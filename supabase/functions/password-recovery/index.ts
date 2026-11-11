// DRAFT ONLY — deploy only after reviewed SQL/RLS, spam controls and staging tests.
// Passwords never go into logs, database rows, or browser storage.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://samsung-kalteng.vercel.app","http://localhost:3000","http://localhost:5173"]);
const GENERIC = "Jika ID akun terdaftar, permintaan Anda akan diteruskan ke Admin.";
const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(id);
const normalizeId = (id: string) => {
  const upper=id.toUpperCase();
  return upper==="AC-2406310901"?"TL_BMU_KAL_02":upper==="ADMIN"?"090994":id;
};
const reply=(req:Request,body:unknown,status=200)=>{
  const origin=req.headers.get("origin")||"";
  return new Response(JSON.stringify(body),{status,headers:{
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://samsung-kalteng.vercel.app",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Vary":"Origin",
  }});
};
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
function randomPassword():string{
  // Rejection sampling removes modulo bias.
  const max=Math.floor(256/alphabet.length)*alphabet.length;
  let s="";
  while(s.length<28){const bytes=crypto.getRandomValues(new Uint8Array(48));for(const b of bytes){if(b<max){s+=alphabet[b%alphabet.length];if(s.length===28)break;}}}
  return s;
}
async function recoverySubjectDigest(employeeId:string,salt:string){
  // Do not trust client-controlled x-forwarded-for as a security identity.
  // Subject-based throttling is stable across networks and VPNs; it complements
  // Turnstile but still needs gateway-wide abuse protection before production.
  const subject=employeeId.trim().toUpperCase();
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(salt),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(subject));
  return Array.from(new Uint8Array(signature)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function verifyHuman(token:unknown,secret:string,localBackend:boolean):Promise<boolean>{
  if(typeof token!=="string"||token.length<20||token.length>2048){console.warn("recovery_turnstile:token_shape");return false;}
  const body=new URLSearchParams({secret,response:token});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",body,signal:controller.signal
    });
    if(!response.ok){
      // HTTP status is non-sensitive and distinguishes configuration, rate limits and outages.
      console.warn("recovery_turnstile:upstream_http_"+response.status);
      return false;
    }
    const result=await response.json();
    if(result?.success!==true){
      const known=["missing-input-secret","invalid-input-secret","missing-input-response",
        "invalid-input-response","bad-request","timeout-or-duplicate","internal-error"];
      const codes=Array.isArray(result?.["error-codes"])?result["error-codes"]:[];
      const reason=known.find(code=>codes.includes(code))||"verification_failed";
      console.warn("recovery_turnstile:"+reason);return false;
    }
    const allowed=typeof result.hostname==="string" &&
      (["samsung-kalteng.vercel.app","localhost"].includes(result.hostname) ||
        (localBackend && secret==="1x0000000000000000000000000000000AA" && result.hostname==="example.com"));
    if(!allowed)console.warn("recovery_turnstile:hostname_rejected");
    return allowed;
  }catch{console.warn("recovery_turnstile:upstream_error");return false;}finally{clearTimeout(timer);}
}
function accountIdFromToken(req:Request){
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return token||null;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return reply(req,{ok:true});
  if(req.method!=="POST")return reply(req,{error:"Method not allowed"},405);
  const origin=req.headers.get("origin");
  if(origin&&!allowedOrigins.has(origin))return reply(req,{error:"Origin tidak diizinkan"},403);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const salt=Deno.env.get("PASSWORD_RECOVERY_IP_SALT");
  const captchaSecret=Deno.env.get("TURNSTILE_SECRET_KEY");
  if(!url||!serviceKey||!anonKey||!salt||salt.length<32||!captchaSecret)return reply(req,{error:"Layanan pemulihan belum dikonfigurasi"},503);
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const auth=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
  let body:Record<string,unknown>;
  try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("bad");}
  catch{return reply(req,{error:"Permintaan tidak valid"},400);}
  const action=body.action;
  // Anonymous request path. NEVER expose existence, profile, email, or an authentication secret.
  if(action==="request"){
    if(!validId(body.employee_id)||!["forgot","reset"].includes(String(body.reason)))return reply(req,{error:"ID atau jenis permintaan tidak valid"},400);
    const requested=normalizeId(body.employee_id);
    // Fail closed: challenge must be verified server-side before touching account data.
    if(!await verifyHuman(body.captcha_token,captchaSecret,new URL(url).hostname==="127.0.0.1" || new URL(url).hostname==="kong"))
      return reply(req,{error:"Verifikasi keamanan gagal. Silakan ulangi CAPTCHA."},400);
    const fingerprint=await recoverySubjectDigest(requested,salt);
    // Atomic database-side rate claim: concurrent requests cannot all pass a SELECT count.
    const {data:rateAllowed,error:rateError}=await admin.rpc("password_recovery_claim_rate",{
      p_fingerprint:fingerprint
    });
    if(rateError)return reply(req,{error:"Layanan sementara tidak tersedia"},503);
    if(rateAllowed!==true)return reply(req,{ok:true,message:GENERIC});
    const email=requested.toLowerCase()+"@login.tlsepri.internal";
    const {data:profile,error:lookupError}=await admin.from("profiles")
      .select("id,employee_id,role,is_active")
      .eq("employee_id",requested).eq("is_active",true).maybeSingle();
    if(lookupError)return reply(req,{error:"Layanan sementara tidak tersedia"},503);
    if(!profile||!["tl","ec","tso"].includes(profile.role))return reply(req,{ok:true,message:GENERIC});
    const {data:user,error:userError}=await admin.auth.admin.getUserById(profile.id);
    if(userError||user?.user?.email?.toLowerCase()!==email)return reply(req,{ok:true,message:GENERIC});
    const {count:recent,error:recentError}=await admin.from("password_recovery_requests")
      .select("id",{count:"exact",head:true}).eq("user_id",profile.id)
      .gte("created_at",new Date(Date.now()-24*3600_000).toISOString());
    if(recentError)return reply(req,{error:"Layanan sementara tidak tersedia"},503);
    if((recent??0)===0)await admin.from("password_recovery_requests").insert({
      user_id:profile.id,employee_id:requested,role:profile.role,reason:body.reason,
      status:"pending",requester_fingerprint:fingerprint
    });
    return reply(req,{ok:true,message:GENERIC});
  }

  const token=accountIdFromToken(req);
  if(!token)return reply(req,{error:"Login diperlukan"},401);
  const {data:userData,error:jwtError}=await auth.auth.getUser(token);
  if(jwtError||!userData?.user)return reply(req,{error:"Sesi tidak valid"},401);
  const callerId=userData.user.id;
  const {data:caller,error:callerError}=await admin.from("profiles")
    .select("id,role,is_active,must_change_password,employee_id").eq("id",callerId).maybeSingle();
  if(callerError||!caller)return reply(req,{error:"Akun tidak tersedia"},403);

  // Rotation is for the authenticated user only, including a temporarily inactive account.
  if(action==="rotate"){
    const password=body.new_password;
    if(typeof password!=="string"||password.length<14||password.length>128||
      !/[A-Za-z]/.test(password)||!/[0-9]/.test(password))
      return reply(req,{error:"Password minimal 14 karakter, berisi huruf dan angka"},400);
    if(caller.must_change_password!==true||caller.is_active!==false)
      return reply(req,{error:"Akun tidak memiliki reset aktif"},403);
    const {data:reset}=await admin.from("password_recovery_requests")
      .select("id,status,expires_at")
      .eq("user_id",callerId).in("status",["awaiting_delivery","delivered"])
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(!reset)return reply(req,{error:"NO_RECOVERY_REQUEST"},409);
    if(!reset.expires_at||Date.parse(reset.expires_at)<=Date.now())
      return reply(req,{error:"Password sementara sudah kedaluwarsa. Minta reset ulang melalui Admin."},410);
    const {error:passwordError}=await admin.auth.admin.updateUserById(callerId,{password});
    if(passwordError)return reply(req,{error:"Tidak dapat memperbarui password"},503);
    const {error:profileError}=await admin.from("profiles")
      .update({must_change_password:false,is_active:true,updated_at:new Date().toISOString()})
      .eq("id",callerId).eq("must_change_password",true).eq("is_active",false);
    if(profileError)return reply(req,{error:"Password baru tersimpan, aktivasi memerlukan bantuan Admin"},503);
    await admin.from("password_recovery_requests").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",reset.id);
    return reply(req,{ok:true,message:"Password baru tersimpan. Silakan login ulang."});
  }

  if(caller.role!=="admin"||!caller.is_active||caller.must_change_password)
    return reply(req,{error:"Hanya Admin aktif yang dapat memproses permintaan"},403);
  if(action==="list"){
    const {data,error}=await admin.from("password_recovery_requests")
      .select("id,employee_id,role,reason,status,created_at,approved_at,expires_at")
      .in("status",["pending","processing","awaiting_delivery","delivered","failed","expired"])
      .order("created_at",{ascending:false}).limit(100);
    if(error)return reply(req,{error:"Permintaan belum dapat dimuat"},503);
    return reply(req,{ok:true,requests:data||[]});
  }
  if(action==="approve"||action==="reissue"){
    const isReissue=action==="reissue";
    if(typeof body.request_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.request_id))
      return reply(req,{error:"Permintaan tidak valid"},400);
    const {data:target,error:getError}=await admin.from("password_recovery_requests")
      .select("id,user_id,employee_id,role,status,approved_at").eq("id",body.request_id).maybeSingle();
    const recoverable=["failed","awaiting_delivery","delivered","expired"];
    // Processing may be recovered only after 15 minutes, so a slow but active
    // approval cannot be preempted by another Admin.
    const staleCutoff=new Date(Date.now()-15*60_000).toISOString();
    const stalled=target?.status==="processing" && !!target.approved_at &&
      Date.parse(target.approved_at)<Date.parse(staleCutoff);
    if(getError||!target||!(isReissue?(recoverable.includes(target.status)||stalled):target.status==="pending"))
      return reply(req,{error:"Status permintaan tidak valid untuk tindakan ini"},409);
    if(target.user_id===callerId)return reply(req,{error:"Tidak boleh menyetujui permintaan sendiri"},403);
    const {data:profile}=await admin.from("profiles")
      .select("id,employee_id,role,is_active,must_change_password").eq("id",target.user_id).maybeSingle();
    const {data:authUser}=await admin.auth.admin.getUserById(target.user_id);
    if(!profile||profile.employee_id!==target.employee_id||profile.role!==target.role||
      !(isReissue
        ? (profile.is_active===false && profile.must_change_password===true) ||
          (target.status==="failed" && profile.is_active===true && profile.must_change_password===false)
        : profile.is_active===true && profile.must_change_password===false) ||
      authUser?.user?.email?.toLowerCase()!==target.employee_id.toLowerCase()+"@login.tlsepri.internal")
      return reply(req,{error:"Identitas atau status akun berubah. Persetujuan dibatalkan"},409);
    // Prevent duplicate approval and parallel credentials issuance.
    let claim=admin.from("password_recovery_requests")
      .update({status:"processing",approved_by:callerId,approved_at:new Date().toISOString()})
      .eq("id",target.id).eq("status",target.status);
    if(stalled){
      // Compare-and-swap against the old timestamp: two Admins cannot both
      // reopen the same stalled request, even though status stays processing.
      claim=claim.eq("approved_at",target.approved_at).lt("approved_at",staleCutoff);
    }
    const {data:claimed,error:claimError}=await claim.select("id").maybeSingle();
    if(claimError||!claimed)return reply(req,{error:"Permintaan sedang diproses"},409);
    // Disabling application access is necessary before password replacement.
    const {data:locked,error:disableError}=profile.is_active===false && profile.must_change_password===true
      ? {data:{id:profile.id},error:null}
      : await admin.from("profiles")
          .update({is_active:false,must_change_password:true,updated_at:new Date().toISOString()})
          .eq("id",profile.id).eq("is_active",true).eq("must_change_password",false)
          .select("id").maybeSingle();
    if(disableError||!locked){
      await admin.from("password_recovery_requests").update({status:"failed"}).eq("id",target.id);
      return reply(req,{error:"Profil gagal dikunci; hubungi Admin"},503);
    }
    const temporary=randomPassword();
    const {error:passwordError}=await admin.auth.admin.updateUserById(profile.id,{password:temporary});
    if(passwordError){
      await admin.from("password_recovery_requests").update({status:"failed"}).eq("id",target.id);
      return reply(req,{error:"Reset gagal. Akun ditahan sementara; eskalasi ke Admin"},503);
    }
    const expiry=new Date(Date.now()+24*3600_000).toISOString();
    const {error:stateError}=await admin.from("password_recovery_requests")
      .update({status:"awaiting_delivery",expires_at:expiry,delivered_at:null,completed_at:null})
      .eq("id",target.id).eq("status","processing");
    if(stateError)return reply(req,{error:"Password diperbarui tetapi status perlu perbaikan manual; jangan kirim password"},503);
    return reply(req,{ok:true,employee_id:target.employee_id,temporary_password:temporary,expires_at:expiry,
      warning:"Tampilkan satu kali kepada Admin. Verifikasi pemilik akun dan kirim lewat kanal privat."});
  }
  if(action==="mark_delivered"){
    if(typeof body.request_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.request_id))
      return reply(req,{error:"ID permintaan tidak valid"},400);
    const {data,error}=await admin.from("password_recovery_requests").update({
      status:"delivered",delivered_at:new Date().toISOString()
    }).eq("id",body.request_id).eq("status","awaiting_delivery").select("id").maybeSingle();
    if(error||!data)return reply(req,{error:"Permintaan tidak dapat ditandai terkirim"},409);
    return reply(req,{ok:true});
  }
  return reply(req,{error:"Tindakan tidak dikenal"},400);
});


import { withSupabase } from "npm:@supabase/server@1";

const ORIGINS = new Set(["https://samsung-kalteng.vercel.app", "http://localhost:3000", "http://localhost:5173"]);
function headers(req: Request) {
 const origin = req.headers.get("origin") || "";
 return { "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://samsung-kalteng.vercel.app",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
   "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary":"Origin",
   "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" };
}
function json(req: Request,body: unknown,status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function makePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const authenticated=withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json(req,{ error: "Method not allowed" }, 405);

    const callerId = ctx.userClaims?.id;
    if (!callerId) return json(req,{ error: "Authentication required" }, 401);

    const admin = ctx.supabaseAdmin;
    const { data: caller, error: callerError } = await admin
      .from("profiles")
      .select("role,is_active,must_change_password,manpower_id,employee_id")
      .eq("id", callerId)
      .maybeSingle();

    if (callerError || !caller) return json(req,{ error: "Profil pengguna tidak ditemukan" },403);
    let body: { action?: string; new_password?: string; employee_id?: string };
    try { body = await req.json(); } catch { return json(req,{error:"Invalid request"},400); }
    if (body.action === "rotate_password") {
      if(caller.role!=="ec" || !caller.must_change_password || caller.is_active || !caller.manpower_id) {
        return json(req,{error:"Perubahan password EC tidak diperlukan untuk akun ini"},403);
      }
      const password=body.new_password;
      if(typeof password!=="string" || password.length<14 || password.length>128 ||
         !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return json(req,{error:"Password minimal 14 karakter, terdiri atas huruf dan angka"},400);
      }
      const {data: activeManpower,error: manpowerError}=await admin.from("manpower")
       .select("id,employee_id,is_active,fieldforce_position").eq("id",caller.manpower_id).maybeSingle();
      if(manpowerError || !activeManpower || !activeManpower.is_active || activeManpower.fieldforce_position!=="EC" || activeManpower.employee_id!==caller.employee_id)
        return json(req,{error:"Status EC tidak dapat diverifikasi"},403);
      const {error:passwordError}=await admin.auth.admin.updateUserById(callerId,{password});
      if(passwordError)return json(req,{error:"Password gagal diperbarui"},500);
      const {error:profileError}=await admin.from("profiles").update({must_change_password:false,is_active:true,updated_at:new Date().toISOString()})
        .eq("id",callerId).eq("role","ec").eq("must_change_password",true).eq("is_active",false);
      if(profileError)return json(req,{error:"Password berhasil diganti, aktivasi profil gagal; hubungi Admin"},500);
      return json(req,{ok:true,message:"Password baru tersimpan dan akun EC aktif"});
    }
    if(body.action==="list_ec_accounts" || body.action==="reset_password") {
      if(caller.role!=="admin" || caller.is_active!==true || caller.must_change_password) {
        return json(req,{error:"Hanya Admin aktif yang dapat mengelola password EC"},403);
      }
      const {data: ecPeople,error:ecError}=await admin.from("manpower")
        .select("id,employee_id,full_name,fieldforce_position,is_active")
        .eq("fieldforce_position","EC").eq("is_active",true).order("full_name");
      if(ecError || !ecPeople)return json(req,{error:"Gagal memeriksa master EC"},500);
      const {data: ecProfiles,error:profilesError}=await admin.from("profiles")
        .select("id,employee_id,manpower_id,role,is_active,must_change_password")
        .in("manpower_id",ecPeople.map(p=>p.id));
      if(profilesError)return json(req,{error:"Gagal membaca profil EC"},500);
      const profileByManpower=new Map((ecProfiles||[]).map(p=>[p.manpower_id,p]));
      if(body.action==="list_ec_accounts")return json(req,{
        ok:true,
        accounts:ecPeople.map(m=>{
          const profile=profileByManpower.get(m.id);
          return {employee_id:m.employee_id,name:m.full_name,linked:Boolean(profile && profile.role==="ec"),
            status:profile?.role==="ec"?(profile.must_change_password?"password_change_required":profile.is_active?"active":"inactive"):"missing"};
        }),
      });
      const employeeId=body.employee_id;
      if(typeof employeeId!=="string" || !/^[A-Za-z0-9_-]{4,40}$/.test(employeeId))return json(req,{error:"ID EC tidak valid"},400);
      const person=ecPeople.find(m=>m.employee_id===employeeId);
      if(!person)return json(req,{error:"EC aktif tidak ditemukan"},404);
      const targetProfile=profileByManpower.get(person.id);
      if(!targetProfile || targetProfile.role!=="ec" || targetProfile.employee_id!==person.employee_id || !targetProfile.id) {
        return json(req,{error:"Akun EC tidak terhubung dengan benar. Perlu pemeriksaan manual."},409);
      }
      const {data:authUser,error:authError}=await admin.auth.admin.getUserById(targetProfile.id);
      const expectedEmail=(person.employee_id+"@login.tlsepri.internal").toLowerCase();
      if(authError || !authUser?.user || authUser.user.email?.toLowerCase()!==expectedEmail){
        return json(req,{error:"Identitas Auth EC tidak sesuai. Reset dibatalkan."},409);
      }
      // Fail closed: revoke active application access before rotating Auth credential.
      // Even if Auth update fails, this account cannot continue accessing RLS data.
      const {error:disableError}=await admin.from("profiles")
        .update({is_active:false,must_change_password:true,updated_at:new Date().toISOString()})
        .eq("id",targetProfile.id).eq("employee_id",person.employee_id)
        .eq("manpower_id",person.id).eq("role","ec");
      if(disableError)return json(req,{error:"Tidak dapat menonaktifkan sementara akun EC. Reset dibatalkan."},500);
      const temporaryPassword=makePassword();
      const {error:resetError}=await admin.auth.admin.updateUserById(targetProfile.id,{password:temporaryPassword});
      if(resetError)return json(req,{error:"Reset password gagal. Akun ditahan nonaktif; ulangi reset sebagai Admin."},500);
      return json(req,{ok:true,employee_id:person.employee_id,name:person.full_name,
        temporary_password:temporaryPassword,requires_password_change:true,
        warning:"Password sementara hanya muncul sekali. Berikan hanya kepada pemilik akun melalui kanal privat."});
    }
    if (body.action !== "activate" && body.action !== "preview") return json(req,{error:"Unknown action"},400);
    if (caller.role !== "admin" || caller.is_active !== true) {
      return json(req,{ error: "Only an active Admin can provision EC accounts" }, 403);
    }
    const { data: manpower, error: manpowerError } = await admin
      .from("manpower")
      .select("id,employee_id,full_name,promoter_id,site_id,tl_name")
      .eq("fieldforce_position", "EC")
      .eq("is_active", true)
      .order("employee_id");

    if (manpowerError) return json(req,{ error: "Could not read EC master data" }, 500);
    if (!manpower?.length || manpower.length>500) return json(req,{error:"Jumlah EC aktif tidak valid"},409);
    if (new Set(manpower.map(m=>m.employee_id.toLowerCase())).size!==manpower.length)
      return json(req,{error:"ID karyawan EC duplikat dalam Master Database"},409);
    if(manpower.some(m=>!/^[-_a-zA-Z0-9]{4,40}$/.test(m.employee_id)))
      return json(req,{error:"Ada ID EC dengan format tidak valid"},409);

    const manpowerIds = manpower.map((m) => m.id);
    const { data: assignments, error: assignmentError } = await admin
      .from("store_assignments")
      .select("manpower_id,store_id")
      .in("manpower_id", manpowerIds)
      .is("valid_to", null);

    if (assignmentError) return json(req,{ error: "Could not verify EC store assignments" }, 500);
    const assigned = new Set((assignments ?? []).map((a) => a.manpower_id));
    const missing = manpower.filter((m) => !assigned.has(m.id)).map((m) => m.employee_id);
    if (missing.length) return json(req,{ error: "Some ECs have no active store assignment", missing_employee_ids: missing }, 409);

    const { data: existingProfiles, error: profileReadError } = await admin
      .from("profiles")
      .select("id,employee_id,email,role,manpower_id,is_active,must_change_password")
      .in("employee_id", manpower.map((m) => m.employee_id));

    if (profileReadError) return json(req,{ error: "Could not inspect existing profiles" }, 500);
    const profileByEmployee = new Map((existingProfiles ?? []).map((p) => [p.employee_id, p]));

    const { data: authList, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authListError) return json(req,{ error: "Could not inspect existing Auth users" }, 500);
    const authByEmail = new Map((authList.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

    const existingByManpower=new Map((existingProfiles??[]).map(p=>[p.manpower_id,p]));
    const pending=manpower.filter(m=>!existingByManpower.has(m.id) && !authByEmail.has((m.employee_id+"@login.tlsepri.internal").toLowerCase()));
    const collisions=manpower.filter(m=>{
      const p=profileByEmployee.get(m.employee_id);
      const u=authByEmail.get((m.employee_id+"@login.tlsepri.internal").toLowerCase());
      return (p && (p.role!=="ec" || p.manpower_id!==m.id || (u && p.id!==u.id))) ||
       (!p && u);
    });
    if(collisions.length) return json(req,{error:"Konflik identitas Auth/Profile; proses dihentikan untuk pemeriksaan manual",count:collisions.length},409);
    if(body.action==="preview") return json(req,{ok:true,active_ec:manpower.length,already_linked:manpower.length-pending.length,to_create:pending.length,assignment_verified:true});

    const results = [];
    const credentials = [];

    for (const person of manpower) {
      const email = person.employee_id + "@login.tlsepri.internal";
      let authUser = authByEmail.get(email.toLowerCase());
      let createdNow = false;
      let generatedPassword: string | null = null;

      if (!authUser) {
        generatedPassword = makePassword();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password: generatedPassword,
          email_confirm: true,
          app_metadata: { role: "ec", employee_id: person.employee_id },
        });
        if (createError || !created.user) {
          results.push({ employee_id: person.employee_id, status: "failed", reason: createError?.message ?? "Auth user creation failed" });
          continue;
        }
        authUser = created.user;
        createdNow = true;
      }

      const existingProfile = profileByEmployee.get(person.employee_id);
      if (existingProfile && existingProfile.id !== authUser.id) {
        if (createdNow) await admin.auth.admin.deleteUser(authUser.id);
        results.push({ employee_id: person.employee_id, status: "conflict", reason: "Employee ID is already linked to another profile" });
        continue;
      }

      if (createdNow) {
        const { error: upsertError } = await admin.from("profiles").upsert({
          id: authUser.id, email, employee_id: person.employee_id,
          full_name: person.full_name, role: "ec", manpower_id: person.id,
          is_active: false, must_change_password: true,
        }, { onConflict: "id" });
        if(upsertError){
          await admin.auth.admin.updateUserById(authUser.id,{ban_duration:"876000h"});
          results.push({employee_id:person.employee_id,status:"failed",reason:"Profile save failed; Auth user blocked"});
          continue;
        }
      } else if (!existingProfile || existingProfile.id!==authUser.id || existingProfile.role!=="ec" || existingProfile.manpower_id!==person.id){
        results.push({employee_id:person.employee_id,status:"conflict",reason:"Existing EC account linkage mismatch"});
        continue;
      }

      if (generatedPassword) {
        credentials.push({ employee_id: person.employee_id, name: person.full_name, email, password: generatedPassword });
      }
      results.push({
        employee_id: person.employee_id,
        name: person.full_name,
        promoter_id: person.promoter_id,
        site_id: person.site_id,
        tl_name: person.tl_name,
        auth_user_id: authUser.id,
        status: createdNow ? "created" : "linked_existing",
      });
    }

    return json(req,{
      message: "EC account provisioning completed",
      created_count: results.filter((r) => r.status === "created").length,
      linked_existing_count: results.filter((r) => r.status === "linked_existing").length,
      failed_count: results.filter((r) => r.status === "failed" || r.status === "conflict").length,
      results,
      one_time_credentials: credentials,
      warning: "Berikan password sementara satu-per-satu melalui kanal privat; EC wajib mengganti password saat login pertama. Jangan simpan di grup atau chat umum.",
    });
  });
Deno.serve((req: Request) => req.method==="OPTIONS" ? new Response("ok",{headers:headers(req)}) : authenticated(req));
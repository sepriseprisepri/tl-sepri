/* Samsung Kalteng account recovery — UI only.
 * Activation requires separately approved Supabase function + SQL and security tests.
 * Passwords are never placed in storage or logs. */
(function(){
 "use strict";
 const encoder=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ID_PATTERN=/^[A-Za-z0-9_-]{4,40}$/;
 const endpoint=()=>window.SAMSUNG_RECOVERY_API_URL || "https://xirmqdcdqpocdfqqvxmh.supabase.co/functions/v1/password-recovery";
 const publicKey=()=>window.SAMSUNG_RECOVERY_PUBLISHABLE_KEY || "sb_publishable_-IN453_OWCSKnepIDCCkFg_7Y2kebO4";
 const generic="Jika ID akun terdaftar, permintaan Anda akan diteruskan ke Admin.";
 let dialog=null,originalFocus=null,busy=false,captchaToken="",captchaWidget=null;
 const siteKey=()=>window.SAMSUNG_TURNSTILE_SITE_KEY||"";
 function renderChallenge(){
  if(!dialog)return;
  const host=dialog.querySelector("[data-recovery-captcha]");
  if(!siteKey()){
    setStatus("Layanan pemulihan belum dikonfigurasi. Hubungi Admin.",true);
    return;
  }
  const mount=()=>{
    if(!dialog||!window.turnstile)return;
    captchaWidget=window.turnstile.render(host,{
      sitekey:siteKey(),
      callback:token=>{captchaToken=token;setStatus("Verifikasi keamanan selesai.");},
      "expired-callback":()=>{captchaToken="";setStatus("Verifikasi kedaluwarsa. Ulangi CAPTCHA.",true);},
      "error-callback":()=>{captchaToken="";setStatus("CAPTCHA gagal dimuat. Coba lagi.",true);}
    });
  };
  if(window.turnstile){mount();return;}
  let script=document.querySelector("script[data-samsung-turnstile]");
  if(!script){
   script=document.createElement("script");
   script.dataset.samsungTurnstile="";
   script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
   script.async=true;
   document.head.appendChild(script);
  }
  script.addEventListener("load",mount,{once:true});
 }
 function setStatus(message,error=false){
  if(!dialog)return;
  const output=dialog.querySelector("[data-recovery-status]");
  output.textContent=message;output.className="mt-4 text-sm "+(error?"text-rose-300":"text-emerald-300");
 }
 async function post(body,token=null){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(endpoint(),{
    method:"POST",cache:"no-store",signal:controller.signal,
    headers:{"Content-Type":"application/json",apikey:publicKey(),
      ...(token?{"Authorization":"Bearer "+token}:{})},
    body:JSON.stringify(body)
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"Layanan pemulihan password belum tersedia. Hubungi Admin.");
   return json;
  }catch(e){
   if(e?.name==="AbortError")throw Error("Koneksi server terlalu lama. Coba lagi.");
   throw e;
  }finally{clearTimeout(timer);}
 }
 function close(){
  if(!dialog||busy)return;
  if(window.turnstile && captchaWidget!==null){try{window.turnstile.remove(captchaWidget);}catch{}}
  captchaWidget=null;captchaToken="";dialog.remove();dialog=null;
  if(originalFocus?.isConnected)originalFocus.focus();
 }
 function open(){
  if(dialog)return;
  originalFocus=document.activeElement;
  dialog=document.createElement("div");
  dialog.id="password-recovery-dialog";
  dialog.className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 px-4 py-6";
  dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
  dialog.setAttribute("aria-labelledby","password-recovery-title");
  dialog.innerHTML=`<div class="w-full max-w-md rounded-2xl border border-cyan-600/40 bg-slate-900 p-6 shadow-2xl">
    <div class="flex justify-between items-start gap-4">
      <div><p class="text-xs uppercase tracking-widest text-cyan-300">Keamanan akun</p>
      <h2 id="password-recovery-title" class="mt-2 text-xl font-semibold text-white">Pemulihan Password</h2></div>
      <button type="button" data-recovery-close aria-label="Tutup pemulihan password" class="rounded-lg px-3 py-2 text-slate-300 hover:text-white">✕</button>
    </div>
    <p class="mt-3 text-sm text-slate-300 leading-6">ID Akun atau Password tidak sesuai. Pilih tindakan untuk mengirim permintaan persetujuan kepada Admin.</p>
    <label for="recovery-employee-id" class="mt-5 block text-sm text-slate-200">ID Akun</label>
    <input id="recovery-employee-id" maxlength="40" autocomplete="username" class="field mt-2 w-full rounded-xl px-4 py-3" placeholder="Masukkan ID akun" />
    <div data-recovery-captcha class="mt-5 min-h-[65px]" aria-label="Verifikasi keamanan CAPTCHA"></div>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button type="button" data-recovery-request="forgot" class="rounded-xl border border-cyan-500 px-3 py-3 text-sm font-semibold text-cyan-200">Lupa Password</button>
      <button type="button" data-recovery-request="reset" class="rounded-xl bg-cyan-400 px-3 py-3 text-sm font-semibold text-slate-950">Reset Password</button>
    </div>
    <p data-recovery-status role="status" aria-live="polite" class="mt-4 text-sm text-slate-400">Admin akan memverifikasi identitas sebelum menyetujui permintaan.</p>
    <p class="mt-3 text-xs text-slate-500">Jangan memasukkan password pada form ini. Kirim satu permintaan dan tunggu konfirmasi Admin.</p>
  </div>`;
  document.body.appendChild(dialog);
  dialog.querySelector("#recovery-employee-id").value=document.getElementById("employee-id")?.value.trim()||"";
  dialog.querySelector("[data-recovery-close]").addEventListener("click",close);
  dialog.addEventListener("keydown",e=>{
   if(e.key==="Escape"){e.preventDefault();close();}
   if(e.key==="Tab"){
    const controls=[...dialog.querySelectorAll("button:not([disabled]), input:not([disabled])")];
    const first=controls[0],last=controls[controls.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  });
  dialog.querySelectorAll("[data-recovery-request]").forEach(button=>button.addEventListener("click",async()=>{
   if(busy)return;
   const id=dialog.querySelector("#recovery-employee-id").value.trim();
   if(!ID_PATTERN.test(id)){setStatus("Masukkan ID akun yang valid (4–40 karakter).",true);return;}
   if(!captchaToken){setStatus("Selesaikan verifikasi keamanan CAPTCHA terlebih dahulu.",true);return;}
   busy=true;
   dialog.querySelectorAll("button").forEach(b=>b.disabled=true);
   setStatus("Mengirim permintaan…");
   try{
    await post({action:"request",employee_id:id,reason:button.dataset.recoveryRequest,captcha_token:captchaToken});
    setStatus(generic);
   }catch(e){setStatus(e.message||"Permintaan gagal dikirim.",true);}
   finally{busy=false;captchaToken="";if(window.turnstile&&captchaWidget!==null){try{window.turnstile.reset(captchaWidget);}catch{}}dialog?.querySelectorAll("button").forEach(b=>b.disabled=false);}
  }));
  dialog.querySelector("#recovery-employee-id").focus();
  renderChallenge();
 }
 function init(){
  const form=document.getElementById("login-form");
  const login=document.getElementById("login-button");
  if(!form||!login||document.getElementById("forgot-password-button"))return;
  const button=document.createElement("button");
  button.type="button";button.id="forgot-password-button";
  button.className="mt-3 w-full rounded-xl border border-cyan-500/50 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-900/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300";
  button.textContent="Lupa Password?";
  button.addEventListener("click",open);
  login.insertAdjacentElement("afterend",button);
 }
 async function renderAdmin(mount,ctx){
  if(!mount||ctx?.profile?.role!=="admin"||mount.querySelector("#admin-password-recovery"))return;
  const section=document.createElement("section");
  section.id="admin-password-recovery";
  section.className="mt-6 rounded-2xl border border-cyan-700/40 bg-slate-950/50 p-5 sm:p-7";
  section.innerHTML=`<h3 class="text-lg font-semibold text-white">Permintaan Lupa / Reset Password</h3>
    <p class="text-sm text-slate-400 mt-2">Tinjau ID dan verifikasi identitas pemilik akun. Password sementara hanya ditampilkan sekali sesudah persetujuan.</p>
    <button type="button" data-recovery-refresh class="mt-4 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Muat permintaan</button>
    <p data-admin-status class="mt-3 text-sm text-slate-400" role="status" aria-live="polite"></p>
    <div data-admin-requests class="mt-4 overflow-x-auto"></div>
    <div data-one-time-secret class="hidden mt-5 rounded-xl border border-amber-700 bg-amber-950/30 p-4">
      <p class="text-sm font-semibold text-amber-200">Password sementara — tampil sekali</p>
      <p class="text-xs text-slate-300 mt-2">Pastikan penerima telah diverifikasi. Kirim hanya melalui kanal privat. Berlaku maksimal 24 jam.</p>
      <p data-secret-identity class="text-sm mt-3"></p>
      <code data-secret-value class="block break-all select-all text-white mt-2 text-base"></code>
      <button type="button" data-mark-delivered class="mt-4 rounded-lg border border-amber-500 px-4 py-2 text-sm text-amber-200">Sudah disampaikan kepada pemilik akun</button>
    </div>`;
  mount.appendChild(section);
  const status=section.querySelector("[data-admin-status]"),list=section.querySelector("[data-admin-requests]");
  const secret=section.querySelector("[data-one-time-secret]");let activeRequest=null;
  const adminPost=body=>post(body,ctx.accessToken);
  const hideSecret=()=>{secret.classList.add("hidden");secret.querySelector("[data-secret-value]").textContent="";activeRequest=null;};
  async function refresh(){
   if(activeRequest){status.textContent="Tandai password terakhir sudah disampaikan sebelum memuat ulang.";return;}
   status.textContent="Memuat…";
   try{
    const response=await adminPost({action:"list"});
    const requests=response.requests||[];
    if(!requests.length){list.textContent="Belum ada permintaan yang memerlukan tindakan.";status.textContent="";return;}
    list.innerHTML='<table class="w-full text-sm"><thead><tr><th class="p-2 text-left">ID</th><th class="p-2 text-left">Role</th><th class="p-2 text-left">Jenis</th><th class="p-2 text-left">Status</th><th class="p-2 text-left">Tindakan</th></tr></thead><tbody>'+
      requests.map(item=>'<tr class="border-t border-slate-700"><td class="p-2">'+encoder(item.employee_id)+'</td><td class="p-2">'+encoder(item.role)+'</td><td class="p-2">'+encoder(item.reason)+'</td><td class="p-2">'+encoder(item.status)+'</td><td class="p-2">'+
      (item.status==="pending"?'<button type="button" data-recovery-action="approve" data-request-id="'+encoder(item.id)+'" class="rounded-lg border border-cyan-500 px-3 py-1 text-cyan-300">Setujui</button>':(["failed","expired","awaiting_delivery","delivered"].includes(item.status)?'<button type="button" data-recovery-action="reissue" data-request-id="'+encoder(item.id)+'" class="rounded-lg border border-amber-500 px-3 py-1 text-amber-200">Terbitkan ulang</button>':'<span class="text-amber-200">Sedang diproses</span>'))+'</td></tr>').join("")+"</tbody></table>";
    list.querySelectorAll("[data-recovery-action]").forEach(button=>button.addEventListener("click",async()=>{
     const found=requests.find(item=>item.id===button.dataset.requestId);
     const action=button.dataset.recoveryAction;
     if(!found||!window.confirm("Sudah memverifikasi identitas pemilik "+found.employee_id+"? "+(action==="reissue"?"Password sementara sebelumnya akan diganti.":"Persetujuan akan mengganti password dan mengunci akses dashboard sementara.")))return;
     button.disabled=true;status.textContent="Memproses persetujuan…";
     try{
      const result=await adminPost({action,request_id:found.id});
      activeRequest=found.id;secret.querySelector("[data-secret-identity]").textContent="ID akun: "+found.employee_id;
      secret.querySelector("[data-secret-value]").textContent=result.temporary_password;
      secret.classList.remove("hidden");status.textContent="Reset berhasil. Sampaikan password sementara secara privat, lalu tandai terkirim.";
     }catch(err){status.textContent=err.message||"Persetujuan gagal.";button.disabled=false;}
    }));
    status.textContent="";
   }catch(err){status.textContent=err.message||"Gagal memuat permintaan.";}
  }
  section.querySelector("[data-recovery-refresh]").addEventListener("click",refresh);
  section.querySelector("[data-mark-delivered]").addEventListener("click",async()=>{
   if(!activeRequest)return;
   try{
    await adminPost({action:"mark_delivered",request_id:activeRequest});
    hideSecret();await refresh();
   }catch(err){status.textContent=err.message||"Gagal menyimpan konfirmasi."; }
  });
  await refresh();
 }
 window.SamsungPasswordRecovery={init,open,renderAdmin,post};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

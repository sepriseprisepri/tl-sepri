/* Samsung Kalteng — Pengaturan Akun, mobile-first, scoped to signed-in user.
 * Security: no password in logs, storage, URL, or database text columns. */
(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleNames={admin:"Administrator",tl:"Team Leader",tso:"TSO",ec:"Experience Consultant"};
const themeChoices=["dark","light","system"];
const passwordValid=p=>typeof p==="string"&&p.length>=14&&p.length<=128&&/[A-Za-z]/.test(p)&&/[0-9]/.test(p);
const timezoneDate=()=>{const x=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(v=>[v.type,v.value]));return x.year+"-"+x.month+"-"+x.day;};
function themeKey(id){return "tlsepri.theme."+id;}
function applyTheme(theme,userId){
 if(!themeChoices.includes(theme))throw Error("Tema tidak tersedia.");
 const key=theme==="system"?("matchMedia" in window&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;
 document.body.classList.toggle("settings-light",key==="light");
 if(userId){try{localStorage.setItem(themeKey(userId),theme);}catch{/* localStorage can be blocked */}}
}
function restoreTheme(userId){
 let theme="dark";
 try{theme=localStorage.getItem(themeKey(userId))||"dark";}catch{}
 if(!themeChoices.includes(theme))theme="dark";
 applyTheme(theme);
 return theme;
}
async function rest(ctx,path,{method="GET",payload}={}){
 if(!ctx.accessToken||!ctx.apiUrl||!ctx.publishableKey)throw Error("Sesi akun belum lengkap. Masuk kembali.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(ctx.apiUrl+path,{
   method,signal:controller.signal,cache:"no-store",
   headers:{apikey:ctx.publishableKey,Authorization:"Bearer "+ctx.accessToken,
    ...(payload?{"Content-Type":"application/json"}:{}),
    ...(method==="POST"?{Prefer:"resolution=merge-duplicates,return=minimal"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  if(!r.ok){
   if(r.status===401)throw Error("Sesi sudah kedaluwarsa. Silakan login ulang.");
   throw Error("Pengaturan belum dapat diperbarui (HTTP "+r.status+").");
  }
  return r.status===204?null:await r.json();
 }catch(e){
  if(e.name==="AbortError")throw Error("Server tidak merespons. Coba lagi setelah memeriksa jaringan.");
  throw e;
 }finally{clearTimeout(timer)}
}
async function saveDensity(ctx,density){
 if(!["compact","comfortable"].includes(density))throw Error("Pilihan tampilan tabel tidak valid.");
 await rest(ctx,"/rest/v1/user_ui_preferences?on_conflict=user_id",{
  method:"POST",payload:{user_id:ctx.profile.id,table_density:density,updated_at:new Date().toISOString()}
 });
}
async function changePassword(ctx,currentPassword,newPassword,confirmation){
 if(!currentPassword)throw Error("Masukkan password saat ini.");
 if(!passwordValid(newPassword))throw Error("Password baru minimal 14 karakter, mengandung huruf dan angka.");
 if(newPassword!==confirmation)throw Error("Konfirmasi password baru tidak sama.");
 if(currentPassword===newPassword)throw Error("Password baru harus berbeda dari password lama.");
 if(!ctx.accessToken||!ctx.apiUrl||!ctx.publishableKey)throw Error("Sesi tidak tersedia. Login kembali.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const headers={apikey:ctx.publishableKey,"Content-Type":"application/json"};
  const info=await fetch(ctx.apiUrl+"/auth/v1/user",{method:"GET",headers:{...headers,Authorization:"Bearer "+ctx.accessToken},signal:controller.signal,cache:"no-store"});
  if(!info.ok)throw Error("Sesi login tidak valid. Login kembali.");
  const me=await info.json();
  if(me.id!==ctx.profile.id||typeof me.email!=="string")throw Error("Identitas akun tidak cocok. Login kembali.");
  // Verify the old password against this user's real Auth email before changing it.
  const verify=await fetch(ctx.apiUrl+"/auth/v1/token?grant_type=password",{
   method:"POST",headers,signal:controller.signal,cache:"no-store",
   body:JSON.stringify({email:me.email,password:currentPassword})
  });
  if(!verify.ok)throw Error("Password saat ini tidak sesuai.");
  const session=await verify.json();
  if(session.user?.id!==ctx.profile.id||!session.access_token)throw Error("Verifikasi identitas gagal.");
  // Use the freshly verified user's token. Never use service-role credentials.
  const change=await fetch(ctx.apiUrl+"/auth/v1/user",{
   method:"PUT",signal:controller.signal,cache:"no-store",
   headers:{...headers,Authorization:"Bearer "+session.access_token},
   body:JSON.stringify({password:newPassword})
  });
  if(!change.ok)throw Error("Perubahan password tidak berhasil. Coba kembali.");
  return true;
 }catch(error){
  if(error?.name==="AbortError")throw Error("Server tidak merespons. Periksa koneksi sebelum mencoba kembali.");
  throw error;
 }finally{clearTimeout(timer)}
}
async function getStores(ctx){
 if(ctx.profile.role!=="ec"||!ctx.profile.manpower_id)return [];
 const today=timezoneDate(),params=new URLSearchParams({select:"store_id,valid_from,valid_to",manpower_id:"eq."+ctx.profile.manpower_id});
 const assignment=await rest(ctx,"/rest/v1/store_assignments?"+params);
 const active=(assignment||[]).filter(a=>a.valid_from<=today&&(!a.valid_to||a.valid_to>=today));
 if(!active.length)return [];
 const ids=active.map(x=>x.store_id).filter(Boolean);
 if(!ids.length)return [];
 const stores=await rest(ctx,"/rest/v1/stores?"+new URLSearchParams({select:"id,site_id,site_name",id:"in.("+ids.join(",")+")"}));
 return stores||[];
}
async function render(ctx,mount){
 const profile=ctx?.profile;
 if(!profile?.id||!roleNames[profile.role]||profile.is_active!==true||profile.must_change_password){
  mount.textContent="Pengaturan hanya tersedia untuk akun yang sudah aktif.";return;
 }
 const theme=restoreTheme(profile.id);
 mount.innerHTML='<div class="max-w-4xl space-y-5 settings-center">'+
 '<div class="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-5 sm:p-6"><p class="text-cyan-300 text-xs tracking-widest uppercase">Pusat Akun & Preferensi</p>'+
 '<h3 class="text-white font-semibold text-xl mt-2">Pengaturan Saya</h3><p class="text-slate-300 text-sm mt-2">Kelola akun pribadi dan pengalaman menggunakan dashboard. Pengaturan ini tidak mengubah target atau data sellout.</p></div>'+
 '<section class="panel rounded-2xl p-4 sm:p-6 space-y-4" aria-labelledby="settings-profile-title">'+
 '<h4 id="settings-profile-title" class="font-semibold text-lg text-white">Profil Saya</h4>'+
 '<div class="grid sm:grid-cols-2 gap-3">'+
 '<div class="settings-field"><span>Nama karyawan</span><strong>'+esc(profile.full_name||"Belum tersedia")+'</strong></div>'+
 '<div class="settings-field"><span>Login ID</span><strong>'+esc(profile.employee_id||"Belum tersedia")+'</strong></div>'+
 '<div class="settings-field"><span>Role akun</span><strong>'+esc(roleNames[profile.role])+'</strong></div>'+
 '<div class="settings-field"><span>Status akun</span><strong class="text-emerald-300">Aktif</strong></div></div>'+
 '<div id="settings-store-status" role="status" aria-live="polite" class="text-sm text-slate-300">'+(profile.role==="ec"?"Memeriksa toko penempatan…":"Informasi akun sesuai akses Anda.")+'</div>'+
 '<p class="text-xs text-slate-400">Data profil dan penempatan dikelola Admin, bukan dapat diubah sendiri dari halaman ini.</p></section>'+
 '<section class="panel rounded-2xl p-4 sm:p-6 space-y-4" aria-labelledby="settings-security-title">'+
 '<h4 id="settings-security-title" class="font-semibold text-lg text-white">Keamanan Akun</h4>'+
 '<p class="text-sm text-slate-300">Ganti password pribadi dengan memverifikasi password saat ini. Admin dapat mengelola reset EC melalui menu Aktivasi Akun EC yang terpisah.</p>'+
 '<form id="settings-password-form" class="grid gap-3 max-w-xl" autocomplete="off">'+
 '<label class="settings-label">Password saat ini<input name="current" type="password" autocomplete="current-password" required class="field settings-input" placeholder="Masukkan password sekarang"></label>'+
 '<label class="settings-label">Password baru<input name="next" type="password" autocomplete="new-password" required minlength="14" maxlength="128" class="field settings-input" placeholder="Minimal 14 karakter, huruf + angka"></label>'+
 '<label class="settings-label">Konfirmasi password baru<input name="confirm" type="password" autocomplete="new-password" required minlength="14" maxlength="128" class="field settings-input" placeholder="Ulangi password baru"></label>'+
 '<button type="submit" id="settings-password-button" class="settings-primary rounded-xl px-5 py-3 font-semibold">Ganti password pribadi</button>'+
 '</form><p id="settings-password-status" role="status" aria-live="polite" class="text-sm text-slate-300"></p>'+
 '<p class="text-xs text-amber-200">Setelah password diubah, keluar dan masuk kembali menggunakan password baru. Jangan bagikan password kepada siapa pun.</p></section>'+
 '<section class="panel rounded-2xl p-4 sm:p-6 space-y-4" aria-labelledby="settings-appearance-title">'+
 '<h4 id="settings-appearance-title" class="font-semibold text-lg text-white">Preferensi Tampilan</h4>'+
 '<label class="settings-label">Tema tampilan<select id="settings-theme" class="field settings-input">'+
 '<option value="dark">Gelap</option><option value="light">Terang</option><option value="system">Ikuti perangkat</option></select></label>'+
 '<p class="text-xs text-slate-400">Tema disimpan di perangkat ini, khusus untuk akun Anda.</p>'+
 '<label class="settings-label">Kerapatan tabel<select id="settings-density" class="field settings-input">'+
 '<option value="comfortable">Nyaman</option><option value="compact">Ringkas</option></select></label>'+
 '<button type="button" id="settings-density-save" class="settings-primary rounded-xl px-5 py-3 font-semibold">Simpan tampilan tabel</button>'+
 '<p id="settings-appearance-status" role="status" aria-live="polite" class="text-sm text-slate-300">Pengaturan siap digunakan.</p>'+
 '<p class="text-xs text-slate-400">Kerapatan tabel disimpan di preferensi akun dan digunakan juga oleh tombol Tabel pada dashboard.</p></section></div>';
 const el=id=>mount.querySelector("#"+id);
 const passwordForm=el("settings-password-form"),passwordBtn=el("settings-password-button"),passwordStatus=el("settings-password-status");
 const themeSelect=el("settings-theme"),densitySelect=el("settings-density"),densitySave=el("settings-density-save"),appearanceStatus=el("settings-appearance-status");
 themeSelect.value=theme;
 densitySelect.value=document.body.classList.contains("intel-compact")?"compact":"comfortable";
 themeSelect.addEventListener("change",()=>{applyTheme(themeSelect.value,profile.id);appearanceStatus.textContent="Tema diperbarui pada perangkat ini.";});
 densitySave.addEventListener("click",async()=>{
  densitySave.disabled=true;appearanceStatus.textContent="Menyimpan preferensi tabel…";
  try{
   await saveDensity(ctx,densitySelect.value);
   document.body.classList.toggle("intel-compact",densitySelect.value==="compact");
   const button=document.getElementById("density-toggle");
   if(button){button.textContent=densitySelect.value==="compact"?"Tabel: Ringkas":"Tabel: Nyaman";button.setAttribute("aria-pressed",String(densitySelect.value==="compact"));}
   appearanceStatus.textContent="Preferensi tabel disimpan di akun.";
  }catch(err){appearanceStatus.textContent=err.message||"Gagal menyimpan preferensi tabel.";}
  finally{densitySave.disabled=false}
 });
 passwordForm.addEventListener("submit",async e=>{
  e.preventDefault();
  if(passwordBtn.disabled)return;
  const current=passwordForm.elements.namedItem("current"),next=passwordForm.elements.namedItem("next"),confirm=passwordForm.elements.namedItem("confirm");
  passwordBtn.disabled=true;passwordStatus.textContent="Memverifikasi akun dan memperbarui password…";
  try{
   await changePassword(ctx,current.value,next.value,confirm.value);
   passwordStatus.textContent="Password berhasil diubah. Keluar lalu login kembali menggunakan password baru.";
  }catch(err){passwordStatus.textContent=err.message||"Gagal mengganti password.";}
  finally{current.value="";next.value="";confirm.value="";passwordBtn.disabled=false;}
 });
 if(profile.role==="ec")getStores(ctx).then(stores=>{
  if(!mount.isConnected)return;
  el("settings-store-status").textContent=stores.length
   ?"Toko penempatan aktif: "+stores.map(s=>s.site_name+" ("+s.site_id+")").join(", ")
   :"Belum ada toko penempatan aktif yang dapat ditampilkan. Hubungi Admin bila tidak sesuai.";
 }).catch(err=>{if(mount.isConnected)el("settings-store-status").textContent="Toko penempatan belum bisa dimuat: "+err.message;});
}
function reset(){document.body.classList.remove("settings-light");}
window.SamsungSettings={render,reset,passwordValid,changePassword,saveDensity,restoreTheme,applyTheme};
})();

/* Admin-only individual EC password reset. Never logs or stores passwords. */
(function(){
 "use strict";
 async function render(ctx,mount){
  if(ctx.profile?.role!=="admin"){mount.textContent="Hanya Admin yang dapat mereset password EC.";return;}
  const section=document.createElement("section");
  section.className="panel rounded-2xl p-5 sm:p-7 max-w-4xl space-y-4 mt-5";
  section.innerHTML='<p class="text-xs uppercase tracking-widest text-cyan-300">Keamanan akun EC</p>'+
   '<h3 class="text-xl font-semibold">Reset Password EC</h3>'+
   '<p class="text-sm text-slate-300">Pilih satu EC, verifikasi identitasnya, lalu buat password sementara unik. Akun yang di-reset harus mengganti password saat login berikutnya. Akun EC lain tidak terpengaruh.</p>'+
   '<label class="block text-sm text-slate-200">Cari akun EC<input id="ec-reset-search" type="search" class="field block w-full rounded-xl p-3 mt-2" placeholder="Cari nama atau ID karyawan" autocomplete="off"></label>'+
   '<label class="block text-sm text-slate-200">Pilih karyawan<select id="ec-reset-target" class="field block w-full rounded-xl p-3 mt-2" disabled><option value="">Memuat daftar EC…</option></select></label>'+
   '<label class="block text-sm text-slate-200">Konfirmasi ID Karyawan<input id="ec-reset-confirm-id" class="field block w-full rounded-xl p-3 mt-2" placeholder="Ketik ulang ID EC yang dipilih" autocomplete="off"></label>'+
   '<div class="flex flex-wrap gap-3"><button id="ec-reset-submit" type="button" disabled class="rounded-xl bg-rose-400 px-5 py-3 text-slate-950 font-semibold disabled:opacity-50">Reset Password EC Terpilih</button>'+
   '<button id="ec-reset-clear" type="button" class="rounded-xl px-4 py-3 border border-slate-600 text-slate-300">Hapus password dari layar</button></div>'+
   '<p id="ec-reset-status" role="status" aria-live="polite" class="text-sm text-amber-200">Memuat akun…</p>'+
   '<div id="ec-reset-secret-box" class="hidden rounded-xl p-4 border border-amber-700/50 bg-amber-950/20">'+
   '<p class="text-amber-200 text-sm font-semibold">Password sementara — tampil satu kali saja</p>'+
   '<p id="ec-reset-identity" class="text-sm mt-2 text-slate-300"></p>'+
   '<code id="ec-reset-secret" class="block mt-3 break-all text-white text-lg"></code>'+
   '<button id="ec-reset-copy" class="rounded-lg border border-amber-700 px-3 py-2 mt-3 text-amber-200 text-xs" type="button">Salin password ini</button>'+
   '<p class="text-xs text-slate-400 mt-3">Serahkan hanya kepada pemilik akun yang sudah diverifikasi. Password tidak dapat dilihat lagi setelah Anda menutup halaman.</p></div>';
  mount.appendChild(section);
  const el=id=>section.querySelector("#"+id);
  const status=el("ec-reset-status"),target=el("ec-reset-target"),search=el("ec-reset-search"),typed=el("ec-reset-confirm-id"),submit=el("ec-reset-submit");
  const secretBox=el("ec-reset-secret-box"),secret=el("ec-reset-secret"),identity=el("ec-reset-identity");
  let accounts=[],temporaryPassword=null;
  function clear(){
   temporaryPassword=null;secret.textContent="";identity.textContent="";secretBox.classList.add("hidden");
  }
  function selected(){return accounts.find(a=>a.employee_id===target.value);}
  function enabled(){submit.disabled=!selected()||typed.value.trim()!==target.value;}
  function paint(){
   const filter=search.value.toLocaleLowerCase("id-ID");
   target.replaceChildren();
   const empty=document.createElement("option");empty.value="";empty.textContent="Pilih EC";target.append(empty);
   accounts.filter(a=>(a.name+" "+a.employee_id).toLocaleLowerCase("id-ID").includes(filter)).forEach(a=>{
    const option=document.createElement("option");option.value=a.employee_id;
    option.textContent=a.name+" · "+a.employee_id+" ("+(a.status==="password_change_required"?"Wajib ganti password":a.status==="active"?"Aktif":"Periksa akun")+")";target.append(option);
   });
   target.disabled=false;typed.value="";enabled();
  }
  search.addEventListener("input",paint);
  target.addEventListener("change",()=>{typed.value="";enabled();clear();});
  typed.addEventListener("input",enabled);
  el("ec-reset-clear").addEventListener("click",clear);
  el("ec-reset-copy").addEventListener("click",async()=>{
   if(!temporaryPassword)return;
   try{await navigator.clipboard.writeText(temporaryPassword);status.textContent="Password sementara disalin. Serahkan hanya ke pemilik akun."; }
   catch{status.textContent="Gagal menyalin. Anda dapat menyalin manual dari layar."; }
  });
  try{
   const {data,error}=await ctx.client.functions.invoke("provision-ec-accounts",{body:{action:"list_ec_accounts"}});
   if(error||!data?.ok)throw Error(data?.error||error?.message||"Tidak dapat memuat akun EC");
   accounts=(data.accounts||[]).filter(a=>a.linked);
   paint();
   status.textContent=accounts.length+" akun EC terhubung. Reset hanya dilakukan pada satu akun yang Anda pilih.";
  }catch(err){status.textContent=err.message||"Daftar EC gagal dimuat.";return;}
  submit.addEventListener("click",async()=>{
   const person=selected();
   if(!person || typed.value.trim()!==person.employee_id)return;
   if(!window.confirm("Reset password akun "+person.name+" ("+person.employee_id+")? Akun tersebut akan wajib mengganti password pada login berikutnya. Pastikan identitas EC telah diverifikasi."))return;
   submit.disabled=true;clear();
   try{
    const {data,error}=await ctx.client.functions.invoke("provision-ec-accounts",{body:{action:"reset_password",employee_id:person.employee_id}});
    if(error||!data?.ok)throw Error(data?.error||error?.message||"Reset gagal");
    temporaryPassword=data.temporary_password;
    identity.textContent=data.name+" · "+data.employee_id;
    secret.textContent=temporaryPassword;secretBox.classList.remove("hidden");
    status.textContent="Reset berhasil. Kirim password sementara secara privat dan minta EC menggantinya saat login.";
    typed.value="";
   }catch(err){status.textContent=err.message||"Reset password gagal.";typed.value="";}
   finally{enabled();}
  });
 }
 window.ECPasswordReset={render};
})();

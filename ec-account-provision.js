/* Admin-only secure EC account onboarding. No credentials persist to storage. */
(function(){
 "use strict";
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function render(ctx,mount){
  if(ctx.profile?.role!=="admin"){mount.textContent="Hanya Admin yang dapat membuat akun EC.";return;}
  mount.innerHTML='<section class="panel rounded-2xl p-5 sm:p-7 max-w-4xl space-y-4">'+
   '<p class="text-xs uppercase tracking-widest text-cyan-300">Administrasi akun · EC</p>'+
   '<h3 class="text-xl font-semibold">Aktivasi Akun EC</h3>'+
   '<p class="text-sm text-slate-300 leading-6">Buat akun hanya untuk EC aktif dengan penugasan toko yang sah. Akun lama dipertahankan, tidak di-reset. Akun baru harus mengganti password sementara saat login pertama.</p>'+
   '<p class="text-sm text-amber-200">Password sementara hanya muncul satu kali di halaman Admin. Jangan membagikannya di grup dan verifikasi identitas setiap EC sebelum menyerahkan kredensial secara privat.</p>'+
   '<div id="ec-provision-status" class="text-sm text-slate-300" aria-live="polite">Memeriksa EC yang belum mempunyai akun…</div>'+
   '<div class="flex flex-wrap gap-3"><button id="ec-provision-preview" type="button" class="px-4 py-3 rounded-xl border border-cyan-500/60 text-cyan-200">Periksa ulang</button>'+
   '<button id="ec-provision-activate" type="button" disabled class="px-4 py-3 rounded-xl bg-cyan-400 text-slate-950 font-semibold disabled:opacity-50">Buat akun yang belum ada</button>'+
   '<button id="ec-provision-hide" type="button" class="px-4 py-3 rounded-xl border border-slate-600 text-slate-300">Sembunyikan kredensial</button></div>'+
   '<div id="ec-provision-output" class="hidden rounded-xl border border-amber-600/40 p-4"><h4 class="font-semibold mb-2 text-amber-200">Password sementara — terlihat satu kali</h4><div id="ec-provision-credentials" class="space-y-3"></div></div>'+
   '</section>';
  const status=mount.querySelector("#ec-provision-status");
  const preview=mount.querySelector("#ec-provision-preview"),activate=mount.querySelector("#ec-provision-activate");
  const hide=mount.querySelector("#ec-provision-hide"),box=mount.querySelector("#ec-provision-output"),entries=mount.querySelector("#ec-provision-credentials");
  const clear=()=>{entries.replaceChildren();box.classList.add("hidden");};
  const call=async action=>{
   const {data,error}=await ctx.client.functions.invoke("provision-ec-accounts",{body:{action}});
   if(error)throw new Error(data?.error||error.message||"Layanan aktivasi tidak tersedia.");
   if(data?.error)throw new Error(data.error);
   if(!data?.ok && action==="preview")throw new Error("Data audit tidak valid");
   return data;
  };
  let lastPreview=null;
  async function refresh(){
   activate.disabled=true;preview.disabled=true;status.textContent="Memvalidasi data EC dan toko…";
   try{
    lastPreview=await call("preview");
    status.textContent="EC aktif: "+lastPreview.active_ec+" · Sudah terhubung: "+lastPreview.already_linked+" · Perlu dibuat: "+lastPreview.to_create+".";
    activate.disabled=lastPreview.to_create===0;
   }catch(err){lastPreview=null;status.textContent=err.message||"Tidak bisa memverifikasi daftar EC.";}
   finally{preview.disabled=false;}
  }
  preview.addEventListener("click",()=>{clear();refresh();});
  hide.addEventListener("click",clear);
  activate.addEventListener("click",async()=>{
   if(!lastPreview||lastPreview.to_create===0)return;
   const yes=window.confirm("Buat "+lastPreview.to_create+" akun EC baru? Akun yang sudah ada tidak diubah. Password sementara hanya muncul sekali.");
   if(!yes)return;
   activate.disabled=true;preview.disabled=true;status.textContent="Mendaftarkan EC dan memeriksa hasil…";clear();
   try{
    const res=await call("activate");
    status.textContent="Dibuat: "+res.created_count+" · Sudah ada: "+res.linked_existing_count+" · Gagal: "+res.failed_count+".";
    const credentials=res.one_time_credentials||[];
    if(credentials.length){
     box.classList.remove("hidden");
     credentials.forEach(item=>{
      const line=document.createElement("div");
      line.className="border-b border-slate-700 pb-3 text-sm";
      const label=document.createElement("p");label.className="text-slate-300";
      label.textContent=item.employee_id+" · "+item.name;
      const username=document.createElement("p");username.className="text-xs text-slate-400 mt-1";
      username.textContent="Login ID: "+item.employee_id;
      const secret=document.createElement("code");secret.className="block break-all text-amber-200 mt-2";
      secret.textContent=item.password;
      const button=document.createElement("button");button.type="button";
      button.className="border border-amber-700/40 rounded-md px-3 py-1 text-xs mt-2";
      button.textContent="Salin password akun ini";
      button.addEventListener("click",async()=>{
       try{await navigator.clipboard.writeText(item.password);button.textContent="Tersalin";}catch{button.textContent="Salin manual";}
      });
      line.append(label,username,secret,button);entries.append(line);
     });
    }
    if(res.failed_count)status.textContent+=" Periksa hasil kegagalan sebelum mengulang.";
    lastPreview=null;
   }catch(err){status.textContent=err.message||"Aktivasi gagal, periksa sebelum mencoba ulang.";}
   finally{preview.disabled=false;}
  });
  await refresh();
 }
 window.ECAccountProvision={render};
})();

/* EC-only competitor sellout. Deliberately NEVER writes raw_sellout (Samsung data).
 * Storage requires the separately approved competitor_sellout migration with RLS. */
(function(){
 "use strict";
 const BRANDS=["Apple","Xiaomi","POCO","OPPO","vivo","realme","Infinix","TECNO","itel","HONOR","Huawei","Motorola","Nokia"];
 const enc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const currency=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0});
 const localDate=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${value.year}-${value.month}-${value.day}`;};
 const forbiddenModel=model=>/(samsung|galaxy)/i.test(model);
 function validate(v,stores){
  if(!BRANDS.includes(v.brand))throw Error("Pilih brand kompetitor yang tersedia.");
  if(typeof v.model!=="string"||v.model.trim().length<2||v.model.trim().length>100||forbiddenModel(v.model))throw Error("Model harus kompetitor, bukan Samsung/Galaxy.");
  if(!stores.some(x=>x.id===v.store_id))throw Error("Toko tidak terdaftar pada penugasan akun.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v.sold_at)||!Number.isFinite(Date.parse(v.sold_at+"T00:00:00Z"))||new Date(v.sold_at+"T00:00:00Z").toISOString().slice(0,10)!==v.sold_at||v.sold_at>localDate()||v.sold_at<"2024-01-01")throw Error("Tanggal transaksi tidak valid.");
  const qty=Number(v.qty),price=Number(v.unit_price);
  if(!Number.isInteger(qty)||qty<1||qty>100)throw Error("Jumlah unit harus 1–100.");
  if(!Number.isFinite(price)||price<0||price>1000000000)throw Error("Harga per unit tidak valid.");
  if((v.variant||"").length>80||(v.notes||"").length>500)throw Error("Varian atau catatan terlalu panjang.");
  return {store_id:v.store_id,sold_at:v.sold_at,brand:v.brand,model:v.model.trim(),variant:(v.variant||"").trim(),qty,unit_price:price,notes:(v.notes||"").trim()};
 }
 async function render(ctx,mount){
  if(ctx.profile?.role!=="ec"){mount.textContent="Menu input kompetitor hanya tersedia bagi EC.";return;}
  mount.innerHTML='<div class="space-y-5 max-w-4xl">'+
   '<div class="rounded-xl border border-cyan-700/30 bg-cyan-950/20 p-4 text-sm text-slate-200"><p class="font-semibold text-cyan-200">Sellout Brand Competitor · EC</p><p class="mt-2 leading-6">Form ini hanya untuk penjualan brand kompetitor. Sellout Samsung tidak boleh diinput di sini dan tetap diperbarui oleh Admin melalui file RAW Sellout.</p></div>'+
   '<div id="competitor-status" role="status" aria-live="polite" class="text-sm text-amber-200"></div>'+
   '<form id="competitor-form" class="hidden panel rounded-2xl p-4 sm:p-6 grid sm:grid-cols-2 gap-4 min-w-0" hidden>'+
    '<div class="sm:col-span-2"><h3 class="font-semibold text-white">Catat transaksi kompetitor</h3><p class="text-xs text-slate-400 mt-1">Toko dipilih dari daftar penugasan aktif Anda. Tidak mengubah KPI Samsung.</p></div>'+
    '<label class="block text-sm text-slate-300">Toko penempatan<select name="store_id" class="field block w-full rounded-xl p-3 mt-2" required></select></label>'+
    '<label class="block text-sm text-slate-300">Tanggal penjualan<input type="date" name="sold_at" class="field block w-full rounded-xl p-3 mt-2" required></label>'+
    '<label class="block text-sm text-slate-300">Brand kompetitor<select name="brand" class="field block w-full rounded-xl p-3 mt-2" required><option value="">Pilih brand</option>'+BRANDS.map(b=>'<option value="'+enc(b)+'">'+enc(b)+'</option>').join("")+'</select></label>'+
    '<label class="block text-sm text-slate-300">Model produk<input name="model" maxlength="100" class="field block w-full rounded-xl p-3 mt-2" placeholder="Contoh: iPhone 16" required></label>'+
    '<label class="block text-sm text-slate-300">Varian / memori (opsional)<input name="variant" maxlength="80" class="field block w-full rounded-xl p-3 mt-2" placeholder="Contoh: 128 GB"></label>'+
    '<label class="block text-sm text-slate-300">Jumlah unit<input name="qty" type="number" min="1" max="100" step="1" value="1" class="field block w-full rounded-xl p-3 mt-2" required></label>'+
    '<label class="block text-sm text-slate-300">Harga per unit (Rp)<input name="unit_price" type="number" min="0" max="1000000000" step="1" class="field block w-full rounded-xl p-3 mt-2" required placeholder="0"></label>'+
    '<div class="sm:col-span-2"><p class="text-sm text-slate-400">Total estimasi: <strong id="competitor-amount" class="text-white">Rp0</strong></p></div>'+
    '<label class="sm:col-span-2 block text-sm text-slate-300">Catatan (opsional)<textarea name="notes" maxlength="500" rows="2" class="field block w-full rounded-xl p-3 mt-2"></textarea></label>'+
    '<div class="sm:col-span-2 flex flex-wrap gap-3"><button type="submit" id="competitor-submit" class="rounded-xl px-5 py-3 bg-cyan-400 text-slate-950 font-semibold disabled:opacity-50">Simpan sellout kompetitor</button><button type="button" id="competitor-cancel" class="hidden rounded-xl px-5 py-3 border border-slate-500 text-white">Batal edit</button></div>'+
   '</form>'+
   '<section class="panel rounded-2xl p-4 sm:p-6 min-w-0"><h3 class="font-semibold text-white">Riwayat input saya</h3><p class="text-xs text-slate-400 mt-1">Hanya transaksi kompetitor yang dicatat melalui akun ini.</p><div id="competitor-history" class="mt-4 text-sm text-slate-400">Memuat…</div></section></div>';
  const status=mount.querySelector("#competitor-status"),form=mount.querySelector("#competitor-form"),history=mount.querySelector("#competitor-history");
  const say=(s,error=false)=>{status.textContent=s;status.className="text-sm "+(error?"text-rose-300":"text-emerald-300");};
  const missing=e=>e?.code==="42P01"||e?.code==="PGRST205"||/competitor_sellout.*(not found|does not exist|schema cache)/i.test(e?.message||"");
  // The signed-in user's JWT keeps exactly the same RLS policies as supabase-js.
  // Direct REST avoids stalled browser Auth session locks observed on mobile.
  const useRest=Boolean(ctx.accessToken&&ctx.apiUrl&&ctx.publishableKey);
  async function rest(path,method="GET",body){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetch(ctx.apiUrl+"/rest/v1/"+path,{
     method,signal:controller.signal,cache:"no-store",
     headers:{apikey:ctx.publishableKey,Authorization:"Bearer "+ctx.accessToken,
       ...(method!=="GET"?{"Content-Type":"application/json",Prefer:"return=minimal"}:{})},
     ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok){
     if(response.status===401)throw Error("Sesi EC sudah kedaluwarsa. Silakan login kembali.");
     if(response.status===403)throw Error("Akses transaksi ditolak. Periksa status EC dan toko penempatan.");
     const details=await response.json().catch(()=>({}));
     throw Error(details.message||details.error||"Permintaan database gagal (HTTP "+response.status+").");
    }
    return method==="GET"?{data:await response.json(),error:null}:{data:null,error:null};
   }catch(err){
    if(err.name==="AbortError")throw Error("Koneksi ke database tidak merespons. Periksa koneksi dan muat ulang menu.");
    throw err;
   }finally{clearTimeout(timer);}
  }
  const storeQuery=()=>useRest?rest("stores?select=id,site_id,site_name&order=site_name.asc"):
    ctx.client.from("stores").select("id,site_id,site_name").order("site_name");
  const historyQuery=()=>useRest?rest("competitor_sellout?select=id,sold_at,brand,model,variant,qty,unit_price,amount,notes,store_id,created_at&order=created_at.desc&limit=20"):
    ctx.client.from("competitor_sellout").select("id,sold_at,brand,model,variant,qty,unit_price,amount,notes,store_id,created_at").order("created_at",{ascending:false}).limit(20);
  const insertQuery=record=>useRest?rest("competitor_sellout","POST",record):
    ctx.client.from("competitor_sellout").insert(record);
  const updateQuery=(id,record)=>useRest?rest("competitor_sellout?id=eq."+encodeURIComponent(id),"PATCH",record):
    ctx.client.from("competitor_sellout").update(record).eq("id",id);
  const deleteQuery=id=>useRest?rest("competitor_sellout?id=eq."+encodeURIComponent(id),"DELETE"):
    ctx.client.from("competitor_sellout").delete().eq("id",id);
  let editingId=null,historyRows=[];
  const resetEdit=()=>{
    editingId=null;form.elements.namedItem("store_id").disabled=false;form.elements.namedItem("sold_at").readOnly=false;form.reset();form.elements.namedItem("sold_at").value=localDate();
    mount.querySelector("#competitor-submit").textContent="Simpan sellout kompetitor";
    mount.querySelector("#competitor-cancel").classList.add("hidden");
  };
  mount.querySelector("#competitor-cancel").addEventListener("click",()=>{resetEdit();say("Edit dibatalkan.");});
  let stores=[];
  try{
   // Do not block the input form just because history failed to load.
   const requestWithDeadline=async(query,label)=>{
    let timer;
    try{
     return await Promise.race([
      Promise.resolve(query),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+" tidak merespons. Periksa koneksi lalu buka ulang menu.")),12000);})
     ]);
    }finally{clearTimeout(timer);}
   };
   const storeResult=await requestWithDeadline(storeQuery(),"Daftar toko");
   if(storeResult.error)throw storeResult.error;
   stores=storeResult.data||[];
   if(!stores.length){say("Toko belum tersedia bagi akun EC ini. Pastikan profil EC aktif dan penugasan tokonya sudah sesuai; hubungi Admin.",true);history.textContent="Riwayat belum dapat ditampilkan.";return;}
   const select=form.elements.namedItem("store_id");
   stores.forEach(s=>{const option=document.createElement("option");option.value=s.id;option.textContent=s.site_name+" · "+s.site_id;select.appendChild(option);});
   const date=form.elements.namedItem("sold_at");date.value=localDate();date.max=date.value;
   const paintHistory=rows=>{
    historyRows=rows;
    if(!rows.length){history.textContent="Belum ada transaksi kompetitor.";return;}
    history.innerHTML='<div class="table-wrap"><table class="w-full text-sm"><thead><tr><th>Tanggal</th><th>Brand / Model</th><th>Qty</th><th>Total</th><th>Aksi</th></tr></thead><tbody>'+
     rows.map(x=>{
      const editable=x.sold_at===localDate();
      return '<tr><td>'+enc(x.sold_at)+'</td><td>'+enc(x.brand)+" · "+enc(x.model)+" "+enc(x.variant||"")+'</td><td>'+enc(x.qty)+'</td><td>'+enc(currency.format(Number(x.amount??(x.qty*x.unit_price))))+'</td><td>'+
       (editable?'<div class="flex gap-2"><button type="button" data-edit-id="'+enc(x.id)+'" class="text-cyan-300 underline">Edit</button><button type="button" data-delete-id="'+enc(x.id)+'" class="text-rose-300 underline">Delete</button></div>':'<span class="text-slate-500">Terkunci</span>')+'</td></tr>';
     }).join("")+'</tbody></table></div><p class="text-xs text-slate-400 mt-3">Perubahan hanya untuk transaksi milik Anda dengan tanggal penjualan hari ini.</p>';
   };
   history.addEventListener("click",async event=>{
    const edit=event.target.closest("[data-edit-id]"),del=event.target.closest("[data-delete-id]");
    if(!edit&&!del)return;
    const id=(edit||del).dataset[edit?"editId":"deleteId"];
    const row=historyRows.find(x=>x.id===id);
    if(!row||row.sold_at!==localDate()){say("Transaksi di luar hari berjalan tidak dapat diubah.",true);return;}
    if(edit){
      editingId=row.id;
      for(const key of ["store_id","sold_at","brand","model","variant","qty","unit_price","notes"]){
        const control=form.elements.namedItem(key);if(control)control.value=row[key]??"";
      }
      form.elements.namedItem("store_id").disabled=true;
      form.elements.namedItem("sold_at").readOnly=true;
      mount.querySelector("#competitor-submit").textContent="Simpan perubahan";
      mount.querySelector("#competitor-cancel").classList.remove("hidden");
      updateAmount();form.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    if(!window.confirm("Hapus input kompetitor hari ini? Tindakan ini akan tercatat dalam audit database."))return;
    try{
      const result=await requestWithDeadline(deleteQuery(id),"Penghapusan transaksi");
      if(result.error)throw result.error;
      say("Transaksi dihapus.");
      const refresh=await requestWithDeadline(historyQuery(),"Riwayat input");
      if(refresh.error)throw refresh.error;
      paintHistory(refresh.data||[]);
    }catch(error){say("Gagal menghapus: "+(error.message||"Akses ditolak."),true);}
   });
   form.classList.remove("hidden");form.hidden=false;
   say("Form siap. Pilih brand dan isi penjualan kompetitor pada toko penempatan Anda.");
   try{
    const salesResult=await requestWithDeadline(historyQuery(),"Riwayat input");
    if(salesResult.error)throw salesResult.error;
    paintHistory(salesResult.data||[]);
   }catch(historyError){
    history.textContent="Riwayat sementara tidak dapat dimuat. Form tetap tersedia; periksa koneksi jika hendak memverifikasi transaksi.";
   }
   const updateAmount=()=>{const qty=Number(form.elements.namedItem("qty").value),price=Number(form.elements.namedItem("unit_price").value);mount.querySelector("#competitor-amount").textContent=currency.format(Math.max(0,(Number.isFinite(qty)?qty:0)*(Number.isFinite(price)?price:0)));};
   form.addEventListener("input",updateAmount);
   form.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=mount.querySelector("#competitor-submit");button.disabled=true;
    try{
     const values=Object.fromEntries(new FormData(form));
     if(editingId){const original=historyRows.find(x=>x.id===editingId);if(!original||original.sold_at!==localDate())throw Error("Transaksi tidak lagi dapat diedit.");values.store_id=original.store_id;}
     const payload=validate(values,stores);
     // Server verifies ec_profile_id, store assignment and date independently via RLS.
     const record=editingId?payload:{...payload,ec_profile_id:ctx.profile.id,entry_key:crypto.randomUUID()};
     const {error}=await requestWithDeadline(editingId?updateQuery(editingId,record):insertQuery(record),"Penyimpanan transaksi");
     if(error)throw error;
     const selectedStore=form.elements.namedItem("store_id").value;
     resetEdit();form.elements.namedItem("store_id").disabled=false;form.elements.namedItem("sold_at").readOnly=false;form.elements.namedItem("store_id").value=selectedStore;date.value=localDate();updateAmount();
     say("Data kompetitor berhasil disimpan. Data Samsung tidak berubah.");
     try{
      const {data,error:loadError}=await requestWithDeadline(historyQuery(),"Riwayat input");
      if(loadError)throw loadError;
      paintHistory(data||[]);
     }catch(refreshError){
      say("Transaksi berhasil disimpan, tetapi riwayat belum dapat dimuat. Jangan kirim ulang transaksi yang sama.",true);
     }
    }catch(err){say(missing(err)?"Modul database kompetitor belum tersedia. Hubungi Admin.":(err.message||"Gagal menyimpan transaksi kompetitor. Jika koneksi terputus, periksa riwayat sebelum mengulangi input."),true);}
    finally{button.disabled=false;}
   });
  }catch(err){
   say(missing(err)?"Modul Input Competitor sedang menunggu aktivasi database. Data Samsung tidak terpengaruh.":("Gagal menyiapkan modul kompetitor: "+(err.message||"Kesalahan jaringan")),true);
   history.textContent="Riwayat belum tersedia.";
  }
 }
 window.ECCompetitorSellout={render,validate,BRANDS};
})();

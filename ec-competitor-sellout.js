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
   '<form id="competitor-form" class="hidden panel rounded-2xl p-5 sm:p-6 grid sm:grid-cols-2 gap-4" hidden>'+
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
    '<div class="sm:col-span-2"><button type="submit" id="competitor-submit" class="rounded-xl px-5 py-3 bg-cyan-400 text-slate-950 font-semibold disabled:opacity-50">Simpan sellout kompetitor</button></div>'+
   '</form>'+
   '<section class="panel rounded-2xl p-5 sm:p-6"><h3 class="font-semibold text-white">Riwayat input saya</h3><p class="text-xs text-slate-400 mt-1">Hanya transaksi kompetitor yang dicatat melalui akun ini.</p><div id="competitor-history" class="mt-4 text-sm text-slate-400">Memuat…</div></section></div>';
  const status=mount.querySelector("#competitor-status"),form=mount.querySelector("#competitor-form"),history=mount.querySelector("#competitor-history");
  const say=(s,error=false)=>{status.textContent=s;status.className="text-sm "+(error?"text-rose-300":"text-emerald-300");};
  const missing=e=>e?.code==="42P01"||e?.code==="PGRST205"||/competitor_sellout.*(not found|does not exist|schema cache)/i.test(e?.message||"");
  let stores=[];
  try{
   const results=await Promise.all([
    ctx.client.from("stores").select("id,site_id,site_name").order("site_name"),
    ctx.client.from("competitor_sellout").select("id,sold_at,brand,model,variant,qty,unit_price,amount,created_at").order("created_at",{ascending:false}).limit(20)
   ]);
   const [storeResult,salesResult]=results;
   if(storeResult.error)throw storeResult.error;
   if(salesResult.error)throw salesResult.error;
   stores=storeResult.data||[];
   if(!stores.length){say("Akun EC belum memiliki toko yang bisa diakses. Hubungi Admin untuk mengecek penugasan.",true);history.textContent="Belum dapat memuat transaksi.";return;}
   const select=form.elements.namedItem("store_id");
   stores.forEach(s=>{const option=document.createElement("option");option.value=s.id;option.textContent=s.site_name+" · "+s.site_id;select.appendChild(option);});
   const date=form.elements.namedItem("sold_at");date.value=localDate();date.max=date.value;
   const paintHistory=rows=>{
    if(!rows.length){history.textContent="Belum ada transaksi kompetitor.";return;}
    history.innerHTML='<div class="table-wrap"><table class="w-full text-sm"><thead><tr><th>Tanggal</th><th>Brand / Model</th><th>Qty</th><th>Total</th></tr></thead><tbody>'+
     rows.map(x=>'<tr><td>'+enc(x.sold_at)+'</td><td>'+enc(x.brand)+" · "+enc(x.model)+" "+enc(x.variant||"")+'</td><td>'+enc(x.qty)+'</td><td>'+enc(currency.format(Number(x.amount??(x.qty*x.unit_price))))+'</td></tr>').join("")+'</tbody></table></div>';
   };
   paintHistory(salesResult.data||[]);
   form.classList.remove("hidden");form.hidden=false;say("Silakan input penjualan kompetitor sesuai toko penempatan.");
   const updateAmount=()=>{const qty=Number(form.elements.namedItem("qty").value),price=Number(form.elements.namedItem("unit_price").value);mount.querySelector("#competitor-amount").textContent=currency.format(Math.max(0,(Number.isFinite(qty)?qty:0)*(Number.isFinite(price)?price:0)));};
   form.addEventListener("input",updateAmount);
   form.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=mount.querySelector("#competitor-submit");button.disabled=true;
    try{
     const values=Object.fromEntries(new FormData(form));
     const payload=validate(values,stores);
     // Server verifies ec_profile_id, store assignment and date independently via RLS.
     const record={...payload,ec_profile_id:ctx.profile.id,entry_key:crypto.randomUUID()};
     const {error}=await ctx.client.from("competitor_sellout").insert(record);
     if(error)throw error;
     const selectedStore=form.elements.namedItem("store_id").value;
     form.reset();form.elements.namedItem("store_id").value=selectedStore;date.value=localDate();updateAmount();
     say("Sellout kompetitor berhasil disimpan. Data Samsung tidak berubah.");
     try{
      const {data,error:loadError}=await ctx.client.from("competitor_sellout").select("id,sold_at,brand,model,variant,qty,unit_price,amount,created_at").order("created_at",{ascending:false}).limit(20);
      if(loadError)throw loadError;
      paintHistory(data||[]);
     }catch(refreshError){
      say("Transaksi berhasil disimpan, tetapi riwayat belum dapat dimuat. Jangan kirim ulang transaksi yang sama.",true);
     }
    }catch(err){say(missing(err)?"Modul database kompetitor belum diaktifkan. Tidak ada transaksi disimpan.":(err.message||"Gagal menyimpan transaksi kompetitor."),true);}
    finally{button.disabled=false;}
   });
  }catch(err){
   say(missing(err)?"Modul Input Competitor sedang menunggu aktivasi database. Data Samsung tidak terpengaruh.":("Gagal menyiapkan modul kompetitor: "+(err.message||"Kesalahan jaringan")),true);
   history.textContent="Riwayat belum tersedia.";
  }
 }
 window.ECCompetitorSellout={render,validate,BRANDS};
})();

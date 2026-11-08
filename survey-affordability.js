/* Survey Affordability — Samsung Kalteng. No changes to RAW Sellout. */
(function(){
"use strict";
const PROVIDERS=["HCI","KREDIVO","FIF","SPEKTRA","YESSSKREDIT","AKULAKU","SPAYLATER","INDODANA","SAMSUNG FINANCE+","KREDITPLUS","BAF","KARTU KREDIT BANK"];
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localDate=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day};
const num=x=>new Intl.NumberFormat("id-ID").format(x||0);
const safeSheet=x=>{let a=String(x??"");if(/^[\s]*[=+@\-\t\r]/.test(a))a="'"+a;return a};
function validateSurvey({answer,confirmed,closings},stores,storeId){
 if(!stores.some(s=>s.id===storeId))throw Error("Toko tidak sesuai dengan penugasan EC.");
 if(answer!=="yes"&&answer!=="no")throw Error("Pilih Ya atau Tidak.");
 if(answer==="no"){
  if(confirmed!==true)throw Error("Konfirmasi wajib sebelum melaporkan tidak ada multifinance.");
  return {has_multifinance:false,no_finance_confirmed:true,closings:[]};
 }
 if(!Array.isArray(closings)||!closings.length||closings.length>25)throw Error("Tambahkan minimal satu model closing (maksimal 25).");
 return {has_multifinance:true,no_finance_confirmed:false,closings:closings.map((c)=>{
  const model=String(c.model??"").trim(),provider=c.provider,qty=Number(c.qty);
  if(model.length<2||model.length>100)throw Error("Model harus diisi (2–100 karakter).");
  if(!PROVIDERS.includes(provider))throw Error("Pilih multifinance dari daftar resmi.");
  if(!Number.isInteger(qty)||qty<1||qty>100)throw Error("Jumlah unit harus 1–100.");
  return {model,provider,qty};
 })};
}
async function request(ctx,table,options={}){
 const {select="*",filters=[],method="GET",payload}=options;
 if(ctx.accessToken&&ctx.apiUrl&&ctx.publishableKey){
  const params=new URLSearchParams({select});
  filters.forEach(([key,operator,value])=>params.set(key,operator+"."+value));
  if(method==="GET"&&table==="stores")params.set("order","site_name.asc");
  if(method==="GET"&&table==="affordability_surveys")params.set("order","survey_date.desc");
  const pageSize=500,all=[];
  // Supabase Data API commonly caps response size: paginate to prevent truncated
  // monthly dashboards when >1000 EC/store/day responses exist.
  for(let offset=0;offset<20000;offset+=pageSize){
   if(method==="GET" && table==="affordability_surveys"){
    params.set("limit",String(pageSize));params.set("offset",String(offset));
   }
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   let rows;
   try{
    const response=await fetch(ctx.apiUrl+"/rest/v1/"+table+"?"+params.toString(),{
     method,signal:controller.signal,cache:"no-store",
     headers:{apikey:ctx.publishableKey,Authorization:"Bearer "+ctx.accessToken,
        ...(method==="POST"?{"Content-Type":"application/json",Prefer:"return=minimal"}:{})},
     ...(method==="POST"?{body:JSON.stringify(payload)}:{})
    });
    if(!response.ok){
     const info=await response.json().catch(()=>({}));
     if(response.status===409||info.code==="23505")throw Error("Survey hari ini untuk toko tersebut sudah dikirim. Tidak perlu dikirim ulang.");
     if(response.status===401)throw Error("Sesi berakhir. Silakan login kembali.");
     if(response.status===403||info.code==="42501")throw Error("Akses ditolak. Periksa penugasan toko dan status EC.");
     if(info.code==="42P01"||info.code==="PGRST205")throw Error("Database Survey belum diaktifkan. Form belum dapat menyimpan.");
     throw Error(info.message||"Permintaan ditolak (HTTP "+response.status+").");
    }
    rows=method==="POST"?[]:await response.json();
   }catch(err){
    if(err.name==="AbortError")throw Error("Koneksi survey tidak merespons. Cek riwayat sebelum mengulangi pengiriman.");
    throw err;
   }finally{clearTimeout(timer)}
   if(method==="POST"||table!=="affordability_surveys")return rows;
   all.push(...rows);
   if(rows.length<pageSize)return all;
  }
  throw Error("Hasil survei lebih dari 20.000 baris. Persempit rentang tanggal laporan.");
 }
 if(method==="POST"){
  const {error}=await ctx.client.from(table).insert(payload);
  if(error)throw Error(error.message);
  return [];
 }
 const all=[],pageSize=500;
 for(let from=0;from<20000;from+=pageSize){
  let q=ctx.client.from(table).select(select);
  filters.forEach(([k,op,value])=>{q=q[op](k,value)});
  if(table==="affordability_surveys")q=q.order("survey_date",{ascending:false});
  const {data,error}=await q.range(from,from+pageSize-1);
  if(error)throw Error(error.message);
  all.push(...(data||[]));
  if(!data||data.length<pageSize)return all;
 }
 throw Error("Hasil survei lebih dari 20.000 baris. Persempit rentang tanggal laporan.");
}
function renderEC(ctx,mount){
 const today=localDate();
 mount.innerHTML='<div class="max-w-3xl space-y-5">'+
  '<div class="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4"><p class="text-cyan-200 font-semibold">Survey Affordability · EC</p>'+
   '<p class="text-sm text-slate-300 mt-2">Laporan harian penggunaan multifinance untuk transaksi closing di toko penempatan Anda. Survey ini tidak mengubah RAW Sellout Samsung.</p></div>'+
  '<p id="aff-status" role="status" aria-live="polite" class="text-sm text-amber-200">Memeriksa data survei hari ini…</p>'+
  '<form id="aff-form" class="hidden panel rounded-2xl p-4 sm:p-6 space-y-5" hidden>'+
   '<div class="grid sm:grid-cols-2 gap-4">'+
    '<label class="block text-sm text-slate-200">Tanggal survey<input class="field block w-full rounded-xl p-3 mt-2" type="text" value="'+today+'" disabled></label>'+
    '<label class="block text-sm text-slate-200">Toko penempatan<select name="store_id" class="field block w-full rounded-xl p-3 mt-2" required></select></label>'+
   '</div>'+
   '<fieldset><legend class="text-sm font-semibold text-white">1. Apakah ada unit sellout menggunakan multifinance hari ini?</legend>'+
    '<div class="grid grid-cols-2 gap-3 mt-3">'+
     '<label class="rounded-xl border border-slate-600 p-4 cursor-pointer"><input type="radio" name="answer" value="yes" required> <span class="ml-2">Ya</span></label>'+
     '<label class="rounded-xl border border-slate-600 p-4 cursor-pointer"><input type="radio" name="answer" value="no" required> <span class="ml-2">Tidak</span></label>'+
    '</div></fieldset>'+
   '<div id="aff-yes" class="hidden space-y-3"><p class="text-sm text-slate-300">2. Model closing dan 3. Multifinance yang digunakan</p>'+
    '<div id="aff-rows" class="space-y-3"></div>'+
    '<button id="aff-add" type="button" class="rounded-xl border border-cyan-500/50 text-cyan-200 px-4 py-3 text-sm">+ Tambah model closing</button></div>'+
   '<div id="aff-no" class="hidden rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-3">'+
    '<p class="text-sm text-amber-200 font-medium">Konfirmasi laporan tanpa multifinance</p>'+
    '<label class="flex items-start gap-3 text-sm text-slate-200"><input id="aff-confirm" type="checkbox" class="mt-1">'+
    '<span>Saya memastikan tidak ada unit sellout menggunakan multifinance di toko tersebut pada hari yang sama dengan pengisian survey ini.</span></label></div>'+
   '<button id="aff-submit" type="submit" class="w-full rounded-xl bg-cyan-400 text-slate-950 font-semibold p-3 min-h-12">Kirim survey harian</button>'+
  '</form>'+
  '<section class="panel rounded-2xl p-4 sm:p-6"><h3 class="font-semibold text-white">Riwayat survey saya</h3><div id="aff-history" class="mt-3 text-sm text-slate-300">Memuat…</div></section></div>';
 const status=mount.querySelector("#aff-status"),form=mount.querySelector("#aff-form"),history=mount.querySelector("#aff-history");
 let stores=[],saved=[];
 const rowContainer=mount.querySelector("#aff-rows");
 const addRow=()=>{
  if(rowContainer.children.length>=25)return;
  const div=document.createElement("div");div.className="rounded-xl border border-slate-700 p-3 grid sm:grid-cols-[1fr_1fr_88px_auto] gap-2";
  div.innerHTML='<label class="text-xs text-slate-300">Model & varian<input name="model" class="field block w-full p-3 rounded-lg mt-1" maxlength="100" placeholder="A08 4/64" required></label>'+
    '<label class="text-xs text-slate-300">Multifinance<select name="provider" class="field block w-full p-3 rounded-lg mt-1" required><option value="">Pilih</option>'+
    PROVIDERS.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join("")+'</select></label>'+
    '<label class="text-xs text-slate-300">Qty<input name="qty" type="number" min="1" max="100" step="1" value="1" class="field block w-full p-3 rounded-lg mt-1" required></label>'+
    '<button type="button" class="self-end rounded-lg border border-slate-600 px-3 py-3 text-xs">Hapus</button>';
  div.querySelector("button").addEventListener("click",()=>{if(rowContainer.children.length>1)div.remove()});
  rowContainer.append(div);
 };
 addRow();
 mount.querySelector("#aff-add").addEventListener("click",addRow);
 const showAnswer=()=>{
  const answer=form.querySelector("input[name=answer]:checked")?.value;
  mount.querySelector("#aff-yes").classList.toggle("hidden",answer!=="yes");
  mount.querySelector("#aff-no").classList.toggle("hidden",answer!=="no");
  rowContainer.querySelectorAll("input,select").forEach(el=>el.disabled=answer!=="yes");
  mount.querySelector("#aff-confirm").disabled=answer!=="no";
 };
 form.querySelectorAll('input[name="answer"]').forEach(el=>el.addEventListener("change",showAnswer));
 function paint(){
  if(!saved.length){history.textContent="Belum ada survey tersimpan.";return;}
  history.innerHTML='<div class="table-wrap"><table class="w-full text-sm"><thead><tr><th>Tanggal</th><th>Toko</th><th>Hasil</th><th>Unit Finance</th></tr></thead><tbody>'+
  saved.map(s=>'<tr><td>'+esc(s.survey_date)+'</td><td>'+esc(stores.find(x=>x.id===s.store_id)?.site_name||s.store_id)+'</td><td>'+esc(s.has_multifinance?"Ya":"Tidak (terkonfirmasi)")+'</td><td>'+num((s.closings||[]).reduce((n,c)=>n+Number(c.qty||0),0))+'</td></tr>').join("")+'</tbody></table></div>';
 }
 const load=async()=>{
  stores=await request(ctx,"stores",{select:"id,site_id,site_name"});
  saved=await request(ctx,"affordability_surveys",{select:"id,store_id,survey_date,has_multifinance,closings,created_at"});
  paint();
  const select=form.elements.namedItem("store_id");select.replaceChildren();
  stores.forEach(store=>{const o=document.createElement("option");o.value=store.id;o.textContent=store.site_name+" · "+store.site_id;select.append(o)});
  if(!stores.length){status.textContent="Toko EC belum tersedia. Hubungi Admin untuk memeriksa penugasan.";return;}
  const disableSubmitted=()=>{const already=saved.some(s=>s.store_id===select.value&&s.survey_date===today);mount.querySelector("#aff-submit").disabled=already;status.textContent=already?"Survey hari ini untuk toko tersebut sudah dikirim.":"Survey "+today+" siap diisi. Pilih jawaban Ya atau Tidak.";};
  select.addEventListener("change",disableSubmitted);
  form.classList.remove("hidden");form.hidden=false;disableSubmitted();
  form.addEventListener("submit",async e=>{
   e.preventDefault();
   const answer=form.querySelector("input[name=answer]:checked")?.value;
   const closings=Array.from(rowContainer.children).map(div=>({
    model:div.querySelector('[name="model"]').value,
    provider:div.querySelector('[name="provider"]').value,
    qty:div.querySelector('[name="qty"]').value
   }));
   let validated;
   try{validated=validateSurvey({answer,confirmed:mount.querySelector("#aff-confirm").checked,closings},stores,select.value)}
   catch(err){status.textContent=err.message;return}
   if(answer==="no"&&!window.confirm("Pastikan: tidak ada unit sellout menggunakan multifinance di toko ini pada "+today+". Kirim konfirmasi Tidak?"))return;
   if(answer==="yes"&&!window.confirm("Kirim "+validated.closings.length+" baris model closing multifinance untuk "+today+"?"))return;
   const submit=mount.querySelector("#aff-submit");submit.disabled=true;status.textContent="Mengirim survey…";
   try{
    await request(ctx,"affordability_surveys",{method:"POST",payload:{ec_profile_id:ctx.profile.id,employee_id:ctx.profile.employee_id,store_id:select.value,survey_date:today,...validated}});
    saved=await request(ctx,"affordability_surveys",{select:"id,store_id,survey_date,has_multifinance,closings,created_at"});paint();
    status.textContent="Survey tersimpan. Terima kasih. Jawaban hari ini tidak dapat dikirim dua kali.";
   }catch(err){status.textContent=err.message||"Gagal mengirim survey. Periksa riwayat sebelum mengulangi.";submit.disabled=false}
  });
 };
 load().catch(err=>{status.textContent=err.message||"Modul survey belum tersedia.";history.textContent="Riwayat belum bisa dimuat."});
}
function summarize(rows){
 const byProvider=new Map(),byModel=new Map(),daily=new Map(),details=[],responses=[];
 let yes=0,no=0,units=0;
 for(const r of rows){
  const totalUnits=(r.closings||[]).reduce((n,c)=>n+Number(c.qty||0),0);
  responses.push({date:r.survey_date,employee_id:r.employee_id||"",store:r.site_name||"",answer:r.has_multifinance?"Ya":"Tidak",confirmed:r.no_finance_confirmed===true,units:totalUnits});
  if(!r.has_multifinance){no++;continue}
  yes++;
  for(const c of r.closings||[]){
   const qty=Number(c.qty||0),name=String(c.provider||""),model=String(c.model||"");
   units+=qty;byProvider.set(name,(byProvider.get(name)||0)+qty);
   byModel.set(model,(byModel.get(model)||0)+qty);
   daily.set(r.survey_date,(daily.get(r.survey_date)||0)+qty);
   details.push({date:r.survey_date,employee_id:r.employee_id||"",store:r.site_name||"",model,provider:name,qty});
  }
 }
 const sorted=m=>[...m].sort((a,b)=>b[1]-a[1]).map(([name,qty])=>({name,qty}));
 return {yes,no,units,surveys:rows.length,byProvider:sorted(byProvider),byModel:sorted(byModel),daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,qty])=>({date,qty})),details,responses};
}
function downloadDashboard(summary,period){
 if(!window.XLSX)throw Error("Fitur ekspor XLSX belum dimuat pada browser ini. Muat ulang halaman.");
 const wb=window.XLSX.utils.book_new(),add=(name,rows)=>{
  const ws=window.XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(v=>typeof v==="string"?safeSheet(v):v)));
  ws["!cols"]=rows[0]?.map((_,i)=>({wch:i===0?28:22}));
  window.XLSX.utils.book_append_sheet(wb,ws,name);
 };
 add("Dashboard",[
  ["SURVEY AFFORDABILITY | SAMSUNG KALTENG"],["Periode",period],
  ["Total Survey",summary.surveys],["Survey Ya",summary.yes],
  ["Survey Tidak",summary.no],["Unit Multifinance",summary.units],
  ["Catatan","Data deklarasi EC; bukan rekonsiliasi RAW Sellout Samsung"],
  [],["Multifinance","Total Unit"],...summary.byProvider.map(x=>[x.name,x.qty]),
  [],["Model","Total Unit"],...summary.byModel.map(x=>[x.name,x.qty])
 ]);
 add("Multifinance",[["Multifinance","Unit"],...summary.byProvider.map(x=>[x.name,x.qty])]);
 add("Model",[["Model","Unit"],...summary.byModel.map(x=>[x.name,x.qty])]);
 add("Harian",[["Tanggal","Unit"],...summary.daily.map(x=>[x.date,x.qty])]);
 add("Detail",[["Tanggal","ID EC","Toko","Model","Multifinance","Qty"],...summary.details.map(x=>[x.date,x.employee_id,x.store,x.model,x.provider,x.qty])]);
 add("Respons Harian",[["Tanggal","ID EC","Toko","Jawaban","Konfirmasi Tidak","Unit Multifinance"],...summary.responses.map(x=>[x.date,x.employee_id,x.store,x.answer,x.confirmed?"Ya":"—",x.units])]);
 window.XLSX.writeFile(wb,"survey-affordability-"+period.replace(/[^0-9-]/g,"")+"-dashboard.xlsx");
}
function renderReport(ctx,mount){
 mount.innerHTML='<div class="space-y-5">'+
  '<div class="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4"><h3 class="text-lg text-white font-semibold">Dashboard Sellout Multifinance</h3>'+
   '<p class="text-sm text-slate-300 mt-1">Rekap survey affordability EC sesuai cakupan toko Anda. Bukan data sellout resmi RAW.</p></div>'+
  '<div class="flex flex-wrap gap-3 items-end"><label class="text-sm text-slate-300">Dari tanggal<input id="aff-from" type="date" class="field block mt-2 rounded-xl p-3"></label>'+
  '<label class="text-sm text-slate-300">Sampai tanggal<input id="aff-to" type="date" class="field block mt-2 rounded-xl p-3"></label>'+
  '<button id="aff-load" type="button" class="rounded-xl bg-cyan-400 p-3 text-slate-950 font-semibold">Tampilkan</button>'+
  '<button id="aff-download" type="button" disabled class="rounded-xl border border-cyan-400/60 text-cyan-200 p-3 disabled:opacity-40">Unduh Dashboard XLSX</button></div>'+
  '<p id="aff-report-status" role="status" aria-live="polite" class="text-sm text-slate-300">Memuat laporan…</p>'+
  '<div id="aff-metrics" class="grid grid-cols-2 sm:grid-cols-4 gap-3"></div>'+
  '<div class="grid lg:grid-cols-2 gap-4"><section class="panel rounded-xl p-4"><h4 class="font-semibold">Unit per multifinance</h4><div id="aff-providers" class="space-y-3 mt-4"></div></section>'+
  '<section class="panel rounded-xl p-4"><h4 class="font-semibold">Model terjual via multifinance</h4><div id="aff-models" class="space-y-3 mt-4"></div></section></div>'+
  '<section class="panel rounded-xl p-4"><h4 class="font-semibold">Detail survey per EC / toko</h4><div id="aff-detail" class="table-wrap mt-4"></div></section></div>';
 const today=localDate(),start=today.slice(0,7)+"-01";
 const from=mount.querySelector("#aff-from"),to=mount.querySelector("#aff-to");
 from.value=start;to.value=today;to.max=today;
 const status=mount.querySelector("#aff-report-status"),download=mount.querySelector("#aff-download");
 let summary=null;
 const bars=(rows,total)=>rows.length?rows.slice(0,15).map(x=>
  '<div class="space-y-1"><div class="flex items-center justify-between gap-2 text-xs"><span>'+esc(x.name)+'</span><b>'+num(x.qty)+' unit</b></div>'+
  '<div class="h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-cyan-400" style="width:'+Math.min(100,total?100*x.qty/total:0)+'%"></div></div></div>').join(""):'<p class="text-sm text-slate-400">Belum ada closing multifinance pada periode ini.</p>';
 async function load(){
  if(!from.value||!to.value||from.value>to.value){status.textContent="Rentang tanggal tidak valid.";return}
  const btn=mount.querySelector("#aff-load");btn.disabled=true;download.disabled=true;status.textContent="Mengambil survey sesuai cakupan…";
  try{
   const [surveys,stores]=await Promise.all([
    request(ctx,"affordability_surveys",{select:"employee_id,store_id,survey_date,has_multifinance,no_finance_confirmed,closings",filters:[["survey_date","gte",from.value],["survey_date","lte",to.value]]}),
    request(ctx,"stores",{select:"id,site_name,site_id"})
   ]);
   const storeMap=new Map(stores.map(s=>[s.id,s.site_name]));
   summary=summarize(surveys.map(s=>({...s,site_name:storeMap.get(s.store_id)||s.store_id})));
   const metrics=[["Survey terkumpul",summary.surveys],["Jawaban Ya",summary.yes],["Jawaban Tidak",summary.no],["Unit via multifinance",summary.units]];
   mount.querySelector("#aff-metrics").innerHTML=metrics.map(([l,n])=>'<div class="metric p-4 rounded-xl"><p class="text-xs">'+esc(l)+'</p><p class="text-2xl font-semibold mt-2">'+num(n)+'</p></div>').join("");
   mount.querySelector("#aff-providers").innerHTML=bars(summary.byProvider,summary.units);
   mount.querySelector("#aff-models").innerHTML=bars(summary.byModel,summary.units);
   mount.querySelector("#aff-detail").innerHTML='<table class="w-full text-sm"><thead><tr><th>Tanggal</th><th>EC</th><th>Toko</th><th>Model</th><th>Multifinance</th><th>Qty</th></tr></thead><tbody>'+
    (summary.details.slice(0,100).map(d=>'<tr><td>'+esc(d.date)+'</td><td>'+esc(d.employee_id)+'</td><td>'+esc(d.store)+'</td><td>'+esc(d.model)+'</td><td>'+esc(d.provider)+'</td><td>'+num(d.qty)+'</td></tr>').join("")||
     '<tr><td colspan="6">Belum ada data closing.</td></tr>')+'</tbody></table>';
   status.textContent=num(summary.surveys)+" survey terhimpun pada rentang "+from.value+" hingga "+to.value+".";
   download.disabled=false;
  }catch(err){status.textContent=err.message||"Gagal memuat survey.";summary=null}
  finally{btn.disabled=false}
 }
 mount.querySelector("#aff-load").addEventListener("click",load);
 download.addEventListener("click",()=>{
  if(!summary)return;
  try{downloadDashboard(summary,from.value+"_"+to.value)}catch(err){status.textContent=err.message}
 });
 load();
}
function render(ctx,mount){
 if(!["ec","tl","admin"].includes(ctx.profile?.role)){
  mount.textContent="Survey Affordability hanya untuk EC, TL, dan Admin.";return;
 }
 if(ctx.profile.role==="ec")renderEC(ctx,mount);
 else renderReport(ctx,mount);
}
window.SamsungAffordability={render,validateSurvey,summarize,PROVIDERS};
})();

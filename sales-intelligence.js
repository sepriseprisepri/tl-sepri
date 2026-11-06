/* Samsung Kalteng Sales Intelligence — scoped summaries, insight rules and chart studio.
   No service key; all data is supplied by existing RLS-protected queries. */
(function(){
"use strict";
const fmt=new Intl.NumberFormat("id-ID",{maximumFractionDigits:2});
const cash=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0});
const n=x=>Number(x||0),N=x=>fmt.format(n(x)),money=x=>cash.format(n(x));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct=(a,b)=>b>0?Math.round(100*a/b*10)/10:0;
const dateLocal=()=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
 return parts.year+"-"+parts.month+"-"+parts.day;
};
const group=(rows,field,key)=>{const map=new Map();for(const r of rows){const id=key(r);map.set(id,(map.get(id)||0)+n(r[field]));}return map;};
const allBy=(rows,fn)=>rows.reduce((acc,r)=>acc+n(fn(r)),0);
const valid=s=>String(s.eula_status||"").toUpperCase()==="VALID";
const panel=(title,content,extra="")=>'<section class="intel-card '+extra+'"><div class="intel-card-head"><h3>'+esc(title)+'</h3></div>'+content+'</section>';
const modelNorm=x=>String(x||"").trim().toUpperCase().replace(/\s+/g," ");
let activeContext=null,lastToken=0,chartObjs=[],searchBound=false;
const analytics={
 compute({period,stores=[],targets=[],sales=[],manpower=[],profile, promos=[]}){
  const good=sales.filter(valid),pending=sales.filter(s=>String(s.eula_status).toUpperCase()==="PENDING");
  const targetsByStore=new Map();
  for(const t of targets)targetsByStore.set(t.store_id,(targetsByStore.get(t.store_id)||0)+n(t.target_qty));
  const siteById=new Map(stores.map(s=>[s.id,s.site_id]));
  const covered=new Set(stores.map(s=>s.site_id));
  const targetQty=allBy(targets,t=>t.target_qty),actualQty=allBy(good,s=>s.qty);
  const totalAmt=allBy(targets,t=>t.target_amt),actualAmt=allBy(good,s=>s.amt);
  const actualByStore=group(good,"qty",s=>s.site_id);
  const missing=profile.role==="ec"?[]:stores.filter(s=>!targetsByStore.has(s.id));
  const unmapped=sales.filter(s=>["UNMAPPED","NO_PROMOTER_ID"].includes(String(s.promoter_mapping_status||"").toUpperCase()));
  // Avoid treating mere absence of a target as underachievement.
  const localToday=dateLocal(),day0=period?.period_start||localToday,dayEnd=period?.period_end||localToday;
  const duration=Math.max(1,Math.round((Date.parse(dayEnd+"T12:00:00Z")-Date.parse(day0+"T12:00:00Z"))/86400000)+1);
  const elapsed=Math.max(0,Math.min(duration,Math.round((Date.parse(localToday+"T12:00:00Z")-Date.parse(day0+"T12:00:00Z"))/86400000)+1));
  const timeGone=elapsed/duration;
  const pace=targetQty*timeGone;
  const slowStores=profile.role==="ec"?[]:stores.filter(s=>{
   const target=targetsByStore.get(s.id)||0;
   return target>0 && elapsed>0 && n(actualByStore.get(s.site_id)) < target*timeGone*.65;
  });
  const models=[...group(good,"qty",s=>modelNorm(s.model)||"Tidak diketahui").entries()]
   .map(([model,qty])=>({model,qty})).sort((a,b)=>b.qty-a.qty);
  const activePromo=promos.filter(p=>p.published&&p.verification_state==="verified"&&p.start_date<=localToday&&p.end_date>=localToday);
  const activeByModel=new Map(activePromo.filter(p=>p.model_code!=="*").map(p=>[modelNorm(p.model_code),p]));
  const promoOpportunity=models.filter(m=>activeByModel.has(m.model)&&m.qty>0).slice(-3);
  const alerts=[];
  if(pending.length)alerts.push({id:"pending",level:"warning",count:pending.length,title:"EULA PENDING",desc:pending.length+" transaksi belum masuk pencapaian resmi.",target:profile.role==="ec"?"Laporan Saya":"RAW Sellout"});
  if(unmapped.length)alerts.push({id:"mapping",level:"critical",count:unmapped.length,title:"Promoter belum termapping",desc:unmapped.length+" transaksi membutuhkan pemeriksaan identitas promoter.",target:profile.role==="admin"?"Data & Import":"RAW Sellout"});
  if(missing.length)alerts.push({id:"target",level:"warning",count:missing.length,title:"Store tanpa target",desc:missing.length+" store dalam cakupan belum mempunyai target periode.",target:profile.role==="admin"?"Target":"Coverage & Toko"});
  if(slowStores.length)alerts.push({id:"pace",level:"info",count:slowStores.length,title:"Di bawah pace",desc:slowStores.length+" toko di bawah 65% proyeksi pace bulan berjalan.",target:profile.role==="admin"?"Target":"Coverage & Toko"});
  return {good,pending,unmapped,missing,slowStores,alerts,models,promoOpportunity,targetQty,actualQty,totalAmt,actualAmt,timeGone,pace,elapsed,duration,covered,activePromo,validCount:good.length,actualByStore,siteById};
 },
 insights(data,role){
  const a=analytics.compute(data),items=[];
  const roleText={admin:"seluruh wilayah",tl:"coverage TL",tso:"wilayah TSO",ec:"penjualan pribadi EC"}[role]||"cakupan Anda";
  items.push({type:"summary",title:"Performa "+roleText,
    body:a.targetQty>0?"Capaian Qty VALID "+N(a.actualQty)+" dari "+N(a.targetQty)+" unit ("+N(pct(a.actualQty,a.targetQty))+"%). Pace periode "+N(a.timeGone*100)+"%.":"Tercatat "+N(a.actualQty)+" unit VALID; target Qty pada scope ini belum tersedia."});
  if(a.models.length)items.push({type:"opportunity",title:"Model terlaris dalam scope",body:a.models[0].model+" menyumbang "+N(a.models[0].qty)+" unit VALID. Kontribusi dihitung dari transaksi yang dapat diakses akun."});
  else items.push({type:"info",title:"Belum ada penjualan VALID",body:"Tidak ada data VALID dalam periode dan cakupan yang dipilih."});
  if(a.pending.length)items.push({type:"risk",title:"Kualitas EULA perlu perhatian",body:N(a.pending.length)+" transaksi PENDING tidak masuk pencapaian. Cek sumber transaksi dan status EULA."});
  if(a.unmapped.length)items.push({type:"risk",title:"Pemetaan promoter belum lengkap",body:N(a.unmapped.length)+" baris memiliki penanda promoter belum termapping."});
  if(a.missing.length)items.push({type:"risk",title:"Target toko belum tersedia",body:N(a.missing.length)+" store belum memiliki target pada periode ini."});
  if(a.slowStores.length)items.push({type:"recommendation",title:"Prioritaskan toko di bawah pace",body:N(a.slowStores.length)+" toko berada di bawah 65% pace per tanggal berjalan. Validasi target serta rencana aksi lapangan."});
  if(a.promoOpportunity.length)items.push({type:"opportunity",title:"Promo terverifikasi untuk model terjual",body:a.promoOpportunity.map(m=>m.model).join(", ")+" memiliki penawaran model-spesifik terverifikasi. Periksa syarat promo sebelum menawarkan."});
  if(!a.activePromo.some(p=>p.model_code!=="*"))items.push({type:"info",title:"Belum ada promo model-spesifik aktif yang tercatat",body:"Admin dapat menerbitkan penawaran yang terverifikasi di Promo Center."});
  return items.slice(0,7);
 }
};
function severityLabel(level){return level==="critical"?"Kritis":level==="warning"?"Peringatan":"Info";}
function insightsHtml(items){
 return items.map(item=>'<article class="intel-insight intel-'+esc(item.type)+'"><span class="intel-insight-dot"></span><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.body)+'</p></div></article>').join("");
}
function renderDashboard(ctx){
 activeContext=ctx;const token=++lastToken;const root=document.getElementById("intel-dashboard");
 if(!root)return;
 const stats=analytics.compute(ctx);
 const roleNames={admin:"Admin Command",tl:"Territory Leader",tso:"Area Supervisor",ec:"Experience Consultant"};
 const action=({admin:"Target",tl:"Coverage & Toko",tso:"Coverage",ec:"Target Saya"})[ctx.profile.role];
 root.innerHTML='<div class="intel-dashboard-top">'+
   panel("Smart Data Alerts",'<div id="intel-alert-list" class="intel-alert-list"></div><p class="intel-caption">Prioritas berbasis transaksi dan target yang saat ini terlihat oleh akun.</p>')+
   panel("Dashboard Personal",'<div class="intel-personal"><p class="intel-overline">'+esc(roleNames[ctx.profile.role]||"Workspace")+'</p>'+
    '<div class="intel-personal-number">'+N(stats.actualQty)+' <small>unit VALID</small></div>'+
    '<p>Capaian '+(stats.targetQty?N(pct(stats.actualQty,stats.targetQty))+"% dari target Qty.":"dari data yang diizinkan RLS.")+'</p>'+
    '<p class="intel-caption">Pace kalender: '+N(stats.timeGone*100)+'% · '+N(stats.elapsed)+' / '+N(stats.duration)+' hari.</p>'+
    '<button class="intel-link" id="intel-role-action">Lihat pekerjaan prioritas ↗</button></div>')+'</div>'+
   '<div class="intel-dashboard-bottom">'+
   panel("AI Sales Insight <small>· Analisis otomatis berbasis aturan</small>",'<div id="intel-insight-items">'+insightsHtml(analytics.insights(ctx,ctx.profile.role))+'</div>'+
   '<div class="intel-panel-actions"><button id="intel-copy-insights" class="intel-link">Salin analisis</button><button id="intel-open-charts" class="intel-link">Grafik detail ↗</button></div><p class="intel-caption">Bukan model AI generatif atau prediksi. Seluruh kesimpulan berasal dari angka yang terlihat.</p>')+
   panel("Promo Samsung Terverifikasi",'<div id="intel-promo-summary" class="intel-promo-summary">Memeriksa promo aktif...</div>'+
     '<button id="intel-open-promos" class="intel-link">Lihat semua promo ↗</button><p class="intel-caption">Hanya penawaran dengan sumber resmi, tanggal dan status verifikasi yang ditampilkan.</p>')+'</div>';
 const list=document.getElementById("intel-alert-list");
 if(stats.alerts.length){
  for(const alert of stats.alerts){
   const button=document.createElement("button");button.type="button";button.className="intel-alert intel-alert-"+alert.level;
   button.innerHTML='<span class="intel-alert-count">'+N(alert.count)+'</span><span><strong>'+esc(alert.title)+'</strong><small>'+esc(alert.desc)+'</small></span><span aria-hidden="true">↗</span>';
   button.addEventListener("click",()=>ctx.openSection(alert.target));list.appendChild(button);
  }
 }else list.innerHTML='<div class="intel-zero">Tidak ada alert yang terdeteksi dari data dalam cakupan saat ini.</div>';
 document.getElementById("intel-role-action").onclick=()=>ctx.openSection(action);
 document.getElementById("intel-open-charts").onclick=()=>ctx.openSection("Grafik Sellout");
 document.getElementById("intel-open-promos").onclick=()=>ctx.openSection("Promo");
 document.getElementById("intel-copy-insights").onclick=async()=>{
   const text=analytics.insights(ctx,ctx.profile.role).map(x=>x.title+": "+x.body).join("\n");
   try{await navigator.clipboard.writeText(text);document.getElementById("intel-copy-insights").textContent="Disalin ✓";}catch{document.getElementById("intel-copy-insights").textContent="Tidak dapat menyalin"; }
 };
 if(ctx.client){
  ctx.client.from("sales_promotions").select("id,title,model_code,model_name,start_date,end_date,published,verification_state,source_url")
   .then(({data,error})=>{
     if(token!==lastToken||!root.isConnected)return;
     const now=dateLocal(),active=error?[]:(data||[]).filter(p=>p.published&&p.verification_state==="verified"&&p.start_date<=now&&p.end_date>=now);
     const modelSpecific=active.filter(p=>p.model_code!=="*");
     const div=document.getElementById("intel-promo-summary");
     div.textContent=error?"Promo tidak dapat dimuat; cek koneksi.":modelSpecific.length?
       N(modelSpecific.length)+" promo model-spesifik aktif terverifikasi.":"Belum ada promo model-spesifik terverifikasi untuk cakupan Anda.";
     if(active.some(p=>p.model_code==="*"))div.textContent+=" Ada kampanye resmi umum yang dapat diperiksa di Promo Center.";
     activeContext={...ctx,promos:data||[]};
     document.getElementById("intel-insight-items").innerHTML=insightsHtml(analytics.insights(activeContext,ctx.profile.role));
   });
 }
 setupSearch(ctx);
}
function createChart(node,type,labels,datasets,opts={}){
 if(!node||typeof window.Chart!=="function")return;
 const chart=new window.Chart(node,{
  type,data:{labels,datasets},
  options:{responsive:true,maintainAspectRatio:false,
   plugins:{legend:{display:datasets.length>1,labels:{color:"#abc9dc",boxWidth:11,font:{size:11}}}},
   scales:type==="doughnut"?undefined:{
    x:{ticks:{color:"#91adc1",maxTicksLimit:12},grid:{color:"rgba(133,180,217,.07)"}},
    y:{beginAtZero:true,ticks:{color:"#91adc1"},grid:{color:"rgba(133,180,217,.08)"}}
   },...opts}
 });chartObjs.push(chart);
}
function clearCharts(){for(const chart of chartObjs){try{chart.destroy();}catch{}}chartObjs=[];}
function byDay(sales,key){
 const map=group(sales,key,s=>s.sold_at);return [...map.entries()].sort(([a],[b])=>a.localeCompare(b));
}
function weekKey(date){
 const d=new Date(date+"T12:00:00Z"),w=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 w.setUTCDate(w.getUTCDate()+4-(w.getUTCDay()||7));
 const year=w.getUTCFullYear(),yearStart=new Date(Date.UTC(year,0,1));
 return year+"-W"+String(Math.ceil((((w-yearStart)/86400000)+1)/7)).padStart(2,"0");
}
function renderCharts(ctx,mount){
 clearCharts();const unique=x=>[...new Set(x)];
 const sales=(ctx.sales||[]),stores=ctx.stores||[];
 const models=unique(sales.map(s=>s.model).filter(Boolean)).sort(),siteCodes=unique(stores.map(s=>s.site_id)).sort();
 mount.innerHTML='<div class="intel-page-head"><div><p class="intel-overline">Analytics Studio · '+esc(ctx.period?.period_name||"Periode")+'</p><h3>Grafik Sellout</h3><p>Tren harian, pertumbuhan mingguan, kontribusi model dan toko, berdasarkan transaksi yang diizinkan RLS.</p></div></div>'+
  '<div class="intel-filters">'+
   '<label>Store<select id="intel-chart-store" class="field"><option value="">Seluruh scope</option>'+siteCodes.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("")+'</select></label>'+
   '<label>Model<select id="intel-chart-model" class="field"><option value="">Semua model</option>'+models.map(m=>'<option value="'+esc(m)+'">'+esc(m)+'</option>').join("")+'</select></label>'+
   '<label>Metrik<select id="intel-chart-metric" class="field"><option value="qty">Qty</option><option value="amt">Amount</option></select></label>'+
  '</div><div id="intel-filter-bar"></div>'+
  '<div id="intel-chart-stats" class="intel-stat-grid"></div>'+
  '<div class="intel-chart-grid">'+
   panel("Tren Sellout Harian",'<div class="intel-chart-canvas"><canvas id="intel-day-chart" role="img" aria-label="Grafik sellout harian"></canvas></div>')+
   panel("Weekly Growth",'<div class="intel-chart-canvas"><canvas id="intel-week-chart" role="img" aria-label="Grafik sellout mingguan"></canvas></div>')+
   panel("Kontribusi Model",'<div class="intel-chart-canvas"><canvas id="intel-model-chart" role="img" aria-label="Peringkat model"></canvas></div>')+
   panel("Peringkat Store",'<div class="intel-chart-canvas"><canvas id="intel-store-chart" role="img" aria-label="Peringkat toko"></canvas></div>')+
   panel("EULA VALID dan PENDING",'<div class="intel-chart-canvas"><canvas id="intel-status-chart" role="img" aria-label="Perbandingan status EULA"></canvas></div>')+
   panel("Pace terhadap Target",'<div id="intel-pace-panel" class="intel-pace-panel"></div><p class="intel-caption">Target penuh vs pencapaian sesuai data. Pace adalah asumsi linear menurut hari kalender.</p>')+
  '</div>';
 const selects=["store","model","metric"].map(k=>document.getElementById("intel-chart-"+k));
 const state=()=>({store:selects[0].value,model:selects[1].value,metric:selects[2].value});
 const redraw=()=>{
  clearCharts();const f=state(),metric=f.metric;
  const filtered=sales.filter(s=>(!f.store||s.site_id===f.store)&&(!f.model||s.model===f.model));
  const good=filtered.filter(valid),pending=filtered.filter(s=>s.eula_status==="PENDING");
  const day=byDay(good,metric),weeks=group(good,metric,s=>weekKey(s.sold_at)),modelMap=group(good,metric,s=>s.model||"Tidak diketahui");
  const nameMap=new Map(stores.map(s=>[s.site_id,s.site_name]));
  const storeMap=group(good,metric,s=>s.site_id),rank=[...modelMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,9);
  const storeRank=[...storeMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  const weekRows=[...weeks.entries()].sort(([a],[b])=>a.localeCompare(b));
  const dsum=allBy(good,s=>s[metric]),pendingQty=allBy(pending,s=>s.qty);
  document.getElementById("intel-chart-stats").innerHTML=
   [['EULA VALID',N(good.length)],['Total '+(metric==="qty"?"Qty":"Amount"),metric==="qty"?N(dsum):money(dsum)],
   ['PENDING',N(pending.length)],['Model terjual',N(modelMap.size)]].map(([l,v])=>'<div class="intel-stat"><span>'+esc(l)+'</span><strong>'+esc(v)+'</strong></div>').join("");
  const base=[{data:day.map(x=>x[1]),label:metric==="qty"?"Qty":"Amount",borderColor:"#63e3fa",backgroundColor:"rgba(78,192,239,.20)",fill:true,tension:.32,pointRadius:2}];
  createChart(document.getElementById("intel-day-chart"),"line",day.map(x=>x[0].slice(5)),base);
  createChart(document.getElementById("intel-week-chart"),"bar",weekRows.map(x=>x[0]),[{label:"WoW "+(metric==="qty"?"Qty":"Amount"),data:weekRows.map(x=>x[1]),backgroundColor:"#4f92e7",borderRadius:5}]);
  createChart(document.getElementById("intel-model-chart"),"bar",rank.map(x=>x[0]),[{data:rank.map(x=>x[1]),backgroundColor:"#68d8f7",borderRadius:5}]);
  createChart(document.getElementById("intel-store-chart"),"bar",storeRank.map(x=>nameMap.get(x[0])||x[0]),[{data:storeRank.map(x=>x[1]),backgroundColor:"#7a9eff",borderRadius:5}],{indexAxis:"y"});
  createChart(document.getElementById("intel-status-chart"),"doughnut",["VALID","PENDING"],[{data:[allBy(good,s=>s.qty),pendingQty],backgroundColor:["#59e2bf","#f9bf6b"],borderWidth:0}]);
  const allTargets=ctx.targets||[];
  const storeIds=new Set(stores.filter(s=>!f.store||s.site_id===f.store).map(s=>s.id));
  const target=n(f.model?0:allTargets.filter(t=>storeIds.has(t.store_id)).reduce((n,t)=>n+Number(t[metric==="qty"?"target_qty":"target_amt"]||0),0));
  const a=analytics.compute({...ctx,sales:filtered,targets:allTargets.filter(t=>storeIds.has(t.store_id))});
  const pctTarget=target>0?pct(dsum,target):0;
  document.getElementById("intel-pace-panel").innerHTML='<div class="intel-personal-number">'+N(dsum)+' <small>/ '+(f.model?"target model belum dialokasikan":N(target))+'</small></div>'+
    '<p class="intel-caption">'+(f.model?"Pace model tidak dihitung tanpa target model-spesifik.":"Achievement "+N(pctTarget)+"%, time gone "+N(a.timeGone*100)+"%.")+'</p>'+
    '<div class="intel-bar"><span style="width:'+Math.max(0,Math.min(100,pctTarget))+'%"></span></div>';
 };
 selects.forEach(el=>el.addEventListener("change",redraw));redraw();
 if(window.UserPrefs)window.UserPrefs.savedFilterControls({
  client:ctx.client,profile:ctx.profile,feature:"charts",mount:document.getElementById("intel-filter-bar"),
  getState:state,applyState:s=>{for(const [k,el] of [["store",selects[0]],["model",selects[1]],["metric",selects[2]]])if(typeof s[k]==="string"&&[...el.options].some(o=>o.value===s[k]))el.value=s[k];redraw();}
 });
}
function renderAlerts(ctx,mount){
 const data=analytics.compute(ctx),items=analytics.insights(ctx,ctx.profile.role);
 mount.innerHTML='<div class="intel-page-head"><div><p class="intel-overline">Health & Quality</p><h3>Smart Alerts</h3><p>Risiko yang terdeteksi dari penjualan dan target dalam cakupan akun saat ini.</p></div></div>'+
 panel("Status pemeriksaan",data.alerts.length?'<p>'+N(data.alerts.length)+' kategori alert aktif dari hasil perhitungan.</p>':'<p>Tidak ditemukan alert berdasarkan aturan yang tersedia.</p>')+
 '<div class="intel-chart-grid">'+data.alerts.map(a=>panel(a.title,
    '<p class="intel-alert-number">'+N(a.count)+'</p><p>'+esc(a.desc)+'</p><button class="intel-link" data-alert-target="'+esc(a.target)+'">Lihat data terkait ↗</button>')).join("")+'</div>'+
 panel("Analisis otomatis / AI Sales Insight",insightsHtml(items))+
 '<p class="intel-caption">Alert bukan jaminan ketidakpatuhan; verifikasi transaksi dan proses bisnis sebelum mengambil keputusan.</p>';
 mount.querySelectorAll("[data-alert-target]").forEach(b=>b.addEventListener("click",()=>ctx.openSection(b.dataset.alertTarget)));
}
function setupSearch(ctx){
 const input=document.getElementById("global-search"),list=document.getElementById("global-search-results");
 if(!input||!list)return;
 if(!searchBound){
  searchBound=true;
  input.addEventListener("input",()=>showSearch());
  input.addEventListener("keydown",e=>{if(e.key==="Escape")list.hidden=true;if(e.key==="Enter"){e.preventDefault();list.querySelector("button")?.click();}});
  document.addEventListener("click",e=>{if(!e.target.closest("#global-search-wrapper"))list.hidden=true;});
 }
 function showSearch(){
  const query=input.value.trim().toLocaleLowerCase("id-ID");
  if(query.length<2||!activeContext){list.hidden=true;return;}
  const c=activeContext,role=c.profile.role;
  const entries=[
   ...(c.stores||[]).map(s=>({label:s.site_name+" · "+s.site_id,query:s.site_id,group:"Store",target:role==="ec"?"Target Saya":role==="admin"?"Target":role==="tso"?"Coverage":"Coverage & Toko"})),
   ...(c.manpower||[]).map(m=>({label:m.full_name+" · "+(m.promoter_id||m.employee_id),query:m.promoter_id||m.employee_id,group:"Promoter",target:role==="ec"?"Laporan Saya":"Performa EC"})),
   ...[...new Set((c.sales||[]).map(s=>s.model).filter(Boolean))].map(model=>({label:model,query:model,group:"Model",target:role==="ec"?"Laporan Saya":"RAW Sellout"}))
  ].filter(e=>(e.label||"").toLocaleLowerCase("id-ID").includes(query)).slice(0,9);
  list.innerHTML="";
  if(!entries.length){list.innerHTML='<p class="intel-search-empty">Tidak ditemukan pada data yang dapat diakses.</p>';list.hidden=false;return;}
  for(const e of entries){
   const button=document.createElement("button");button.type="button";button.className="intel-search-result";
   button.innerHTML='<span>'+esc(e.group)+'</span><strong>'+esc(e.label)+'</strong>';
   button.addEventListener("click",()=>{
    if(window.UserPrefs)window.UserPrefs.pendingSearch=e.query;
    c.openSection(e.target);input.value="";list.hidden=true;
   });list.appendChild(button);
  }
  list.hidden=false;
 }
 if(input.value.length>=2)showSearch();
}
window.SalesIntelligence={renderDashboard,renderCharts,renderAlerts,analytics,weekKey,dateLocal,modelNorm,clearCharts};
})();

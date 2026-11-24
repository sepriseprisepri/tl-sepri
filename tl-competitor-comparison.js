/* TL market comparison. Database RLS remains the authority for store access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TLCompetitorComparison=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shift=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const monday=day=>{const d=new Date(day+'T12:00:00Z');return shift(day,-((d.getUTCDay()+6)%7));};
function key(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(),start=new Date(Date.UTC(year,0,1,12));return year+'-W'+String(Math.ceil((((d-start)/86400000)+1)/7)).padStart(2,'0');}
function weeks(period,today){if(!period?.period_start||!period?.period_end)return [];const end=period.period_end<today?period.period_end:today;if(end<period.period_start)return [];const list=[];for(let d=monday(period.period_start);d<=end;d=shift(d,7)){const last=shift(d,6),start=d<period.period_start?period.period_start:d,finish=last>end?end:last;list.push({key:key(d),start,end:finish,partial:start!==d||finish!==last});}return list;}
const number=x=>Number.isFinite(Number(x))?Number(x):0;
const metricValue=(row,metric,competitor=false)=>metric==='amt'?(competitor?(row.amount==null?number(row.qty)*number(row.unit_price):number(row.amount)):number(row.amt)):number(row.qty);


function compare({weeks:all,first,second,stores,sales,competitor,metric='qty'}){
 const ids=new Set(stores.map(s=>s.id)),sites=new Set(stores.map(s=>s.site_id));
 return [first,second].map(k=>{
  const w=all.find(x=>x.key===k);
  if(!w)throw Error('Minggu tidak tersedia');
  const within=r=>r.sold_at>=w.start&&r.sold_at<=w.end;
  return {...w,
   samsung:sales.filter(r=>sites.has(r.site_id)&&within(r)&&String(r.eula_status||'').toUpperCase()==='VALID').reduce((a,r)=>a+metricValue(r,metric),0),
   competitor:competitor.filter(r=>ids.has(r.store_id)&&within(r)).reduce((a,r)=>a+metricValue(r,metric,true),0)
  };
 });
}
const growth=(a,b)=>a>0?(b-a)/a*100:null;

const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(n);
const moneyFmt=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0});
const compactFmt=new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:1});
const valueText=(n,metric='qty')=>metric==='amt'?(n<0?'-':'')+'Rp '+moneyFmt.format(Math.abs(n)):fmt(n)+' unit';
function insight(rows,metric='qty'){
 const [a,b]=rows;
 const days=w=>Math.round((Date.parse(w.end+'T12:00:00Z')-Date.parse(w.start+'T12:00:00Z'))/86400000)+1;
 const equalDays=days(a)===days(b);
 const describe=(name,x,y)=>{
  const d=y-x,g=growth(x,y);
  const percentage=!equalDays?'':g===null?'; persentase tidak tersedia karena nilai awal 0':'; '+(g>0?'+':'')+fmt(g)+'%';
  return name+': '+valueText(x,metric)+' → '+valueText(y,metric)+' ('+(d>0?'+':'')+valueText(d,metric)+percentage+').';
 };
 return describe('Samsung',a.samsung,b.samsung)+' '+describe('Kompetitor',a.competitor,b.competitor)+' '+
  (!equalDays?'Persentase pertumbuhan tidak ditampilkan karena jumlah hari berbeda. ':'')+
  (a.partial||b.partial?'Sebagian minggu tidak lengkap; perbandingan perlu dibaca dengan hati-hati. ':'')+
  'Data kompetitor bergantung pada input EC dan bukan seluruh pasar.';
}
function chartConfig(rows,metric='qty'){
 return {
  type:'bar',
  data:{
   labels:rows.map(w=>w.key+(w.partial?' *':'')),
   datasets:[
    {label:'Samsung',data:rows.map(w=>w.samsung),backgroundColor:'#4d92ff',borderColor:'#9acaff',borderWidth:1,borderRadius:7,maxBarThickness:76},
    {label:'Kompetitor',data:rows.map(w=>w.competitor),backgroundColor:'#f9b66e',borderColor:'#ffd7ac',borderWidth:1,borderRadius:7,maxBarThickness:76}
   ]
  },
  options:{
   responsive:true,maintainAspectRatio:false,
   plugins:{
    legend:{position:'bottom',labels:{color:'#d8e9f8'}},
    tooltip:{callbacks:{label:c=>c.dataset.label+': '+valueText(c.parsed.y,metric)}}
   },
   scales:{
    x:{grid:{display:false},ticks:{color:'#bfd0e3'}},
    y:{beginAtZero:true,grid:{color:'rgba(148,163,184,.14)'},ticks:{color:'#bfd0e3',callback:v=>metric==='amt'?'Rp '+compactFmt.format(v):fmt(v)}}
   }
  }
 };
}
let activeChart=null;
function destroyChart(){if(activeChart){activeChart.destroy();activeChart=null;}}
let renderSerial=0;
async function render(ctx,mount){const serial=++renderSerial;destroyChart();if(ctx.profile?.role!=='tl'){mount.textContent='Menu hanya tersedia untuk TL.';return;}const period=ctx.period;if(!period){mount.textContent='Pilih periode yang tersedia.';return;}const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Pontianak',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const today=parts.year+'-'+parts.month+'-'+parts.day;const available=weeks(period,today);if(!available.length){mount.textContent='Belum ada minggu berjalan dalam periode ini.';return;}mount.innerHTML='<p role="status">Memuat data kompetitor sesuai coverage…</p>';try{const data=await ctx.fetchAll('competitor_sellout','id,store_id,sold_at,brand,model,variant,qty,unit_price,amount',q=>q.gte('sold_at',period.period_start).lte('sold_at',available[available.length-1].end).order('id',{ascending:true}));if(serial!==renderSerial||(ctx.isActive&&!ctx.isActive()))return;const stores=ctx.stores||[],ids=new Set(stores.map(s=>s.id)),rows=data.filter(r=>ids.has(r.store_id));const names=new Map(stores.map(s=>[s.id,s.site_name+' · '+s.site_id]));const opts=available.map(w=>`<option value="${esc(w.key)}">${esc(w.key)} · ${esc(w.start)}–${esc(w.end)}${w.partial?' (parsial)':''}</option>`).join('');mount.innerHTML=`<div class="space-y-5"><div class="panel rounded-2xl p-5"><h3 class="text-xl font-semibold">Samsung vs Competitor</h3><p class="text-sm text-slate-400 mt-2">Qty/Amt sesuai coverage TL · ${esc(period.period_name||'Periode terpilih')} · Samsung EULA VALID dan input EC. Minggu ISO Senin–Minggu, dibatasi periode dan hari ini (WIB).</p><div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4"><label>Minggu awal<select id="cmp-first" class="field block w-full rounded-xl p-3 mt-2">${opts}</select></label><label>Minggu pembanding<select id="cmp-second" class="field block w-full rounded-xl p-3 mt-2">${opts}</select></label><label>Toko<select id="cmp-store" class="field block w-full rounded-xl p-3 mt-2"><option value="">Semua toko coverage</option>${stores.map(s=>`<option value="${esc(s.id)}">${esc(names.get(s.id))}</option>`).join('')}</select></label><label>Metrik<select id="cmp-metric" class="field block w-full rounded-xl p-3 mt-2"><option value="qty">Qty (Unit)</option><option value="amt">Amt (Rp)</option></select></label></div><div id="cmp-filter-bar" class="mt-4"></div><div class="flex flex-wrap gap-3 items-center mt-3"><button type="button" id="cmp-reset" class="intel-action intel-action-subtle">Reset filter</button><p id="cmp-filter-feedback" class="text-sm text-amber-200" role="status" aria-live="polite"></p></div></div><div id="cmp-mtd" class="panel rounded-2xl p-5" aria-live="polite"></div><section class="panel rounded-2xl p-5"><h3 class="font-semibold">Week vs Week Sellout <span id="cmp-chart-unit">Qty</span></h3><p class="text-xs text-slate-400 mt-2">Samsung dan kompetitor pada dua minggu terpilih. Tanda * menandai minggu parsial.</p><div class="intel-chart-canvas"><canvas id="cmp-wow-chart" role="img" aria-label="Grafik batang week vs week Samsung dan kompetitor"></canvas></div><p id="cmp-chart-note" class="text-xs text-slate-400 mt-2" role="status" aria-live="polite"></p></section><div id="cmp-summary" class="panel rounded-2xl p-5" aria-live="polite"></div><section class="panel rounded-2xl p-5"><h3 class="font-semibold">Ringkasan analitis</h3><p class="text-xs text-slate-400 mt-1">Analisis otomatis berbasis aturan dan data yang dipilih.</p><p id="cmp-insight" class="mt-3 text-sm leading-6" aria-live="polite"></p></section><section class="panel rounded-2xl p-5"><h3 class="font-semibold">Rincian input kompetitor</h3><p class="text-xs text-slate-400 mt-1">Transaksi pada dua minggu terpilih.</p><div id="cmp-rows" class="table-wrap mt-4"></div></section></div>`;const a=mount.querySelector('#cmp-first'),b=mount.querySelector('#cmp-second'),store=mount.querySelector('#cmp-store'),metric=mount.querySelector('#cmp-metric');a.value=available[Math.max(0,available.length-2)].key;b.value=available[available.length-1].key;
function update(){
 const selected=store.value?stores.filter(s=>s.id===store.value):stores;
 const chosen=metric.value==='amt'?'amt':'qty';
 const format=x=>valueText(x,chosen);
 const range={key:'MTD',start:period.period_start,end:available[available.length-1].end,partial:false};
 const total=compare({weeks:[range],first:'MTD',second:'MTD',stores:selected,sales:ctx.sales||[],competitor:rows,metric:chosen})[0];
 mount.querySelector('#cmp-mtd').innerHTML='<h3 class="font-semibold">Total periode hingga '+esc(range.end)+'</h3>'+
  '<p class="mt-3">Samsung <strong>'+esc(format(total.samsung))+'</strong> · Kompetitor <strong>'+esc(format(total.competitor))+'</strong></p>'+
  '<p class="text-xs text-slate-400 mt-2">Dihitung dari '+esc(range.start)+' sesuai toko terpilih.</p>';
 mount.querySelector('#cmp-chart-unit').textContent=chosen==='amt'?'Amt (Rp)':'Qty (Unit)';
 const firstIndex=available.findIndex(w=>w.key===a.value),secondIndex=available.findIndex(w=>w.key===b.value);
 const feedback=mount.querySelector('#cmp-filter-feedback');
 const chartNote=mount.querySelector('#cmp-chart-note');
 destroyChart();
 if(firstIndex<0||secondIndex<0||firstIndex>=secondIndex){
  feedback.textContent=available.length<2?'Belum tersedia dua minggu untuk dibandingkan. Total periode tetap ditampilkan.':'Pilih minggu awal yang lebih lama daripada minggu pembanding.';
  mount.querySelector('#cmp-summary').textContent='Perbandingan belum tersedia untuk pilihan minggu ini.';
  mount.querySelector('#cmp-insight').textContent='';
  mount.querySelector('#cmp-rows').textContent='Pilih dua minggu berbeda dalam urutan kronologis.';
  chartNote.textContent='Grafik ditampilkan setelah memilih dua minggu berurutan secara kronologis.';
  return;
 }
 feedback.textContent='';
 const result=compare({weeks:available,first:a.value,second:b.value,stores:selected,sales:ctx.sales||[],competitor:rows,metric:chosen});
 mount.querySelector('#cmp-summary').innerHTML='<h3 class="font-semibold mb-3">Perbandingan '+(chosen==='amt'?'Amt (Rp)':'Qty (Unit)')+'</h3>'+
  '<div class="table-wrap"><table class="w-full text-sm"><thead><tr><th>Periode</th><th>Samsung</th><th>Kompetitor</th><th>Selisih Samsung</th></tr></thead><tbody>'+
  result.map(x=>'<tr><td>'+esc(x.key)+' ('+esc(x.start)+'–'+esc(x.end)+')'+(x.partial?' · parsial':'')+'</td><td>'+esc(format(x.samsung))+'</td><td>'+esc(format(x.competitor))+'</td><td>'+esc(format(x.samsung-x.competitor))+'</td></tr>').join('')+
  '</tbody></table></div>';
 mount.querySelector('#cmp-insight').textContent=insight(result,chosen);
 const allowed=new Set(selected.map(s=>s.id));
 const found=rows.filter(r=>allowed.has(r.store_id)&&result.some(w=>r.sold_at>=w.start&&r.sold_at<=w.end)).sort((x,y)=>y.sold_at.localeCompare(x.sold_at));
 mount.querySelector('#cmp-rows').innerHTML=found.length?
  '<table class="w-full text-sm"><thead><tr><th>Tanggal</th><th>Toko</th><th>Brand / model</th><th>'+(chosen==='amt'?'Amt (Rp)':'Qty (Unit)')+'</th></tr></thead><tbody>'+
  found.map(r=>'<tr><td>'+esc(r.sold_at)+'</td><td>'+esc(names.get(r.store_id))+'</td><td>'+esc(r.brand)+' · '+esc(r.model)+' '+esc(r.variant||'')+'</td><td>'+esc(format(metricValue(r,chosen,true)))+'</td></tr>').join('')+
  '</tbody></table>':'<p class="text-sm text-slate-400">Belum ada input kompetitor pada pilihan ini.</p>';
 const chartCanvas=mount.querySelector('#cmp-wow-chart');
 if(typeof window!=='undefined'&&typeof window.Chart==='function'){
  try{
   activeChart=new window.Chart(chartCanvas,chartConfig(result,chosen));
   chartNote.textContent=(result.some(w=>w.partial)?'* Minggu parsial belum memuat tujuh hari penuh. ':'')+
    (chosen==='amt'?'Amt kompetitor menggunakan total transaksi (Qty × harga unit) dari input EC. ':'')+
    'Perbandingan mengikuti filter toko dan periode.';
  }catch(chartError){
   chartNote.textContent='Grafik belum dapat ditampilkan. Angka pembanding tetap tersedia pada tabel.';
   console.error('[TLCompetitorChart]',chartError);
  }
 }else{
  chartNote.textContent='Library grafik belum tersedia. Angka pembanding tetap tersedia pada tabel.';
 }
}

[a,b,store,metric].forEach(el=>el.addEventListener('change',update));
const reset=()=>{a.value=available[Math.max(0,available.length-2)].key;b.value=available[available.length-1].key;store.value='';metric.value='qty';update();};
mount.querySelector('#cmp-reset').addEventListener('click',reset);
update();
if(typeof window!=='undefined'&&window.UserPrefs)window.UserPrefs.savedFilterControls({
 client:ctx.client,profile:ctx.profile,feature:'sellout',scope:'Samsung vs Competitor',mount:mount.querySelector('#cmp-filter-bar'),
 getState:()=>({first:a.value,second:b.value,store:store.value,metric:metric.value}),
 applyState:s=>{
  reset();
  if(typeof s.first==='string'&&[...a.options].some(o=>o.value===s.first))a.value=s.first;
  if(typeof s.second==='string'&&[...b.options].some(o=>o.value===s.second))b.value=s.second;
  if(typeof s.store==='string'&&[...store.options].some(o=>o.value===s.store))store.value=s.store;
  if(s.metric==='qty'||s.metric==='amt')metric.value=s.metric;
  update();
 }
});}catch(error){if(serial!==renderSerial||(ctx.isActive&&!ctx.isActive()))return;mount.innerHTML='<p role="alert" class="text-rose-300">Data kompetitor gagal dimuat. Periksa koneksi atau hak akses, lalu perbarui halaman.</p>';console.error('[TLCompetitor]',error);}}
return {weeks,compare,growth,insight,chartConfig,metricValue,render};});

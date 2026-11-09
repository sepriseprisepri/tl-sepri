/* Samsung Kalteng Market Pulse: role-scoped RAW sellout WoW and curated sources.
 * No service key, no external data scraping, no unverified live price claims.
 * Only sales already returned through role RLS are included. */
(function(){
"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qty=x=>Number(x||0),num=x=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(qty(x));
const dayNumber=s=>Math.floor(Date.parse(s+"T12:00:00Z")/86400000);
const dayISO=n=>new Date(n*86400000).toISOString().slice(0,10);
const localToday=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
};
function weekStart(s){
 const day=dayNumber(s),dow=new Date(day*86400000).getUTCDay();
 return dayISO(day-((dow+6)%7));
}
function weeklySummary(sales,period,today=localToday()){
 if(!period?.period_start||!period?.period_end)return {ready:false,message:"Periode belum tersedia."};
 const end=Math.min(dayNumber(today)-1,dayNumber(period.period_end));
 const start=dayNumber(period.period_start);
 const weeks=new Map();
 for(const x of sales||[]){
  if(String(x.eula_status||"").toUpperCase()!=="VALID"||!x.sold_at)continue;
  const date=dayNumber(x.sold_at);if(date<start||date>end)continue;
  const monday=weekStart(x.sold_at);
  weeks.set(monday,(weeks.get(monday)||0)+qty(x.qty));
 }
 const latest=weekStart(dayISO(end));
 const entries=[];
 for(let monday=dayNumber(weekStart(period.period_start));monday<=dayNumber(latest);monday+=7){
  const mondayISO=dayISO(monday),sunday=monday+6;
  if(monday<start||sunday>end)continue; // Only complete Monday–Sunday weeks
  entries.push({start:mondayISO,end:dayISO(sunday),qty:weeks.get(mondayISO)||0});
 }
 if(entries.length<2){
  // Week-to-date versus the same weekdays last week. Clearly marked as partial.
  const currentMonday=dayNumber(weekStart(today)),lastAvailable=Math.min(dayNumber(today),dayNumber(period.period_end));
  const elapsed=Math.max(0,Math.min(7,lastAvailable-currentMonday+1));
  const prevMonday=currentMonday-7;
  if(elapsed>0&&prevMonday>=start){
   let recent=0,previousWeek=0;
   for(const sale of sales||[]){
    if(String(sale.eula_status||"").toUpperCase()!=="VALID")continue;
    const day=dayNumber(sale.sold_at);
    if(day>=currentMonday&&day<currentMonday+elapsed)recent+=qty(sale.qty);
    if(day>=prevMonday&&day<prevMonday+elapsed)previousWeek+=qty(sale.qty);
   }
   if(previousWeek>0)return {ready:true,partial:true,
    current:{start:dayISO(currentMonday),end:dayISO(currentMonday+elapsed-1),qty:recent},
    previous:{start:dayISO(prevMonday),end:dayISO(prevMonday+elapsed-1),qty:previousWeek},
    growth:(recent-previousWeek)/previousWeek*100,delta:recent-previousWeek,weeks:entries};
  }
  return {ready:false,message:"Belum ada dua minggu penuh atau dua rentang minggu berjalan yang sebanding.",weeks:entries};
 }
 const previous=entries[entries.length-2],current=entries[entries.length-1];
 if(previous.qty===0)return {ready:false,message:"Minggu pembanding memiliki 0 unit; persentase pertumbuhan tidak dihitung.",current,previous,weeks:entries};
 return {ready:true,current,previous,weeks:entries,growth:(current.qty-previous.qty)/previous.qty*100,delta:current.qty-previous.qty};
}
const sources=[
 {name:"Samsung Global Newsroom",topic:"Peluncuran Galaxy, fitur AI & teknologi",url:"https://news.samsung.com/global/category/mobile",kind:"Berita resmi"},
 {name:"Samsung Indonesia",topic:"Spesifikasi dan harga produk Galaxy Indonesia",url:"https://www.samsung.com/id/smartphones/",kind:"Katalog resmi"},
 {name:"Apple Newsroom",topic:"Inovasi iPhone dan pengumuman produk",url:"https://www.apple.com/id/newsroom/topics/iphone/",kind:"Berita resmi"},
 {name:"Apple Indonesia",topic:"Harga dan perbandingan iPhone resmi",url:"https://www.apple.com/id/iphone/",kind:"Katalog resmi"},
 {name:"Xiaomi Indonesia",topic:"Xiaomi, Redmi, POCO; varian & harga",url:"https://www.mi.co.id/id/mobile/",kind:"Katalog resmi"},
 {name:"vivo Indonesia",topic:"Model vivo terbaru, spesifikasi & harga",url:"https://www.vivo.com/id/products",kind:"Katalog resmi"},
 {name:"OPPO Indonesia",topic:"Informasi produk OPPO dan perbandingan",url:"https://www.oppo.com/id/smartphones/",kind:"Katalog resmi"}
];
function render(ctx,root){
 if(!root)return;
 root.innerHTML='<div class="grid lg:grid-cols-2 gap-4 mt-4">'+
 '<section class="intel-card"><div class="intel-card-head"><h3>Samsung Sellout · Week to Week</h3></div>'+
 '<div id="pulse-wow" role="status" aria-live="polite"></div>'+
 '<p class="intel-caption mt-3">Hanya EULA VALID sesuai akses. Dua minggu lengkap diprioritaskan; jika belum cukup, WTD dibanding hari yang sama minggu lalu dan diberi label.</p></section>'+
 '<section class="intel-card"><div class="intel-card-head"><h3>Radar Smartphone Global</h3></div>'+
 '<p class="text-xs text-slate-300 mb-3">Berita, fitur terbaru dan katalog harga resmi. Sumber eksternal dibuka terpisah; harga dapat berubah sewaktu-waktu.</p>'+
 '<div id="pulse-sources" class="space-y-2"></div>'+
 '<p class="intel-caption mt-3">Kurasi sumber, bukan feed otomatis atau seluruh informasi dunia. Harga, stok, dan tanggal produk wajib diverifikasi pada situs terkait.</p></section></div>';
 const data=weeklySummary(ctx.sales||[],ctx.period);
 const el=root.querySelector("#pulse-wow");
 if(data.ready){
  const sign=data.growth>0?"+":"",down=data.growth<0;
  el.innerHTML='<div class="text-3xl font-bold '+(down?"text-amber-200":"text-emerald-300")+'">'+sign+num(data.growth.toFixed(1))+'% <small class="text-sm font-normal">WoW</small></div>'+
  '<p class="text-sm text-slate-200 mt-2">'+num(data.previous.qty)+' unit ('+esc(data.previous.start)+'–'+esc(data.previous.end)+') → '+num(data.current.qty)+' unit ('+esc(data.current.start)+'–'+esc(data.current.end)+')</p>'+
  '<p class="text-sm mt-2 text-slate-300">'+(down?"Turun ":"Naik ")+num(Math.abs(data.delta))+' unit dibanding '+(data.partial?"hari yang sama minggu sebelumnya (WTD).":"minggu penuh sebelumnya.")+'</p>';
 }else el.textContent=data.message;
 root.querySelector("#pulse-sources").innerHTML=sources.map(item=>
  '<a class="block rounded-xl border border-slate-700/70 p-3 hover:border-cyan-500/60" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+
  '<div class="flex justify-between gap-2"><strong class="text-cyan-200 text-sm">'+esc(item.name)+'</strong><span class="text-xs text-slate-400">'+esc(item.kind)+'</span></div>'+
  '<p class="text-xs text-slate-300 mt-1">'+esc(item.topic)+'</p></a>').join("");
}
window.SamsungMarketPulse={weeklySummary,weekStart,render,sources};
})();

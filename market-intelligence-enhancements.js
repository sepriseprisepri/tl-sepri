/* Market intelligence enhancements. Uses only RLS-scoped sales already in app context.
 * No synthetic data, no scraping, no API keys or production writes. */
(function(){
"use strict";
const F=new Intl.NumberFormat("id-ID",{maximumFractionDigits:1});
const fmt=x=>F.format(Number(x||0));
const e=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const valid=x=>String(x.eula_status||"").toUpperCase()==="VALID";
const sources=[
 ["Samsung Newsroom","Produk baru dan keunggulan Galaxy","https://news.samsung.com/global/"],
 ["GSMArena","Berita, spesifikasi dan review semua brand","https://www.gsmarena.com/news.php3"],
 ["Android Authority","Inovasi dan pembaruan Android","https://www.androidauthority.com/news/"],
 ["Apple Newsroom","Produk dan teknologi iPhone","https://www.apple.com/newsroom/"],
 ["Samsung Indonesia","Harga dan promo resmi Galaxy Indonesia","https://www.samsung.com/id/smartphones/"],
 ["Xiaomi Indonesia","Produk dan harga resmi Xiaomi/POCO","https://www.mi.co.id/id/mobile/"],
 ["OPPO Indonesia","Produk dan harga resmi OPPO","https://www.oppo.com/id/smartphones/"],
 ["vivo Indonesia","Produk dan harga resmi vivo","https://www.vivo.com/id/products"],
 ["Counterpoint Research","Riset perkembangan pasar smartphone global","https://www.counterpointresearch.com/insights/"]
];
function marketPanel(){
 return '<section class="intel-card intel-market-hub" aria-label="Referensi teknologi smartphone">'+
  '<div class="intel-card-head"><h3>Radar Pasar Smartphone Global</h3></div>'+
  '<p class="intel-caption">Pantau berita, peluncuran, spesifikasi, inovasi, dan harga melalui sumber aslinya. Tautan membuka data terbaru dari penerbit masing-masing. Tidak ada klaim harga real-time di dashboard ini.</p>'+
  '<div class="intel-live-news"><h4>Berita Smartphone Terbaru</h4><p class="intel-caption">Judul dari RSS penerbit serta waktu publikasi.</p><div data-market-headlines role="status" aria-live="polite">Memuat berita…</div></div>'+
  '<div class="intel-market-grid">'+sources.map(([name,desc,url])=>
   '<a href="'+e(url)+'" target="_blank" rel="noopener noreferrer" class="intel-market-link"><strong>'+e(name)+'</strong><span>'+e(desc)+'</span></a>').join("")+'</div>'+
  '<p class="intel-caption">Sumber eksternal tidak mengubah RAW Sellout Samsung. Sinkronisasi otomatis lintas penerbit/brand membutuhkan layanan terpisah dan verifikasi lisensi serta jadwal pembaruan.</p></section>';
}
function loadHeadlines(root){
 const node=root?.querySelector("[data-market-headlines]");if(!node)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 fetch("/api/market-news",{cache:"no-store",signal:controller.signal}).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(payload=>{
  if(!node.isConnected)return;
  const rows=Array.isArray(payload.articles)?payload.articles.filter(x=>typeof x.title==="string"&&typeof x.url==="string"&&/^https:\/\//.test(x.url)):[];
  if(!rows.length){node.textContent="Berita belum tersedia. Buka sumber resmi di bawah.";return;}
  node.innerHTML=rows.slice(0,8).map(x=>'<a class="intel-news-row" href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer"><strong>'+e(x.title)+'</strong><span>'+e(x.source)+' · '+e(x.published?new Date(x.published).toLocaleDateString("id-ID"):"Tanggal tidak tersedia")+'</span></a>').join("");
 }).catch(()=>{if(node.isConnected)node.textContent="Feed berita sementara tidak tersedia. Gunakan sumber langsung di bawah.";}).finally(()=>clearTimeout(timer));
}
function weekly(sales,weekKey,metric="qty"){
 const map=new Map();
 for(const r of sales.filter(valid)){const week=weekKey(r.sold_at);map.set(week,(map.get(week)||0)+Number(r[metric]||0));}
 const weeks=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 return weeks.map(([week,value],i)=>({week,value,previous:i?weeks[i-1][1]:null,
  growth:i&&weeks[i-1][1]>0?(value/weeks[i-1][1]-1)*100:null}));
}
function insightRows(sales,weekKey,metric="qty"){
 const good=sales.filter(valid),w=weekly(sales,weekKey,metric);
 const total=good.reduce((n,r)=>n+Number(r[metric]||0),0);
 const pending=sales.filter(r=>String(r.eula_status||"").toUpperCase()==="PENDING");
 if(!good.length)return [{title:"Belum ada sellout VALID",body:"Periksa filter toko, model dan periode. Transaksi PENDING tidak dihitung sebagai pencapaian."}];
 const out=[{title:"Kondisi sellout",body:fmt(total)+(metric==="qty"?" unit":" rupiah")+" dari "+fmt(good.length)+" transaksi VALID. "+fmt(pending.length)+" transaksi PENDING belum dihitung."}];
 if(w.length>=2){
  const x=w[w.length-1];
  out.push({title:"Perubahan Week to Week",body:x.growth===null?"Minggu sebelumnya bernilai nol; persentase tidak dihitung.":(x.growth>=0?"Tumbuh ":"Turun ")+fmt(Math.abs(x.growth))+"% dari "+w[w.length-2].week+" ke "+x.week+". Perbandingan minggu berjalan mungkin belum setara karena belum lengkap."});
 }
 const models=new Map();
 for(const r of good)models.set(r.model,(models.get(r.model)||0)+Number(r[metric]||0));
 const top=[...models.entries()].sort((a,b)=>b[1]-a[1])[0];
 if(top&&total>0)out.push({title:"Model paling berkontribusi",body:top[0]+" menyumbang "+fmt(top[1]/total*100)+"% dari total terfilter. Bandingkan dengan stok dan target fokus model."});
 return out;
}
function appendChart(ctx,mount,weekKey){
 let holder=mount.querySelector("#intel-market-extra");
 if(!holder){holder=document.createElement("div");holder.id="intel-market-extra";holder.className="intel-market-extra";mount.append(holder)}
 holder.innerHTML='<section class="intel-card"><div class="intel-card-head"><h3>Artificial Insight · Grafik Sellout</h3></div><div id="intel-contextual-insight" class="intel-insight-list" role="status" aria-live="polite"></div>'+
 '<p class="intel-caption">Insight otomatis berbasis aturan dan data transaksi VALID. Bukan prediksi atau hasil AI generatif.</p></section>'+marketPanel();
 loadHeadlines(holder);
 const store=mount.querySelector("#intel-chart-store"),model=mount.querySelector("#intel-chart-model"),metric=mount.querySelector("#intel-chart-metric");
 const paint=()=>{
  const filtered=(ctx.sales||[]).filter(r=>(!store?.value||r.site_id===store.value)&&(!model?.value||r.model===model.value));
  const rows=insightRows(filtered,weekKey,metric?.value||"qty");
  const target=mount.querySelector("#intel-contextual-insight");
  if(target)target.innerHTML=rows.map(x=>'<article class="intel-insight"><strong>'+e(x.title)+'</strong><p>'+e(x.body)+'</p></article>').join("");
 };
 [store,model,metric].filter(Boolean).forEach(el=>el.addEventListener("change",paint));paint();
 const hints=[["intel-day-chart","Qty/Amount VALID per tanggal penjualan"],["intel-week-chart","Total mingguan dan persentase perubahan vs minggu sebelumnya"],["intel-model-chart","Peringkat model berdasarkan metrik terpilih"],["intel-store-chart","Peringkat toko di cakupan akun"],["intel-status-chart","Qty VALID vs PENDING"],["intel-pace-panel","Target periode dibanding pencapaian saat ini"]];
 for(const [id,desc] of hints){const node=mount.querySelector("#"+id);if(node&&node.parentElement){
  const hint=document.createElement("p");hint.className="intel-caption intel-chart-hint";hint.textContent=desc;node.parentElement.after(hint);
 }}
}
function appendDashboard(ctx,weekKey){
 const host=document.getElementById("intel-dashboard");
 if(!host)return;
 const w=weekly(ctx.sales||[],weekKey),previous=host.querySelector("#intel-dashboard-weekly");
 if(previous)previous.remove();
 const node=document.createElement("section");node.id="intel-dashboard-weekly";node.className="intel-card";
 node.innerHTML='<div class="intel-card-head"><h3>Growth Sellout Samsung · Week to Week</h3></div>'+
 (w.length?w.slice(-4).map(x=>'<div class="intel-week-row"><span>'+e(x.week)+'</span><strong>'+fmt(x.value)+' unit</strong><span>'+(x.growth===null?"Belum ada pembanding":(x.growth>=0?"+":"")+fmt(x.growth)+"% WoW")+'</span></div>').join(""):'<p class="intel-caption">Belum ada transaksi VALID pada periode ini.</p>')+
 '<p class="intel-caption">Ringkasan Qty VALID sesuai hak akses. Periode minggu berjalan belum tentu lengkap; untuk keputusan gunakan minggu pembanding setara.</p>';
 host.prepend(node);
 let radar=host.querySelector("#intel-market-dashboard");
 if(!radar){radar=document.createElement("div");radar.id="intel-market-dashboard";host.append(radar);}
 radar.innerHTML=marketPanel();loadHeadlines(radar);
}
function install(){
 const lib=window.SalesIntelligence;if(!lib||lib.__marketExtended)return false;
 const originalDashboard=lib.renderDashboard,originalCharts=lib.renderCharts;
 lib.renderDashboard=(ctx)=>{originalDashboard(ctx);appendDashboard(ctx,lib.weekKey);};
 lib.renderCharts=(ctx,mount)=>{originalCharts(ctx,mount);appendChart(ctx,mount,lib.weekKey);};
 lib.__marketExtended=true;
 window.SamsungMarketInsights={weekly,insightRows,marketPanel};
 return true;
}
if(!install())document.addEventListener("DOMContentLoaded",install,{once:true});
})();

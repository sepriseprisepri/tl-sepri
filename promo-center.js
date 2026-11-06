/* Samsung Kalteng Promo Center.
   Published + verified promotion records are RLS-filtered. Never invent per-model benefits. */
(function(){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=new Intl.NumberFormat("id-ID");
const rp=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0});
const channelName={all:"Seluruh channel (sesuai syarat)",offline:"Traditional + Organized",traditional:"Traditional saja",organized:"Organized saja",e_store:"E-Store",online:"Online saja",unspecified:"Channel belum dipastikan"};
const kindLabel={offer:"Promo",price_update:"Informasi harga",no_offer:"Tanpa promo cashback",information:"Informasi program",financing:"Skema pembiayaan"};
function formatOffer(item){
 let output=String(item.name||"Benefit");
 if(item.amount_idr!=null)output+=" · "+rp.format(Number(item.amount_idr));
 if(item.price_idr!=null)output+=" · "+rp.format(Number(item.price_idr));
 if(item.percent!=null)output+=" · "+String(item.percent)+"%";
 if(item.estimated_value_idr!=null)output+=" · nilai estimasi "+rp.format(Number(item.estimated_value_idr));
 return output;
}
const today=()=>window.SalesIntelligence?.dateLocal?.()||new Date().toISOString().slice(0,10);
const norm=x=>String(x||"").trim().toUpperCase().replace(/\s+/g," ");
const allowedUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"&&(x.hostname==="www.samsung.com"&&x.pathname.startsWith("/id/")||x.hostname==="samsung.com"&&x.pathname.startsWith("/id/")||x.hostname==="news.samsung.com"&&x.pathname.startsWith("/id/"));}catch{return false;}};
const state=p=>!p.published?"draft":p.verification_state!=="verified"?"unverified":p.start_date>today()?"upcoming":p.end_date<today()?"expired":"active";
const label={draft:"Draft",unverified:"Belum diverifikasi",upcoming:"Akan datang",expired:"Berakhir",active:"Aktif"};
let renderToken=0;
async function loadRows(client,table,cols,filter){
 let items=[];for(let i=0;i<5;i++){
  let q=client.from(table).select(cols);if(filter)q=filter(q);
  const {data,error}=await q.range(i*500,(i+1)*500-1);
  if(error)throw error;items.push(...(data||[]));if((data||[]).length<500)break;
 }
 return items;
}
async function render(ctx,mount){
 const token=++renderToken;mount.innerHTML='<p class="intel-loading" role="status">Memuat katalog promo yang diizinkan akun...</p>';
 try{
  // National published promo rows for every active role; auth still enforced by RLS.
  const promos=await loadRows(ctx.client,"sales_promotions",
   "id,title,model_code,model_name,benefit,terms,channel_label,scope_type,start_date,end_date,source_url,verification_state,verified_at,published,created_at,source_type,source_reference,source_date,verified_basis,program_category,sku_variant,channel_code,offer_items,record_kind",
   q=>q.eq("published",true).eq("verification_state","verified").eq("scope_type","national").order("start_date",{ascending:false})
  );
  if(token!==renderToken||!mount.isConnected)return;
  const models=[...new Set(promos.filter(p=>p.model_code!=="*").map(p=>p.model_name).filter(Boolean).map(v=>String(v).trim()))].sort((a,b)=>a.localeCompare(b,"id"));
  mount.innerHTML='<div class="intel-page-head"><div><p class="intel-overline">Sales enablement · National catalog</p><h3>Promo Nasional Samsung</h3>'+
   '<p>Katalog nasional yang sama untuk Admin, TL, TSO, dan EC. Detail cashback, bundling, varian, dan channel tetap mengikuti ketentuan masing-masing program.</p></div>'+
   '<a class="intel-action intel-action-subtle" href="https://www.samsung.com/id/offer/" target="_blank" rel="noopener noreferrer">Samsung Offers Resmi ↗</a></div>'+
   '<div class="intel-promo-provenance">Sumber data: <strong>Bulletin internal “Master Update Promo Samsung — November 2026” tertanggal 30 Oktober 2026</strong> dan penawaran resmi Samsung.com yang tercatat terpisah. Data bulletin adalah informasi internal yang Anda sampaikan, <strong>bukan hasil verifikasi eksternal oleh Samsung.com</strong>.</div><div class="intel-promo-universal-rules">Periode utama program tertentu: <strong>1–17 November</strong>, lainnya mengikuti tanggal masing-masing kartu. Berlaku untuk <strong>Regular Device (Non-PO)</strong> kecuali syarat menyatakan lain. RRP baru berlaku nasional sejak <strong>1 November 2026</strong>. Promo reguler berlaku Traditional & Organized bila tidak ada pengecualian (misalnya S25 FE, Buds 4 Pro, Tab S12). <strong>Biaya Admin Dobel Zero 6%/8% berbeda dari Free Admin & Processing Fee.</strong></div><div id="intel-promo-kpis" class="intel-stat-grid"></div>'+
   '<div class="intel-filters">'+
     '<label>Model atau kata kunci<input id="promo-query" class="field" placeholder="Cari Galaxy A / cashback…" aria-label="Cari promosi"></label>'+
     '<label>Status<select id="promo-status" class="field"><option value="active">Sedang berjalan</option><option value="upcoming">Akan datang</option><option value="expired">Sudah berakhir</option><option value="all">Semua status</option></select></label>'+
     '<label>Model<select id="promo-model" class="field"><option value="">Semua model</option>'+models.map(m=>'<option value="'+esc(m)+'">'+esc(m)+'</option>').join("")+'</select></label>'+
     '<label>Channel<select id="promo-channel" class="field"><option value="">Semua channel</option><option value="traditional">Traditional</option><option value="organized">Organized</option><option value="offline">Offline (Trad + Organized)</option><option value="e_store">E-Store</option><option value="online">Online</option><option value="all">Semua channel</option></select></label>'+
     '<label>Kategori<select id="promo-category" class="field"><option value="">Semua kategori</option><option value="smartphone">Smartphone</option><option value="tablet">Tablet</option><option value="wearable">Watch / Wearable</option><option value="audio">Buds / Audio</option><option value="financing">Finance Plus</option><option value="price">Update Harga</option><option value="information">Info / pengecualian</option></select></label>'+
   '</div><div id="promo-saved-filters"></div>'+
   '<p id="promo-results-count" class="intel-caption" aria-live="polite"></p><div id="promo-results" class="intel-promo-grid" aria-live="polite"></div><button id="promo-load-more" class="intel-action intel-action-subtle" type="button" hidden>Muat 18 promo berikutnya</button>'+
   '<div id="promo-model-availability" class="intel-card"><h3>Cakupan promo per model</h3><p class="intel-caption">Promo nasional dapat dilihat semua peran; manfaat tiap model tetap mengikuti varian, channel, dan syarat. Tidak ada data promo = jangan menjanjikan cashback.</p><div id="promo-model-list" class="intel-model-chips"></div></div>';
  const query=mount.querySelector("#promo-query"),status=mount.querySelector("#promo-status"),model=mount.querySelector("#promo-model"),
   channel=mount.querySelector("#promo-channel"),category=mount.querySelector("#promo-category");
  if(window.UserPrefs?.pendingSearch){query.value=window.UserPrefs.pendingSearch;window.UserPrefs.pendingSearch="";}
  const current=()=>({query:query.value,status:status.value,model:model.value,channel:channel.value,category:category.value});
  let visibleLimit=18;
  const display=()=>{
   const filter=current(),term=filter.query.trim().toLocaleLowerCase("id-ID");
   const eligiblePromo=promos.filter(p=>{
    if(filter.status!=="all"&&state(p)!==filter.status)return false;
    if(filter.model&&norm(p.model_name)!==norm(filter.model)&&norm(p.model_code)!==norm(filter.model)&&p.model_code!=="*")return false;
    if(filter.channel){
     const selected=filter.channel,actual=p.channel_code||"unspecified";
     const channelMatch=actual===selected||actual==="all"||
       (selected==="traditional"||selected==="organized")&&actual==="offline"||
       selected==="offline"&&["traditional","organized"].includes(actual);
     if(!channelMatch)return false;
    }
    if(filter.category&&p.program_category!==filter.category)return false;
    const searchable=[p.title,p.model_code,p.model_name,p.sku_variant,p.benefit,p.channel_label,p.terms,p.source_reference].join(" ").toLocaleLowerCase("id-ID");
    return !term||searchable.includes(term);
   });
   const currentActive=promos.filter(p=>state(p)==="active");
   const specific=currentActive.filter(p=>p.model_code!=="*"&&p.record_kind==="offer");
   const channelEligible=p=>{
    if(!filter.channel)return true;
    const a=p.channel_code||"unspecified",c=filter.channel;
    return a===c||a==="all"||["traditional","organized"].includes(c)&&a==="offline"||
      c==="offline"&&["traditional","organized"].includes(a);
   };
   const covered=new Set(specific.filter(p=>channelEligible(p)).map(p=>norm(p.model_name)));
   mount.querySelector("#intel-promo-kpis").innerHTML=[
    ["Program model aktif",specific.length],["Kampanye umum",currentActive.filter(p=>p.model_code==="*").length],
    ["Model dalam katalog",models.length],["Model belum ada promo",models.filter(m=>!covered.has(norm(m))).length]
   ].map(([k,v])=>'<div class="intel-stat"><span>'+esc(k)+'</span><strong>'+fmt.format(v)+'</strong></div>').join("");
   const box=mount.querySelector("#promo-results");box.innerHTML="";
   const more=mount.querySelector("#promo-load-more");
   more.hidden=eligiblePromo.length<=visibleLimit;
   mount.querySelector("#promo-results-count").textContent="Menampilkan "+Math.min(visibleLimit,eligiblePromo.length)+" dari "+eligiblePromo.length+" entri sesuai filter. Label 'aktif' menunjukkan tanggal program pada bulletin, bukan verifikasi eksternal.";
   if(!eligiblePromo.length)box.innerHTML='<div class="intel-zero">Belum ada promo terverifikasi yang sesuai filter ini. Periksa kanal resmi Samsung atau hubungi Admin.</div>';
   for(const p of eligiblePromo.slice(0,visibleLimit)){
    const node=document.createElement("article");node.className="intel-promo-card";
    const condition=state(p),isGeneral=p.model_code==="*";
    const modelTag=isGeneral?"KAMPANYE UMUM · CEK KELAYAKAN MODEL":p.model_name;
    const isInternal=p.source_type==="internal_bulletin";
    const source=isInternal?
      '<span class="intel-source-internal">Bulletin internal · '+esc(p.source_date||"30 Oktober 2026")+' · Disalin dari informasi yang diberikan. Bukan verifikasi publik Samsung.com; cek mekanisme dengan TL/TSO.</span>':
      allowedUrl(p.source_url)?'<a href="'+esc(p.source_url)+'" target="_blank" rel="noopener noreferrer" class="intel-link">Lihat syarat & sumber resmi ↗</a>':
       '<span class="intel-caption">Tautan resmi belum tersedia — periksa sumber sebelum transaksi.</span>';
    const items=Array.isArray(p.offer_items)?p.offer_items:[];
    const itemCards=items.length?
     '<ul class="intel-offer-items">'+items.map(item=>'<li>'+esc(formatOffer(item))+'</li>').join("")+'</ul>':"";
    const kind=p.record_kind||"offer";
    const review=p.review_notes&&p.requires_review?'<p class="intel-review-note">Perlu konfirmasi: '+esc(p.review_notes)+'</p>':"";
    const sourceLabel=isInternal?"Sumber: bulletin internal":"Sumber: Samsung.com";
    node.innerHTML='<div class="intel-promo-top"><span class="intel-promo-state state-'+esc(condition)+'">'+esc(kind!=="offer"?(kindLabel[kind]||label[condition]):label[condition])+'</span><span class="intel-overline">'+esc(sourceLabel)+'</span></div>'+
     '<p class="intel-promo-model">'+esc(modelTag)+'</p><h4>'+esc(p.title)+'</h4>'+
     '<div class="intel-offer-badges"><span>Varian: '+esc(p.sku_variant||"Semua varian")+'</span><span>Channel: '+esc(channelName[p.channel_code]||p.channel_label)+'</span><span>'+esc(kindLabel[kind]||"Promo")+'</span></div>'+
     '<p class="intel-promo-benefit">'+esc(p.benefit)+'</p>'+itemCards+review+
     '<dl class="intel-promo-meta"><div><dt>Mulai</dt><dd>'+esc(p.start_date)+'</dd></div><div><dt>Berakhir</dt><dd>'+esc(p.end_date)+'</dd></div>'+
     '<div><dt>Cakupan</dt><dd>Nasional · mengikuti syarat channel &amp; varian</dd></div></dl>'+
     (p.terms?'<details class="intel-terms"><summary>Syarat dan ketentuan</summary><p>'+esc(p.terms)+'</p></details>':"")+
     '<div class="intel-promo-links">'+source+'</div>';
    box.appendChild(node);
   }
   const chips=mount.querySelector("#promo-model-list");chips.innerHTML="";
   for(const m of models.filter(m=>!filter.model||norm(m)===norm(filter.model)).slice(0,150)){
    const isActive=covered.has(norm(m)),el=document.createElement("span");
    el.className="intel-model-chip"+(isActive?" active":"");
    el.textContent=m+" · "+(isActive?"Ada program terdata, cek varian/channel":"Tidak ada promo cashback terdata untuk model/kanal ini");
    chips.appendChild(el);
   }
   if(!models.length)chips.innerHTML='<p class="intel-caption">Belum ada model yang dipublikasikan dalam katalog nasional.</p>';
  };
  [query,status,model,channel,category].forEach(input=>input.addEventListener(input===query?"input":"change",()=>{visibleLimit=18;display();}));
  mount.querySelector("#promo-load-more").addEventListener("click",()=>{visibleLimit+=18;display();});
  display();
  if(window.UserPrefs)window.UserPrefs.savedFilterControls({
   client:ctx.client,profile:ctx.profile,feature:"promo",mount:mount.querySelector("#promo-saved-filters"),
   getState:current,applyState:s=>{
    if(typeof s.query==="string")query.value=s.query;
    if(typeof s.status==="string"&&[...status.options].some(o=>o.value===s.status))status.value=s.status;
    if(typeof s.model==="string"&&[...model.options].some(o=>o.value===s.model))model.value=s.model;
    if(typeof s.channel==="string"&&[...channel.options].some(o=>o.value===s.channel))channel.value=s.channel;
    if(typeof s.category==="string"&&[...category.options].some(o=>o.value===s.category))category.value=s.category;
    display();
   }
  });
 }catch(error){
  if(token!==renderToken)return;
  console.error("[PromoCenter]",error);
  mount.innerHTML='<div role="alert" class="intel-zero">Gagal memuat promo: '+esc(error.message||"Periksa koneksi dan izin data.")+'</div>';
 }
}
window.PromoCenter={render,allowedUrl,state,norm};
})();

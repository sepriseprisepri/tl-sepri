/* Samsung Kalteng Promo Center.
   Published + verified promotion records are RLS-filtered. Never invent per-model benefits. */
(function(){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=new Intl.NumberFormat("id-ID");
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
  const [promos,focus,raw,eligible]=await Promise.all([
   loadRows(ctx.client,"sales_promotions","id,title,model_code,model_name,benefit,terms,channel_label,scope_type,start_date,end_date,source_url,verification_state,verified_at,published,created_at",q=>q.order("start_date",{ascending:false})),
   loadRows(ctx.client,"focus_model_settings","model_code,display_name,is_active"),
   loadRows(ctx.client,"raw_sellout","model",q=>q.order("sold_at",{ascending:false})),
   loadRows(ctx.client,"sales_promotion_stores","promo_id,store_id")
  ]);
  if(token!==renderToken||!mount.isConnected)return;
  const models=[...new Set([...focus.map(s=>s.display_name||s.model_code),...raw.map(s=>s.model),...promos.filter(p=>p.model_code!=="*").map(p=>p.model_name)].filter(Boolean).map(s=>String(s).trim()))].sort((a,b)=>a.localeCompare(b,"id"));
  const storeMap=new Map((ctx.stores||[]).map(s=>[s.id,s]));
  const relation=new Map();
  for(const item of eligible){const arr=relation.get(item.promo_id)||[];arr.push(item.store_id);relation.set(item.promo_id,arr);}
  const role=ctx.profile.role;
  mount.innerHTML='<div class="intel-page-head"><div><p class="intel-overline">Sales enablement · Verified offers</p><h3>Promo Samsung</h3>'+
   '<p>Promo resmi yang tersedia untuk model Samsung dalam periode dan cakupan Anda. Syarat selalu mengikuti sumber resmi.</p></div>'+
   '<a class="intel-action intel-action-subtle" href="https://www.samsung.com/id/offer/" target="_blank" rel="noopener noreferrer">Samsung Offers Resmi ↗</a></div>'+
   '<div id="intel-promo-kpis" class="intel-stat-grid"></div>'+
   '<div class="intel-filters">'+
     '<label>Model atau kata kunci<input id="promo-query" class="field" placeholder="Cari Galaxy A / cashback…" aria-label="Cari promosi"></label>'+
     '<label>Status<select id="promo-status" class="field"><option value="active">Sedang berjalan</option><option value="upcoming">Akan datang</option><option value="expired">Sudah berakhir</option>'+(role==="admin"?'<option value="draft">Draft Admin</option>':'')+'<option value="all">Semua status</option></select></label>'+
     '<label>Model<select id="promo-model" class="field"><option value="">Semua model</option>'+models.map(m=>'<option value="'+esc(m)+'">'+esc(m)+'</option>').join("")+'</select></label>'+
   '</div><div id="promo-saved-filters"></div>'+
   '<div id="promo-results" class="intel-promo-grid" aria-live="polite"></div>'+
   '<div id="promo-model-availability" class="intel-card"><h3>Cakupan promo per model</h3><p class="intel-caption">Model yang teridentifikasi dari sellout dan focus model. Tidak ada penawaran terverifikasi = tidak boleh menjanjikan promo.</p><div id="promo-model-list" class="intel-model-chips"></div></div>'+
   (role==="admin"?'<div class="intel-card"><div class="intel-card-head"><h3>Admin · Publikasikan promo terverifikasi</h3></div><p class="intel-caption">Verifikasi sumber, cakupan toko dan tanggal terlebih dahulu. Hanya admin aktif yang dapat membuat atau menonaktifkan promo.</p><div id="promo-admin"></div></div>':"");
  const query=mount.querySelector("#promo-query"),status=mount.querySelector("#promo-status"),model=mount.querySelector("#promo-model");
  const current=()=>({query:query.value,status:status.value,model:model.value});
  const display=()=>{
   const filter=current(),term=filter.query.trim().toLocaleLowerCase("id-ID");
   const eligiblePromo=promos.filter(p=>{
    if(filter.status!=="all"&&state(p)!==filter.status)return false;
    if(filter.model&&norm(p.model_name)!==norm(filter.model)&&norm(p.model_code)!==norm(filter.model)&&p.model_code!=="*")return false;
    const searchable=[p.title,p.model_code,p.model_name,p.benefit,p.channel_label].join(" ").toLocaleLowerCase("id-ID");
    return !term||searchable.includes(term);
   });
   const currentActive=promos.filter(p=>state(p)==="active");
   const specific=currentActive.filter(p=>p.model_code!=="*");
   const covered=new Set(specific.map(p=>norm(p.model_name)));
   mount.querySelector("#intel-promo-kpis").innerHTML=[
    ["Promo model aktif",specific.length],["Kampanye umum",currentActive.filter(p=>p.model_code==="*").length],
    ["Model dalam katalog",models.length],["Model belum ada promo",models.filter(m=>!covered.has(norm(m))).length]
   ].map(([k,v])=>'<div class="intel-stat"><span>'+esc(k)+'</span><strong>'+fmt.format(v)+'</strong></div>').join("");
   const box=mount.querySelector("#promo-results");box.innerHTML="";
   if(!eligiblePromo.length)box.innerHTML='<div class="intel-zero">Belum ada promo terverifikasi yang sesuai filter ini. Periksa kanal resmi Samsung atau hubungi Admin.</div>';
   for(const p of eligiblePromo){
    const node=document.createElement("article");node.className="intel-promo-card";
    const condition=state(p),isGeneral=p.model_code==="*";
    const modelTag=isGeneral?"KAMPANYE UMUM · CEK KELAYAKAN MODEL":p.model_name;
    const stores=(relation.get(p.id)||[]).map(id=>storeMap.get(id)?.site_name).filter(Boolean);
    const source=allowedUrl(p.source_url)?'<a href="'+esc(p.source_url)+'" target="_blank" rel="noopener noreferrer" class="intel-link">Lihat syarat & sumber resmi ↗</a>':
      '<span class="intel-caption">Sumber bukan domain Samsung Indonesia yang diizinkan — konfirmasi ke Admin.</span>';
    node.innerHTML='<div class="intel-promo-top"><span class="intel-promo-state state-'+esc(condition)+'">'+esc(label[condition])+'</span><span class="intel-overline">'+esc(p.channel_label)+'</span></div>'+
     '<p class="intel-promo-model">'+esc(modelTag)+'</p><h4>'+esc(p.title)+'</h4>'+
     '<p class="intel-promo-benefit">'+esc(p.benefit)+'</p>'+
     '<dl class="intel-promo-meta"><div><dt>Mulai</dt><dd>'+esc(p.start_date)+'</dd></div><div><dt>Berakhir</dt><dd>'+esc(p.end_date)+'</dd></div>'+
     '<div><dt>Cakupan</dt><dd>'+esc(p.scope_type==="national"?"Kampanye umum nasional":stores.length?stores.join(", "):"Toko tertentu")+'</dd></div></dl>'+
     (p.terms?'<details class="intel-terms"><summary>Syarat dan ketentuan</summary><p>'+esc(p.terms)+'</p></details>':"")+
     '<div class="intel-promo-links">'+source+'</div>';
    if(role==="admin"){
     const toggle=document.createElement("button");toggle.className="intel-action intel-action-subtle";toggle.type="button";
     toggle.textContent=p.published?"Nonaktifkan promo":"Terbitkan ulang";
     toggle.disabled=!p.published&&p.verification_state!=="verified";
     toggle.addEventListener("click",async()=>{
      toggle.disabled=true;
      const update={published:!p.published,updated_by:ctx.profile.id,updated_at:new Date().toISOString()};
      const {error}=await ctx.client.from("sales_promotions").update(update).eq("id",p.id);
      if(error){toggle.textContent="Gagal: "+error.message;toggle.disabled=false;return;}
      p.published=!p.published;toggle.disabled=false;display();
     });
     node.appendChild(toggle);
    }
    box.appendChild(node);
   }
   const chips=mount.querySelector("#promo-model-list");chips.innerHTML="";
   for(const m of models.filter(m=>!filter.model||norm(m)===norm(filter.model)).slice(0,150)){
    const isActive=covered.has(norm(m)),el=document.createElement("span");
    el.className="intel-model-chip"+(isActive?" active":"");
    el.textContent=m+" · "+(isActive?"Promo model terverifikasi":"Belum ada promo model");
    chips.appendChild(el);
   }
   if(!models.length)chips.innerHTML='<p class="intel-caption">Belum tersedia master model dari data akun ini. Gunakan pencarian promo atau perbarui data focus model.</p>';
  };
  [query,status,model].forEach(input=>input.addEventListener(input===query?"input":"change",display));
  display();
  if(window.UserPrefs)window.UserPrefs.savedFilterControls({
   client:ctx.client,profile:ctx.profile,feature:"promo",mount:mount.querySelector("#promo-saved-filters"),
   getState:current,applyState:s=>{
    if(typeof s.query==="string")query.value=s.query;
    if(typeof s.status==="string"&&[...status.options].some(o=>o.value===s.status))status.value=s.status;
    if(typeof s.model==="string"&&[...model.options].some(o=>o.value===s.model))model.value=s.model;
    display();
   }
  });
  if(role==="admin")adminEditor(ctx,mount.querySelector("#promo-admin"),models,ctx.stores||[],()=>render(ctx,mount));
 }catch(error){
  if(token!==renderToken)return;
  console.error("[PromoCenter]",error);
  mount.innerHTML='<div role="alert" class="intel-zero">Gagal memuat promo: '+esc(error.message||"Periksa koneksi dan izin data.")+'</div>';
 }
}
function adminEditor(ctx,mount,models,stores,reload){
 mount.innerHTML='<form id="promo-create" class="intel-admin-form">'+
  '<label>Nama kampanye<input name="title" class="field" required minlength="4" maxlength="160" placeholder="Contoh: Cashback Galaxy ..."></label>'+
  '<label>Nama model<input name="model_name" list="promo-available-models" class="field" required placeholder="Galaxy A16 5G atau * untuk kampanye umum"><datalist id="promo-available-models">'+models.map(m=>'<option value="'+esc(m)+'">').join("")+'</datalist></label>'+
  '<label>Benefit terverifikasi<textarea name="benefit" class="field" required minlength="4" maxlength="600" placeholder="Penawaran yang tepat dari sumber resmi"></textarea></label>'+
  '<label>Syarat dan ketentuan<textarea name="terms" class="field" maxlength="2500" placeholder="Bank, channel, stok, syarat trade-in, dll."></textarea></label>'+
  '<label>Channel / lokasi berlaku<input name="channel_label" class="field" required value="Samsung.com Indonesia"></label>'+
  '<label>Mulai<input name="start_date" type="date" class="field" required></label>'+
  '<label>Selesai<input name="end_date" type="date" class="field" required></label>'+
  '<label>Tautan sumber resmi Samsung Indonesia<input name="source_url" type="url" class="field" required placeholder="https://www.samsung.com/id/offer/..."></label>'+
  '<label>Cakupan<select name="scope_type" class="field"><option value="national">Umum nasional — sesuai syarat kanal</option><option value="selected_stores">Toko tertentu</option></select></label>'+
  '<label class="intel-full">Site ID toko (jika toko tertentu, pisahkan dengan koma)<textarea name="site_ids" class="field" placeholder="SITE001, SITE002"></textarea></label>'+
  '<button type="submit" class="intel-action intel-action-primary">Terbitkan promo setelah verifikasi</button>'+
  '<p id="promo-admin-status" class="intel-filter-msg intel-full" role="status"></p></form>';
 const form=mount.querySelector("#promo-create"),status=mount.querySelector("#promo-admin-status"),btn=form.querySelector('button[type="submit"]');
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const values=Object.fromEntries(new FormData(form).entries());
  if(!allowedUrl(values.source_url)){status.textContent="Sumber wajib dari samsung.com/id atau news.samsung.com/id.";return;}
  if(values.start_date>values.end_date){status.textContent="Tanggal selesai tidak boleh sebelum mulai.";return;}
  const name=values.model_name.trim();
  if(!name){status.textContent="Nama model diperlukan.";return;}
  const isGeneral=name==="*";
  const ids=values.site_ids.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  const uniqueIds=[...new Set(ids)];const map=new Map(stores.map(s=>[s.site_id,s.id]));
  if(values.scope_type==="selected_stores"&&(!uniqueIds.length||uniqueIds.some(id=>!map.has(id)))){
   status.textContent="Untuk scope toko tertentu, isi Site ID yang valid dan termasuk cakupan Admin.";return;
  }
  const payload={
   title:values.title.trim(),model_code:isGeneral?"*":norm(name),model_name:isGeneral?"Penawaran umum Samsung Indonesia":name,
   benefit:values.benefit.trim(),terms:values.terms.trim(),
   channel_label:values.channel_label.trim(),scope_type:values.scope_type,
   start_date:values.start_date,end_date:values.end_date,
   source_url:values.source_url.trim(),verification_state:"verified",verified_at:new Date().toISOString(),
   published:false,created_by:ctx.profile.id,updated_by:ctx.profile.id
  };
  btn.disabled=true;status.textContent="Menyimpan promosi dan cakupan...";
  let createdId=null;
  try{
   const {data,error}=await ctx.client.from("sales_promotions").insert(payload).select("id").single();
   if(error||!data)throw new Error(error?.message||"Gagal membuat promo");
   createdId=data.id;
   if(values.scope_type==="selected_stores"){
    const rows=uniqueIds.map(id=>({promo_id:createdId,store_id:map.get(id)}));
    const {error:linkError}=await ctx.client.from("sales_promotion_stores").insert(rows);
    if(linkError)throw new Error("Cakupan toko tidak tersimpan: "+linkError.message);
   }
   const {error:publishError}=await ctx.client.from("sales_promotions").update({published:true,updated_at:new Date().toISOString()}).eq("id",createdId);
   if(publishError)throw new Error("Gagal menerbitkan promo: "+publishError.message);
   status.textContent="Promo terbit. Memuat daftar terbaru...";
   reload();
  }catch(e){
   // Fail closed: never leave an unexpectedly published promo behind.
   if(createdId)await ctx.client.from("sales_promotions").delete().eq("id",createdId).eq("published",false);
   status.textContent="Gagal: "+e.message;
  }finally{btn.disabled=false;}
 });
}
window.PromoCenter={render,allowedUrl,state,norm};
})();

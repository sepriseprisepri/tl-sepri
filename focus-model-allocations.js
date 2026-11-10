/* Samsung Kalteng — TL-owned Focus Model targets for individual ECs.
 * Database RLS scopes reads. Writes are authorized and serialized by a
 * SECURITY DEFINER RPC; no browser-side business permission is trusted.
 */
(function(){
"use strict";
const num=x=>Number(x||0);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const qty=x=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Math.round(num(x)));
const money=x=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(num(x));
const percentage=(a,b)=>b>0?(100*a/b).toFixed(1)+"%":"—";
const key=s=>String(s??"").toUpperCase().normalize("NFKC").replace(/[^A-Z0-9]/g,"");
const today=()=>window.SamsungMarketMetrics?.localToday()||new Date().toISOString().slice(0,10);
function control(label,id,options){
 return '<label class="text-xs text-slate-400 grid gap-2">'+esc(label)+
  '<select id="'+id+'" class="field rounded-lg p-3 text-sm w-full" aria-label="'+esc(label)+'">'+
  options.map(x=>'<option value="'+esc(x.value)+'">'+esc(x.text)+'</option>').join("")+
  '</select></label>';
}
function metric(label,value,note){
 return '<div class="metric rounded-xl p-4"><div class="text-xs text-slate-400">'+esc(label)+'</div>'+
 '<strong class="block text-xl text-white mt-2">'+esc(value)+'</strong>'+
 '<p class="text-xs text-slate-500 mt-2">'+esc(note)+'</p></div>';
}
async function readAll(client,table,columns,configure){
 const output=[],size=650;
 for(let n=0;n<30000;n+=size){
  let query=client.from(table).select(columns);
  if(configure)query=configure(query);
  const {data,error}=await query.range(n,n+size-1);
  if(error)throw error;
  output.push(...data||[]);
  if(!data||data.length<size)return output;
 }
 throw Error("Terlalu banyak baris pada "+table+"; hubungi Admin");
}
const missingTable=e=>/PGRST205|PGRST116|does not exist|could not find the table|relation .* does not exist|schema cache/i.test(
 String(e?.code||"")+" "+String(e?.message||""));
function setupUi(data){
 const {mount,client,profile,period,stores,settings,targets,allocations,manpower,
  assignments,history=[],sales,migrationPending,isCurrent}=data;
 if(!isCurrent())return;
 const role=profile.role;
 const manager=role==="tl"||role==="admin";
 const personal=role==="ec";
 const valid=sales.filter(s=>String(s.eula_status||"").toUpperCase()==="VALID"&&
  s.sold_at>=period.period_start&&s.sold_at<=period.period_end&&s.sold_at<=today());
 const storesById=new Map(stores.map(s=>[s.id,s]));
 const people=new Map(manpower.map(m=>[m.id,m]));
 const names=new Map(settings.map(m=>[m.model_code,m.display_name]));
 const targetByTriple=new Map(targets.map(t=>[t.store_id+"|"+t.model_code,t]));
 const assigned=allocations.filter(a=>targetByTriple.has(a.store_id+"|"+a.model_code));
 const salesByTriple=new Map();
 for(const s of valid){
  const k=s.site_id+"|"+s.promoter_id+"|"+key(s.model);
  const a=salesByTriple.get(k)||{qty:0,amt:0};
  a.qty+=num(s.qty);a.amt+=num(s.amt);salesByTriple.set(k,a);
 }
 function actualFor(a){
  const store=storesById.get(a.store_id),m=people.get(a.manpower_id);
  if(!store||!m||!m.promoter_id)return {qty:0,amt:0,match:false};
  const words=[key(a.model_code),key(names.get(a.model_code))].filter(Boolean);
  const found=new Set(words);
  const acc={qty:0,amt:0,match:true};
  for(const name of found){
   const x=salesByTriple.get(store.site_id+"|"+m.promoter_id+"|"+name);
   if(x){acc.qty+=x.qty;acc.amt+=x.amt;}
  }
  return acc;
 }
 const rows=assigned.map(a=>{
  const st=storesById.get(a.store_id);
  const m=people.get(a.manpower_id);
  const actual=actualFor(a);
  return {...a,store_name:st?.site_name||"—",site_id:st?.site_id||"—",
   model_name:names.get(a.model_code)||a.model_code,
   employee_name:personal?"Saya":m?.full_name||"EC tidak aktif",
   promoter_id:personal?"—":m?.promoter_id||"—",
   actual_qty:actual.qty,actual_amt:actual.amt};
 });
 const total=(arr,field)=>arr.reduce((v,x)=>v+num(x[field]),0);
 const targetQty=total(targets,"target_qty"),targetAmt=total(targets,"target_amt");
 const assignedQty=total(rows,"target_qty"),assignedAmt=total(rows,"target_amt");
 const achievedQty=total(rows,"actual_qty"),achievedAmt=total(rows,"actual_amt");
 const storeLabel=personal?"Target Focus Model Saya":"Alokasi Focus Model EC";
 const head='<div class="flex flex-wrap items-start justify-between gap-3 mb-5">'+
  '<div><p class="text-xs text-cyan-300 uppercase tracking-widest">Samsung Kalteng · '+esc(period.period_name)+'</p>'+
  '<h3 class="text-xl font-semibold text-white mt-2">'+storeLabel+'</h3>'+
  '<p class="text-sm text-slate-400 mt-2">'+(personal?
    'Hanya target yang benar-benar dialokasikan TL untuk akun EC ini.':
    'Target toko adalah batas resmi; TL membagikan alokasi individual EC sesuai coverage.')+
   '</p></div><span class="pill text-cyan-200">EULA VALID · RLS</span></div>';
 const cards='<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">'+
  (personal?"":metric("Target Qty model toko",qty(targetQty),"Batas total store dalam scope"))+
  metric(personal?"Target Qty Saya":"Total Qty dialokasikan",qty(assignedQty),
   personal?"Alokasi pribadi dari TL":"Penjumlahan alokasi individual EC")+
  metric("Qty VALID tercapai",qty(achievedQty),"Hanya model yang cocok + Promoter ID")+
  metric("Gap Qty",qty(assignedQty-achievedQty),"Alokasi Qty dikurangi realisasi pribadi")+
  metric("Achievement Qty",percentage(achievedQty,assignedQty),"Dari target EC yang dialokasikan")+
  metric("Target Amt dialokasikan",money(assignedAmt),"Total target rupiah alokasi")+
  metric("Gap Amt",money(assignedAmt-achievedAmt),"Selisih target rupiah terhadap VALID")+
 '</div>';
 const summary=manager?'<p class="text-xs text-slate-400 mb-4">Target toko Qty '+qty(targetQty)+
  ' · Amt '+money(targetAmt)+' · telah dialokasikan Qty '+qty(assignedQty)+
  ' / Amt '+money(assignedAmt)+'. Alokasi tidak boleh melebihi tiap target model toko.</p>':
 '<p class="text-xs text-slate-400 mb-4">Pencapaian dihitung dari transaksi Anda pada toko penempatan, Promoter ID, model yang teridentifikasi, dan EULA VALID.</p>';
 const notice=migrationPending?
  '<div role="status" class="rounded-xl bg-amber-950/30 border border-amber-700/40 p-4 text-amber-200 mb-4">Migrasi alokasi EC belum tersedia di database ini. Target model toko tetap dapat dilihat, tetapi pengaturan personal belum aktif.</div>':"";
 const selections=targets.map((t,i)=>({value:String(i),
  text:(storesById.get(t.store_id)?.site_name||"Toko")+
    " · "+(names.get(t.model_code)||t.model_code)+" · target "+qty(t.target_qty)}));
 const activeAssignments=new Set(assignments.filter(a=>
  a.valid_from<=today()&&(!a.valid_to||a.valid_to>=today())).map(a=>a.manpower_id+"|"+a.store_id));
 const eligible=manpower.filter(m=>m.is_active&&m.fieldforce_position==="EC"&&
  stores.some(s=>s.site_id===m.site_id)&&
  [...activeAssignments].some(a=>a.startsWith(m.id+"|")));
 const form=manager&&!migrationPending&&targets.length?
  '<section class="panel rounded-2xl p-5 mb-5" aria-labelledby="focus-form-title">'+
  '<h4 id="focus-form-title" class="font-semibold text-white">Atur alokasi Focus Model per EC</h4>'+
  '<p class="text-xs text-slate-400 mt-2 mb-4">Pilih toko dan model yang sudah memiliki target resmi, lalu pilih EC aktif pada toko tersebut.</p>'+
  '<form id="focus-ec-form" class="space-y-3">'+
   '<div class="grid sm:grid-cols-2 gap-3">'+
    control("Toko dan model","focus-parent",[{value:"",text:"Pilih target model toko"},...selections])+
    control("Experience Consultant","focus-person",[{value:"",text:"Pilih EC sesuai toko"}])+
    '<label class="grid gap-2 text-xs text-slate-400">Target Qty EC'+
     '<input id="focus-qty" class="field rounded-lg p-3 text-sm" type="number" min="0" step="0.01" inputmode="decimal" required value="0"></label>'+
    '<label class="grid gap-2 text-xs text-slate-400">Target Amount EC (Rp)'+
     '<input id="focus-amt" class="field rounded-lg p-3 text-sm" type="number" min="0" step="1" inputmode="numeric" required value="0"></label>'+
   '</div><p id="focus-capacity" class="text-xs text-cyan-200" aria-live="polite">Pilih target model toko.</p>'+
   '<div class="flex gap-3 flex-wrap"><button type="submit" class="rounded-lg bg-cyan-500 text-slate-950 font-semibold px-5 py-3 hover:bg-cyan-400">Simpan alokasi EC</button>'+
   '<button type="button" id="focus-clear" class="rounded-lg border border-slate-600 px-4 py-3 text-slate-200">Bersihkan formulir</button></div>'+
   '<p id="focus-form-feedback" role="status" aria-live="polite" class="text-sm text-slate-300"></p>'+
  '</form></section>':
  manager&&!migrationPending?'<p class="text-amber-200 mb-4">Belum ada target Focus Model toko. Admin perlu membuat target toko terlebih dahulu.</p>':"";
 const storeOverview=manager?
  '<section class="panel rounded-2xl p-5 mb-5" aria-label="Ringkasan batas Focus Model per toko">'+
  '<h4 class="text-white font-semibold mb-3">Kontrol Target Model Toko</h4>'+
  '<p class="text-xs text-slate-400 mb-4">Target toko adalah plafon alokasi. Sisa belum dialokasikan bukan berarti pencapaian penjualan nol.</p>'+
  '<div class="table-wrap"><table class="w-full text-sm"><thead><tr>'+
  '<th>Toko</th><th>Model</th><th>Target Qty Toko</th><th>Qty Dialokasikan</th>'+
  '<th>Sisa Alokasi</th><th>VALID Qty EC</th><th>Target Amt Toko</th>'+
  '<th>Amt Dialokasikan</th><th>Sisa Amt</th></tr></thead><tbody>'+
  targets.map(t=>{
   const subset=rows.filter(a=>a.store_id===t.store_id&&a.model_code===t.model_code);
   const qAlloc=total(subset,"target_qty"),amtAlloc=total(subset,"target_amt");
   return '<tr><td>'+esc(storesById.get(t.store_id)?.site_name||"—")+'</td>'+
     '<td>'+esc(names.get(t.model_code)||t.model_code)+'</td>'+
     '<td>'+qty(t.target_qty)+'</td><td>'+qty(qAlloc)+'</td>'+
     '<td>'+qty(num(t.target_qty)-qAlloc)+'</td>'+
     '<td>'+qty(total(subset,"actual_qty"))+'</td>'+
     '<td>'+money(t.target_amt)+'</td><td>'+money(amtAlloc)+'</td>'+
     '<td>'+money(num(t.target_amt)-amtAlloc)+'</td></tr>';
  }).join("")+
  (targets.length?"":'<tr><td colspan="9" class="py-5 text-slate-400">Belum ada target Focus Model toko.</td></tr>')+
  '</tbody></table></div></section>':"";
 const filterData=[
  {id:"focus-filter-store",label:"Toko",opts:[{value:"",text:"Semua toko"},...stores.map(s=>({value:s.id,text:s.site_name}))]},
  {id:"focus-filter-model",label:"Model",opts:[{value:"",text:"Semua model"},...settings.map(s=>({value:s.model_code,text:s.display_name}))]}
 ];
 const filters='<div class="grid sm:grid-cols-2 gap-3 mb-4">'+filterData.map(f=>
  control(f.label,f.id,f.opts)).join("")+'</div>';
 const table='<section class="panel rounded-2xl p-5"><h4 class="text-white font-semibold mb-3">'+
  (personal?"Realisasi Focus Model Pribadi":"Daftar Alokasi dan Realisasi EC")+'</h4>'+filters+
  '<div class="table-wrap"><table class="w-full text-sm"><thead><tr>'+
  (personal?"":"<th>Nama EC</th>")+
  '<th>Toko</th><th>Model</th><th class="text-right">Target Qty</th><th class="text-right">VALID Qty</th>'+
  '<th class="text-right">Gap Qty</th><th class="text-right">Achievement</th>'+
  '<th class="text-right">Target Amt</th><th class="text-right">VALID Amt</th><th class="text-right">Gap Amt</th>'+
  (manager?"<th>Aksi</th>":"")+'</tr></thead><tbody id="focus-table-body"></tbody></table></div>'+
  '<p class="text-xs text-slate-500 mt-3">Model dihitung jika kode/nama model setelah normalisasi cocok dengan model RAW Sellout. Data yang tidak cocok perlu diverifikasi agar tidak dihitung sebagai pencapaian keliru.</p></section>';
 const activity=manager&&!migrationPending?
  '<section class="panel rounded-2xl p-5 mt-4" aria-label="Riwayat perubahan Focus Model">'+
  '<h4 class="text-white font-semibold mb-3">Riwayat Perubahan Alokasi</h4>'+
  '<div class="table-wrap"><table class="w-full text-sm"><thead><tr>'+
  '<th>Waktu (WIB)</th><th>EC</th><th>Model</th><th>Aksi</th>'+
  '<th>Qty sebelum → sesudah</th><th>Amt sebelum → sesudah</th></tr></thead><tbody>'+
  [...history].sort((a,b)=>String(b.changed_at||"").localeCompare(String(a.changed_at||"")))
   .slice(0,25).map(h=>'<tr>'+
    '<td>'+esc(h.changed_at?new Date(h.changed_at).toLocaleString("id-ID",{timeZone:"Asia/Pontianak"}):"—")+'</td>'+
    '<td>'+esc(people.get(h.manpower_id)?.full_name||"EC lama / tidak aktif")+'</td>'+
    '<td>'+esc(names.get(h.model_code)||h.model_code)+'</td>'+
    '<td>'+esc(h.action==="create"?"Dibuat":h.action==="update"?"Diubah":"Dihapus")+'</td>'+
    '<td>'+qty(h.old_qty)+' → '+qty(h.new_qty)+'</td>'+
    '<td>'+money(h.old_amt)+' → '+money(h.new_amt)+'</td></tr>').join("")+
   (history.length?"":'<tr><td colspan="6" class="text-slate-400 py-5">Belum ada perubahan.</td></tr>')+
  '</tbody></table></div><p class="text-xs text-slate-500 mt-3">25 aktivitas terbaru dalam periode; seluruh perubahan dicatat pada database.</p></section>':"";
 mount.innerHTML=head+notice+cards+summary+form+storeOverview+table+activity;
 const body=mount.querySelector("#focus-table-body");
 const stFilter=mount.querySelector("#focus-filter-store"),modelFilter=mount.querySelector("#focus-filter-model");
 function paint(){
  const filtered=rows.filter(r=>(!stFilter.value||r.store_id===stFilter.value)&&
    (!modelFilter.value||r.model_code===modelFilter.value));
  body.innerHTML=filtered.map(r=>'<tr>'+
   (personal?"":'<td>'+esc(r.employee_name)+'</td>')+
   '<td>'+esc(r.store_name)+'</td><td>'+esc(r.model_name)+'</td>'+
   '<td class="text-right">'+qty(r.target_qty)+'</td>'+
   '<td class="text-right">'+qty(r.actual_qty)+'</td>'+
   '<td class="text-right">'+qty(r.target_qty-r.actual_qty)+'</td>'+
   '<td class="text-right">'+percentage(r.actual_qty,r.target_qty)+'</td>'+
   '<td class="text-right">'+money(r.target_amt)+'</td>'+
   '<td class="text-right">'+money(r.actual_amt)+'</td>'+
   '<td class="text-right">'+money(r.target_amt-r.actual_amt)+'</td>'+
   (manager?'<td><div class="flex gap-2"><button class="text-cyan-300 underline" type="button" data-focus-edit="'+esc(r.id)+'">Edit</button>'+
    '<button class="text-rose-300 underline" type="button" data-focus-delete="'+esc(r.id)+'">Hapus</button></div></td>':"")+
   '</tr>').join("")||'<tr><td colspan="'+(manager?11:personal?9:10)+
    '" class="py-7 text-slate-400 text-center">Belum ada alokasi untuk filter ini.</td></tr>';
 }
 stFilter.addEventListener("change",paint);modelFilter.addEventListener("change",paint);paint();
 if(!manager||migrationPending||!targets.length)return;
 const formEl=mount.querySelector("#focus-ec-form"),parent=mount.querySelector("#focus-parent"),
  person=mount.querySelector("#focus-person"),qInput=mount.querySelector("#focus-qty"),
  amtInput=mount.querySelector("#focus-amt"),feedback=mount.querySelector("#focus-form-feedback"),
  capacity=mount.querySelector("#focus-capacity");
 function refreshPeople(){
  const t=parent.value===""?null:targets[Number(parent.value)];
  const group=t?eligible.filter(m=>storesById.get(t.store_id)?.site_id===m.site_id&&
    activeAssignments.has(m.id+"|"+t.store_id)):[];
  person.innerHTML='<option value="">Pilih EC sesuai toko</option>'+
    group.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.full_name)+
      ' · '+esc(m.promoter_id||"ID belum tersedia")+'</option>').join("");
  showCap();
 }
 function showCap(){
  const t=parent.value===""?null:targets[Number(parent.value)];
  if(parent.value===""||!t){capacity.textContent="Pilih target model toko.";return;}
  const others=assigned.filter(a=>a.store_id===t.store_id&&a.model_code===t.model_code&&
   a.manpower_id!==person.value);
  capacity.textContent="Target toko: "+qty(t.target_qty)+" / "+money(t.target_amt)+
   " · Sisa untuk EC terpilih: "+qty(num(t.target_qty)-total(others,"target_qty"))+
   " / "+money(num(t.target_amt)-total(others,"target_amt"));
 }
 function clear(){
  parent.value="";qInput.value="0";amtInput.value="0";refreshPeople();feedback.textContent="";
 }
 parent.addEventListener("change",refreshPeople);
 person.addEventListener("change",showCap);
 mount.querySelector("#focus-clear").addEventListener("click",clear);
 async function save(t,personId,amountQty,amountAmt){
  const {data:result,error}=await client.rpc("set_focus_model_ec_allocation",{
   p_period_id:period.id,p_store_id:t.store_id,p_model_code:t.model_code,
   p_manpower_id:personId,p_target_qty:amountQty,p_target_amt:amountAmt
  });
  if(error)throw new Error(error.message);
  if(!result?.ok)throw new Error("Alokasi belum berhasil disimpan");
  await window.FocusModelAllocationUI.render(data);
 }
 formEl.addEventListener("submit",async event=>{
  event.preventDefault();
  const t=targets[Number(parent.value)],manpowerId=person.value;
  const v=Number(qInput.value),a=Number(amtInput.value);
  if(parent.value===""||!t||!manpowerId||!Number.isFinite(v)||!Number.isFinite(a)||
    v<0||a<0||(!v&&!a)){
   feedback.textContent="Pilih toko, model, EC dan target valid. Untuk menghapus, gunakan tombol Hapus.";
   return;
  }
  const button=formEl.querySelector('button[type="submit"]');
  button.disabled=true;feedback.textContent="Menyimpan alokasi...";
  try{await save(t,manpowerId,v,a);}
  catch(error){feedback.textContent="Gagal menyimpan: "+error.message;button.disabled=false;}
 });
 mount.onclick=async event=>{
  const edit=event.target.closest("[data-focus-edit]");
  const del=event.target.closest("[data-focus-delete]");
  if(!edit&&!del)return;
  const item=assigned.find(a=>a.id===(edit||del).getAttribute(edit?"data-focus-edit":"data-focus-delete"));
  if(!item)return;
  const t=targets.find(t=>t.store_id===item.store_id&&t.model_code===item.model_code);
  if(!t)return;
  if(edit){
   parent.value=String(targets.indexOf(t));refreshPeople();
   person.value=item.manpower_id;qInput.value=item.target_qty;amtInput.value=item.target_amt;
   showCap();formEl.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  if(!window.confirm("Hapus alokasi "+(people.get(item.manpower_id)?.full_name||"EC")+
   " untuk "+(names.get(item.model_code)||item.model_code)+"?"))return;
  feedback.textContent="Menghapus alokasi...";
  try{await save(t,item.manpower_id,0,0);}
  catch(error){feedback.textContent="Gagal menghapus: "+error.message;}
 };
}
async function render(data){
 const {client,period,profile,isCurrent,mount}=data;
 const canManage=profile.role==="tl"||profile.role==="admin";
 let allocations=[],manpower=[],assignments=[],history=[],migrationPending=false;
 try{
  allocations=await readAll(client,"focus_model_ec_allocations",
   "id,period_id,store_id,model_code,manpower_id,target_qty,target_amt,updated_at",
   q=>q.eq("period_id",period.id));
 }catch(error){
  if(missingTable(error))migrationPending=true;
  else throw new Error("Gagal mengambil alokasi Focus Model: "+error.message);
 }
 if(canManage){
  if(!migrationPending)history=await readAll(client,"focus_model_allocation_history",
   "period_id,store_id,model_code,manpower_id,action,old_qty,new_qty,old_amt,new_amt,changed_at",
   q=>q.eq("period_id",period.id));
  manpower=await readAll(client,"manpower","id,full_name,site_id,fieldforce_position,promoter_id,is_active",
   q=>q.eq("fieldforce_position","EC").eq("is_active",true));
  assignments=await readAll(client,"store_assignments","manpower_id,store_id,valid_from,valid_to");
 }else if(profile.role==="ec"&&profile.manpower_id){
  manpower=await readAll(client,"manpower","id,full_name,site_id,fieldforce_position,promoter_id,is_active",
   q=>q.eq("id",profile.manpower_id));
 }
 if(!isCurrent())return;
 setupUi({...data,allocations,manpower,assignments,history,migrationPending});
}
window.FocusModelAllocationUI={render};
})();

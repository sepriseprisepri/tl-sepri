/* TL-only Focus Model allocator. Database RLS is the actual authority. */
(function(){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function render(ctx,mount){
 if(ctx.profile?.role!=="tl")return;
 const box=document.createElement("section");box.className="panel rounded-2xl p-4 sm:p-6 mt-5 space-y-3";
 mount.append(box);
 if(!ctx.allocated){
  box.innerHTML='<h4 class="font-semibold text-white">Alokasi Focus Model oleh TL</h4>'+
   '<p role="status" class="text-sm text-amber-200">Alokasi Focus Model per EC belum diaktifkan pada database. Form pengaturan ditahan sampai migrasi dan pengujian RLS disetujui.</p>';
  return;
 }
 const allStores=ctx.stores||[],allEC=(ctx.manpower||[]).filter(m=>m.is_active&&m.fieldforce_position==="EC"),
  models=(ctx.settings||[]).filter(m=>m.is_active);
 box.innerHTML='<h4 class="font-semibold text-white">Alokasi Focus Model kepada EC</h4>'+
  '<p class="text-sm text-slate-300">Tentukan target per EC / toko / model pada periode '+esc(ctx.period?.period_name)+'. Hanya toko dalam coverage TL yang dapat disimpan, dibatasi RLS.</p>'+
  '<form id="focus-allocate-form" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">'+
   '<label class="text-xs text-slate-300">Toko<select name="store_id" class="field block mt-2 rounded-xl p-3 w-full" required></select></label>'+
   '<label class="text-xs text-slate-300">EC penerima target<select name="manpower_id" class="field block mt-2 rounded-xl p-3 w-full" required></select></label>'+
   '<label class="text-xs text-slate-300">Focus Model<select name="model_code" class="field block mt-2 rounded-xl p-3 w-full" required></select></label>'+
   '<label class="text-xs text-slate-300">Target Qty<input name="target_qty" type="number" min="0" max="10000" step="0.01" class="field block mt-2 rounded-xl p-3 w-full" required></label>'+
   '<label class="text-xs text-slate-300">Target Amt (Rp)<input name="target_amt" type="number" min="0" max="100000000000" step="1" class="field block mt-2 rounded-xl p-3 w-full" required></label>'+
   '<button type="submit" class="self-end min-h-12 rounded-xl bg-cyan-400 text-slate-950 font-semibold p-3">Simpan alokasi</button></form>'+
  '<p id="focus-allocate-status" role="status" aria-live="polite" class="text-sm text-slate-300"></p>';
 const form=box.querySelector("#focus-allocate-form"),status=box.querySelector("#focus-allocate-status");
 const stores=form.elements.namedItem("store_id"),ecs=form.elements.namedItem("manpower_id"),modelSelect=form.elements.namedItem("model_code");
 allStores.forEach(st=>stores.add(new Option(st.site_name+" · "+st.site_id,st.id)));
 models.forEach(m=>modelSelect.add(new Option(m.display_name+" · "+m.model_code,m.model_code)));
 function populateEC(){
  ecs.replaceChildren(new Option("Pilih EC penempatan", ""));
  const store=allStores.find(s=>s.id===stores.value);
  for(const m of allEC.filter(m=>store&&m.site_id===store.site_id))ecs.add(new Option(m.full_name+" · "+m.employee_id,m.id));
  if(ecs.options.length===1)status.textContent="Belum ada EC terdaftar pada toko ini. Periksa master penempatan dengan Admin.";
  else status.textContent="";
 }
 stores.addEventListener("change",populateEC);populateEC();
 form.addEventListener("submit",async e=>{
  e.preventDefault();const button=form.querySelector('button[type="submit"]');
  const targetQty=Number(form.elements.namedItem("target_qty").value),
   targetAmt=Number(form.elements.namedItem("target_amt").value);
  if(!ecs.value||!models.some(m=>m.model_code===modelSelect.value)||!allStores.some(s=>s.id===stores.value)||
   !Number.isFinite(targetQty)||targetQty<0||!Number.isFinite(targetAmt)||targetAmt<0){
   status.textContent="Toko, EC, model, dan target wajib valid.";return;
  }
  button.disabled=true;status.textContent="Memverifikasi penugasan dan menyimpan target…";
  try{
   const record={period_id:ctx.period.id,store_id:stores.value,manpower_id:ecs.value,
    model_code:modelSelect.value,target_qty:targetQty,target_amt:targetAmt,assigned_by:ctx.profile.id};
   const {error}=await ctx.client.from("focus_model_ec_targets").upsert(record,{
    onConflict:"period_id,store_id,manpower_id,model_code"
   });
   if(error)throw error;
   status.textContent="Alokasi tersimpan. Memuat kembali target dan pencapaian…";
   await ctx.refresh();
  }catch(error){status.textContent="Alokasi gagal: "+(error.message||"Periksa izin TL dan penempatan EC.");}
  finally{button.disabled=false;}
 });
}
window.FocusAllocator={render};
})();

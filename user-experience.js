/* Samsung Kalteng personal UX: scoped saved filters & density preference.
   Saves settings in RLS-protected user tables. No cookies/secret storage. */
(function(){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const featureMap={
 "Coverage & Toko":"coverage","Coverage":"coverage","Target":"coverage","Target Saya":"coverage",
 "RAW Sellout":"sellout","Performa EC":"sellout","Laporan":"sellout","Laporan Saya":"sellout",
 "Store Shadow":"coverage","Focus Model":"coverage"
};
let client=null,profile=null,loadSerial=0;
function setStatus(el,message,error=false){if(el){el.textContent=message;el.className="intel-filter-msg"+(error?" error":"");}}
async function init({client:db,profile:person}){
 client=db;profile=person;const seq=++loadSerial;
 const button=document.getElementById("density-toggle");if(!button)return;
 button.classList.remove("hidden");button.disabled=false;button.textContent="Tabel: Nyaman";
 document.body.classList.remove("intel-compact");
 const {data,error}=await client.from("user_ui_preferences").select("table_density").eq("user_id",person.id).maybeSingle();
 if(seq!==loadSerial)return;
 if(!error&&data?.table_density==="compact")applyDensity("compact");
 else applyDensity("comfortable");
}
function applyDensity(density){
 const compact=density==="compact";document.body.classList.toggle("intel-compact",compact);
 const button=document.getElementById("density-toggle");
 if(button){button.textContent=compact?"Tabel: Ringkas":"Tabel: Nyaman";button.setAttribute("aria-pressed",String(compact));button.title="Ubah kerapatan tabel";}
}
async function toggleDensity(){
 if(!client||!profile)return;
 const next=document.body.classList.contains("intel-compact")?"comfortable":"compact";
 applyDensity(next);
 const {error}=await client.from("user_ui_preferences").upsert({
  user_id:profile.id,table_density:next,updated_at:new Date().toISOString()
 },{onConflict:"user_id"});
 if(error){applyDensity(next==="compact"?"comfortable":"compact");const button=document.getElementById("density-toggle");button.title="Gagal menyimpan preferensi: "+error.message;}
}
function reset(){
 loadSerial++;client=null;profile=null;document.body.classList.remove("intel-compact");
 const b=document.getElementById("density-toggle");if(b){b.classList.add("hidden");b.textContent="Tabel: Nyaman";}
}
async function savedFilterControls({client:db,profile:person,feature,mount,getState,applyState}){
 if(!db||!person?.id||!mount||!feature)return;
 mount.innerHTML='<div class="intel-saved-bar"><label class="intel-filter-select-label">Filter tersimpan'+
  '<select id="intel-saved-select" class="field" aria-label="Pilih filter tersimpan"><option value="">Pilih filter</option></select></label>'+
  '<label class="intel-filter-select-label">Nama filter'+
  '<input id="intel-saved-name" class="field" placeholder="Mis. Pantau A07" maxlength="60"></label>'+
  '<button type="button" id="intel-saved-save" class="intel-action">Simpan</button>'+
  '<button type="button" id="intel-saved-delete" class="intel-action intel-action-subtle">Hapus</button>'+
  '<span id="intel-saved-message" class="intel-filter-msg" role="status"></span></div>';
 const select=mount.querySelector("#intel-saved-select"),name=mount.querySelector("#intel-saved-name");
 const message=mount.querySelector("#intel-saved-message");
 const save=mount.querySelector("#intel-saved-save"),del=mount.querySelector("#intel-saved-delete");
 let saved=[];
 const refresh=async()=>{
  const {data,error}=await db.from("user_saved_filters").select("id,feature,filter_name,filter_state,updated_at")
   .eq("user_id",person.id).eq("feature",feature).order("updated_at",{ascending:false}).limit(50);
  if(error){setStatus(message,"Filter tidak dapat dimuat",true);return;}
  saved=data||[];
  select.innerHTML='<option value="">Pilih filter</option>'+
   saved.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.filter_name)+'</option>').join("");
 };
 select.addEventListener("change",()=>{
  const item=saved.find(x=>x.id===select.value);
  if(!item)return;name.value=item.filter_name;
  try{applyState(item.filter_state||{});setStatus(message,"Filter diterapkan.");}catch{setStatus(message,"Filter tidak kompatibel.",true);}
 });
 save.addEventListener("click",async()=>{
  const filterName=name.value.trim(),state=getState();
  if(filterName.length<2){setStatus(message,"Nama filter minimal 2 karakter.",true);return;}
  if(JSON.stringify(state).length>3000){setStatus(message,"Filter terlalu besar.",true);return;}
  save.disabled=true;
  const {error}=await db.from("user_saved_filters").upsert({
   user_id:person.id,feature,filter_name:filterName,filter_state:state,updated_at:new Date().toISOString()
  },{onConflict:"user_id,feature,filter_name"});
  save.disabled=false;
  if(error){setStatus(message,"Tidak dapat menyimpan: "+error.message,true);return;}
  await refresh();setStatus(message,"Filter tersimpan di akun ini.");
 });
 del.addEventListener("click",async()=>{
  if(!select.value){setStatus(message,"Pilih filter yang akan dihapus.",true);return;}
  del.disabled=true;
  const {error}=await db.from("user_saved_filters").delete().eq("id",select.value).eq("user_id",person.id);
  del.disabled=false;
  if(error){setStatus(message,"Gagal menghapus filter.",true);return;}
  name.value="";await refresh();setStatus(message,"Filter dihapus.");
 });
 await refresh();
}
function attachOpsSearch({client:db,profile:person,label,mount}){
 if(!featureMap[label]||!mount)return;
 const input=mount.querySelector("[data-search]");
 if(!input)return;
 const feature=featureMap[label];
 const bar=document.createElement("div");bar.className="intel-ops-saved";mount.insertBefore(bar,mount.firstChild);
 savedFilterControls({client:db,profile:person,feature,mount:bar,
   getState:()=>({search:input.value||""}),
   applyState:s=>{input.value=typeof s.search==="string"?s.search:"";input.dispatchEvent(new Event("input",{bubbles:true}));}
 });
 if(typeof api.pendingSearch==="string"&&api.pendingSearch){
  input.value=api.pendingSearch;api.pendingSearch="";
  input.dispatchEvent(new Event("input",{bubbles:true}));
 }
}
const api={init,toggleDensity,reset,savedFilterControls,attachOpsSearch,pendingSearch:""};
window.UserPrefs=api;
})();

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
async function savedFilterControls({client:db,profile:person,feature,mount,getState,applyState,scope=""}){
 if(!db||!person?.id||!mount||!feature)return;
 mount.innerHTML='<div class="intel-saved-bar"><label class="intel-filter-select-label">Filter tersimpan'+
  '<select id="intel-saved-select" class="field" aria-label="Pilih filter tersimpan"><option value="">Pilih filter</option></select></label>'+
  '<label class="intel-filter-select-label">Nama filter'+
  '<input id="intel-saved-name" class="field" placeholder="Mis. Pantau A07" maxlength="60"></label>'+
  '<button type="button" id="intel-saved-save" class="intel-action">Simpan</button>'+
  '<button type="button" id="intel-saved-delete" class="intel-action intel-action-subtle">Hapus</button>'+
  '<span id="intel-saved-message" class="intel-filter-msg" role="status" aria-live="polite"></span></div>';
 const select=mount.querySelector("#intel-saved-select"),name=mount.querySelector("#intel-saved-name");
 const message=mount.querySelector("#intel-saved-message");
 const save=mount.querySelector("#intel-saved-save"),del=mount.querySelector("#intel-saved-delete");
 const displayName=x=>scope&&x.filter_state?.__scope===scope&&x.filter_name.startsWith(scope+"::")
  ?x.filter_name.slice(scope.length+2):x.filter_name;
 let saved=[];
 const refresh=async(preferName="")=>{
  const {data,error}=await db.from("user_saved_filters").select("id,feature,filter_name,filter_state,updated_at")
   .eq("user_id",person.id).eq("feature",feature).order("updated_at",{ascending:false}).limit(50);
  if(!mount.isConnected)return;
  if(error){setStatus(message,"Filter tidak dapat dimuat: "+error.message,true);return;}
  // Existing unscoped filters remain readable. New ones are scoped per page.
  saved=(data||[]).filter(x=>!scope||!x.filter_state?.__scope||x.filter_state.__scope===scope);
  const previous=select.value;
  select.innerHTML='<option value="">Pilih filter</option>'+
    saved.map(x=>'<option value="'+esc(x.id)+'">'+esc(displayName(x))+'</option>').join("");
  const preferred=saved.find(x=>x.filter_name===preferName);
  if(preferred)select.value=preferred.id;
  else if(saved.some(x=>x.id===previous))select.value=previous;
 };
 select.addEventListener("change",()=>{
  const item=saved.find(x=>x.id===select.value);
  if(!item)return;
  name.value=displayName(item);
  try{applyState(item.filter_state||{});setStatus(message,"Filter diterapkan.");}
  catch{setStatus(message,"Filter tidak kompatibel.",true);}
 });
 save.addEventListener("click",async()=>{
  const filterName=name.value.trim();
  if(filterName.length<2){setStatus(message,"Nama filter minimal 2 karakter.",true);return;}
  const storedName=scope?scope+"::"+filterName:filterName;
  if(storedName.length>60){setStatus(message,"Nama filter terlalu panjang untuk halaman ini (maksimal "+(60-(scope?scope.length+2:0))+" karakter).",true);return;}
  let state;
  try{const value=getState();state={...(value&&typeof value==="object"&&!Array.isArray(value)?value:{}),...(scope?{__scope:scope}:{})};}
  catch{setStatus(message,"Gagal membaca filter saat ini.",true);return;}
  if(JSON.stringify(state).length>3000){setStatus(message,"Filter terlalu besar.",true);return;}
  save.disabled=true;
  try{
   const {error}=await db.from("user_saved_filters").upsert({
    user_id:person.id,feature,filter_name:storedName,filter_state:state,updated_at:new Date().toISOString()
   },{onConflict:"user_id,feature,filter_name"});
   if(error){setStatus(message,"Tidak dapat menyimpan: "+error.message,true);return;}
   await refresh(storedName);setStatus(message,"Filter tersimpan di akun ini.");
  }catch(error){setStatus(message,"Gagal menyimpan: "+(error.message||"Koneksi tidak tersedia."),true);}
  finally{save.disabled=false;}
 });
 del.addEventListener("click",async()=>{
  if(!select.value){setStatus(message,"Pilih filter yang akan dihapus.",true);return;}
  del.disabled=true;
  try{
   const {error}=await db.from("user_saved_filters").delete().eq("id",select.value).eq("user_id",person.id);
   if(error){setStatus(message,"Gagal menghapus filter: "+error.message,true);return;}
   select.value="";name.value="";await refresh();setStatus(message,"Filter dihapus.");
  }catch(error){setStatus(message,"Gagal menghapus: "+(error.message||"Koneksi tidak tersedia."),true);}
  finally{del.disabled=false;}
 });
 await refresh();
}
function attachOpsSearch({client:db,profile:person,label,mount}){
 if(!featureMap[label]||!mount)return;
 const inputs=[...mount.querySelectorAll("[data-search]")];
 if(!inputs.length)return;
 const feature=featureMap[label];
 const bar=document.createElement("div");bar.className="intel-ops-saved";mount.insertBefore(bar,mount.firstChild);
 const applyInputs=values=>{
  inputs.forEach((input,i)=>{input.value=typeof values[i]==="string"?values[i]:"";input.dispatchEvent(new Event("input",{bubbles:true}));});
 };
 savedFilterControls({client:db,profile:person,feature,scope:label,mount:bar,
  getState:()=>({search:inputs[0].value||"",searches:inputs.map(input=>input.value||"")}),
  applyState:s=>applyInputs(Array.isArray(s.searches)?s.searches:[typeof s.search==="string"?s.search:""])
 });
 const reset=document.createElement("button");reset.type="button";reset.className="intel-action intel-action-subtle";
 reset.textContent="Reset pencarian";reset.addEventListener("click",()=>applyInputs([]));
 bar.appendChild(reset);
 if(typeof api.pendingSearch==="string"&&api.pendingSearch){
  inputs[0].value=api.pendingSearch;api.pendingSearch="";
  inputs[0].dispatchEvent(new Event("input",{bubbles:true}));
 }
}

const api={init,toggleDensity,reset,savedFilterControls,attachOpsSearch,pendingSearch:""};
window.UserPrefs=api;
})();

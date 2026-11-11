"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const metrics=require("../market-metrics.js");
const code=fs.readFileSync("focus-model-allocations.js","utf8");
new vm.Script(code,{filename:"focus-model-allocations.js"});
const date="2026-11-10",period={id:"p-1",period_start:"2026-11-01",
 period_end:"2026-11-30",period_name:"November Dummy"};
const stores=[{id:"st-1",site_id:"S-01",site_name:"Dummy Shop"}];
const settings=[{model_code:"GALAXY A55",display_name:"Galaxy A55",is_active:true}];
const targets=[{period_id:"p-1",store_id:"st-1",model_code:"GALAXY A55",
 target_qty:10,target_amt:1000}];
const rows=[
 {id:"a-1",period_id:"p-1",store_id:"st-1",model_code:"GALAXY A55",
  manpower_id:"m-1",target_qty:6,target_amt:600},
 {id:"a-2",period_id:"p-1",store_id:"st-1",model_code:"GALAXY A55",
  manpower_id:"m-2",target_qty:3,target_amt:300}
];
const people=[
 {id:"m-1",full_name:"Dummy EC Satu",promoter_id:"P01",site_id:"S-01",
  fieldforce_position:"EC",is_active:true},
 {id:"m-2",full_name:"Dummy EC Dua",promoter_id:"P02",site_id:"S-01",
  fieldforce_position:"EC",is_active:true}
];
const assignments=[
 {manpower_id:"m-1",store_id:"st-1",valid_from:"2020-01-01",valid_to:null},
 {manpower_id:"m-2",store_id:"st-1",valid_from:"2020-01-01",valid_to:null}
];
const sales=[
 {site_id:"S-01",promoter_id:"P01",model:"Galaxy A55",eula_status:"VALID",
  sold_at:"2026-11-04",qty:2,amt:200},
 {site_id:"S-01",promoter_id:"P02",model:"Galaxy A55",eula_status:"VALID",
  sold_at:"2026-11-04",qty:1,amt:100},
 {site_id:"S-01",promoter_id:"P02",model:"Galaxy A55",eula_status:"PENDING",
  sold_at:"2026-11-04",qty:5,amt:500}
];
function element(id){
 const o={id,value:"",textContent:"",innerHTML:"",disabled:false,
  events:{},addEventListener(name,fn){this.events[name]=fn;},
  scrollIntoView(){},getAttribute(n){return this[n];}};
 if(id==="focus-qty"||id==="focus-amt")o.value="0";
 if(id==="focus-parent"||id==="focus-person"||id.startsWith("focus-filter"))o.value="";
 if(id==="focus-ec-form"||id==="focus-admin-parent-form")o.querySelector=()=>({disabled:false,isConnected:true});
 return o;
}
function mountMock(){
 const nodes=new Map(),mount={html:"",onclick:null,events:{},parentBox:null,
  prepend(box){this.parentBox=box;},
  set innerHTML(text){this.html=text;nodes.clear();
   for(const [,id] of text.matchAll(/id="([^"]+)"/g))nodes.set(id,element(id));},
  get innerHTML(){return this.html;},
  querySelector(selector){return nodes.get(selector.replace("#",""))||null;},
  addEventListener(n,cb){this.events[n]=cb;},
  nodes
 };
 return mount;
}
function fakeClient(role,missing=false){
 const calls=[];
 const client={calls,from(name){
  let filters=[];
  return {select(){return this;},
   upsert(payload,opts){calls.push({name:"upsert",table:name,payload,opts});return Promise.resolve({error:null});},
   eq(col,value){filters.push([col,value]);return this;},
   async range(){
    if(name==="focus_model_ec_allocations"&&missing)
     return {data:null,error:{code:"PGRST205",message:"Could not find the table"}};
    const all={focus_model_ec_allocations:role==="ec"?rows.filter(x=>x.manpower_id==="m-1"):rows,
     manpower:role==="ec"?people.filter(x=>x.id==="m-1"):people,store_assignments:assignments};
    return {data:(all[name]||[]).filter(x=>filters.every(([col,value])=>x[col]===value)),error:null};
   }};
 },async rpc(name,args){calls.push({name,args});return {data:{ok:true},error:null};}};
 return client;
}
async function run(){
 const context={window:{SamsungMarketMetrics:metrics,confirm:()=>true},console,Intl,
  Number,Date,Map,Set,Math,document:{createElement(){
   const nodes=new Map(),box={setAttribute(){},className:"",
    set innerHTML(html){this.markup=html;nodes.clear();
     for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,element(id));},
    get innerHTML(){return this.markup;},
    querySelector(sel){return nodes.get(sel.replace("#",""))||null;},
    nodes};
   return box;
  }}};
 vm.runInNewContext(code,context);
 const focus=context.window.FocusModelAllocationUI;
 const tlMount=mountMock(),tlClient=fakeClient("tl");
 const args={mount:tlMount,client:tlClient,period,stores,settings,targets,sales,
  profile:{id:"22222222-2222-2222-2222-222222222222",role:"tl",manpower_id:null},isCurrent:()=>true};
 await focus.render(args);
 assert.ok(tlMount.parentBox,"TL can set the store target");
 assert.match(tlMount.parentBox.innerHTML,/TL · Target Focus Model per Toko/);
 assert.match(tlMount.innerHTML,/Atur alokasi Focus Model per EC/);
 assert.match(tlMount.innerHTML,/Total Qty dialokasikan/);
 assert.match(tlMount.nodes.get("focus-table-body").innerHTML,/Dummy EC Satu/);
 assert.match(tlMount.nodes.get("focus-table-body").innerHTML,/Dummy EC Dua/);
 assert.match(tlMount.nodes.get("focus-table-body").innerHTML,/33\.3%/,
  "TL should show per-EC actual Qty and achievements");
 const parent=tlMount.nodes.get("focus-parent");
 parent.value="0";parent.events.change();
 const chosen=tlMount.nodes.get("focus-person");chosen.value="m-1";
 chosen.events.change();
 tlMount.nodes.get("focus-qty").value="5";
 tlMount.nodes.get("focus-amt").value="500";
 await tlMount.nodes.get("focus-ec-form").events.submit({preventDefault(){}});
 assert.equal(tlClient.calls.length,1,"TL must save only via authenticated RPC");
 assert.equal(tlClient.calls[0].name,"set_focus_model_ec_allocation");
 assert.equal(tlClient.calls[0].args.p_manpower_id,"m-1");
 assert.equal(tlClient.calls[0].args.p_target_qty,5);
 const tlBox=tlMount.parentBox;
 tlBox.querySelector("#focus-admin-store").value="st-1";
 tlBox.querySelector("#focus-admin-model").value="GALAXY A55";
 tlBox.querySelector("#focus-admin-qty").value="12";
 tlBox.querySelector("#focus-admin-amt").value="1200";
 await tlBox.querySelector("#focus-admin-parent-form").events.submit({preventDefault(){}});
 assert.equal(tlClient.calls[1].table,"focus_model_targets");
 assert.equal(tlClient.calls[1].payload.updated_by,args.profile.id);
 const ecMount=mountMock();
 await focus.render({...args,mount:ecMount,client:fakeClient("ec"),
  targets:[], // EC is intentionally denied parent store targets by RLS
  profile:{role:"ec",manpower_id:"m-1"}});
 assert.doesNotMatch(ecMount.innerHTML,/id="focus-ec-form"/);
 assert.match(ecMount.innerHTML,/Target Focus Model Saya/);
 assert.match(ecMount.nodes.get("focus-table-body").innerHTML,/33\.3%/,
  "EC sees own sale actual / assigned target");
 assert.doesNotMatch(ecMount.nodes.get("focus-table-body").innerHTML,/Dummy EC Dua/);
 const tsoMount=mountMock();
 await focus.render({...args,mount:tsoMount,client:fakeClient("tso"),
  profile:{role:"tso",manpower_id:null}});
 assert.doesNotMatch(tsoMount.innerHTML,/id="focus-ec-form"/,
  "TSO must not receive TL editor");
 assert.equal(tsoMount.parentBox,null,"TSO cannot create store targets");
 assert.match(tsoMount.nodes.get("focus-table-body").innerHTML,/Dummy EC Satu/);
 assert.match(tsoMount.nodes.get("focus-table-body").innerHTML,/33\.3%/,
  "TSO should see scoped EC real achievement, not zero from unloaded manpower");
 const adminMount=mountMock(),adminClient=fakeClient("admin");
 await focus.render({...args,mount:adminMount,client:adminClient,
  profile:{id:"11111111-1111-1111-1111-111111111111",role:"admin"}});
 assert.ok(adminMount.parentBox,"Admin must receive a store/model target budget editor");
 const parentBox=adminMount.parentBox;
 assert.match(parentBox.innerHTML,/Simpan Target Induk/);
 parentBox.querySelector("#focus-admin-store").value="st-1";
 parentBox.querySelector("#focus-admin-model").value="GALAXY A55";
 parentBox.querySelector("#focus-admin-store").events.change();
 parentBox.querySelector("#focus-admin-qty").value="11";
 parentBox.querySelector("#focus-admin-amt").value="1100";
 await parentBox.querySelector("#focus-admin-parent-form").events.submit({preventDefault(){}});
 const upsertCall=adminClient.calls.find(x=>x.name==="upsert");
 assert.ok(upsertCall,"Admin parent budget must be saved through RLS-scoped Data API");
 assert.equal(upsertCall.table,"focus_model_targets");
 assert.equal(upsertCall.payload.target_qty,11);
 assert.equal(upsertCall.payload.target_amt,1100);
 assert.equal(upsertCall.payload.updated_by,"11111111-1111-1111-1111-111111111111");
 const pending=mountMock();
 await focus.render({...args,mount:pending,client:fakeClient("tl",true)});
 assert.match(pending.innerHTML,/Migrasi alokasi EC belum tersedia/);
 assert.doesNotMatch(pending.innerHTML,/id="focus-ec-form"/);
 const aliases=mountMock();
 await focus.render({...args,mount:aliases,client:fakeClient("tl"),
  settings:[...settings,{model_code:"OTHER-MODEL",display_name:"Galaxy A55",is_active:true}]});
 assert.match(aliases.nodes.get("focus-table-body").innerHTML,
  /<td class="text-right">6<\/td><td class="text-right">0<\/td>/,
  "Ambiguous model display names must not double count sellout");
 console.log("PASS Focus UI: Admin target store editor, TL RPC, EC-only view, TSO read-only, aliases and schema fallback");
}
run().catch(e=>{console.error(e);process.exitCode=1;});

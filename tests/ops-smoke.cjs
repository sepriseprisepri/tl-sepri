/* Node 20+ smoke tests; no credentials and no network requests. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

class Element {
  constructor(){
    this.html="";this.children=[];this.nodes=new Map();this.listeners={};
    this.isConnected=true;this.value="";this.textContent="";
  }
  set innerHTML(value){this.html=value;this.children=[];this.nodes.clear();}
  get innerHTML(){return this.html;}
  append(child){this.children.push(child);}
  insertAdjacentHTML(_position,markup){this.html+=markup;}
  querySelector(selector){
    if(!this.nodes.has(selector))this.nodes.set(selector,new Element());
    return this.nodes.get(selector);
  }
  addEventListener(name,callback){this.listeners[name]=callback;}
}
const document={createElement:()=>new Element()};
const window={};
const errors=[];
vm.runInNewContext(fs.readFileSync("ops-modules.js","utf8"),{
  window,document,console:{error:(...args)=>errors.push(args.join(" "))}
},{filename:"ops-modules.js"});
assert.equal(typeof window.SamsungOps.render,"function");


// SQL draft must enforce allocation ceilings at the database layer, not only in JS.
// This is a static contract check; concurrency still requires real staging transactions.
const allocationSql=fs.readFileSync("docs/sql/20261110-focus-model-ec-allocations-draft.sql","utf8");
for(const required of [
  "CREATE TRIGGER focus_ec_allocation_ceiling",
  "BEFORE INSERT OR UPDATE ON public.focus_model_ec_targets",
  "FOR UPDATE;",
  "allocated_qty + NEW.target_qty > ceiling_qty",
  "allocated_amt + NEW.target_amt > ceiling_amt",
  "CREATE TRIGGER focus_store_target_ceiling",
  "BEFORE UPDATE OF target_qty, target_amt ON public.focus_model_targets",
  "NEW.target_qty < used_qty OR NEW.target_amt < used_amt",
  "REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated",
  "REVOKE ALL ON FUNCTION app_private.enforce_focus_ec_allocation()"
])assert.ok(allocationSql.includes(required),"Missing database invariant: "+required);
assert.ok(!allocationSql.includes("a.id<>OLD.id"),"INSERT trigger must not dereference OLD");

const html=fs.readFileSync("index.html","utf8");
for(const match of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)){
 if(match[1].trim())new vm.Script(match[1],{filename:"index.inline.js"});
}
assert.ok(html.includes('<script src="/ops-modules.js"></script>'));
assert.ok(html.includes("window.SamsungOps.render"));
assert.ok(html.includes('alias==="AC-2406310901"?"TL_BMU_KAL_02"'));

const period={id:"p",period_name:"November 2026",period_start:"2026-11-01",period_end:"2026-11-30"};
const data={
 stores:[
  {id:"s1",site_id:"C001",site_name:'Store <img src=x onerror=alert(1)>',channel_category:"NSP"},
  {id:"s2",site_id:"C002",site_name:"Toko Rahasia",channel_category:"STAR"}
 ],
 store_targets:[
  {period_id:"p",store_id:"s1",target_qty:10,target_amt:10000000},
  {period_id:"p",store_id:"s2",target_qty:50,target_amt:75000000}
 ],
 raw_sellout:[
  {site_id:"C001",transaction_id:"IMEI1",promoter_id:"P1",model:"Galaxy-A07",qty:1,amt:2500000,sold_at:"2026-11-05",eula_status:"VALID"},
  {site_id:"C001",transaction_id:"IMEI-P",promoter_id:"P1",model:"Galaxy-A07",qty:1,amt:2500000,sold_at:"2026-11-05",eula_status:"PENDING"},
  {site_id:"C002",transaction_id:"IMEI2",promoter_id:"P2",model:"Galaxy-A08",qty:1,amt:3500000,sold_at:"2026-11-05",eula_status:"VALID"}
 ],
 manpower:[
  {id:"m1",employee_id:"EC-1",full_name:"EC One",site_id:"C001",promoter_id:"P1",is_active:true,fieldforce_position:"EC"},
  {id:"m2",employee_id:"EC-2",full_name:"EC Two",site_id:"C002",promoter_id:"P2",is_active:true,fieldforce_position:"EC"}
 ],
 ec_target_allocations:[
  {period_id:"p",manpower_id:"m1",store_id:"s1",target_qty:10,target_amt:10000000},
  {period_id:"p",manpower_id:"m2",store_id:"s2",target_qty:50,target_amt:75000000}
 ],
 store_shadow_history:[
  {store_id:"s1",shadow_month:"2026-11-01",is_shadow:true},
  {store_id:"s2",shadow_month:"2026-11-01",is_shadow:true}
 ],
 focus_model_settings:[{model_code:"A07",display_name:"Galaxy A07",is_active:true}],
 focus_model_ec_targets:[
  {period_id:"p",store_id:"s1",manpower_id:"m1",model_code:"A07",target_qty:123,target_amt:25000000},
  {period_id:"p",store_id:"s1",manpower_id:"m2",model_code:"A07",target_qty:456,target_amt:90000000}
 ],
 focus_model_targets:[
  {period_id:"p",store_id:"s1",model_code:"A07",target_qty:2,target_amt:4500000},
  {period_id:"p",store_id:"s2",model_code:"A07",target_qty:10,target_amt:30000000}
 ]
};

function makeClient(role){
 const scope=row=>{
  if(role==="admin")return true;
  if(row.site_id!==undefined)return row.site_id==="C001";
  if(row.store_id!==undefined)return row.store_id==="s1";
  return true;
 };
 const profile=role==="ec"?{role,manpower_id:"m1",employee_id:"EC-1"}:
   {role,manpower_id:"TL-1",employee_id:"TL-1"};
 return {
  profile,
  from(table){
   return {
    filters:[],
    select(){return this;},
    eq(k,v){this.filters.push(row=>row[k]===v);return this;},
    gte(k,v){this.filters.push(row=>row[k]>=v);return this;},
    lte(k,v){this.filters.push(row=>row[k]<=v);return this;},
    order(){return this;},
    range(from,to){
     let rows=(data[table]||[]).filter(scope);
     if(role==="ec"&&table==="store_shadow_history")rows=[];
     if(role==="ec"&&table==="raw_sellout")rows=rows.filter(row=>row.promoter_id==="P1");
     rows=rows.filter(row=>this.filters.every(fn=>fn(row)));
     return Promise.resolve({data:rows.slice(from,to+1),error:null});
    }
   };
  }
 };
}
async function view(role,label){
 const client=makeClient(role),mount=new Element();
 const result=await window.SamsungOps.render({client,profile:client.profile,mount,period,label});
 assert.equal(result,true,label);
 const rendered=[mount.innerHTML,...mount.children.map(c=>c.innerHTML+"\n"+c.querySelector("[data-body]").innerHTML)].join("\n");
 assert.ok(!rendered.includes("Modul gagal"),label);
 assert.ok(mount.children.length>0,label);
 if(role!=="admin")assert.ok(!rendered.includes("Toko Rahasia"),label+" leaked off-scope store");
 return rendered;
}
(async()=>{
 for(const [role,label] of [
  ["tl","Coverage & Toko"],["tl","RAW Sellout"],["tl","Store Shadow"],
  ["tl","Performa EC"],["tl","Focus Model"],["tl","Laporan"],
  ["ec","Target Saya"],["ec","Focus Model"],["ec","Laporan Saya"],
  ["admin","Target"],["admin","Coverage"]
 ])await view(role,label);

 const ownFocus=await view("ec","Focus Model");
 assert.ok(ownFocus.includes("123"),"EC must see individually assigned Focus Model target");
 assert.ok(!ownFocus.includes("456"),"EC must never see another EC focus allocation");
 const tlFocus=await view("tl","Focus Model");
 assert.ok(tlFocus.includes("579"),"TL must see aggregated EC model allocation targets");
 assert.ok(tlFocus.includes("VALID Qty"),"TL focus should show actual achievement");
 assert.ok(tlFocus.includes("Bagikan Focus Model kepada EC"),
  "TL must see Focus Model allocation form after staging allocations exist");
 assert.ok(!ownFocus.includes("Bagikan Focus Model kepada EC"),
  "EC must not see allocation controls");
 const ownTarget=await view("ec","Target Saya");
 for(const label of ["Gap Qty","Gap Amt","Target Daily Qty","Target Daily Amt","AR Amt"]){
  assert.ok(ownTarget.includes(label),"Missing EC KPI "+label);
 }
 const raw=await view("tl","RAW Sellout");
 assert.ok(raw.includes("IMEI-P"),"pending entries must remain visible");
 assert.ok(raw.includes("EULA VALID"),"valid KPI missing");
 const shadow=await view("admin","Store Shadow");
 assert.ok(shadow.includes("75.000"),"shadow incentive example should total Rp75.000");
 const injection=await view("tl","Coverage & Toko");
 assert.ok(injection.includes("&lt;img"),"store names must be escaped");
 assert.ok(!injection.includes("<img"),"XSS HTML must not render");
 assert.deepEqual(errors,[]);
 console.log("Operational smoke tests passed: 10 views + 4 assertions + JS parsing");
})().catch(error=>{console.error(error);process.exitCode=1;});
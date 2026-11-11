'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('focus-model-allocations.js','utf8');
const context={window:{},Intl,Date,Number,String,Map,Set,Math,console,document:{createElement(){return {setAttribute(){},set innerHTML(s){this.html=s},querySelector(){return {innerHTML:'',value:'',addEventListener(){}}}}}}};
vm.runInNewContext(code,context);
function makeMount(){return {html:'',set innerHTML(v){this.html=v},get innerHTML(){return this.html},prepend(x){this.box=x}}}
const rows=[{store_id:'s1',model_code:'A08',target_qty:8,target_amt:800,actual_qty:3,actual_amt:300}];
const stores=[{id:'s1',site_name:'Toko Uji',site_id:'S1'}],settings=[{model_code:'A08',display_name:'Galaxy A08',is_active:true}];
async function run(){
 for(const role of ['ec','tso']){
  const mount=makeMount(),calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:rows,error:null}}};
  await context.window.FocusModelAllocationUI.render({client,profile:{role},period:{id:'p1'},mount,stores,settings,isCurrent:()=>true});
  assert.equal(calls[0].name,'focus_model_store_summary');assert.match(mount.html,/Focus Model Toko/);assert.match(mount.html,/Toko Uji/);assert.match(mount.html,/37\.5%/);assert.doesNotMatch(mount.html,/alokasi EC|Simpan alokasi/);assert.equal(mount.box,undefined);
 }
 const mount=makeMount();await assert.rejects(context.window.FocusModelAllocationUI.render({client:{rpc:async()=>({error:{message:'denied'}})},profile:{role:'ec'},period:{id:'p1'},mount,stores,settings,isCurrent:()=>true}),/denied/);
 console.log('PASS Focus Model shared store summary and fail-closed behavior');
}
run().catch(e=>{console.error(e);process.exitCode=1});

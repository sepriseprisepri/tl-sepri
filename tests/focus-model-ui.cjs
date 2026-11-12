'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('focus-model-allocations.js','utf8');
const context={window:{confirm:()=>true},Intl,Date,Number,String,Map,Set,Math,console,document:{createElement(){const nodes=new Map();return {nodes,setAttribute(){},set innerHTML(s){this.html=s},querySelector(s){if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',events:{},addEventListener(n,f){this.events[n]=f},querySelector(){return {disabled:false,isConnected:true}}});return nodes.get(s)}}}}};
vm.runInNewContext(code,context);
function makeMount(){const nodes=new Map();return {html:'',nodes,set innerHTML(v){this.html=v},get innerHTML(){return this.html},prepend(x){this.box=x},querySelector(s){if(!nodes.has(s))nodes.set(s,{value:'',innerHTML:'',events:{},addEventListener(n,f){this.events[n]=f}});return nodes.get(s)}}}
const rows=[{store_id:'s1',model_code:'A08',target_qty:8,target_amt:800,actual_qty:3,actual_amt:300}];
const stores=[{id:'s1',site_name:'Toko Uji',site_id:'S1'}],settings=[{model_code:'A08',display_name:'Galaxy A08',is_active:true}];
function query(result){return {order(){return this},range:async()=>result}}
async function run(){
 for(const role of ['ec','tso']){
  const mount=makeMount(),calls=[];const client={rpc:(name,args)=>{calls.push({name,args});return query({data:rows,error:null})}};
  await context.window.FocusModelAllocationUI.render({client,profile:{role},period:{id:'p1'},mount,stores,settings,isCurrent:()=>true});
  assert.equal(calls[0].name,'focus_model_store_summary');assert.match(mount.html,/Focus Model Toko/);assert.match(mount.nodes.get('#focus-store-rows').innerHTML,/Toko Uji/);assert.match(mount.nodes.get('#focus-store-rows').innerHTML,/37\.5%/);assert.doesNotMatch(mount.html,/alokasi EC|Simpan alokasi/);assert.equal(mount.box,undefined);
  const filter=mount.nodes.get('#focus-store-filter');filter.value='another';filter.events.change();assert.match(mount.nodes.get('#focus-store-rows').innerHTML,/Tidak ada target/);filter.value='s1';filter.events.change();assert.match(mount.nodes.get('#focus-store-rows').innerHTML,/Toko Uji/);
 }
 const manager=makeMount(),calls=[];
 const client={rpc:()=>query({data:rows,error:null}),from(name){return {upsert(payload){calls.push({name,payload});return Promise.resolve({error:null})},select(){return this},eq(){return this},range:async()=>({data:rows,error:null})}}};
 await context.window.FocusModelAllocationUI.render({client,profile:{role:'tl',id:'tl1'},period:{id:'p1',status:'active'},mount:manager,stores,settings,isCurrent:()=>true});
 assert.match(manager.box.html,/TL · Target Focus Model per Toko/);
 manager.box.querySelector('#focus-admin-store').value='s1';manager.box.querySelector('#focus-admin-model').value='A08';manager.box.querySelector('#focus-admin-qty').value='8';manager.box.querySelector('#focus-admin-amt').value='800';
 await manager.box.querySelector('#focus-admin-parent-form').events.submit({preventDefault(){}});
 assert.equal(calls[0].name,'focus_model_targets');assert.equal(calls[0].payload.target_qty,8);assert.equal(calls[0].payload.updated_by,'tl1');
 const mount=makeMount();await assert.rejects(context.window.FocusModelAllocationUI.render({client:{rpc:()=>query({error:{message:'denied'}})},profile:{role:'ec'},period:{id:'p1'},mount,stores,settings,isCurrent:()=>true}),/denied/);
 console.log('PASS Focus Model shared store summary and fail-closed behavior');
}
run().catch(e=>{console.error(e);process.exitCode=1});

/* Browser-independent regression checks for Samsung Kalteng filters.
 * Run: node --test tests/filter-regression.test.cjs
 * No external packages or production credentials required.
 */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tl=require('../tl-competitor-comparison.js');

global.window={SalesIntelligence:{dateLocal:()=> '2026-11-23'}};
require('../promo-center.js');
require('../user-experience.js');

test('ISO week choices respect requested period and partial weeks',()=>{
 const weeks=tl.weeks({period_start:'2026-11-01',period_end:'2026-11-30'},'2026-11-23');
 assert.equal(weeks.length,5);
 assert.deepEqual(weeks.map(w=>w.start),['2026-11-01','2026-11-02','2026-11-09','2026-11-16','2026-11-23']);
 assert.equal(weeks[0].partial,true);
 assert.equal(weeks[1].partial,false);
 assert.equal(weeks.at(-1).end,'2026-11-23');
 assert.equal(weeks.at(-1).partial,true);
});

test('weekly comparison counts only scoped stores and VALID Samsung transactions',()=>{
 const weeks=tl.weeks({period_start:'2026-11-01',period_end:'2026-11-30'},'2026-11-23');
 const data=tl.compare({
  weeks,first:weeks[1].key,second:weeks[2].key,
  stores:[{id:'storeA',site_id:'A'}],
  sales:[
   {site_id:'A',sold_at:'2026-11-03',qty:2,eula_status:'VALID'},
   {site_id:'A',sold_at:'2026-11-04',qty:8,eula_status:'PENDING'},
   {site_id:'A',sold_at:'2026-11-11',qty:4,eula_status:'VALID'},
   {site_id:'B',sold_at:'2026-11-11',qty:100,eula_status:'VALID'}
  ],competitor:[
   {store_id:'storeA',sold_at:'2026-11-04',qty:3},
   {store_id:'storeA',sold_at:'2026-11-12',qty:1},
   {store_id:'storeB',sold_at:'2026-11-12',qty:100}
  ]
 });
 assert.deepEqual(data.map(x=>[x.samsung,x.competitor]),[[2,3],[4,1]]);
 assert.equal(tl.growth(0,10),null);
 assert.match(tl.insight(data),/Samsung/);
});

test('promo channel filter excludes ambiguous channel unless explicitly selected',()=>{
 const promo=global.window.PromoCenter;
 assert.equal(promo.matchesChannel('unspecified','unspecified'),true);
 assert.equal(promo.matchesChannel('unspecified','organized'),false);
 assert.equal(promo.matchesChannel('all','unspecified'),false);
 assert.equal(promo.matchesChannel('all','traditional'),true);
 assert.equal(promo.matchesChannel('traditional','offline'),true);
 assert.equal(promo.matchesChannel('organized','traditional'),false);
});

test('promo status is date-aware and never reports expired as active',()=>{
 const promo=global.window.PromoCenter;
 const row={published:true,verification_state:'verified',start_date:'2026-11-01',end_date:'2026-11-17'};
 assert.equal(promo.state(row),'expired');
 assert.equal(promo.state({...row,start_date:'2026-11-18',end_date:'2026-11-30'}),'active');
 assert.equal(promo.state({...row,published:false}),'draft');
});

class MockElement{
 constructor(){this.innerHTML='';this.value='';this.textContent='';this.className='';this.isConnected=true;this.disabled=false;this.listeners={};this.nodes={};}
 querySelector(selector){return this.nodes[selector]??(this.nodes[selector]=new MockElement());}
 addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
 async emit(type){for(const cb of this.listeners[type]||[])await cb();}
}
function memoryDB(){
 const rows=[];
 return {rows,from(){
  return {select(){return this;},eq(){return this;},order(){return this;},
   async limit(){return {data:rows.map(x=>({...x})),error:null};},
   async upsert(record){
    const n=rows.findIndex(x=>x.user_id===record.user_id&&x.feature===record.feature&&x.filter_name===record.filter_name);
    if(n<0)rows.push({id:String(rows.length+1),...record});else rows[n]={...rows[n],...record};
    return {error:null};
   },
   delete(){return this;}
  };
 }};
}
test('saved filters with same visible name remain isolated across pages',async()=>{
 const db=memoryDB(),person={id:'test-user'},ux=global.window.UserPrefs;
 const a=new MockElement(),b=new MockElement();
 await ux.savedFilterControls({client:db,profile:person,feature:'coverage',scope:'Target Saya',mount:a,
  getState:()=>({search:'Galaxy'}),applyState:()=>{}});
 a.querySelector('#intel-saved-name').value='Harian';
 await a.querySelector('#intel-saved-save').emit('click');
 await ux.savedFilterControls({client:db,profile:person,feature:'coverage',scope:'Coverage & Toko',mount:b,
  getState:()=>({search:'Store'}),applyState:()=>{}});
 b.querySelector('#intel-saved-name').value='Harian';
 await b.querySelector('#intel-saved-save').emit('click');
 assert.equal(db.rows.length,2);
 assert.deepEqual(db.rows.map(x=>x.filter_name),['Target Saya::Harian','Coverage & Toko::Harian']);
 assert.deepEqual(db.rows.map(x=>x.filter_state.__scope),['Target Saya','Coverage & Toko']);
 assert.match(a.querySelector('#intel-saved-select').innerHTML,/Harian/);
 assert.doesNotMatch(a.querySelector('#intel-saved-select').innerHTML,/Coverage & Toko/);
 assert.doesNotMatch(b.querySelector('#intel-saved-select').innerHTML,/Target Saya/);
});

test('date and preset controls are wired in relevant modules',()=>{
 const file=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
 assert.match(file('sales-intelligence.js'),/intel-chart-reset/);
 assert.match(file('sales-intelligence.js'),/intel-alert-reset/);
 assert.match(file('promo-center.js'),/promo-reset/);
 assert.match(file('promo-center.js'),/offer_items\.map/);
 assert.match(file('survey-affordability.js'),/downloadDashboard\(summary,loadedRange\)/);
 assert.match(file('focus-model-allocations.js'),/focus-store-reset/);
 assert.match(file('index.html'),/pendingWorkspaceRefresh/);
});

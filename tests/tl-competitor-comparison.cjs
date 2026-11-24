const assert=require('node:assert/strict');
const m=require('../tl-competitor-comparison.js');
const period={period_start:'2026-10-01',period_end:'2026-11-30'};
const weeks=m.weeks(period,'2026-11-08');
assert.equal(weeks.find(w=>w.key==='2026-W44').start,'2026-10-26');
assert.equal(weeks.find(w=>w.key==='2026-W45').end,'2026-11-08');
assert.equal(weeks[0].partial,true);
const stores=[{id:'one',site_id:'A'}];
const sales=[{site_id:'A',sold_at:'2026-10-27',qty:5,eula_status:'VALID'},{site_id:'A',sold_at:'2026-11-03',qty:8,eula_status:'VALID'},{site_id:'A',sold_at:'2026-11-03',qty:100,eula_status:'PENDING'},{site_id:'B',sold_at:'2026-11-03',qty:200,eula_status:'VALID'}];
const competitor=[{store_id:'one',sold_at:'2026-10-27',qty:3},{store_id:'one',sold_at:'2026-11-03',qty:6},{store_id:'two',sold_at:'2026-11-03',qty:200}];
const result=m.compare({weeks,first:'2026-W44',second:'2026-W45',stores,sales,competitor});
assert.deepEqual(result.map(x=>[x.samsung,x.competitor]),[[5,3],[8,6]]);
assert.equal(m.growth(0,4),null);
assert.match(m.insight(result),/5.*8/);
assert.notEqual(m.insight(result),m.insight([result[1],result[0]]));
console.log('TL competitor comparison: coverage, ISO weeks, partial dates and filter analysis passed');
const partial=[{key:'2026-W44',start:'2026-11-01',end:'2026-11-01',partial:true,samsung:8,competitor:1},{key:'2026-W45',start:'2026-11-02',end:'2026-11-08',partial:false,samsung:73,competitor:2}];
assert.doesNotMatch(m.insight(partial),/812,5%|100%/);
assert.match(m.insight(partial),/jumlah hari berbeda/i);
assert.match(m.insight(result),/60%/);


const amountRows=m.compare({
 weeks,first:'2026-W44',second:'2026-W45',stores,
 sales:[
  {site_id:'A',sold_at:'2026-10-27',qty:2,amt:4500000,eula_status:'VALID'},
  {site_id:'A',sold_at:'2026-11-03',qty:3,amt:9000000,eula_status:'VALID'},
  {site_id:'A',sold_at:'2026-11-03',qty:99,amt:99000000,eula_status:'PENDING'},
  {site_id:'B',sold_at:'2026-11-03',qty:99,amt:99000000,eula_status:'VALID'}
 ],
 competitor:[
  {store_id:'one',sold_at:'2026-10-27',qty:2,unit_price:2000000,amount:null},
  {store_id:'one',sold_at:'2026-11-03',qty:1,unit_price:1500000,amount:1500000},
  {store_id:'two',sold_at:'2026-11-03',qty:1,unit_price:15000000,amount:15000000}
 ],metric:'amt'
});
assert.deepEqual(amountRows.map(x=>[x.samsung,x.competitor]),[[4500000,4000000],[9000000,1500000]],
 'Amt uses VALID Samsung and scoped competitor transaction totals, with price fallback');
assert.match(m.insight(amountRows,'amt'),/Rp 4.500.000/);
const qtyChart=m.chartConfig(result,'qty');
const amtChart=m.chartConfig(amountRows,'amt');
assert.equal(qtyChart.type,'bar');
assert.deepEqual(qtyChart.data.datasets.map(x=>x.data),[[5,8],[3,6]]);
assert.deepEqual(amtChart.data.datasets.map(x=>x.data),[[4500000,9000000],[4000000,1500000]]);
assert.match(amtChart.options.plugins.tooltip.callbacks.label({dataset:{label:'Samsung'},parsed:{y:9000000}}),/Rp 9.000.000/);
console.log('TL competitor chart: Qty/Amt amounts, EULA, scope, fallback and tooltip verified');


const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
test('Samsung vs Competitor chart reacts to Qty, Amt, store, invalid weeks and reset',async()=>{
 const configs=[],destroyed=[];
 class MockChart{
  constructor(canvas,config){this.config=config;configs.push(config);}
  destroy(){destroyed.push(true);}
 }
 const realm={window:{Chart:MockChart},module:{exports:{}},console,Intl,Date};
 vm.runInNewContext(fs.readFileSync(require.resolve('../tl-competitor-comparison.js'),'utf8'),realm);
 const view=realm.module.exports;
 const nodes=new Map();
 const mount={
  _html:'',textContent:'',
  set innerHTML(html){
   this._html=html;nodes.clear();
   for(const match of html.matchAll(/id="([^"]+)"/g)){
    const id=match[1];
    nodes.set(id,{value:'',textContent:'',innerHTML:'',events:{},
     addEventListener(name,callback){this.events[name]=callback;}});
   }
  },
  get innerHTML(){return this._html;},
  querySelector(selector){return nodes.get(selector.slice(1));}
 };
 await view.render({
  profile:{role:'tl'},period:{period_name:'Nov',period_start:'2026-11-01',period_end:'2026-11-23'},
  stores:[{id:'A',site_id:'site-A',site_name:'Store A'},{id:'B',site_id:'site-B',site_name:'Store B'}],
  sales:[
   {site_id:'site-A',sold_at:'2026-11-17',qty:3,amt:6000000,eula_status:'VALID'},
   {site_id:'site-A',sold_at:'2026-11-23',qty:4,amt:8000000,eula_status:'VALID'},
   {site_id:'site-B',sold_at:'2026-11-17',qty:5,amt:10000000,eula_status:'VALID'},
   {site_id:'site-B',sold_at:'2026-11-23',qty:7,amt:14000000,eula_status:'VALID'}
  ],
  fetchAll:async()=>[
   {store_id:'A',sold_at:'2026-11-17',qty:2,unit_price:3000000,amount:null,brand:'OPPO',model:'Reno'},
   {store_id:'A',sold_at:'2026-11-23',qty:1,unit_price:5000000,amount:5000000,brand:'OPPO',model:'Find'},
   {store_id:'B',sold_at:'2026-11-17',qty:2,unit_price:2000000,amount:4000000,brand:'vivo',model:'V'},
   {store_id:'B',sold_at:'2026-11-23',qty:1,unit_price:3000000,amount:3000000,brand:'vivo',model:'V'}
  ],isActive:()=>true
 },mount);
 assert.match(mount.innerHTML,/id="cmp-wow-chart"/);
 assert.match(mount.innerHTML,/id="cmp-metric"/);
 assert.deepEqual(Array.from(configs[0].data.datasets[0].data),[8,11]);
 nodes.get('cmp-store').value='A';
 nodes.get('cmp-store').events.change();
 assert.deepEqual(Array.from(configs[1].data.datasets[0].data),[3,4]);
 assert.deepEqual(Array.from(configs[1].data.datasets[1].data),[2,1]);
 nodes.get('cmp-metric').value='amt';
 nodes.get('cmp-metric').events.change();
 assert.deepEqual(Array.from(configs[2].data.datasets[0].data),[6000000,8000000]);
 assert.deepEqual(Array.from(configs[2].data.datasets[1].data),[6000000,5000000]);
 assert.match(nodes.get('cmp-insight').textContent,/Rp 6.000.000/);
 assert.equal(destroyed.length,2,'Old Chart instances must be released before replacement');
 nodes.get('cmp-first').value=nodes.get('cmp-second').value;
 nodes.get('cmp-first').events.change();
 assert.equal(destroyed.length,3);
 assert.match(nodes.get('cmp-filter-feedback').textContent,/Pilih minggu awal/);
 nodes.get('cmp-reset').events.click();
 assert.equal(nodes.get('cmp-metric').value,'qty');
 assert.equal(nodes.get('cmp-store').value,'');
 assert.deepEqual(Array.from(configs.at(-1).data.datasets[0].data),[8,11]);
});

"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const metrics=require("../market-metrics.js");
const nodes=new Map(),charts=[];
let prefs=null;
const period={period_name:"Okt 2026",period_start:"2026-10-01",period_end:"2026-10-31"};
const values={
 "intel-chart-store":"",
 "intel-chart-model":"",
 "intel-chart-metric":"qty",
 "intel-chart-from":period.period_start,
 "intel-chart-to":period.period_end
};
const createNode=(id)=>{
 const node={id,value:values[id]??"",innerHTML:"",textContent:"",events:{},
  min:period.period_start,max:period.period_end,
  options:[{value:""},{value:"S-01"},{value:"S-02"},{value:"A"},{value:"B"},{value:"qty"},{value:"amt"}],
  addEventListener(event,fn){this.events[event]=fn;}};
 nodes.set(id,node);
 return node;
};
const mount={isConnected:true,_html:"",set innerHTML(v){
 this._html=v;
 for(const match of v.matchAll(/id="([^"]+)"/g))createNode(match[1]);
},get innerHTML(){return this._html;}};
class Chart{
 constructor(element,config){this.element=element;this.config=config;charts.push(this);}
 destroy(){}
}
const ctx={window:{SamsungMarketMetrics:metrics,Chart,UserPrefs:{
 savedFilterControls(config){prefs=config;}
}},document:{getElementById(id){return nodes.get(id)||null;}},console,Intl,Date,Map,Set,Number,Math};
vm.runInNewContext(fs.readFileSync("sales-intelligence.js","utf8"),ctx);
const sale=(sold_at,qty,model,site_id="S-01",eula_status="VALID")=>({
 sold_at,qty,amt:qty*1000000,model,site_id,eula_status
});
const data={
 period,profile:{role:"tl"},client:{},
 stores:[{id:"store-1",site_id:"S-01",site_name:"Dummy 1"},{id:"store-2",site_id:"S-02",site_name:"Dummy 2"}],
 targets:[{store_id:"store-1",target_qty:200,target_amt:200000000},
  {store_id:"store-2",target_qty:100,target_amt:100000000}],
 sales:[sale("2026-10-03",10,"A"),sale("2026-10-10",20,"A"),
  sale("2026-10-17",30,"B"),sale("2026-10-18",50,"A","S-02","PENDING")]
};
ctx.window.SalesIntelligence.renderCharts(data,mount);
assert.ok(mount.innerHTML.includes('id="intel-chart-from"'));
assert.ok(mount.innerHTML.includes('id="intel-chart-to"'));
assert.equal(charts.length,5);
assert.equal(charts[0].config.data.datasets[0].data.length,31,
 "Daily chart should include zero-sale calendar dates");
assert.ok(charts[0].config.data.datasets[0].data.includes(0));
assert.equal(charts[1].config.data.datasets[1].data.filter(x=>x!==null).length,2,
 "Only consecutive complete weeks may show WoW");
assert.ok(charts[1].config.data.labels.some(x=>x.includes("*")));
assert.ok(nodes.get("intel-chart-insight").textContent.includes("WoW"));

// Switching site must update all five charts without leaving an old Chart instance.
nodes.get("intel-chart-store").value="S-02";
nodes.get("intel-chart-store").events.change();
assert.equal(charts.length,10);
assert.equal(charts.at(-5).config.data.datasets[0].data.reduce((a,b)=>a+b,0),0,
 "Pending sales excluded when S-02 is selected");
nodes.get("intel-chart-store").value="";
nodes.get("intel-chart-from").value="2026-10-15";
nodes.get("intel-chart-to").value="2026-10-23";
nodes.get("intel-chart-to").events.change();
assert.equal(charts.at(-5).config.data.datasets[0].data.length,9,
 "Date filter must adjust daily chart window");
assert.ok(nodes.get("intel-pace-panel").innerHTML.includes("Rentang tanggal parsial"));
assert.ok(prefs&&typeof prefs.getState==="function");
assert.equal(prefs.getState().from,"2026-10-15");
prefs.applyState({from:"2026-10-01",to:"2026-10-30",store:"S-01",model:"A",metric:"amt"});
assert.equal(nodes.get("intel-chart-from").value,"2026-10-01");
assert.equal(nodes.get("intel-chart-store").value,"S-01");
assert.equal(nodes.get("intel-chart-metric").value,"amt");
console.log("PASS charts DOM: zero-sale dates, completed WoW, site/model/date filters, saved selections");

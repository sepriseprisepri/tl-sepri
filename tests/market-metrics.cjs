"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const metrics=require("../market-metrics.js");
const period={period_start:"2026-11-01",period_end:"2026-11-30"};
const targets=[{target_qty:300,target_amt:3000000}];
const sale=(date,qty,amt,status="VALID")=>({sold_at:date,qty,amt,eula_status:status});
const sales=[
 sale("2026-11-03",10,100000),
 sale("2026-11-10",20,200000),
 sale("2026-11-17",30,300000),
 sale("2026-11-18",999,999999,"PENDING"),
 sale("2026-11-24",1000,10000000)
];
const m=metrics.summarize({period,targets,sales,asOf:"2026-11-23"});
assert.equal(m.duration,30);
assert.equal(m.elapsed,23);
assert.equal(m.remainingDays,8);
assert.equal(m.actualQty,60,"future sales and EULA pending must be ignored");
assert.equal(m.actualAmt,600000);
assert.equal(m.pending.length,1);
assert.equal(m.targetQty,300);
assert.equal(m.gapQty,240);
assert.equal(m.gapAmt,2400000);
assert.equal(m.mtdQty,230);
assert.equal(m.mtdGapQty,170);
assert.equal(m.dailyQty,30);
assert.equal(m.dailyAmt,300000);
assert.equal(m.completeWeekCount,3);
assert.equal(m.lastWeek.start,"2026-11-16");
assert.equal(m.lastWeek.end,"2026-11-22");
assert.equal(m.previousWeek.start,"2026-11-09");
assert.equal(m.wowQty,50);
assert.equal(m.wowAmt,50);
assert.equal(metrics.weekStart("2027-01-01"),"2026-12-28");
assert.ok(metrics.insights(m,"tl").some(x=>x.title.includes("week-to-week")));

const partial=metrics.summarize({period,targets,sales,asOf:"2026-11-10"});
assert.equal(partial.elapsed,10);
assert.equal(partial.mtdQty,100);
assert.equal(partial.wowQty,null,"No comparison against incomplete current week");
assert.equal(partial.remainingDays,21);
assert.equal(partial.actualQty,30);
assert.equal(partial.dailyQty,270/21);
const before=metrics.summarize({period,targets,sales,asOf:"2026-10-15"});
assert.equal(before.elapsed,0);
assert.equal(before.actualQty,0);
assert.equal(before.remainingDays,30);
const after=metrics.summarize({period,targets,sales,asOf:"2026-12-12"});
assert.equal(after.remainingDays,0);
assert.equal(after.dailyQty,0);
const noTarget=metrics.summarize({period,targets:[],sales:[],asOf:"2026-11-12"});
assert.equal(noTarget.achievementQty,null,"No target is not 0 percent achievement");
assert.ok(metrics.insights(noTarget,"ec").some(x=>x.title.includes("Target belum")));
assert.equal(metrics.qtyFormat(1.6),"2","Display rounds only, raw math retains fractional targets");

const html=fs.readFileSync("index.html","utf8");
const ops=fs.readFileSync("ops-modules.js","utf8");
const charts=fs.readFileSync("sales-intelligence.js","utf8");
assert.match(html,/<script src="\/market-metrics\.js"><\/script>/);
assert.match(ops,/Target Daily Qty/);
assert.match(ops,/Gap Amt/);
assert.match(charts,/intel-chart-from/);
assert.match(charts,/intel-chart-to/);
assert.match(charts,/intel-chart-insight/);
assert.match(charts,/completeWeekCount|weekMetrics/);
assert.doesNotMatch(charts,/service_role/i);
for(const [name,text] of [["ops",ops],["charts",charts]]){
 new vm.Script(text,{filename:name+".js"});
}
console.log("PASS shared market metrics: MTD, daily pace, gaps, complete-week WoW, EULA and UI integration");

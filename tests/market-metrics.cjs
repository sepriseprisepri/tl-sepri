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

const ceilingCases=[
  [3794.25,"3.795"],
  [1.955,"2"],
  [3.911,"4"],
  [34.218,"35"],
  [4.888,"5"],
  [3,"3"],
  [0,"0"],
  [1.001,"2"]
];
for(const [input,expected] of ceilingCases){
 assert.equal(metrics.targetQtyFormat(input),expected,
   "Target Qty must always be rounded UP: "+input);
}
assert.equal(metrics.qtyFormat(1.001),"1","Actual quantities must not inherit target-only ceiling");

// Literal Indonesian number formatting from the request is also supported.
for(const [input,expected] of [
 ["3.794,25","3.795"],
 ["1,955","2"],
 ["3,911","4"],
 ["34,218","35"],
 ["4,888","5"]
])assert.equal(metrics.targetQtyFormat(input),expected,
 "Indonesian target formatting: "+input);

const fractional=metrics.summarize({
 period,targets:[{target_qty:34.218,target_amt:123456.78}],
 sales:[],asOf:"2026-11-01"
});
assert.equal(fractional.targetQty,34.218,"Raw targets must not be mutated");
assert.equal(fractional.targetAmt,123456.78,"Amount is not rounded by Qty display logic");
assert.equal(metrics.targetQtyFormat(fractional.targetQty),"35");
assert.equal(fractional.mtdQty,34.218/30,"MTD must retain numeric precision");


const html=fs.readFileSync("index.html","utf8");
const ops=fs.readFileSync("ops-modules.js","utf8");
const charts=fs.readFileSync("sales-intelligence.js","utf8");
assert.match(html,/<script src="\/market-metrics\.js"><\/script>/);
assert.match(ops,/Target Daily Qty/);
const focus=fs.readFileSync("focus-model-allocations.js","utf8");
const intelligence=fs.readFileSync("sales-intelligence.js","utf8");
const master=fs.readFileSync("master-import.js","utf8");
assert.match(html,/fmtTargetQty\(targetQty\)/,"Dashboard Qty uses ceil");
assert.match(html,/fmtTargetQty\(r\.target\)/,"Store target rows use ceil");
assert.match(ops,/targetQtyText\(r\.target_qty\)/,"EC\/TL target rows use ceil");
assert.match(ops,/targetQtyText\(qty\*elapsed\/duration\)/,"MTD target uses ceil");
assert.match(ops,/targetQtyText\(Math\.max\(0,qty-actual\)\/remaining\)/,"Daily target uses ceil");
assert.match(focus,/targetQtyText\(t\.target_qty\)/,"Focus Model store targets use ceil");
assert.match(focus,/targetQtyText\(r\.target_qty\)/,"Focus Model EC targets use ceil");
assert.match(focus,/remainingQtyText\(num\(t\.target_qty\)-qAlloc\)/,"Remaining allocatable capacity is never overstated by ceiling");
assert.match(intelligence,/targetQtyText\(market\.mtdQty\)/,"Artificial Insight pulse uses ceil");
assert.match(master,/targetQtyFormat\?\.\(p\.qtySum\)/,"Master preview target uses ceil");

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

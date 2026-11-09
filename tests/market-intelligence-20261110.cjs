"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const ops=fs.readFileSync("ops-modules.js","utf8");
const charts=fs.readFileSync("sales-intelligence.js","utf8");
const market=fs.readFileSync("market-intelligence.js","utf8");
const competitor=fs.readFileSync("ec-competitor-sellout.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const competitorSql=fs.readFileSync("docs/sql/20261110-competitor-daily-edit-soft-delete-draft.sql","utf8");
const focusSql=fs.readFileSync("docs/sql/20261110-ec-focus-model-allocations-draft.sql","utf8");
for(const script of [ops,charts,market,competitor])new vm.Script(script);
const scope={window:{},Intl,Date,Number,String,Error,Map,URLSearchParams,console};
vm.runInNewContext(market,scope);
const p=scope.window.SamsungMarketPulse;
assert.ok(p);
assert.equal(p.weekStart("2026-11-10"),"2026-11-09");
const sales=[
 {sold_at:"2026-11-02",qty:5,eula_status:"VALID"},
 {sold_at:"2026-11-03",qty:2,eula_status:"VALID"},
 {sold_at:"2026-11-09",qty:7,eula_status:"VALID"},
 {sold_at:"2026-11-10",qty:3,eula_status:"VALID"},
 {sold_at:"2026-11-09",qty:999,eula_status:"PENDING"}
];
const compare=p.weeklySummary(sales,{period_start:"2026-11-01",period_end:"2026-11-30"},"2026-11-10");
assert.equal(compare.ready,true);
assert.equal(compare.partial,true);
assert.equal(compare.previous.qty,7);
assert.equal(compare.current.qty,10);
assert.equal(Math.round(compare.growth),43);
const zero=p.weeklySummary([],{period_start:"2026-11-01",period_end:"2026-11-30"},"2026-11-10");
assert.equal(zero.ready,false);
const full=p.weeklySummary([
 {sold_at:"2026-11-02",qty:10,eula_status:"VALID"},
 {sold_at:"2026-11-09",qty:15,eula_status:"VALID"}
],{period_start:"2026-11-01",period_end:"2026-11-30"},"2026-11-16");
assert.equal(full.ready,true);
assert.equal(full.partial,undefined);
assert.equal(full.growth,50);
assert.ok(p.sources.length>=5);
assert.ok(p.sources.every(s=>s.url.startsWith("https://")));
assert.match(html,/src="\/market-intelligence\.js"/);
assert.match(html,/id="market-pulse-dashboard"/);
assert.match(ops,/function monthProgress\(period\)/);
assert.match(ops,/Target MTD Qty/);
assert.match(ops,/Daily Qty \/ Amt/);
assert.match(ops,/Gap Amt/);
assert.match(ops,/qtyRounded/);
assert.match(ops,/focus_model_ec_targets/);
assert.match(ops,/profile\.role==="ec"\?focusAllocations:focusTargets/);
assert.match(ops,/const loadSales=true/);
assert.match(ops,/modelMatches/);
assert.match(ops,/data-column/);
assert.match(ops,/data-clear/);
assert.match(charts,/intel-chart-insights/);
assert.match(charts,/intel-chart-from/);
assert.match(charts,/intel-chart-to/);
assert.match(charts,/weeklySummary/);
assert.match(competitor,/data-edit/);
assert.match(competitor,/data-delete/);
assert.match(competitor,/const canModify/);
assert.match(competitor,/method==="PATCH"/);
assert.match(competitor,/return=representation/);
assert.match(competitor,/new Date\(\)\.toISOString\(\)/);
assert.doesNotMatch(competitor,/from\(["']raw_sellout["']\)\.(?:insert|update|delete)/);
assert.match(competitorSql,/CREATE POLICY competitor_ec_update_today/);
assert.match(competitorSql,/GRANT UPDATE\(brand,model,variant,qty,unit_price,notes,deleted_at,updated_at\)/);
assert.match(competitorSql,/guard_competitor_daily_edit/);
assert.doesNotMatch(competitorSql,/GRANT\s+DELETE\s+ON\s+public\.competitor_sellout/);
assert.match(focusSql,/CREATE TABLE public\.focus_model_ec_targets/);
assert.match(focusSql,/ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(focusSql,/INSERT INTO public\.raw_sellout/);
console.log("Market Intelligence regression passed: safe WoW/WTD, focus, target MTD, chart filters, same-day competitor controls and untouched Samsung RAW.");

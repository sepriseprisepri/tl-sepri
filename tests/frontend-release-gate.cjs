/* Release gate: production-safe frontend changes without pending DB migration. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ops=fs.readFileSync("ops-modules.js","utf8");
const competitor=fs.readFileSync("ec-competitor-sellout.js","utf8");
const intelligence=fs.readFileSync("sales-intelligence.js","utf8");
assert.match(ops,/window\.SAMSUNG_EC_FOCUS_ALLOCATIONS_ENABLED===true/,"TL write UI must be off by default");
assert.match(competitor,/window\.SAMSUNG_COMPETITOR_CORRECTIONS_ENABLED===true/,"Competitor corrections must be off by default");
assert.match(competitor,/window\.SAMSUNG_COMPETITOR_CORRECTIONS_ENABLED!==true/,"Direct correction event must be guarded");
assert.match(ops,/Sisa alokasi Qty/,"TL must see remaining Qty");
assert.match(ops,/Target Daily Qty/,"EC daily target must be visible");
assert.match(intelligence,/completedWeekTotals/,"WoW should use completed weeks");
for(const js of ["ops-modules.js","ec-competitor-sellout.js","sales-intelligence.js"]){
new (require("node:vm").Script)(fs.readFileSync(js,"utf8"),{filename:js});
}
console.log("Production-safe frontend release gates passed.");

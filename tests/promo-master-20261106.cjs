/* Master Promo November 2026 — integrity of user-supplied internal bulletin import.
 * No network calls or database credentials. Run with Node 20+. */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const sql=fs.readFileSync("docs/sql/20261106-promo-master-import.sql","utf8");
const schema=fs.readFileSync("docs/sql/20261106-promo-provenance.sql","utf8");
const ui=fs.readFileSync("promo-center.js","utf8");
const chart=fs.readFileSync("sales-intelligence.js","utf8");
const css=fs.readFileSync("sales-intelligence.css","utf8");
new vm.Script(ui);new vm.Script(chart);

assert.match(schema,/source_type IN \('official_web','internal_bulletin'\)/);
assert.match(schema,/source_url DROP NOT NULL/);
assert.match(schema,/source_provenance_chk/);
assert.match(schema,/channel_code IN \(/);
assert.match(schema,/offer_items jsonb/);
assert.match(schema,/record_kind IN \(/);
assert.match(sql,/ON CONFLICT \(import_key\) DO NOTHING/);
assert.match(sql,/INTERNAL USER-SUPPLIED BULLETIN/);
const keys=[...sql.matchAll(/'master-20261030-[a-z0-9-]+'/g)].map(x=>x[0]);
assert.equal(keys.length,61,"61 records from bulletin expected");
assert.equal(new Set(keys).size,61,"No duplicate import keys");
const row=key=>{
 const s=sql.split("\n").find(x=>x.includes("'master-20261030-"+key+"'"));
 assert.ok(s,"Missing SKU "+key);return s;
};
for(const [key,amounts] of Object.entries({
 "z-fold8-ultra":["1500000","750000","1250000"],
 "z-fold8":["1000000","750000","1250000"],
 "z-flip8":["500000","500000","1000000"],
 "s26-ultra":["2000000"],"s26-plus":["1500000"],"s26-base":["1000000"],
 "s25-ultra":["2500000"],"s25-base":["1500000"],
 "s26fe-12":["1750000","1000000"],"s26fe-8-256":["1250000"],"s26fe-8-128":["1000000"],
 "s25fe-trad":["2000000"],"a57-off-12-256":["1000000","300000"],
 "a57-off-8-256":["700000"],"a57-off-8-128":["500000"],
 "a37-5g":["300000"],"a27-lite":["300000"],"a27-price":["5799900"],
 "a07s-launch":["2699000"],"a17-5g-online":["4999000"],
 "a17-lte-4-128":["3999000","3595000"],
 "tab-s12-trad":["1000000"],"tab-s12-org":["500000"],
 "watch8":["1000000"],"watch8-classic":["20"],
 "buds4pro-org":["500000"],"buds4pro-trad":["20"],
 "finance-flagship":["50000","6"],"finance-a":["8"]
})){
 const text=row(key);for(const a of amounts)assert.ok(text.includes(a),key+" lacks "+a);
}
assert.match(row("s25fe-trad"),/'traditional'/);
assert.match(row("s25fe-org"),/'organized'/);
assert.match(row("a57-online"),/'online'/);
assert.match(row("buds4pro-org"),/'organized'/);
assert.match(row("buds4pro-trad"),/'traditional'/);
assert.match(row("a57-xl-pending"),/'draft',NULL,false/);
assert.match(row("a17-lte-8-128-price"),/'draft',NULL,false/);
assert.match(row("buds-core"),/'draft',NULL,false/);
assert.match(row("easy-galaxy"),/'2026-12-31'/);
for(const key of keys){
 const r=sql.split("\n").find(x=>x.includes(key));
 assert.ok(r.includes("'internal_bulletin'"),key+" must have explicit internal source");
 assert.ok(r.includes("'bulletin_user_transcription'"),key+" must not claim official-site verification");
}
assert.match(ui,/p\.source_type==="internal_bulletin"/);
assert.match(ui,/Sumber internal bukan verifikasi publik/);
assert.match(ui,/intel-offer-items/);
assert.match(ui,/sku_variant/);
assert.match(ui,/channel_code/);
assert.match(ui,/const matchesChannel=/);
assert.match(ui,/record_kind/);
assert.match(ui,/id="promo-channel"/);
assert.match(ui,/id="promo-category"/);
// National catalog is the same read-only listing for every authorized role.
assert.match(ui,/Promo Nasional Samsung/);
assert.match(ui,/q=>q\.eq\("published",true\)\.eq\("verification_state","verified"\)\.eq\("scope_type","national"\)/);
assert.match(ui,/const models=\[\.\.\.new Set\(promos\.filter/);
assert.doesNotMatch(ui,/Admin · Antrean|Admin · Publikasikan|Draft Admin/);
assert.doesNotMatch(ui,/adminReviewQueue|adminEditor|promo-review-queue|promo-admin/);
assert.doesNotMatch(ui,/role==="admin"|focus_model_settings|raw_sellout|sales_promotion_stores/);
assert.doesNotMatch(ui,/\.from\("sales_promotions"\)\.(?:insert|update|delete|upsert)\(/);
assert.doesNotMatch(ui,/Nonaktifkan promo|Terbitkan ulang|Simpan catatan \(tetap draft\)/);
// Monthly updates must not inherit a fixed November banner or hide other-channel offers.
assert.match(ui,/const latestBulletinDate=/);
assert.match(ui,/Tanggal sumber bulletin internal terbaru/);
assert.match(ui,/tidak tersinkron otomatis/);
assert.doesNotMatch(ui,/Master Update Promo Samsung — November 2026/);
assert.doesNotMatch(ui,/1–17 November|30 Oktober 2026/);
assert.match(ui,/const daysUntil=value=>/);
assert.match(ui,/Segera berakhir/);
assert.match(ui,/Berakhir hari ini/);
assert.match(ui,/Program berakhir/);
assert.match(ui,/Tidak ada program nasional yang masih berlaku/);
assert.match(ui,/class="intel-promo-timing/);
assert.match(ui,/id="promo-channel" class="field"><option value="">Semua channel<\/option>/);
assert.doesNotMatch(ui,/<option value="all">Semua channel<\/option>/);
assert.match(css,/\.intel-promo-timing-soon/);
// Runtime channel matrix prevents cards, KPI totals and model chips from diverging.
const sandbox={window:{SalesIntelligence:{dateLocal:()=>"2026-11-07"}},Date,Intl,URL};
vm.runInNewContext(ui,sandbox);
const api=sandbox.window.PromoCenter;
assert.equal(typeof api.matchesChannel,"function");
for(const [actual,selected,expected] of [
 ["traditional","",true],["organized","",true],["e_store","all",true],
 ["traditional","traditional",true],["organized","traditional",false],
 ["offline","traditional",true],["traditional","offline",true],
 ["organized","offline",true],["online","offline",false],
 ["e_store","online",false],["all","online",true],
 ["unspecified","organized",false],["online","online",true]
]){
 assert.equal(api.matchesChannel(actual,selected),expected,actual+" / "+selected);
}
assert.equal(api.daysUntil("2026-11-07"),0);
assert.equal(api.daysUntil("2026-11-10"),3);
assert.equal(api.daysUntil("2026-11-06"),-1);
const promo=(kind,end_date)=>({published:true,verification_state:"verified",start_date:"2026-11-01",end_date,record_kind:kind});
for(const kind of ["offer","information","price_update","no_offer","financing"]){
 assert.equal(api.state(promo(kind,"2026-11-06")),"expired",kind);
 assert.equal(api.state(promo(kind,"2026-11-07")),"active",kind);
}
assert.match(ui,/const currentActive=promos\.filter\(p=>state\(p\)==="active"&&matchesChannel\(p.channel_code,filter\.channel\)\)/);
assert.match(ui,/const covered=new Set\(specific\.map/);
assert.match(ui,/esc\(label\[condition\]\)/);
assert.doesNotMatch(ui,/const channelEligible=p=>|const channelMatch=/);
assert.match(ui,/Tanpa promo cashback/); // no-cashback informational records remain distinct from offers
assert.match(css,/\.intel-source-internal/);
assert.match(chart,/p\.record_kind==="offer"/);
require("./promo-import-preflight.cjs");
require("./ec-competitor-sellout.cjs");
console.log("Promo master integrity passed: 61 SKUs, 6 review-only entries, channel exceptions, cashback and source labeling.");

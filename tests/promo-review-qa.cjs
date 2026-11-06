/* Samsung Kalteng — administrator promo review and fail-closed approval smoke. */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("promo-review.js","utf8");
const promo=fs.readFileSync("promo-center.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const sql=fs.readFileSync("docs/sql/20261106-promo-review-approval-gate.sql","utf8");
const css=fs.readFileSync("sales-intelligence.css","utf8");
const scope={window:{},console,Object,Array,Set,Map,Date,Number,String};
vm.runInNewContext(source,scope,{filename:"promo-review.js"});
new vm.Script(promo,{filename:"promo-center.js"});
const v=scope.window.PromoReview.validate;
assert.equal(typeof v,"function");
assert.equal(typeof scope.window.PromoReview.render,"function");
const sites=new Map([["SITE1","s1"],["SITE2","s2"]]);
const valid={
 model:"Galaxy A57 5G",variant:"12/256GB",benefit:"Additional Cashback hingga Rp1.500.000 untuk store yang memenuhi syarat.",
 terms:"Berlaku pada enam toko eligible sesuai surat internal.",
 channel:"offline",items:[{name:"Additional Cashback hingga",amount_idr:1500000}],
 siteIds:["SITE1","SITE2"],evidence:"Konfirmasi tertulis TSO 6 November 2026 dengan lampiran daftar store eligible.",
 confirmed:true
};
let result=v({import_key:"master-20261030-a57-xl-pending"},valid,sites);
assert.equal(result.errors.length,0,result.errors.join("; "));
assert.equal(result.scope,"selected_stores");
assert.equal(result.sites.length,2);
assert.ok(v({import_key:"master-20261030-a57-xl-pending"},{...valid,siteIds:[]},sites).errors.some(x=>x.includes("Site ID")));
assert.ok(v({import_key:"master-20261030-a57-xl-pending"},{...valid,siteIds:["UNKNOWN"]},sites).errors.some(x=>x.includes("Site ID")));
assert.ok(v({import_key:"master-20261030-a57-xl-pending"},{...valid,evidence:"ok"},sites).errors.some(x=>x.includes("25 karakter")));
assert.ok(v({import_key:"master-20261030-a57-xl-pending"},{...valid,confirmed:false},sites).errors.some(x=>x.includes("Centang")));
assert.ok(v({import_key:"master-20261030-a18-adaptor-review"},{...valid,siteIds:[],benefit:"Apple Adaptor tersedia."},sites).errors.some(x=>x.includes("ambigu")));
assert.ok(v({import_key:"master-20261030-a08-adaptor-review"},{...valid,siteIds:[],terms:"Apple Adaptor mungkin termasuk."},sites).errors.some(x=>x.includes("ambigu")));
assert.ok(v({import_key:"master-20261030-buds-core"},{...valid,siteIds:[],variant:"Buds SCORE"},sites).errors.some(x=>x.includes("ambigu")));
assert.ok(v({import_key:"master-20261030-a17-lte-8-128-price"},{...valid,siteIds:[],items:[{name:"RRP",amount_idr:3999000}]},sites).errors.some(x=>x.includes("price_idr")));
assert.equal(v({import_key:"master-20261030-a17-lte-8-128-price"},
 {...valid,siteIds:[],items:[{name:"RRP terbaru",price_idr:4999000}]},sites).errors.length,0);
assert.ok(v({import_key:"master-20261030-a57-xl-pending"},
 {...valid,items:[{name:"Discount",amount_idr:"abc"}]},sites).errors.some(x=>x.includes("angka")));
for(const text of [
 "initial_review_required boolean NOT NULL DEFAULT false",
 "review_evidence text NOT NULL DEFAULT",
 "reviewed_by uuid REFERENCES public.profiles",
 "sales_promotions_gate_requires_evidence",
 "sales_promotions_no_publish_pending_review",
 "OLD.initial_review_required",
 "SECURITY INVOKER",
 "REVOKE ALL ON FUNCTION",
 "BEFORE INSERT OR UPDATE",
 "published AND NEW.requires_review"
])assert.ok(sql.includes(text),"SQL review gate missing "+text);
assert.match(promo,/window\.PromoReview\.render/);
assert.match(promo,/id="promo-review-queue"/);
assert.match(promo,/initial_review_required,review_evidence,reviewed_by,reviewed_at/);
assert.match(index,/<script src="\/promo-review\.js"><\/script>/);
assert.match(css,/\.intel-review-fields/);
assert.match(source,/verification_state:"draft"/);
assert.match(source,/verified_basis:"bulletin_admin_review"/);
assert.match(source,/\.eq\("requires_review",true\)/);
assert.match(source,/\.eq\("published",false\)/);
assert.match(source,/Simpan koreksi sebagai draft/);
console.log("Promo review QA smoke passed: Admin corrections gated, evidence, XL store scope, pricing, ambiguity and RLS checks.");

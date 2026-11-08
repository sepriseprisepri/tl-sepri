/* Offline-only promo importer validation. No network and no DB access. */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {prepare,dateValid}=require("../scripts/prepare-national-promos.cjs");
const entry={
 import_key:"national-20261201-galaxy-test",
 title:"Contoh uji — bukan promo nyata",
 model_code:"GALAXY TEST",model_name:"Galaxy Test",
 benefit:"Promo fiktif untuk tes, tidak untuk ditayangkan",
 terms:"Bukan data resmi Samsung. Jangan import ke produksi.",
 channel_label:"Traditional",start_date:"2026-12-01",end_date:"2026-12-12",
 source_reference:"Fixture pengujian internal",source_date:"2026-11-30",
 program_category:"smartphone",sku_variant:"Contoh",channel_code:"traditional",
 offer_items:[{name:"Diskon pengujian",amount_idr:100000}],record_kind:"offer"
};
const batch={schema_version:1,promotions:[entry]};
const p=prepare(batch);
assert.equal(p.count,1);
assert.ok(p.sql.includes("INSERT INTO public.sales_promotions"));
assert.ok(p.sql.includes("ON CONFLICT (import_key) DO NOTHING"));
assert.ok(p.sql.includes("'national'"));
assert.ok(p.sql.includes("'draft'"));
assert.ok(p.sql.includes("FALSE"));
assert.ok(p.sql.includes("TRUE"));
assert.ok(p.sql.includes("NULL"));
assert.ok(p.sql.includes("unverified_import"));
assert.ok(!/UPDATE\s+public\.sales_promotions|DELETE\s+FROM|DROP\s+TABLE/i.test(p.sql));
assert.ok(!/published\s*=\s*true/i.test(p.sql));
assert.ok(dateValid("2026-12-01"));
assert.equal(dateValid("2026-02-30"),false);
assert.equal(dateValid("2026-13-01"),false);
const reject=(value,pattern)=>assert.throws(()=>prepare(value),pattern);
reject({...batch,schema_version:2},/schema_version/);
reject({...batch,promotions:[entry,entry]},/duplikat/);
reject({...batch,promotions:[{...entry,end_date:"2026-11-01"}]},/end_date/);
reject({...batch,promotions:[{...entry,channel_code:"all_public"}]},/kategori\/channel/);
reject({...batch,promotions:[{...entry,published:true}]},/field tak diizinkan/);
reject({...batch,promotions:[{...entry,verification_state:"verified"}]},/field tak diizinkan/);
reject({...batch,promotions:[{...entry,offer_items:[]}]},/offer_items/);
reject({...batch,promotions:[{...entry,source_date:"2026-12-31"}]},/source_date/);
assert.ok(prepare({...batch,promotions:[{...entry,title:"O'Hara contoh"}]}).sql.includes("O''Hara"));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"promo-preflight-"));
try{
 const inFile=path.join(dir,"input.json"),outFile=path.join(dir,"draft.sql");
 fs.writeFileSync(inFile,JSON.stringify(batch));
 const stdout=execFileSync(process.execPath,[path.join(__dirname,"..","scripts","prepare-national-promos.cjs"),inFile,outFile],{encoding:"utf8"});
 assert.match(stdout,/Valid: 1 entri/);
 assert.ok(fs.readFileSync(outFile,"utf8").includes("published"));
 assert.throws(()=>execFileSync(process.execPath,[path.join(__dirname,"..","scripts","prepare-national-promos.cjs"),inFile,outFile],{stdio:"pipe"}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log("National promo import preflight passed: validation, SQL safety, no overwrite, no auto-publish.");

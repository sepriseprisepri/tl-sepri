#!/usr/bin/env node
/* Offline preflight for user-supplied national promo bulletins.
 * Generates a reviewable, draft-only SQL file; never connects to Supabase. */
"use strict";
const fs=require("node:fs");
const path=require("node:path");

const CATEGORIES=new Set(["general","smartphone","tablet","wearable","audio","financing","price","information"]);
const CHANNELS=new Set(["all","offline","traditional","organized","e_store","online"]);
const KINDS=new Set(["offer","price_update","no_offer","information","financing"]);
const VALID_FIELDS=["import_key","title","model_code","model_name","benefit","terms","channel_label","start_date","end_date","source_reference","source_date","program_category","sku_variant","channel_code","offer_items","record_kind"];
const LIMIT=200;
const quote=x=>"'"+String(x).replace(/'/g,"''")+"'";
const fail=(where,message)=>{throw new Error(where+": "+message);};
const dateValid=value=>{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
};
const str=(obj,key,where,max=1500)=>{
 const v=obj[key];if(typeof v!=="string"||!v.trim())fail(where,key+" wajib berupa teks");
 if(v.length>max)fail(where,key+" terlalu panjang (maks "+max+")");
 if(/[\u0000-\u001f\u007f]/.test(v))fail(where,key+" mengandung karakter kontrol");
 return v.trim();
};
function prepare(input){
 if(!input||typeof input!=="object"||Array.isArray(input))fail("batch","harus object");
 if(input.schema_version!==1)fail("batch","schema_version harus 1");
 if(!Array.isArray(input.promotions)||input.promotions.length<1||input.promotions.length>LIMIT)fail("batch","promotions harus 1-"+LIMIT+" entri");
 const seen=new Set();
 const records=input.promotions.map((v,i)=>{
  const where="promotions["+(i+1)+"]";
  if(!v||typeof v!=="object"||Array.isArray(v))fail(where,"bukan object");
  const extra=Object.keys(v).filter(k=>!VALID_FIELDS.includes(k));
  if(extra.length)fail(where,"field tak diizinkan: "+extra.join(", "));
  const a={};
  for(const k of ["import_key","title","model_code","model_name","benefit","terms","channel_label","start_date","end_date","source_reference","source_date","program_category","sku_variant","channel_code","record_kind"]){
   a[k]=str(v,k,where,k==="benefit"||k==="terms"?4000:1500);
  }
  if(!/^national-[a-z0-9][a-z0-9-]{5,110}$/.test(a.import_key))fail(where,"import_key harus national-... unik");
  if(seen.has(a.import_key))fail(where,"import_key duplikat");seen.add(a.import_key);
  if(!dateValid(a.start_date)||!dateValid(a.end_date)||!dateValid(a.source_date))fail(where,"tanggal harus YYYY-MM-DD valid");
  if(a.end_date<a.start_date)fail(where,"end_date sebelum start_date");
  if(a.source_date>a.end_date)fail(where,"source_date melebihi akhir program");
  if(!CATEGORIES.has(a.program_category)||!CHANNELS.has(a.channel_code)||!KINDS.has(a.record_kind))fail(where,"kategori/channel/jenis tidak valid");
  if(!Array.isArray(v.offer_items)||v.offer_items.length>30)fail(where,"offer_items harus array maksimal 30");
  a.offer_items=v.offer_items.map((item,j)=>{
   if(!item||typeof item!=="object"||Array.isArray(item))fail(where,"offer_items["+(j+1)+"] bukan object");
   if(Object.keys(item).some(k=>!["name","amount_idr","price_idr","percent","estimated_value_idr"].includes(k)))fail(where,"atribut benefit tidak didukung");
   const cleaned={name:str(item,"name",where+" offer "+j,200)};
   for(const k of ["amount_idr","price_idr","percent","estimated_value_idr"]){
    if(item[k]!==undefined){
     if(typeof item[k]!=="number"||!Number.isFinite(item[k])||item[k]<0||item[k]>1e12)fail(where,k+" harus angka positif yang masuk akal");
     cleaned[k]=item[k];
    }
   }
   return cleaned;
  });
  if(a.record_kind==="offer"&&!a.offer_items.length)fail(where,"promo penawaran harus menyertakan offer_items");
  return a;
 });
 const columns=["import_key","title","model_code","model_name","benefit","terms","channel_label","scope_type","start_date","end_date","source_url","verification_state","verified_at","published","source_type","source_reference","source_date","verified_basis","program_category","sku_variant","channel_code","offer_items","record_kind","review_notes","requires_review"];
 const values=records.map(a=>{
  const obj={...a,scope_type:"national",source_url:null,verification_state:"draft",verified_at:null,published:false,source_type:"internal_bulletin",verified_basis:"unverified_import",review_notes:"Impor tertahan. Periksa sumber, kanal, varian, dan manfaat sebelum penerbitan terkontrol.",requires_review:true};
  return "("+columns.map(k=>k==="offer_items"?quote(JSON.stringify(obj[k]))+"::jsonb":obj[k]===null?"NULL":typeof obj[k]==="boolean"?(obj[k]?"TRUE":"FALSE"):quote(obj[k])).join(",")+")";
 });
 const sql=[
  "-- DRAFT-ONLY: generated offline. Review every row before a separate approved publication.",
  "-- No updates to existing rows. Collision on import_key is intentionally ignored.",
  "BEGIN;",
  "INSERT INTO public.sales_promotions ("+columns.join(",")+") VALUES",
  values.join(",\n")+"\nON CONFLICT (import_key) DO NOTHING;",
  "COMMIT;",
  ""
 ].join("\n");
 return {sql,count:records.length,keys:records.map(x=>x.import_key)};
}
function main(argv){
 if(argv.length!==2||argv[0].startsWith("-")||argv[1].startsWith("-")){
  throw new Error("Penggunaan: node scripts/prepare-national-promos.cjs batch.json output-draft.sql");
 }
 const inputPath=path.resolve(argv[0]),outputPath=path.resolve(argv[1]);
 if(inputPath===outputPath)throw new Error("Path output harus berbeda dari input");
 if(fs.existsSync(outputPath))throw new Error("Output sudah ada; tidak menimpa file yang ada");
 const input=JSON.parse(fs.readFileSync(inputPath,"utf8"));
 const report=prepare(input);
 fs.writeFileSync(outputPath,report.sql,{encoding:"utf8",flag:"wx",mode:0o600});
 console.log("Valid: "+report.count+" entri. SQL draft-only ditulis ke "+outputPath);
 console.log("Belum diterapkan ke database; tidak ada promosi yang diterbitkan.");
}
if(require.main===module){
 try{main(process.argv.slice(2));}catch(err){console.error("Preflight gagal:",err.message);process.exitCode=1;}
}
module.exports={prepare,dateValid};

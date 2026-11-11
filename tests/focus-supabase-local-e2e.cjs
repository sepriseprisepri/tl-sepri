/* Real, LOCAL ONLY: GoTrue JWT + PostgREST RLS + Focus Model RPC.
 * No remote credentials, no real accounts, no mutation outside 127.0.0.1.
 */
"use strict";
const assert=require("node:assert/strict");
const API=process.env.API_URL,ANON=process.env.ANON_KEY,ADMIN=process.env.SERVICE_ROLE_KEY;
if(!API||!ANON||!ADMIN||!/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(API))
 throw Error("Focus Model E2E accepts ONLY the disposable local Supabase API");
const uuid={store1:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
 store2:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
 period:"cccccccc-cccc-cccc-cccc-cccccccccccc",
 ec1:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
 ec2:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
 ec3:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3"};
const password="OnlyLocalPassword2026!A";
const accounts={};
function headers(key,token=key,prefer=""){
 return {apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",
  ...(prefer?{Prefer:prefer}:{})};
}
async function call(path,method="GET",body,head=headers(ANON)){
 const result=await fetch(API+path,{method,headers:head,
  body:body===undefined?undefined:JSON.stringify(body)});
 let payload=await result.text();
 try{payload=payload?JSON.parse(payload):null;}catch{}
 return {status:result.status,data:payload};
}
const ok=(r,label)=>assert.ok(r.status>=200&&r.status<300,
 label+" expected 2xx, got "+r.status+" "+JSON.stringify(r.data?.code||r.data?.message||""));
const deny=(r,label)=>assert.ok(r.status>=400&&r.status<500,
 label+" expected 4xx, got "+r.status);
async function post(table,payload){
 const r=await call("/rest/v1/"+table,"POST",payload,headers(ADMIN,ADMIN,"return=minimal"));
 ok(r,"insert dummy "+table);
}
async function patch(table,filter,payload){
 const r=await call("/rest/v1/"+table+"?"+filter,"PATCH",payload,
  headers(ADMIN,ADMIN,"return=minimal"));
 ok(r,"patch dummy "+table);
}
async function createUser(role,name,manpower_id=null){
 const email="focustest-"+name+"@local.test";
 const r=await call("/auth/v1/admin/users","POST",
  {email,password,email_confirm:true},headers(ADMIN));
 ok(r,"GoTrue create "+name);
 assert.ok(r.data?.id,"Auth ID missing");
 accounts[name]={id:r.data.id,email};
 await post("profiles",{id:r.data.id,role,manpower_id,is_active:true,must_change_password:false});
}
async function login(name){
 const r=await call("/auth/v1/token?grant_type=password","POST",
  {email:accounts[name].email,password},headers(ANON));
 ok(r,"GoTrue login "+name);
 assert.ok(r.data?.access_token);
 return r.data.access_token;
}
async function rows(table,token,select="*"){
 const r=await call("/rest/v1/"+table+"?select="+encodeURIComponent(select),
  "GET",undefined,headers(ANON,token));
 ok(r,table+" read");
 assert.ok(Array.isArray(r.data));
 return r.data;
}
async function assign(token,ec,qty,amt){
 return call("/rest/v1/rpc/set_focus_model_ec_allocation","POST",{
  p_period_id:uuid.period,p_store_id:uuid.store1,p_model_code:"GALAXY A55",
  p_manpower_id:ec,p_target_qty:qty,p_target_amt:amt},headers(ANON,token));
}
async function run(){
 await createUser("admin","admin");
 await createUser("tl","tl1");
 await createUser("tl","tl2");
 await createUser("ec","ec1",uuid.ec1);
 await createUser("ec","ec2",uuid.ec2);
 await createUser("ec","ec3",uuid.ec3);
 await post("coverage_assignments",[
  {profile_id:accounts.tl1.id,store_id:uuid.store1,coverage_role:"tl",valid_from:"2020-01-01"},
  {profile_id:accounts.tl2.id,store_id:uuid.store2,coverage_role:"tl",valid_from:"2020-01-01"}]);
 const jwt={};
 for(const name of ["admin","tl1","tl2","ec1","ec2","ec3"])jwt[name]=await login(name);
 assert.equal((await rows("focus_model_targets",jwt.ec1)).length,0,
  "EC must not see entire store model budget");
 assert.equal((await rows("focus_model_ec_allocations",jwt.ec1)).length,0);
 assert.equal((await rows("focus_model_targets",jwt.tl1)).length,1);
 assert.equal((await rows("focus_model_targets",jwt.tl2)).length,0);

 // Admin can initialize/edit model budget using the real authenticated Data API.
 const budget=await call(
  "/rest/v1/focus_model_targets?on_conflict=period_id,store_id,model_code",
  "POST",{period_id:uuid.period,store_id:uuid.store1,model_code:"GALAXY A55",
   target_qty:10,target_amt:1000,updated_by:accounts.admin.id},
  headers(ANON,jwt.admin,"resolution=merge-duplicates,return=representation"));
 ok(budget,"Admin RLS-scoped parent upsert");
 deny(await call("/rest/v1/focus_model_targets?on_conflict=period_id,store_id,model_code",
  "POST",{period_id:uuid.period,store_id:uuid.store1,model_code:"GALAXY A55",
   target_qty:300,target_amt:3000,updated_by:accounts.ec1.id},
  headers(ANON,jwt.ec1,"resolution=merge-duplicates,return=minimal")),"EC parent mutation");

 const a=await assign(jwt.tl1,uuid.ec1,6,600),b=await assign(jwt.tl1,uuid.ec2,3,300);
 ok(a,"TL allocation EC1");ok(b,"TL allocation EC2");
 assert.equal((await rows("focus_model_ec_allocations",jwt.ec1)).length,1);
 assert.deepEqual((await rows("focus_model_ec_allocations",jwt.ec1,"manpower_id,target_qty"))
   .map(r=>r.manpower_id),[uuid.ec1]);
 assert.equal((await rows("focus_model_allocation_history",jwt.ec1)).length,0);
 assert.equal((await rows("focus_model_ec_allocations",jwt.tl1)).length,2);
 assert.equal((await rows("focus_model_ec_allocations",jwt.tl2)).length,0);
 deny(await assign(jwt.tl2,uuid.ec1,1,100),"Outside-coverage TL");
 deny(await assign(jwt.ec1,uuid.ec1,2,200),"EC must not assign");
 deny(await assign(ANON,uuid.ec1,2,200),"Anonymous must not assign");
 deny(await assign(jwt.tl1,uuid.ec2,5,300),"Total Qty cannot exceed store budget");
 deny(await assign(jwt.tl1,uuid.ec2,3,500),"Total Amt cannot exceed store budget");
 deny(await assign(jwt.tl1,uuid.ec3,1,100),"EC from different store");
 deny(await call("/rest/v1/focus_model_ec_allocations","POST",
  {period_id:uuid.period,store_id:uuid.store1,model_code:"GALAXY A55",
   manpower_id:uuid.ec1,target_qty:1,target_amt:100,assigned_by:accounts.ec1.id},
  headers(ANON,jwt.ec1,"return=minimal")),"Direct client insert");
 deny(await call("/rest/v1/focus_model_targets?store_id=eq."+uuid.store1,
  "PATCH",{target_qty:8},headers(ANON,jwt.admin,"return=representation")),
  "Admin cannot shrink store budget below allocations");

 // A valid JWT must stop reading immediately on mandatory password rotation.
 await patch("profiles","id=eq."+accounts.ec1.id,{must_change_password:true});
 assert.equal((await rows("focus_model_ec_allocations",jwt.ec1)).length,0,
  "Old EC JWT must respect forced rotation");
 await patch("profiles","id=eq."+accounts.ec1.id,{must_change_password:false});

 // Expiry of store assignment must hide allocation even if manpower.site_id remains.
 await patch("store_assignments","manpower_id=eq."+uuid.ec1+"&store_id=eq."+uuid.store1,
  {valid_to:"2020-01-02"});
 assert.equal((await rows("focus_model_ec_allocations",jwt.ec1)).length,0,
  "Expired store assignment must revoke EC allocation visibility");
 await patch("store_assignments","manpower_id=eq."+uuid.ec1+"&store_id=eq."+uuid.store1,
  {valid_to:null});

 ok(await assign(jwt.tl1,uuid.ec1,0,0),"TL removes EC1 allocation");
 ok(await assign(jwt.tl1,uuid.ec2,0,0),"TL removes EC2 allocation");
 assert.equal((await rows("focus_model_ec_allocations",jwt.tl1)).length,0);
 assert.ok((await rows("focus_model_allocation_history",jwt.tl1)).length>=4,
  "Create and delete must be audited");

 // Two separate HTTP transactions race; parent row lock permits only one.
 const racing=await Promise.all([assign(jwt.tl1,uuid.ec1,6,600),
  assign(jwt.tl1,uuid.ec2,6,600)]);
 assert.equal(racing.filter(v=>v.status===200).length,1,
  "Exactly one concurrent 6-unit allocation fits 10-unit parent budget");
 const finalRows=await rows("focus_model_ec_allocations",jwt.tl1);
 assert.equal(finalRows.reduce((x,r)=>x+Number(r.target_qty),0),6);
 assert.equal(finalRows.reduce((x,r)=>x+Number(r.target_amt),0),600);
 console.log("PASS LOCAL GoTrue/PostgREST Focus Model: Admin budget, TL scope, EC RLS, audit, rotation, store expiry, Qty/Amt caps and HTTP race");
}
run().catch(err=>{console.error(err.message);process.exitCode=1;});

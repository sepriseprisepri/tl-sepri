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

 const testDate=new Date().toISOString().slice(0,10);
 await post("raw_sellout",[
  {site_id:"S-01",model:"Galaxy A55",eula_status:"VALID",sold_at:testDate,qty:2,amt:200},
  {site_id:"S-01",model:"Galaxy A55",eula_status:"VALID",sold_at:testDate,qty:3,amt:300},
  {site_id:"S-01",model:"Galaxy A55",eula_status:"PENDING",sold_at:testDate,qty:9,amt:900},
  {site_id:"S-02",model:"Galaxy A55",eula_status:"VALID",sold_at:testDate,qty:20,amt:2000}]);
 const summary=token=>call("/rest/v1/rpc/focus_model_store_summary","POST",{p_period_id:uuid.period},headers(ANON,token));
 const [ec1,ec2,ec3,tl1,tl2,admin]=await Promise.all(['ec1','ec2','ec3','tl1','tl2','admin'].map(name=>summary(jwt[name])));
 for(const v of [ec1,ec2,ec3,tl1,tl2,admin])ok(v,"summary RPC");
 assert.equal(ec1.data.length,1);assert.deepEqual(ec1.data,ec2.data,"ECs in same store must see same total");
 assert.equal(Number(ec1.data[0].actual_qty),5);assert.equal(Number(ec1.data[0].actual_amt),500);
 assert.equal(ec3.data.length,0);assert.equal(tl2.data.length,0);assert.equal(tl1.data.length,1);
 assert.equal(admin.data.length,1);assert.equal((await rows("focus_model_targets",jwt.ec1)).length,0,"EC cannot read parent table directly");
 deny(await summary(ANON),"Anonymous summary");
 deny(await assign(jwt.tl1,uuid.ec1,1,100),"Legacy individual allocation is disabled");
 await patch("profiles","id=eq."+accounts.ec1.id,{must_change_password:true});
 deny(await summary(jwt.ec1),"Rotation guard");
 await patch("profiles","id=eq."+accounts.ec1.id,{must_change_password:false});
 await patch("store_assignments","manpower_id=eq."+uuid.ec1+"&store_id=eq."+uuid.store1,{valid_to:"2020-01-02"});
 assert.equal((await summary(jwt.ec1)).data.length,0,"Expired assignment hides store");
 console.log("PASS shared store summary with actual Auth and PostgREST");
}
run().catch(err=>{console.error(err.message);process.exitCode=1;});

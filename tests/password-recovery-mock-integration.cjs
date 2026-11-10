/* Isolated integration-style test: executes real Edge Function handler with
 * in-memory Supabase/Turnstile mocks. No cloud account or credential mutation. */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {stripTypeScriptTypes}=require("node:module");
const {webcrypto}=require("node:crypto");
const source=fs.readFileSync("supabase/functions/password-recovery/index.ts","utf8")
  .replace(/^import \{ createClient \} from .+;\s*/m,"");
const js=stripTypeScriptTypes(source,{mode:"strip"});
let handler=null,siteVerifyMode="reject",calls={rpc:0,insert:0,updatedPassword:0};
let authUser=null,callerProfile=null,requestedProfile=null,targetProfile=null,recoveryRequest=null;
const CALLER="11111111-1111-1111-1111-111111111111";
const TARGET="22222222-2222-2222-2222-222222222222";
function from(name){
 const filters={},state={payload:null};
 function data(){
  if(name==="profiles"){
   const id=filters.id;
   const selected=id===CALLER?callerProfile:id===TARGET?targetProfile:(requestedProfile||callerProfile);
   if(!selected)return null;
   if(filters.is_active!==undefined&&selected.is_active!==filters.is_active)return null;
   if(filters.must_change_password!==undefined&&selected.must_change_password!==filters.must_change_password)return null;
   return selected;
  }
  if(name==="password_recovery_requests"){
   if(!recoveryRequest)return null;
   if(filters.id&&recoveryRequest.id!==filters.id)return null;
   if(filters.user_id&&recoveryRequest.user_id!==filters.user_id)return null;
   if(filters.status&&recoveryRequest.status!==filters.status)return null;
   if(filters.status_in&&!filters.status_in.includes(recoveryRequest.status))return null;
   return recoveryRequest;
  }
  return null;
 }
 function commit(){
  const current=data();
  if(state.payload&&current){
   Object.assign(current,state.payload);
   return {data:{id:current.id},error:null};
  }
  if(state.payload)return {data:null,error:null};
  return {data:current,error:null};
 }
 return {
  select(){return this;},
  eq(key,value){filters[key]=value;return this;},
  gte(){return this;},order(){return this;},limit(){return this;},
  in(key,values){filters[key+"_in"]=values;return this;},
  update(payload){state.payload=payload;return this;},
  async maybeSingle(){return commit();},
  async insert(){calls.insert++;return {error:null};},
  then(resolve,reject){return Promise.resolve({data:state.payload?commit().data:(data()?[data()]:[]),error:null}).then(resolve,reject);}
 };
}
const admin={
 from,
 rpc:async(name)=>{assert.equal(name,"password_recovery_claim_rate");calls.rpc++;return {data:true,error:null};},
 auth:{admin:{
  getUserById:async()=>({data:{user:authUser},error:null}),
  updateUserById:async()=>{calls.updatedPassword++;return {error:null};}
 }}
};
const auth={auth:{getUser:async(token)=>["ok-token","user-token"].includes(token)
 ? {data:{user:{id:token==="ok-token"?CALLER:TARGET}},error:null}
 : {data:null,error:{message:"Invalid JWT"}}}};
const Deno={
 env:{get:key=>({
  SUPABASE_URL:"http://mock-supabase.invalid",
  SUPABASE_SERVICE_ROLE_KEY:"mock-server-only",
  SUPABASE_ANON_KEY:"mock-public",
  PASSWORD_RECOVERY_IP_SALT:"a".repeat(36),
  TURNSTILE_SECRET_KEY:"mock-turnstile-secret"
 })[key]},
 serve:fn=>{handler=fn;}
};
const context={Deno,createClient:(url,key)=>key==="mock-server-only"?admin:auth,
  crypto:webcrypto,Response,Request,URL,URLSearchParams,AbortController,TextEncoder,
  Uint8Array,Date,Set,Math,Array,String,Number,RegExp,Error,JSON,setTimeout,clearTimeout,
  fetch:async url=>({ok:true,json:async()=>({success:siteVerifyMode==="accept",hostname:"samsung-kalteng.vercel.app"})})};
vm.runInNewContext(js,context,{filename:"password-recovery.ts"});
assert.equal(typeof handler,"function");
async function call(payload,token){
 const req=new Request("https://example.invalid/functions/v1/password-recovery",{
  method:"POST",headers:{"content-type":"application/json","origin":"https://samsung-kalteng.vercel.app",
    ...(token?{authorization:"Bearer "+token}:{})},
  body:JSON.stringify(payload)
 });
 const res=await handler(req);
 return {status:res.status,body:await res.json()};
}
(async()=>{
 let result=await call({action:"request",employee_id:"032914",reason:"forgot"});
 assert.equal(result.status,400,"Missing CAPTCHA must fail closed");
 assert.equal(calls.rpc,0);
 result=await call({action:"request",employee_id:"032914",reason:"forgot",captcha_token:"x".repeat(50)});
 assert.equal(result.status,400,"Invalid CAPTCHA must fail closed");
 assert.equal(calls.rpc,0);
 siteVerifyMode="accept"; requestedProfile=null;callerProfile=null;
 result=await call({action:"request",employee_id:"032914",reason:"forgot",captcha_token:"x".repeat(50)});
 assert.equal(result.status,200);assert.equal(result.body.ok,true);
 assert.match(result.body.message,/Jika ID akun terdaftar/);
 assert.equal(calls.rpc,1);assert.equal(calls.insert,0);
 result=await call({action:"approve",request_id:"00000000-0000-0000-0000-000000000001"});
 assert.equal(result.status,401);
 result=await call({action:"approve",request_id:"00000000-0000-0000-0000-000000000001"},"bad-jwt");
 assert.equal(result.status,401);
 callerProfile={id:"11111111-1111-1111-1111-111111111111",role:"tl",is_active:true,must_change_password:false};
 result=await call({action:"approve",request_id:"00000000-0000-0000-0000-000000000001"},"ok-token");
 assert.equal(result.status,403,"Non-admin approval forbidden");
 assert.equal(calls.updatedPassword,0);
 // A failed reset can be reissued by Admin for a recovery-locked TL.
 callerProfile={id:CALLER,role:"admin",employee_id:"090994",is_active:true,must_change_password:false};
 targetProfile={id:TARGET,role:"tl",employee_id:"032914",is_active:false,must_change_password:true};
 authUser={id:TARGET,email:"032914@login.tlsepri.internal"};
 recoveryRequest={id:"33333333-3333-3333-3333-333333333333",user_id:TARGET,employee_id:"032914",role:"tl",status:"failed",expires_at:"2020-01-01T00:00:00Z"};
 result=await call({action:"reissue",request_id:recoveryRequest.id},"ok-token");
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.temporary_password.length,28);
 assert.equal(recoveryRequest.status,"awaiting_delivery");
 assert.ok(Date.parse(recoveryRequest.expires_at)>Date.now());
 assert.equal(calls.updatedPassword,1);
 // An expired temporary credential cannot be used to exit recovery.
 recoveryRequest.expires_at="2020-01-01T00:00:00Z";
 result=await call({action:"rotate",new_password:"PanjangPasswordBaru2026"},"user-token");
 assert.equal(result.status,410);
 assert.equal(targetProfile.is_active,false);
 assert.equal(calls.updatedPassword,1);
 // Reissue invalidates the prior temporary password and supplies a fresh window.
 result=await call({action:"reissue",request_id:recoveryRequest.id},"ok-token");
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(calls.updatedPassword,2);
 result=await call({action:"rotate",new_password:"PanjangPasswordBaru2026"},"user-token");
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(targetProfile.is_active,true);
 assert.equal(targetProfile.must_change_password,false);
 assert.equal(recoveryRequest.status,"completed");
 assert.equal(calls.updatedPassword,3);
 console.log("Mocked API handler PASS: CAPTCHA, JWT, Admin review, TL reissue, 24h expiry, mandatory rotation; zero real account changes.");
})().catch(err=>{console.error(err);process.exitCode=1;});

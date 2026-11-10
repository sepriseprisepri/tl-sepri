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
let authUser=null,callerProfile=null,requestedProfile=null;
function from(name){
 const table={
  select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},
  limit(){return this;},in(){return this;},
  async maybeSingle(){
   if(name==="profiles"){
    return {data:requestedProfile||callerProfile,error:null};
   }
   return {data:null,error:null};
  },
  async insert(){calls.insert++;return {error:null};},
 };
 return table;
}
const admin={
 from,
 rpc:async(name)=>{assert.equal(name,"password_recovery_claim_rate");calls.rpc++;return {data:true,error:null};},
 auth:{admin:{
  getUserById:async()=>({data:{user:authUser},error:null}),
  updateUserById:async()=>{calls.updatedPassword++;return {error:null};}
 }}
};
const auth={auth:{getUser:async(token)=>token==="ok-token"
 ? {data:{user:{id:"11111111-1111-1111-1111-111111111111"}},error:null}
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
  crypto:webcrypto,Response,Request,URLSearchParams,AbortController,TextEncoder,
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
 console.log("Mocked recovery API integration checks PASS: CAPTCHA, generic ID response, JWT, role guards; no real database used.");
})().catch(err=>{console.error(err);process.exitCode=1;});

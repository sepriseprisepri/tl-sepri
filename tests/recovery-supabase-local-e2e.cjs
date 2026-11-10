/* Real isolated Supabase local-stack E2E (GoTrue/Auth, PostgREST/RLS, Edge).
 * Requires API_URL, ANON_KEY, SERVICE_ROLE_KEY from 'supabase status -o env'.
 * Only run in disposable local environment; NEVER connect production.
 * Prints no password, token, secret, or user identifying information. */
"use strict";
const assert=require("node:assert/strict");
const BASE=process.env.API_URL;
const ANON=process.env.ANON_KEY;
const ADMIN=process.env.SERVICE_ROLE_KEY;
if(!BASE||!ANON||!ADMIN)throw Error("Local Supabase status env required");
if(!/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(BASE))
 throw Error("Unsafe target: this test runs ONLY against local 127.0.0.1:54321");
const authEndpoint=BASE+"/auth/v1";
const restEndpoint=BASE+"/rest/v1";
const fnEndpoint=BASE+"/functions/v1/password-recovery";
const origin="http://localhost:3000";
const tempPassword="OnlyLocalTemporary2026!A";
const finalPassword="OnlyLocalFinal2026!B";
const accounts={};
function baseHeaders(key=ANON,token=key){return {apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json"};}
async function request(url,method,body,headers){
 const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>null);
 if(response.status>=500)throw Error("HTTP "+response.status+" from local service "+new URL(url).pathname+": "+JSON.stringify(result?.message||result?.error||"internal server error"));
 return {status:response.status,result};
}
function expectResponse(v,status,subject){
 assert.equal(v.status,status,subject+": "+JSON.stringify({status:v.status,code:v.result?.code,error:v.result?.error}));
}
async function createUser(role,id){
 const email=id.toLowerCase()+"@login.tlsepri.internal";
 const user=await request(authEndpoint+"/admin/users","POST",{
   email,password:tempPassword,email_confirm:true,app_metadata:{role,employee_id:id}
 },baseHeaders(ADMIN));
 expectResponse(user,200,"admin create dummy "+role);
 assert.ok(user.result?.id);
 accounts[role]={id:user.result.id,employee_id:id,email};
 const p=await request(restEndpoint+"/profiles","POST",{
   id:user.result.id,email,employee_id:id,full_name:"Dummy "+role,
   role,is_active:true,must_change_password:false
 },{...baseHeaders(ADMIN),Prefer:"return=minimal"});
 assert.ok([201,200].includes(p.status),"dummy profile creation "+role+" "+p.status);
}
async function login(role,password=tempPassword){
 const record=accounts[role];
 const v=await request(authEndpoint+"/token?grant_type=password","POST",{
   email:record.email,password
 },baseHeaders());
 expectResponse(v,200,"GoTrue login "+role);
 assert.ok(v.result?.access_token);
 return v.result.access_token;
}
async function edge(action,data={},token=null){
 const body={action,...data};
 const v=await request(fnEndpoint,"POST",body,{
  ...baseHeaders(ANON,token||ANON),Origin:origin,
 });
 return v;
}
async function readBusiness(jwt){
 return request(restEndpoint+"/recovery_e2e_business_data?select=id", "GET",undefined,baseHeaders(ANON,jwt));
}
async function getProfile(role){
 const p=await request(restEndpoint+"/profiles?select=employee_id,is_active,must_change_password&employee_id=eq."+accounts[role].employee_id,
  "GET",undefined,baseHeaders(ADMIN));
 expectResponse(p,200,"profile check");
 assert.equal(p.result.length,1);
 return p.result[0];
}
async function updateRequest(uuid,data){
 const p=await request(restEndpoint+"/password_recovery_requests?id=eq."+uuid,"PATCH",data,{
  ...baseHeaders(ADMIN),Prefer:"return=minimal"
 });
 assert.equal(p.status,204,"local request update");
}
async function requests(){
 const response=await request(restEndpoint+"/password_recovery_requests?select=id,employee_id,status&order=created_at.desc",
 "GET",undefined,baseHeaders(ADMIN));
 expectResponse(response,200,"get local requests");
 return response.result;
}
async function run(){
 await createUser("admin","009991");
 await createUser("tl","432001");
 await createUser("ec","432002");
 const adminJwt=await login("admin");
 let tlJwt=await login("tl");
 const ecJwt=await login("ec");
 const before=await readBusiness(tlJwt);
 expectResponse(before,200,"market view TL before reset");
 assert.equal(before.result.length,1);
 const ecBusiness=await readBusiness(ecJwt);
 expectResponse(ecBusiness,200,"market view EC before reset");
 assert.equal(ecBusiness.result.length,1);

 // Real HTTP -> real Edge Function -> real Turnstile official dummy validation ->
 // real Postgres rate limit / auth.users lookup / request insert.
 const requestPayload={employee_id:"432001",reason:"forgot",captcha_token:"XXXX.DUMMY.TOKEN.XXXX"};
 const requested=await edge("request",requestPayload);
 expectResponse(requested,200,"request with official local Turnstile dummy credentials");
 assert.equal(requested.result?.ok,true);
 assert.ok((await requests()).some(x=>x.employee_id==="432001"&&x.status==="pending"));

 const listed=await edge("list",{},adminJwt);
 expectResponse(listed,200,"Admin list");
 const found=listed.result?.requests?.find(r=>r.employee_id==="432001");
 assert.ok(found?.id);
 const wrongRole=await edge("approve",{request_id:found.id},tlJwt);
 expectResponse(wrongRole,403,"TL must not approve");
 const approved=await edge("approve",{request_id:found.id},adminJwt);
 expectResponse(approved,200,"Admin approves real dummy account");
 assert.equal(approved.result?.temporary_password?.length,28);
 const onetimePassword=approved.result.temporary_password;
 assert.equal((await getProfile("tl")).must_change_password,true);
 assert.equal((await getProfile("tl")).is_active,false);

 // Previously issued JWT is still valid at Auth layer, but RLS denies data.
 const oldJwtBusiness=await readBusiness(tlJwt);
 expectResponse(oldJwtBusiness,200,"old TL JWT request after reset");
 assert.equal(oldJwtBusiness.result.length,0,"old JWT must not read protected data");
 tlJwt=await login("tl",onetimePassword);
 const tempJwtBusiness=await readBusiness(tlJwt);
 expectResponse(tempJwtBusiness,200,"temporary TL JWT data request");
 assert.equal(tempJwtBusiness.result.length,0,"temporary JWT must not read protected data");

 // Expiry applies to rotation even when the temporary login still works.
 await updateRequest(found.id,{expires_at:"2020-01-01T00:00:00Z"});
 const expired=await edge("rotate",{new_password:finalPassword},tlJwt);
 expectResponse(expired,410,"expired temporary password");
 assert.equal((await getProfile("tl")).must_change_password,true);
 const reissue=await edge("reissue",{request_id:found.id},adminJwt);
 expectResponse(reissue,200,"Admin reissue after expiry");
 assert.equal(reissue.result?.temporary_password?.length,28);
 assert.notEqual(onetimePassword,reissue.result.temporary_password);
 tlJwt=await login("tl",reissue.result.temporary_password);
 const rotated=await edge("rotate",{new_password:finalPassword},tlJwt);
 expectResponse(rotated,200,"mandatory TL rotate");
 const current=await getProfile("tl");
 assert.equal(current.is_active,true);
 assert.equal(current.must_change_password,false);
 const newJwt=await login("tl",finalPassword);
 const restored=await readBusiness(newJwt);
 expectResponse(restored,200,"after rotation");
 assert.equal(restored.result.length,1);

 // No-user existence disclosure: generic reply for unknown ID.
 const missing=await edge("request",{employee_id:"999991",reason:"forgot",captcha_token:"XXXX.DUMMY.TOKEN.XXXX"});
 expectResponse(missing,200,"unknown ID request");
 assert.equal(missing.result.message,requested.result.message);

 // Reissue of completed request must be rejected.
 const noReissue=await edge("reissue",{request_id:found.id},adminJwt);
 expectResponse(noReissue,409,"completed request reissue blocked");

 // EC also completes the complete reset workflow, not just initial login.
 const ecRequested=await edge("request",{employee_id:"432002",reason:"reset",captcha_token:"XXXX.DUMMY.TOKEN.XXXX"});
 expectResponse(ecRequested,200,"EC reset request");
 const ecQueue=await edge("list",{},adminJwt);
 expectResponse(ecQueue,200,"Admin EC queue");
 const ecRow=ecQueue.result?.requests?.find(x=>x.employee_id==="432002"&&x.status==="pending");
 assert.ok(ecRow?.id,"EC request must be visible to Admin");
 const ecApproved=await edge("approve",{request_id:ecRow.id},adminJwt);
 expectResponse(ecApproved,200,"EC approved reset");
 // Simulate a crashed Admin job. A fresh processing request must not be
 // reissued; an older than 15m one can be claimed exactly once.
 await updateRequest(ecRow.id,{status:"processing",approved_at:new Date().toISOString()});
 const tooSoon=await edge("reissue",{request_id:ecRow.id},adminJwt);
 expectResponse(tooSoon,409,"fresh processing cannot be stolen");
 await updateRequest(ecRow.id,{status:"processing",approved_at:new Date(Date.now()-20*60_000).toISOString()});
 const stuckRecovered=await edge("reissue",{request_id:ecRow.id},adminJwt);
 expectResponse(stuckRecovered,200,"stalled EC processing can be reissued");
 assert.equal(stuckRecovered.result?.temporary_password?.length,28);
 const ecOldData=await readBusiness(ecJwt);
 expectResponse(ecOldData,200,"stale EC token request");
 assert.equal(ecOldData.result.length,0,"stale EC token must lose market access");
 const ecTemporaryJwt=await login("ec",stuckRecovered.result.temporary_password);
 const ecTempData=await readBusiness(ecTemporaryJwt);
 expectResponse(ecTempData,200,"temporary EC token request");
 assert.equal(ecTempData.result.length,0,"EC must not read business data until rotation");
 const ecRotated=await edge("rotate",{new_password:"OnlyLocalNewEC2026!A"},ecTemporaryJwt);
 expectResponse(ecRotated,200,"mandatory EC rotate");
 const ecNewJwt=await login("ec","OnlyLocalNewEC2026!A");
 const ecRestored=await readBusiness(ecNewJwt);
 expectResponse(ecRestored,200,"EC new password data access");
 assert.equal(ecRestored.result.length,1);
 assert.equal((await getProfile("ec")).must_change_password,false);
 console.log("PASS real local Supabase: GoTrue TL+EC first-login, Admin approval, Turnstile, stale-JWT RLS, expiry/reissue, mandatory rotations.");

}
run().catch(err=>{console.error(err.message);process.exitCode=1;});

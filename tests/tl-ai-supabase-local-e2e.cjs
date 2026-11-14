'use strict';
// Real local GoTrue, PostgREST and PostgreSQL; model output simulated; no cloud credentials.
const assert=require('node:assert/strict');
const {handle}=require('../api/tl-ai-insight.js');
const API=process.env.API_URL,ANON=process.env.ANON_KEY,ADMIN=process.env.SERVICE_ROLE_KEY;
if(!API||!ANON||!ADMIN||!/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(API))throw Error('Only disposable local Supabase is permitted');
const store='22222222-2222-4222-8222-222222222222',outside='33333333-3333-4333-8333-333333333333',period='11111111-1111-4111-8111-111111111111';
const headers=(key,token=key)=>({apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'});
async function call(path,method='GET',body,head=headers(ANON)){const r=await fetch(API+path,{method,headers:head,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();const data=text?JSON.parse(text):null;assert.ok(r.ok,`${path} HTTP ${r.status}: ${data?.msg||data?.message||''}`);return data;}
async function createUser(role){const email=`tl-ai-${role}@local.test`,password='OnlyLocalPassword2026!A';const user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true},headers(ADMIN));await call('/rest/v1/profiles','POST',{id:user.id,role,is_active:true},headers(ADMIN));const token=await call('/auth/v1/token?grant_type=password','POST',{email,password});return {id:user.id,token:token.access_token};}
(async()=>{
 const tl=await createUser('tl'),ec=await createUser('ec');
 await call('/rest/v1/coverage_assignments','POST',{profile_id:tl.id,store_id:store,coverage_role:'tl',valid_from:'2020-01-01'},headers(ADMIN));
 const env={SUPABASE_URL:API,SUPABASE_ANON_KEY:ANON,CLOUDFLARE_ACCOUNT_ID:'abcdef0123456789abcdef0123456789',CLOUDFLARE_AI_TOKEN:'synthetic',AI_WORKERS_FREE_CONFIRMED:'true',AI_INSIGHT_ENABLED:'true'};
 let sent=[];const fetcher=(url,opts)=>{if(url.startsWith('https://api.cloudflare.com/')){sent.push(JSON.parse(opts.body));return Promise.resolve(new Response(JSON.stringify({success:true,result:{response:'Ringkasan data pilihan.'}}),{status:200}));}return fetch(url,opts);};
 const body={period_id:period,first:'2026-W44',second:'2026-W45',store_id:store};
 const run=(token,b=body)=>handle({method:'POST',headers:{authorization:'Bearer '+token},body:b},{env,fetcher,today:'2026-11-14'});
 let r=await run(tl.token);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.body.weeks.map(w=>[w.samsung,w.competitor]),[[5,2],[8,3]]);assert.doesNotMatch(JSON.stringify(sent),/999|S-04/);
 r=await run(tl.token,{...body,store_id:outside});assert.equal(r.status,403);assert.equal(sent.length,1);
 r=await run(ec.token);assert.equal(r.status,403);assert.equal(sent.length,1);
 for(let i=1;i<20;i++){r=await run(tl.token);assert.equal(r.status,200,JSON.stringify(r));}
 r=await run(tl.token);assert.equal(r.status,429);assert.equal(sent.length,20);
 console.log('PASS local GoTrue login, PostgREST fixture RLS, week totals, EC denial and real quota RPC; AI simulated');
})().catch(e=>{console.error(e);process.exitCode=1});

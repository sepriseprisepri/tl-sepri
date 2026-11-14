'use strict';
// Real PostgREST/PostgreSQL and JWT, with synthetic Auth and AI; never uses production.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {handle}=require('../api/tl-ai-insight.js');
const secret='integration-only-secret-32-chars-long-12345';
const sign=sub=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const v=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub,exp:Math.floor(Date.now()/1000)+300});return v+'.'+crypto.createHmac('sha256',secret).update(v).digest('base64url');};
const tl='22222222-2222-2222-2222-222222222222',ec='33333333-3333-3333-3333-333333333331';
const store='22222222-2222-4222-8222-222222222222',outside='33333333-3333-4333-8333-333333333333';
const period='11111111-1111-4111-8111-111111111111';
const base='http://synthetic-supabase.invalid';
const pgrst=process.env.POSTGREST_URL;if(!pgrst)throw Error('POSTGREST_URL is required');
const env={SUPABASE_URL:base,SUPABASE_ANON_KEY:'test-only',CLOUDFLARE_ACCOUNT_ID:'abcdef0123456789abcdef0123456789',CLOUDFLARE_AI_TOKEN:'test-only',AI_WORKERS_FREE_CONFIRMED:'true',AI_INSIGHT_ENABLED:'true'};
let sent=[];
const fetcher=async(url,opts={})=>{
 if(url===base+'/auth/v1/user'){let token=opts.headers.Authorization.split(' ')[1];let claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));return new Response(JSON.stringify({id:claims.sub}),{status:200});}
 if(url.startsWith(base+'/rest/v1/'))return fetch(pgrst+url.slice((base+'/rest/v1').length),opts);
 if(url.includes('/ai/run/')){sent.push(JSON.parse(opts.body));return new Response(JSON.stringify({success:true,result:{response:'Ringkasan berdasarkan data pilihan.'}}),{status:200});}
 throw Error('Unexpected destination');
};
const input={period_id:period,first:'2026-W44',second:'2026-W45',store_id:store};
const call=(user,body=input)=>handle({method:'POST',headers:{authorization:'Bearer '+sign(user)},body},{env,fetcher,today:'2026-11-14'});
(async()=>{
 let res=await call(tl);assert.equal(res.status,200,JSON.stringify(res));assert.deepEqual(res.body.weeks.map(w=>[w.samsung,w.competitor]),[[5,2],[8,3]]);
 assert.doesNotMatch(JSON.stringify(sent),/999|100|S-04/);
 let direct=await fetch(pgrst+'/stores?select=site_id',{headers:{Authorization:'Bearer '+sign(tl)}});assert.deepEqual((await direct.json()).map(s=>s.site_id),['S-03']);
 res=await call(tl,{...input,store_id:outside});assert.equal(res.status,403);assert.equal(sent.length,1);
 res=await call(ec);assert.equal(res.status,403);assert.equal(sent.length,1);
 for(let i=1;i<20;i++){res=await call(tl);assert.equal(res.status,200,`request ${i+1}: ${JSON.stringify(res)}`);}
 res=await call(tl);assert.equal(res.status,429);assert.equal(sent.length,20);
 console.log('PostgREST integration passed: signed JWT, RLS fixture, scope, totals, role, and real quota RPC (synthetic Auth/AI).');
})().catch(e=>{console.error(e);process.exitCode=1});

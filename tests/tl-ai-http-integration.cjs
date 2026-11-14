'use strict';
// Local HTTP integration: synthetic Supabase/Auth and Workers AI responses, no external services.
const http=require('node:http');
const assert=require('node:assert/strict');
const {handle}=require('../api/tl-ai-insight.js');
const period='11111111-1111-4111-8111-111111111111';
const a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const forbidden='44444444-4444-4444-8444-444444444444';
let calls=[],modelMode='ok',quota=true;
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
const stub=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let raw='';for await(const chunk of req)raw+=chunk;
  calls.push({path:url.pathname,auth:req.headers.authorization,body:raw});
  const role=req.headers.authorization==='Bearer tl-test'?'tl':req.headers.authorization==='Bearer ec-test'?'ec':null;
  if(url.pathname==='/ai'){if(modelMode==='error')return json(res,503,{});return json(res,200,{success:true,result:{response:modelMode==='unsafe'?'Pangsa pasar Samsung 73%.':'Data penjualan sesuai pilihan minggu.'}});}
  if(url.pathname==='/auth/v1/user')return role?json(res,200,{id:'55555555-5555-4555-8555-555555555555'}):json(res,401,{});
  if(!role)return json(res,401,{});
  if(url.pathname==='/rest/v1/profiles')return json(res,200,[{role,is_active:true}]);
  if(url.pathname==='/rest/v1/target_periods')return json(res,200,[{id:period,period_start:'2026-11-01',period_end:'2026-11-30'}]);
  if(url.pathname==='/rest/v1/stores')return json(res,200,[{id:a,site_id:'A'},{id:b,site_id:'B'}]);
  if(url.pathname==='/rest/v1/raw_sellout')return json(res,200,[{id:'1',site_id:'A',sold_at:'2026-11-01',qty:5,eula_status:'VALID'},{id:'2',site_id:'A',sold_at:'2026-11-03',qty:8,eula_status:'VALID'},{id:'3',site_id:'B',sold_at:'2026-11-03',qty:4,eula_status:'VALID'},{id:'4',site_id:'A',sold_at:'2026-11-03',qty:100,eula_status:'INVALID'},{id:'5',site_id:'X',sold_at:'2026-11-03',qty:999,eula_status:'VALID'}]);
  if(url.pathname==='/rest/v1/competitor_sellout')return json(res,200,[{id:'1',store_id:a,sold_at:'2026-11-01',qty:2},{id:'2',store_id:a,sold_at:'2026-11-03',qty:3},{id:'3',store_id:b,sold_at:'2026-11-03',qty:6},{id:'4',store_id:forbidden,sold_at:'2026-11-03',qty:999}]);
  if(url.pathname==='/rest/v1/rpc/claim_tl_ai_insight_quota')return json(res,200,quota);
  return json(res,404,{});
});
(async()=>{
 await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
 const root=`http://127.0.0.1:${stub.address().port}`;
 const env={SUPABASE_URL:root,SUPABASE_ANON_KEY:'test-key',CLOUDFLARE_ACCOUNT_ID:'abcdef0123456789abcdef0123456789',CLOUDFLARE_AI_TOKEN:'test-token',AI_WORKERS_FREE_CONFIRMED:'true',AI_INSIGHT_ENABLED:'true'};
 const fetcher=(url,opts)=>fetch(url.startsWith('https://api.cloudflare.com/')?root+'/ai':url,opts);
 const request=(body,token='tl-test')=>handle({method:'POST',headers:{authorization:'Bearer '+token},body},{env,fetcher,today:'2026-11-14'});
 const body={period_id:period,first:'2026-W44',second:'2026-W45',store_id:a};
 let result=await request(body);assert.equal(result.status,200);
 assert.deepEqual(result.body.weeks.map(w=>[w.samsung,w.competitor]),[[5,2],[8,3]]);
 let sent=JSON.parse(calls.find(x=>x.path==='/ai').body);let data=JSON.parse(sent.messages[1].content);
 assert.deepEqual(data.weeks.map(w=>[w.samsung,w.competitor]),[[5,2],[8,3]]);assert.doesNotMatch(JSON.stringify(data),/999|test-token|Bearer/);
 calls=[];result=await request({...body,store_id:null});assert.equal(result.status,200);assert.deepEqual(result.body.weeks.map(w=>[w.samsung,w.competitor]),[[5,2],[12,9]]);
 calls=[];result=await request({...body,first:'2026-W45',second:'2026-W44'});assert.equal(result.status,200);assert.deepEqual(result.body.weeks.map(w=>[w.samsung,w.competitor]),[[8,3],[5,2]]);
 calls=[];result=await request({...body,store_id:forbidden});assert.equal(result.status,403);assert.ok(!calls.some(c=>c.path==='/ai'));
 calls=[];result=await request(body,'ec-test');assert.equal(result.status,403);assert.ok(!calls.some(c=>c.path==='/ai'));
 calls=[];result=await request(body,'invalid');assert.equal(result.status,401);assert.ok(!calls.some(c=>c.path==='/ai'));
 quota=false;calls=[];result=await request(body);assert.equal(result.status,429);assert.ok(!calls.some(c=>c.path==='/ai'));quota=true;
 modelMode='error';result=await request(body);assert.equal(result.status,503);
 modelMode='unsafe';result=await request(body);assert.equal(result.status,503);
 console.log('HTTP integration passed: week/store totals, scoped data, roles, quota and AI failures (simulated services).');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>stub.close());

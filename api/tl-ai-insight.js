'use strict';
// Draft endpoint: remains disabled until configuration and the quota migration are approved.
const metrics=require('../tl-competitor-comparison.js');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const week=/^\d{4}-W\d{2}$/;
const fail=(status,error)=>({status,body:{error}});
async function handle(req,{env=process.env,fetcher=fetch,today}={}){
 if(req.method!=='POST')return fail(405,'Metode tidak diizinkan.');
 if(env.AI_INSIGHT_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.AI_GATEWAY_API_KEY)return fail(503,'Analisis AI belum diaktifkan.');
 const auth=req.headers?.authorization||'';if(!/^Bearer [^\s]+$/.test(auth))return fail(401,'Sesi tidak tersedia.');
 const input=req.body;if(!input||typeof input!=='object'||!uuid.test(input.period_id||'')||!week.test(input.first||'')||!week.test(input.second||'')||(input.store_id&&!uuid.test(input.store_id)))return fail(400,'Filter tidak valid.');
 const root=env.SUPABASE_URL.replace(/\/$/,'');const headers={apikey:env.SUPABASE_ANON_KEY,Authorization:auth};
 async function request(path,options={}){const r=await fetcher(root+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Supabase request failed');return r.json();}
 async function all(table,params){const out=[];for(let offset=0;offset<50000;offset+=1000){const q=new URLSearchParams({...params,order:'id.asc',limit:'1000',offset:String(offset)});const rows=await request('/rest/v1/'+table+'?'+q);if(!Array.isArray(rows))throw Error('Unexpected response');out.push(...rows);if(rows.length<1000)return out;}throw Error('Too many records');}
 try{
  const user=await request('/auth/v1/user');if(!user?.id)return fail(401,'Sesi tidak valid.');
  const profile=await request('/rest/v1/profiles?'+new URLSearchParams({select:'role,is_active',id:'eq.'+user.id,limit:'1'}));if(profile?.[0]?.role!=='tl'||profile[0].is_active!==true)return fail(403,'Akses hanya untuk TL aktif.');
  const periods=await request('/rest/v1/target_periods?'+new URLSearchParams({select:'id,period_start,period_end',id:'eq.'+input.period_id,limit:'1'}));const period=periods?.[0];if(!period)return fail(403,'Periode tidak tersedia.');
  if((Date.parse(period.period_end)-Date.parse(period.period_start))/86400000>62)return fail(400,'Rentang periode terlalu panjang.');
  const now=today||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Pontianak',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const available=metrics.weeks(period,now);if(!available.some(w=>w.key===input.first)||!available.some(w=>w.key===input.second))return fail(400,'Minggu di luar periode.');
  const stores=await all('stores',{select:'id,site_id'});const selected=input.store_id?stores.filter(s=>s.id===input.store_id):stores;if(input.store_id&&!selected.length)return fail(403,'Toko di luar coverage.');
  const end=available[available.length-1].end;
  // Duplicate sold_at predicates need an explicit PostgREST and expression.
  const filter={and:`(sold_at.gte.${period.period_start},sold_at.lte.${end})`};
  const [sales,competitor]=await Promise.all([all('raw_sellout',{...filter,select:'id,site_id,sold_at,qty,eula_status'}),all('competitor_sellout',{...filter,select:'id,store_id,sold_at,qty'})]);
  const rows=metrics.compare({weeks:available,first:input.first,second:input.second,stores:selected,sales,competitor});
  const summary=rows.map(({key,start,end,partial,samsung,competitor})=>({week:key,start,end,partial,samsung,competitor}));
  const allowed=await request('/rest/v1/rpc/claim_tl_ai_insight_quota',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(allowed!==true)return fail(429,'Batas analisis AI harian telah tercapai.');
  const r=await fetcher('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.AI_GATEWAY_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model:'openai/gpt-4.1-mini',temperature:0.2,max_tokens:350,messages:[{role:'system',content:'Anda analis penjualan. Jawab dalam Bahasa Indonesia maksimal 3 kalimat singkat. Hanya gunakan angka yang tersedia. Bedakan fakta dan saran, jangan mengarang penyebab atau pangsa pasar. Jika minggu parsial atau durasi berbeda, jangan simpulkan pertumbuhan adil. Data kompetitor hanya dari input EC. Jangan mengutip data pribadi.'},{role:'user',content:JSON.stringify({weeks:summary,scope:'coverage TL atau toko terpilih',competitor_data:'input EC; tidak mewakili seluruh pasar'})}]})});
  if(!r.ok)return fail(503,'Analisis AI sementara tidak tersedia.');const result=await r.json();const analysis=result?.choices?.[0]?.message?.content;if(typeof analysis!=='string'||!analysis.trim()||analysis.length>4000)return fail(503,'Jawaban AI tidak tersedia.');return {status:200,body:{analysis:analysis.trim(),weeks:summary}};
 }catch(e){return fail(503,'Analisis AI sementara tidak tersedia.');}
}
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store');const result=await handle(req);res.status(result.status).json(result.body);};
module.exports.handle=handle;

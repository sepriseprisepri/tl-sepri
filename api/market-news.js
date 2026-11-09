/* Curated, headline-only global smartphone news.
 * Fixed RSS allowlist, no arbitrary URL fetch, no stored personal information.
 * Existing Vercel Hobby project; no external paid API or secret credentials. */
"use strict";
const FEEDS=[
 {name:"Samsung Newsroom",url:"https://news.samsung.com/global/?feed=rss2",host:"news.samsung.com"},
 {name:"GSMArena",url:"https://www.gsmarena.com/rss-news-reviews.php3",host:"www.gsmarena.com"}
];
function decode(text){
 return String(text||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
  .replace(/<[^>]*>/g,"").trim();
}
function field(item,name){
 const m=item.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
 return m?decode(m[1]):"";
}
function parseFeed(xml,source,host){
 const entries=[];
 for(const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const item=match[1],title=field(item,"title"),link=field(item,"link"),published=field(item,"pubDate");
  if(!title||title.length>240||!link)continue;
  let url;try{url=new URL(link);}catch{continue}
  if(url.protocol!=="https:"||url.hostname!==host)continue;
  const time=Date.parse(published);
  entries.push({source,title,url:url.href,published:Number.isFinite(time)?new Date(time).toISOString():null});
  if(entries.length>=15)break;
 }
 return entries;
}
async function loadFeed(feed){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),6000);
 try{
  const response=await fetch(feed.url,{signal:ctrl.signal,headers:{Accept:"application/rss+xml, application/xml, text/xml"}});
  if(!response.ok)throw Error("RSS HTTP "+response.status);
  const raw=await response.text();
  if(raw.length>1500000)throw Error("RSS terlalu besar");
  return parseFeed(raw,feed.name,feed.host);
 }finally{clearTimeout(timeout)}
}
module.exports=async function handler(req,res){
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
 res.setHeader("Cache-Control","public, s-maxage=1800, stale-while-revalidate=3600");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 const results=await Promise.allSettled(FEEDS.map(loadFeed));
 const entries=results.flatMap(x=>x.status==="fulfilled"?x.value:[]);
 entries.sort((a,b)=>(b.published||"").localeCompare(a.published||""));
 return res.status(200).json({updated_at:new Date().toISOString(),articles:entries.slice(0,12),sources:FEEDS.map(x=>x.name),
  note:"Judul berita dari RSS penerbit asli; bukan data harga atau sellout Samsung."});
};
module.exports.parseFeed=parseFeed;

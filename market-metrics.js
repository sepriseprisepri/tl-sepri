/* Samsung Kalteng — shared, deterministic market metrics.
 * Requires RLS-scoped rows from existing Supabase queries. No network calls.
 * Dates are YYYY-MM-DD; UTC calendar arithmetic avoids device timezone drift.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.SamsungMarketMetrics=api;
})(typeof window!=="undefined"?window:null,function(){
"use strict";
const amount=x=>Number.isFinite(Number(x))?Number(x):0;
const iso=d=>new Date(d+"T12:00:00Z");
const shift=(d,days)=>{const v=iso(d);v.setUTCDate(v.getUTCDate()+days);return v.toISOString().slice(0,10);};
const span=(a,b)=>Math.max(0,Math.round((iso(b)-iso(a))/86400000)+1);
const clip=(day,start,end)=>day<start?start:day>end?end:day;
const localToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const weekStart=day=>shift(day,-((iso(day).getUTCDay()+6)%7));
const moneyFormat=x=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(x);
const qtyFormat=x=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Math.round(x));
// Display-only: EVERY Target Qty uses ceiling, never nearest-integer rounding.
const targetQtyFormat=x=>{
 // PostgREST gives numbers; also accept Indonesian example strings such as
 // "3.794,25" without misreading decimal commas as grouping separators.
 const normalized=typeof x==="string"&&x.includes(",")?
   Number(x.trim().replace(/\./g,"").replace(",", ".")):amount(x);
 const value=Number.isFinite(normalized)?normalized:0;
 return new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Math.ceil(value));
};
const percent=(n,d)=>d>0?n/d*100:null;

function completeWeeks(valid,start,end,asOf,metric){
 const last=end<asOf?end:asOf,rows=[];
 if(last<start)return rows;
 // Weeks must be complete within the chosen period and as-of date.
 for(let monday=weekStart(start);monday<=last;monday=shift(monday,7)){
  const sunday=shift(monday,6);
  if(monday<start||sunday>last)continue;
  rows.push({start:monday,end:sunday,total:valid.reduce((sum,s)=>
    s.sold_at>=monday&&s.sold_at<=sunday?sum+amount(s[metric]):sum,0)});
 }
 return rows;
}
function summarize({period,targets=[],sales=[],asOf=localToday()}){
 const start=period?.period_start||asOf,end=period?.period_end||asOf;
 const duration=span(start,end)||1;
 const elapsed=asOf<start?0:asOf>=end?duration:span(start,asOf);
 const effective=clip(asOf,start,end);
 const valid=sales.filter(s=>String(s.eula_status||"").toUpperCase()==="VALID"&&
  typeof s.sold_at==="string"&&s.sold_at>=start&&s.sold_at<=effective&&elapsed>0);
 const pending=sales.filter(s=>String(s.eula_status||"").toUpperCase()==="PENDING"&&
  typeof s.sold_at==="string"&&s.sold_at>=start&&s.sold_at<=effective&&elapsed>0);
 const targetQty=targets.reduce((v,t)=>v+amount(t.target_qty),0);
 const targetAmt=targets.reduce((v,t)=>v+amount(t.target_amt),0);
 const actualQty=valid.reduce((v,s)=>v+amount(s.qty),0);
 const actualAmt=valid.reduce((v,s)=>v+amount(s.amt),0);
 const remainingDays=asOf<start?duration:asOf>end?0:duration-elapsed+1;
 const weeks=completeWeeks(valid,start,end,asOf,"qty");
 const amtWeeks=completeWeeks(valid,start,end,asOf,"amt");
 const recent=weeks.length?weeks[weeks.length-1]:null;
 const previous=weeks.length>1?weeks[weeks.length-2]:null;
 const wowQty=previous&&recent&&previous.total>0?(recent.total-previous.total)/previous.total*100:null;
 const wowAmt=amtWeeks.length>=2&&amtWeeks[amtWeeks.length-2].total>0?
   (amtWeeks[amtWeeks.length-1].total-amtWeeks[amtWeeks.length-2].total)/amtWeeks[amtWeeks.length-2].total*100:null;
 return {
  start,end,asOf,elapsed,duration,remainingDays,effective,
  valid,pending,targetQty,targetAmt,actualQty,actualAmt,
  gapQty:targetQty-actualQty,gapAmt:targetAmt-actualAmt,
  mtdQty:targetQty*elapsed/duration,mtdAmt:targetAmt*elapsed/duration,
  mtdGapQty:targetQty*elapsed/duration-actualQty,
  mtdGapAmt:targetAmt*elapsed/duration-actualAmt,
  dailyQty:remainingDays>0?Math.max(0,targetQty-actualQty)/remainingDays:0,
  dailyAmt:remainingDays>0?Math.max(0,targetAmt-actualAmt)/remainingDays:0,
  achievementQty:percent(actualQty,targetQty),achievementAmt:percent(actualAmt,targetAmt),
  weekRows:weeks,wowQty,wowAmt,previousWeek:previous,lastWeek:recent,
  completeWeekCount:weeks.length
 };
}
function insights(m,role){
 const scope=role==="ec"?"penjualan pribadi EC":role==="tl"?"coverage TL":"cakupan akun";
 const insights=[];
 if(m.targetQty>0){
  insights.push({
   type:m.mtdGapQty>0?"warning":"positive",
   title:m.mtdGapQty>0?"Qty di bawah pace MTD":"Qty memenuhi pace MTD",
   body:"Target MTD "+targetQtyFormat(m.mtdQty)+" unit; pencapaian VALID "+qtyFormat(m.actualQty)+
     " unit. Selisih pace "+qtyFormat(m.mtdGapQty)+" unit pada "+scope+"."
  });
  if(m.remainingDays>0)insights.push({type:"recommendation",title:"Kebutuhan harian hingga akhir periode",
   body:"Perlu rata-rata "+targetQtyFormat(m.dailyQty)+" unit dan "+moneyFormat(Math.ceil(m.dailyAmt))+
   " per hari dalam "+m.remainingDays+" hari kalender tersisa (termasuk hari ini)."});
 }else insights.push({type:"info",title:"Target belum tersedia",
  body:"Belum ada target pada periode dan cakupan akun ini. Hindari menyimpulkan performa buruk."});
 if(m.wowQty!==null){
  const change=(m.wowQty>=0?"+":"")+m.wowQty.toFixed(1)+"%";
  insights.push({type:m.wowQty<0?"warning":"positive",title:"Perubahan Sellout week-to-week",
   body:"Dua minggu kalender lengkap: "+qtyFormat(m.previousWeek.total)+" → "+
     qtyFormat(m.lastWeek.total)+" unit, perubahan "+change+
     ". Minggu berjalan yang belum lengkap tidak dibandingkan."});
 }else insights.push({type:"info",title:"Growth WoW belum dapat dihitung adil",
   body:"Diperlukan dua minggu kalender lengkap dalam periode dan penjualan pada minggu pembanding. Minggu berjalan tidak disamakan dengan minggu penuh."});
 if(m.pending.length)insights.push({type:"warning",title:"EULA perlu ditindaklanjuti",
  body:m.pending.length+" transaksi PENDING tidak dimasukkan ke pencapaian VALID."});
 return insights;
}
return Object.freeze({summarize,insights,weekStart,completeWeeks,localToday,qtyFormat,targetQtyFormat,moneyFormat});
});

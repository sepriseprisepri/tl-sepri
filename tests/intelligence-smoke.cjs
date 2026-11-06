/* Samsung Kalteng — no-network tests for intelligence and verified promotions.
   Run: node tests/intelligence-smoke.cjs */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const files=["sales-intelligence.js","promo-center.js","user-experience.js","index.html","sales-intelligence.css"];
files.forEach(path=>assert.ok(fs.existsSync(path),"Missing "+path));
const window={};
const context={window,console,Intl,Date,URL,Map,Set,Number,String,Math,Object,Array};
for(const file of files.filter(path=>path.endsWith(".js"))){
 const code=fs.readFileSync(file,"utf8");
 vm.runInNewContext(code,context,{filename:file});
}
const html=fs.readFileSync("index.html","utf8");
for(const script of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)){
 if(script[1].trim())new vm.Script(script[1],{filename:"index.inline.js"});
}
for(const js of ["sales-intelligence.js","promo-center.js","user-experience.js"]){
 assert.match(html,new RegExp('src="/'+js.replace(".","\\.")+'"'));
}
assert.match(html, /href="\/sales-intelligence\.css"/);
for(const id of ["intel-dashboard","global-search","global-search-results","density-toggle","import-hub-container"]){
 assert.equal((html.match(new RegExp('id="'+id+'"',"g"))||[]).length,1,"ID "+id);
}
for(const label of ["Smart Alerts","Grafik Sellout","Promo"]){
 assert.ok(html.includes('["'+label+'"'),"Menu missing "+label);
}
assert.match(html, /window\.PromoCenter\.render/);
assert.match(html, /window\.SalesIntelligence\.renderCharts/);
assert.match(html, /window\.SalesIntelligence\.renderAlerts/);
assert.match(html, /window\.UserPrefs\.attachOpsSearch/);
assert.match(html, /window\.UserPrefs\.init/);
assert.match(html, /lastSalesData=\{period,stores,manpower,targets,sales\}/);
assert.doesNotMatch(fs.readFileSync("user-experience.js","utf8"),/service_role|localStorage/);
assert.doesNotMatch(fs.readFileSync("sales-intelligence.js","utf8"),/service_role/);

const {analytics,weekKey,modelNorm}=window.SalesIntelligence;
assert.equal(modelNorm("  Galaxy  A07  "), "GALAXY A07");
assert.equal(weekKey("2026-11-02"),"2026-W45");
const data={
 profile:{role:"tl"},
 period:{id:"nov",period_start:"2026-11-01",period_end:"2026-11-30",period_name:"November 2026"},
 stores:[{id:"s1",site_id:"S1",site_name:"Toko A"},{id:"s2",site_id:"S2",site_name:"Toko B"}],
 manpower:[],
 targets:[{store_id:"s1",target_qty:40,target_amt:60000000}],
 sales:[
  {site_id:"S1",model:"Galaxy A07",qty:2,amt:5000000,eula_status:"VALID",sold_at:"2026-11-05",promoter_mapping_status:"EC_ACTIVE"},
  {site_id:"S1",model:"Galaxy A07",qty:3,amt:7500000,eula_status:"PENDING",sold_at:"2026-11-05",promoter_mapping_status:"UNMAPPED"},
  {site_id:"S2",model:"Galaxy A16",qty:1,amt:3200000,eula_status:"VALID",sold_at:"2026-11-05",promoter_mapping_status:"EC_ACTIVE"}
 ],
 promos:[{model_code:"*",published:true,verification_state:"verified",start_date:"2020-01-01",end_date:"2100-12-31"}]
};
const m=analytics.compute(data);
assert.equal(m.good.length,2);
assert.equal(m.pending.length,1);
assert.equal(m.unmapped.length,1);
assert.equal(m.missing.length,1);
assert.equal(m.actualQty,3);
assert.equal(m.targetQty,40);
assert.equal(m.models[0].model,"GALAXY A07");
assert.ok(m.alerts.some(x=>x.id==="pending"));
assert.ok(m.alerts.some(x=>x.id==="mapping"));
assert.ok(m.alerts.some(x=>x.id==="target"));
const insights=analytics.insights(data,"tl");
assert.ok(insights.some(x=>x.title.includes("Belum ada promo model-spesifik")));
assert.ok(insights.some(x=>x.body.includes("PENDING")));
const ec=analytics.compute({...data,profile:{role:"ec"}});
assert.equal(ec.missing.length,0,"EC must not receive store target-missing alerts");

assert.equal(window.PromoCenter.allowedUrl("https://www.samsung.com/id/offer/black-friday/"),true);
assert.equal(window.PromoCenter.allowedUrl("https://news.samsung.com/id/official"),true);
for(const invalid of ["javascript:alert(1)","http://www.samsung.com/id/offer",
 "https://www.samsung.com.evil.example/id/offer/","https://evil.example/id/offer/"]){
 assert.equal(window.PromoCenter.allowedUrl(invalid),false,invalid);
}
const promo={
 published:true,verification_state:"verified",start_date:"2020-01-01",end_date:"2100-12-31",
 model_code:"GALAXY A07",model_name:"Galaxy A07",benefit:"Promo teruji"
};
assert.equal(window.PromoCenter.state(promo),"active");
assert.equal(window.PromoCenter.state({...promo,start_date:"2090-01-01",end_date:"2099-12-31"}),"upcoming");
assert.equal(window.PromoCenter.state({...promo,start_date:"2020-01-01",end_date:"2020-12-31"}),"expired");
assert.equal(window.PromoCenter.state({...promo,published:false}),"draft");
assert.equal(window.PromoCenter.norm(" Galaxy  A07 "),"GALAXY A07");
assert.equal(typeof window.UserPrefs.savedFilterControls,"function");
assert.equal(typeof window.UserPrefs.attachOpsSearch,"function");
assert.equal(typeof window.UserPrefs.toggleDensity,"function");

const sql=fs.readFileSync("docs/sql/sales-intelligence-promotions-20261106.sql","utf8");
for(const table of ["sales_promotions","sales_promotion_stores","user_saved_filters","user_ui_preferences"]){
 assert.ok(sql.includes("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY"));
}
assert.ok(sql.includes("sales_promos_read_verified"));
assert.ok(sql.includes("public.can_access_store(pst.store_id)"));
assert.ok(sql.includes("sales_promotions_verified_publication"));
assert.ok(sql.includes("user_id=(SELECT auth.uid())"));
console.log("Intelligence regression passed: routes, role-scope mock, promo verification, safe URLs, RLS and UX hooks.");

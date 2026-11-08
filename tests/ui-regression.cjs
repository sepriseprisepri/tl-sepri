/* Samsung Kalteng visual upgrade regression.
 * Static checks deliberately avoid credentials, network and production sessions.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("futuristic-ui.css","utf8");

function hasId(id){return html.includes('id="'+id+'"');}
const idSet=[
  "login-view","login-form","employee-id","password","password-visibility","login-button","login-error",
  "password-rotation-view","rotate-form","rotate-new","rotate-confirm","rotate-submit",
  "app-view","mobile-menu","nav-list","nav-wrap","page-title","user-avatar","user-name","user-role",
  "dashboard-content","period-select","refresh-button","sync-status","quick-actions",
  "kpi-stores","kpi-target-qty","kpi-actual-qty","kpi-actual-amt","kpi-qty-progress",
  "qty-progress-fill","qty-progress-track","amt-progress-fill","amt-progress-track",
  "daily-chart","segment-chart","store-table","section-placeholder","import-hub-container",
  "login-card-title"
];
for(const id of idSet){
  assert.ok(hasId(id),"Missing mandatory element #"+id);
  const n=(html.match(new RegExp('id="'+id+'"',"g"))||[]).length;
  assert.equal(n,1,"Duplicate #"+id);
}
assert.match(html, /<main id="login-view" class="login-stage/);
assert.doesNotMatch(html, /<main id="login-view"[^>]*lg:grid-cols-2/);
assert.match(html,/class="login-shell"/);
assert.match(html,/id="login-form" class="login-glass"/);
assert.match(html,/class="login-orbit login-orbit--one"/);
assert.match(html,/class="login-orbit login-orbit--two"/);
assert.match(html,/<link rel="stylesheet" href="\/futuristic-ui\.css">/);
assert.match(html,/Rajdhani/);
assert.match(html,/Space\+Grotesk/);
assert.match(css,/#login-view \.login-glass\s*\{/);
assert.match(css,/\.dashboard-intro/);
assert.match(css,/#app-view \.metric/);
assert.match(css,/@media \(max-width:1023px\)/);
assert.match(css,/@media \(max-width:639px\)/);
assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
assert.match(css,/:focus-visible/);
assert.match(html,/aria-label="Buka menu navigasi"/);
assert.match(html,/aria-controls="password"/);
assert.match(html,/aria-label="Pencapaian Qty"/);
assert.match(html,/aria-label="Pencapaian Amount"/);
assert.match(html,/setAttribute\("aria-expanded"/);
assert.match(html,/function menuIcon/);
assert.match(html,/function renderQuickActions|const quickLabels=/);
assert.match(html,/timeZone:"Asia\/Pontianak"/);

for(const match of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)){
  if(match[1].trim())new vm.Script(match[1],{filename:"index.inline.js"});
}
assert.match(html, /client\.auth\.signInWithPassword/);
assert.match(html, /async function enterApp/);
assert.match(html, /function renderBmuActivation/);
assert.match(html, /getLoginProfile\(user,token/);
assert.match(html, /\/rest\/v1\/profiles\?select=/);
assert.match(html, /Authorization:"Bearer "\+token/);
assert.match(html, /window\.SamsungOps\.render/);
assert.match(html, /<script src="\/ops-modules\.js"><\/script>/);
assert.match(html, /<script src="\/master-import\.js"><\/script>/);
assert.match(html, /<script src="\/raw-import\.js"><\/script>/);
assert.doesNotMatch(html, /service_role/);
assert.doesNotMatch(css, /http:\/\/[^\s]+\.svg/);
console.log("Visual UI regression passed: "+idSet.length+" IDs + centered login, focus, responsiveness, layout and auth hooks");
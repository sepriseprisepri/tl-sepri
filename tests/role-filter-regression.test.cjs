/* Samsung Kalteng role-scoped filter regression
 * Execute with: node --test tests/filter-regression.test.cjs tests/role-filter-regression.test.cjs
 * Uses in-memory data only; never connects to Supabase.
 */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const menuStart=html.indexOf('const menus=');
const menuEnd=html.indexOf('\nlet currentProfile=',menuStart);
assert.ok(menuStart>0&&menuEnd>menuStart,'Navigation menu source must be present');
const menus=new Function(html.slice(menuStart,menuEnd)+'\nreturn menus;')();
const roleNames=['admin','tl','tso','ec'];
const roleMenus=Object.fromEntries(roleNames.map(role=>[role,menus[role].map(([name])=>name)]));

const domWindow={
 SamsungMarketMetrics:{targetQtyFormat:v=>String(v)},
};
new Function('window',fs.readFileSync(path.join(root,'ops-modules.js'),'utf8'))(domWindow);
new Function('window',fs.readFileSync(path.join(root,'sales-intelligence.js'),'utf8'))(domWindow);
const {filterTableRows}=domWindow.SamsungOps;
const {roleSearchTarget}=domWindow.SalesIntelligence;

test('each authorized role receives dedicated role-scoped modules',()=>{
 for(const role of roleNames){
  assert.ok(roleMenus[role].includes('Dashboard'));
  assert.ok(roleMenus[role].includes('Grafik Sellout'));
  assert.ok(roleMenus[role].includes('Promo'));
  assert.ok(roleMenus[role].includes('Smart Alerts'));
 }
 assert.ok(roleMenus.admin.includes('Target'));
 assert.ok(roleMenus.admin.includes('RAW Sellout'));
 assert.ok(!roleMenus.admin.includes('Input Competitor'));
 assert.ok(roleMenus.tl.includes('Samsung vs Competitor'));
 assert.ok(roleMenus.tl.includes('Performa EC'));
 assert.ok(!roleMenus.tl.includes('Data & Import'));
 assert.ok(roleMenus.tso.includes('Coverage'));
 assert.ok(!roleMenus.tso.includes('Survey')); // RLS currently does not authorize TSO survey reports.
 assert.ok(!roleMenus.tso.includes('Samsung vs Competitor'));
 assert.ok(roleMenus.ec.includes('Target Saya'));
 assert.ok(roleMenus.ec.includes('Input Competitor'));
 assert.ok(!roleMenus.ec.includes('RAW Sellout'));
});

test('global search routes only to allowed modules for all four roles',()=>{
 for(const role of roleNames){
  const allowed=roleMenus[role];
  const store=roleSearchTarget(role,'Store',allowed);
  const model=roleSearchTarget(role,'Model',allowed);
  const promo=roleSearchTarget(role,'Promo',allowed);
  assert.ok(allowed.includes(store));
  assert.ok(allowed.includes(model));
  assert.equal(promo,'Promo');
  assert.equal(roleSearchTarget(role,'Unknown',allowed),null);
  assert.equal(roleSearchTarget(role,'Model',['Dashboard']),null);
 }
 assert.equal(roleSearchTarget('tl','Promoter',roleMenus.tl),'Performa EC');
 assert.equal(roleSearchTarget('tso','Promoter',roleMenus.tso),'RAW Sellout');
 assert.equal(roleSearchTarget('ec','Promoter',roleMenus.ec),null);
 assert.equal(roleSearchTarget('admin','Store',roleMenus.admin),'Target');
 assert.equal(roleSearchTarget('ec','Store',roleMenus.ec),'Target Saya');
});

test('faceted filters compose search, store, model and status without exposing extra rows',()=>{
 const entries=[
  {columns:['2026-11-20','Pusat Ponsel','S1','Galaxy A57','VALID']},
  {columns:['2026-11-20','Pusat Ponsel','S1','Galaxy A57','PENDING']},
  {columns:['2026-11-21','Toko B','S2','Galaxy S26','VALID']},
  {columns:['2026-11-21','Toko C','S3','Galaxy A57','VALID']}
 ];
 assert.equal(filterTableRows(entries).length,4);
 assert.equal(filterTableRows(entries,'galaxy a57').length,3);
 assert.deepEqual(filterTableRows(entries,'',{1:'Pusat Ponsel',3:'Galaxy A57',4:'VALID'}).map(r=>r.columns[2]),['S1']);
 assert.equal(filterTableRows(entries,'s26',{1:'Pusat Ponsel'}).length,0);
 assert.equal(filterTableRows(entries,'',{4:'PENDING'}).length,1);
 assert.equal(filterTableRows(entries,'Toko C',{3:'Galaxy A57'}).length,1);
 assert.equal(filterTableRows(entries,'unknown').length,0);
});

test('operational modules attach full-table facet presets and keep exported CSV filtered',()=>{
 const ops=fs.readFileSync(path.join(root,'ops-modules.js'),'utf8');
 const ux=fs.readFileSync(path.join(root,'user-experience.js'),'utf8');
 assert.match(ops,/data-filter-col/);
 assert.match(ops,/filterTableRows\(entries,search.value,selected\)/);
 assert.match(ops,/filtered\.map\(entry=>entry\.columns\)/);
 assert.match(ux,/facets:facetInputs\.map/);
 assert.match(ux,/input\.dispatchEvent\(new Event\("change"/);
 assert.match(ux,/Reset semua filter tabel/);
 assert.match(html,/navigationId===navigationSerial/);
});

test('role permission checks are applied to direct and alert navigation',()=>{
 const insights=fs.readFileSync(path.join(root,'sales-intelligence.js'),'utf8');
 assert.match(html,/if\(!allowed\.has\(label\)\)/);
 assert.match(insights,/allowed\.has\(item\.target\)/);
 assert.match(insights,/roleSearchTarget\(role,group,c\.allowedSections/);
 assert.match(insights,/action\.disabled=true/);
});

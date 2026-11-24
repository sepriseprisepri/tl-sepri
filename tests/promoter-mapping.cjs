const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('raw-import.js','utf8');
const context={window:{}};
vm.createContext(context);
vm.runInContext(src.replace('  function date(v) {','  window.classifyPromoter=classifyPromoter;\n  function date(v) {'),context);
const classify=context.window.classifyPromoter;
const people=[
{promoter_id:'EC1',fieldforce_position:'EC',is_active:true},
{promoter_id:'EC2',fieldforce_position:'EC',is_active:false},
{promoter_id:'TL1',fieldforce_position:'TERRITORY LEADER',is_active:true},
{promoter_id:'TL2',fieldforce_position:'TL',is_active:false},
{promoter_id:'DUP',fieldforce_position:'EC',is_active:true},
{promoter_id:'DUP',fieldforce_position:'TL',is_active:true}];
for(const [id,status] of [[' ec1 ','EC_ACTIVE'],['EC2','EC_INACTIVE'],['TL1','TL_ACTIVE'],['TL2','TL_INACTIVE'],['SP-1','STORE_SHADOW'],['DUP','UNMAPPED'],['','UNMAPPED'],['UNKNOWN','UNMAPPED']]) assert.equal(classify(id,'',people),status);
assert.match(src,/promoter_mapping_status:mapping/);
console.log('Promoter mapping regression PASS');

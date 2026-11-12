"use strict";
const assert=require("node:assert/strict");
const API=process.env.API_URL,ANON=process.env.ANON_KEY,ADMIN=process.env.SERVICE_ROLE_KEY;
if(!API||!ANON||!ADMIN||!/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(API))
 throw Error("Test only runs on disposable local Supabase");
const store="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const ec1="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",ec2="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const password="OnlyLocalPassword2026!A";
function headers(key,token=key,prefer=""){return {apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",...(prefer?{Prefer:prefer}:{})};}
async function call(path,method="GET",body,head=headers(ANON)){
 const r=await fetch(API+path,{method,headers:head,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{data=text;}
 return {status:r.status,data};
}
function ok(r,label){assert.ok(r.status>=200&&r.status<300,label+": "+r.status+" "+JSON.stringify(r.data));}
function deny(r,label){assert.ok(r.status>=400&&r.status<500,label+": "+r.status);}
async function admin(table,data){const r=await call("/rest/v1/"+table,"POST",data,headers(ADMIN,ADMIN,"return=minimal"));ok(r,"seed");}
async function user(name,manpower){
 const email="competitor-"+name+"@local.test";
 const u=await call("/auth/v1/admin/users","POST",{email,password,email_confirm:true},headers(ADMIN));ok(u,"create user");
 await admin("profiles",{id:u.data.id,role:"ec",manpower_id:manpower,is_active:true,must_change_password:false});
 const token=await call("/auth/v1/token?grant_type=password","POST",{email,password},headers(ANON));ok(token,"login");
 return {id:u.data.id,token:token.data.access_token};
}
async function run(){
 const a=await user("one",ec1), b=await user("two",ec2);
 const data={ec_profile_id:a.id,store_id:store,sold_at:today,brand:"Apple",model:"iPhone",variant:"128",qty:1,unit_price:100,notes:"",entry_key:"55555555-5555-5555-5555-555555555551"};
 const write=(t,method,path,body)=>call("/rest/v1/competitor_sellout"+path,method,body,headers(ANON,t,"return=representation"));
 deny(await write(a.token,"POST","",{...data,created_at:new Date(Date.now()+86400000).toISOString()}),"forged creation time");
 const inserted=await write(a.token,"POST","",data);ok(inserted,"insert own");
 const id=inserted.data[0].id, filter="?id=eq."+id;
 let r=await write(b.token,"PATCH",filter,{qty:9});ok(r,"other user patch");assert.equal(r.data.length,0);
 r=await write(a.token,"PATCH",filter,{qty:2});ok(r,"own patch");assert.equal(r.data.length,1);
 deny(await write(a.token,"PATCH",filter,{store_id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"}),"store change");
 r=await write(b.token,"DELETE",filter);ok(r,"other user delete");assert.equal(r.data.length,0);
 r=await write(a.token,"DELETE",filter);ok(r,"own delete");assert.equal(r.data.length,1);
 r=await call("/rest/v1/competitor_correction_history?select=action","GET",undefined,headers(ANON,a.token));ok(r,"audit");assert.deepEqual(r.data.map(x=>x.action).sort(),["delete","update"]);
 const seed=await call("/rest/v1/competitor_sellout","POST",[
  {...data,entry_key:"55555555-5555-5555-5555-555555555552",created_at:new Date(Date.now()-172800000).toISOString()},
  {...data,entry_key:"55555555-5555-5555-5555-555555555553"}
 ],headers(ADMIN,ADMIN,"return=representation"));ok(seed,"seed old and current entries");
 const old="?id=eq."+seed.data[0].id,current="?id=eq."+seed.data[1].id;
 r=await write(a.token,"PATCH",old,{qty:3});ok(r,"old entry patch");assert.equal(r.data.length,0);
 r=await write(a.token,"DELETE",old);ok(r,"old entry delete");assert.equal(r.data.length,0);
 r=await call("/rest/v1/profiles?id=eq."+a.id,"PATCH",{must_change_password:true},headers(ADMIN,ADMIN,"return=minimal"));ok(r,"require password rotation");
 r=await write(a.token,"DELETE",current);ok(r,"rotation gated delete");assert.equal(r.data.length,0);
 r=await call("/rest/v1/profiles?id=eq."+a.id,"PATCH",{must_change_password:false},headers(ADMIN,ADMIN,"return=minimal"));ok(r,"clear rotation gate");
 r=await call("/rest/v1/store_assignments?manpower_id=eq."+ec1,"PATCH",{valid_to:"2020-01-02"},headers(ADMIN,ADMIN,"return=minimal"));ok(r,"expire assignment");
 r=await write(a.token,"PATCH",current,{qty:3});ok(r,"expired assignment patch");assert.equal(r.data.length,0);
 r=await write(a.token,"DELETE",current);ok(r,"expired assignment delete");assert.equal(r.data.length,0);
 console.log("PASS competitor correction with local Auth and PostgREST");
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});

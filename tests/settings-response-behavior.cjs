"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("account-settings.js","utf8").replace(/\}\)\(\);\s*$/, "window.testRest=rest;})();");
const sandbox={window:{},AbortController,setTimeout,clearTimeout,Intl,Date,URLSearchParams,console};
vm.runInNewContext(source,sandbox);
const ctx={apiUrl:"https://example.invalid",accessToken:"test",publishableKey:"test"};
async function run(){
 sandbox.fetch=async()=>({ok:true,status:201,json:async()=>{throw new SyntaxError("empty JSON");},text:async()=>""});
 assert.equal(await sandbox.window.testRest(ctx,"/test",{method:"POST",payload:{x:1}}),null,"empty successful write must succeed");
 sandbox.fetch=async()=>({ok:true,status:204});
 assert.equal(await sandbox.window.testRest(ctx,"/test",{method:"POST",payload:{x:1}}),null);
 sandbox.fetch=async()=>({ok:true,status:200,json:async()=>[{x:1}],text:async()=>"[{\"x\":1}]"});
 assert.equal((await sandbox.window.testRest(ctx,"/test"))[0].x,1);
 sandbox.fetch=async()=>({ok:false,status:401});
 await assert.rejects(sandbox.window.testRest(ctx,"/test"),/kedaluwarsa/);
 console.log("PASS settings empty write and read behavior");
}
run().catch(e=>{console.error(e);process.exitCode=1;});

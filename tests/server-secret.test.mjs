import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server: the Secret shows why it cannot build yet, and never starts without a confirm and a Gemini key',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-sec-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});
 const run={id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'',videoUrl:''}],events:[]};
 await writeFile(join(root,'runs','run1.json'),JSON.stringify(run));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;
  const status=await (await fetch(`${base}/api/runs/run1/secret`)).json();assert.equal(status.state,'none');assert.match(status.plan.error,/at least 8/);
  const {token,connections}=await (await fetch(`${base}/api/bootstrap`)).json();assert.equal(connections.gemini.configured,false);
  const post=body=>fetch(`${base}/api/runs/run1/secret`,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const noConfirm=await post({});assert.equal(noConfirm.status,400);assert.match((await noConfirm.json()).error,/Confirm the cost/);
  const noKey=await post({confirm:true});assert.equal(noKey.status,400);assert.match((await noKey.json()).error,/Gemini key/);
  assert.equal((await fetch(`${base}/api/runs/run1/secret`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"confirm":true}'})).status,403);
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

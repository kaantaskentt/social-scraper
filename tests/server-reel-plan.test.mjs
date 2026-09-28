import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server: the reel plan needs a confirm, a Secret and keys, and says so',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-rp-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});await writeFile(join(root,'runs','run1.json'),JSON.stringify({id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',posts:[],events:[]}));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;assert.equal((await (await fetch(`${base}/api/runs/run1/reel-plan`)).json()).state,'none');
  const {token}=await (await fetch(`${base}/api/bootstrap`)).json();
  const post=(p,b)=>fetch(`${base}/api/runs/run1/reel-plan/${p}`,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(b)});
  assert.match((await (await post('ideas',{})).json()).error,/Confirm first/);
  assert.match((await (await post('ideas',{confirm:true})).json()).error,/Build the Secret/);
  assert.equal((await fetch(`${base}/api/runs/run1/reel-plan/ideas`,{method:'POST',body:'{"confirm":true}'})).status,403);
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

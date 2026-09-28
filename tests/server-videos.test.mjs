import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server streams saved videos with seeking, reports them, and deletes only videos',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-v-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});await mkdir(join(root,'videos','run1'),{recursive:true});
 const run={id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'',videoUrl:''}],events:[]};
 await writeFile(join(root,'runs','run1.json'),JSON.stringify(run));await writeFile(join(root,'videos','run1','a.mp4'),'0123456789');
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;
  const part=await fetch(`${base}/videos/run1/a`,{headers:{Range:'bytes=2-5'}});assert.equal(part.status,206);assert.equal(await part.text(),'2345');assert.equal(part.headers.get('content-range'),'bytes 2-5/10');
  const whole=await fetch(`${base}/videos/run1/a`);assert.equal(whole.status,200);assert.equal(whole.headers.get('accept-ranges'),'bytes');assert.equal(await whole.text(),'0123456789');
  assert.equal((await fetch(`${base}/videos/run1/a`,{headers:{Range:'bytes=50-'}})).status,416);
  assert.equal((await fetch(`${base}/videos/run1/..%2Frun1`)).status,404);assert.equal((await fetch(`${base}/videos/nope/a`)).status,404);
  const info=await (await fetch(`${base}/api/runs/run1/videos`)).json();assert.deepEqual(info.saved,['a']);assert.equal(info.bytes,10);
  const {token}=await (await fetch(`${base}/api/bootstrap`)).json();
  const del=await fetch(`${base}/api/runs/run1/videos/delete`,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:'{}'});
  assert.equal(del.status,200);assert.deepEqual(await del.json(),{deleted:1,bytes:10});
  assert.equal((await fetch(`${base}/videos/run1/a`)).status,404);
  assert.equal(JSON.parse(await readFile(join(root,'runs','run1.json'),'utf8')).id,'run1');
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

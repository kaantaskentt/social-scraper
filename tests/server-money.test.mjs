import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server serves the money report and the money modules',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});
 await writeFile(join(root,'runs','run1.json'),JSON.stringify({id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',scrape:{finishedAt:'2026-09-25T00:00:00Z'},posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'Comment "YES"'}],events:[]}));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;
  const rep=await (await fetch(`${base}/api/runs/run1/money`)).json();assert.equal(rep.manifest.formula,'money-1.0');assert.equal(rep.results.a.keyword,'YES');
  const bad=await fetch(`${base}/api/runs/run1/money?version=money-0.1`);assert.equal(bad.status,400);
  const missing=await fetch(`${base}/api/runs/nope/money`);assert.equal(missing.status,404);
  for(const f of ['/money/index.mjs','/money/1.0.mjs']){const r=await fetch(base+f);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);}
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

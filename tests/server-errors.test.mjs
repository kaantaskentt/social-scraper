import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// The error log end to end (2026-09-29): a failed request and a page crash land in data/errors.jsonl, and the server
// keeps running (an earlier version of this hook crashed it on the first failed request).
test('server: failed requests and page reports go to the error log, and the server stays up',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-err-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000).unref();});
  const base=`http://127.0.0.1:${port}`,{token}=await (await fetch(`${base}/api/bootstrap`)).json();
  const post=(p,b)=>fetch(base+p,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(b)});
  const bad=await post('/api/runs',{creator:'not a handle!'});assert.equal(bad.status,400);
  assert.equal((await post('/api/errors',{message:"Cannot read properties of undefined (reading 'x')",where:'page crash (step: copy)',detail:'at render'})).status,204);
  assert.equal((await fetch(`${base}/api/bootstrap`)).status,200); // still up
  await new Promise(r=>setTimeout(r,100));
  const lines=(await readFile(join(root,'errors.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
  assert.deepEqual(lines.map(l=>[l.source,l.where]),[['request','POST /api/runs'],['page','page crash (step: copy)']]);
  assert.match(lines[0].message,/valid Instagram handle/);assert.equal(lines[1].detail,'at render');
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

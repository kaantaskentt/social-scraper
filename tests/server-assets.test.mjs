// Every module the page imports must be served: a missing one breaks the whole app (it happened on 2026-09-27).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function importsOf(file,seen=new Set()){
 if(seen.has(file))return seen;seen.add(file);
 const src=await readFile(new URL(`../public/${file}`,import.meta.url),'utf8');
 for(const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]\.\/([^'"]+)['"]/g))await importsOf(m[1],seen);
 return seen;
}
test('server: every module reachable from app.js is served',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-a-'));const port=5400+Math.floor(Math.random()*400);
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const files=[...await importsOf('app.js')];assert.ok(files.length>8,files.join(','));
  for(const f of files){const r=await fetch(`http://127.0.0.1:${port}/${f}`);assert.equal(r.status,200,`/${f} is not served`);assert.match(r.headers.get('content-type'),/javascript/);}
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

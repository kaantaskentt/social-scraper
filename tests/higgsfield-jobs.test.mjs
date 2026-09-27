import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PaidJobs} from '../lib/higgsfield-jobs.mjs';

function fake({create='["job-1"]',gets=[{status:'in_progress'},{status:'completed',result_url:'https://cdn.example/a.mp4'}]}={}){
 const calls=[];let g=0;
 const run=async args=>{calls.push(args);if(args[1]==='create'){if(create instanceof Error)throw create;return create;}if(args[1]==='get')return JSON.stringify(gets[Math.min(g++,gets.length-1)]);throw new Error('unexpected');};
 return {calls,run};
}
async function jobs(opts){const dir=await mkdtemp(join(tmpdir(),'cl-jobs-'));const f=fake(opts);const j=new PaidJobs(dir,{run:f.run,download:async(url,file)=>{const {writeFile}=await import('node:fs/promises');await writeFile(file,'media '+url);},pollMs:1,maxWaitMs:2000});return {dir,j,...f};}

test('a paid job is saved before the call, followed to the end, downloaded, and its record kept',async()=>{
 const {dir,j,calls}=await jobs();
 try{const r=await j.run('shot-s1',['generate','create','seedance_2_0','--prompt','x'],{ext:'.mp4',credits:27});
  assert.equal(r.status,'done');assert.equal(r.jobId,'job-1');assert.equal(String(await readFile(r.file)),'media https://cdn.example/a.mp4');
  assert.equal(calls.filter(c=>c[1]==='create').length,1);assert.ok(calls[0].includes('--json'));
  const rec=JSON.parse(await readFile(join(dir,'shot-s1.json'),'utf8'));assert.equal(rec.status,'done');assert.equal(rec.credits,27);
  const again=await j.run('shot-s1',['generate','create','seedance_2_0','--prompt','x'],{ext:'.mp4',credits:27});assert.equal(again.status,'done');assert.equal(calls.filter(c=>c[1]==='create').length,1,'a finished job is never paid again');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a lost reply is never resubmitted: the job becomes uncertain and blocks until someone checks',async()=>{
 const {dir,j,calls}=await jobs({create:new Error('request failed (no response received)')});
 try{await assert.rejects(j.run('shot-s1',['generate','create','x'],{ext:'.mp4',credits:27}),/may have gone through/);
  await assert.rejects(j.run('shot-s1',['generate','create','x'],{ext:'.mp4',credits:27}),/uncertain/);assert.equal(calls.filter(c=>c[1]==='create').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a failed job is reported and can be tried again on purpose (the retry is a new paid attempt)',async()=>{
 const {dir,j,calls}=await jobs({gets:[{status:'failed',error:'nsfw'}]});
 try{await assert.rejects(j.run('shot-s1',['generate','create','x'],{ext:'.mp4',credits:27}),/failed \(failed: nsfw\)/);
  const f2=fake();j.runCli=f2.run;const r=await j.run('shot-s1',['generate','create','x'],{ext:'.mp4',credits:27,retry:true});assert.equal(r.status,'done');assert.equal(r.attempt,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a job that never finishes stops at the deadline and is marked uncertain with its id',async()=>{
 const {dir,j}=await jobs({gets:[{status:'in_progress'}]});
 try{j.maxWaitMs=20;await assert.rejects(j.run('shot-s1',['generate','create','x'],{ext:'.mp4',credits:27}),/job-1/);
  assert.equal(JSON.parse(await readFile(join(dir,'shot-s1.json'),'utf8')).status,'uncertain');
 }finally{await rm(dir,{recursive:true,force:true});}
});

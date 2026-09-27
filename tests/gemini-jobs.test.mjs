import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VideoJobs} from '../lib/gemini-jobs.mjs';

const usage={total_input_tokens:1000,total_output_tokens:57920,output_tokens_by_modality:[{modality:'video',tokens:57920}]};
// A fake Google: POST creates a job, GET answers in_progress once, then completed with a download link.
function google({fail=false,noId=false}={}){
 const calls={post:[],get:0,download:0};let polls=0;
 const fetchImpl=async(url,opts={})=>{
  if(opts.method==='POST'){calls.post.push(JSON.parse(opts.body));return noId?Response.json({status:'in_progress'}):Response.json({id:`job${calls.post.length}`,status:'in_progress'});}
  if(url.includes(':download')){calls.download++;assert.equal(opts.headers['x-goog-api-key'],'k');return new Response('MP4BYTES');}
  calls.get++;if(polls++<1)return Response.json({status:'in_progress'});
  return Response.json(fail?{status:'failed',usage:{}}:{status:'completed',usage,steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',uri:'https://generativelanguage.googleapis.com/v1beta/files/x:download?alt=media'}]}]});};
 return {calls,fetchImpl};
}
const setup=async()=>mkdtemp(join(tmpdir(),'vjobs-'));
const opts=(g)=>({key:'k',model:'gemini-omni-1.1-flash',fetchImpl:g.fetchImpl,sleep:async()=>{},pollMs:0});

test('a job is sent in the background, its id saved before waiting, then polled, downloaded and priced',async()=>{
 const dir=await setup(),g=google(),jobs=new VideoJobs(dir,opts(g));
 const r=await jobs.run('part-1',{input:[{type:'text',text:'hi'}],responseFormat:{type:'video'}});
 assert.equal(g.calls.post.length,1);assert.equal(g.calls.post[0].background,true);assert.equal(g.calls.post[0].model,'gemini-omni-1.1-flash');
 assert.equal(r.status,'done');assert.equal(r.id,'job1');assert.equal(await readFile(r.file,'utf8'),'MP4BYTES');assert.match(r.file,/part-1-a1\.mp4$/);
 assert.ok(Math.abs(r.costUsd-(1000*1.5+57920*17.5)/1e6)<1e-9);assert.equal(r.fresh,true);
 // Asked again: nothing is sent or paid.
 const again=await jobs.run('part-1',{input:[]});assert.equal(g.calls.post.length,1);assert.equal(again.fresh,undefined);
 await rm(dir,{recursive:true});
});

test('the second part extends the first by its id',async()=>{
 const dir=await setup(),g=google(),jobs=new VideoJobs(dir,opts(g));
 await jobs.run('part-2',{input:[{type:'text',text:'continues'}],previousId:'job-first'});assert.equal(g.calls.post[0].previous_interaction_id,'job-first');
 await rm(dir,{recursive:true});
});

test('after a restart a saved id is picked up again, not paid twice; a job cut off while sending is uncertain',async()=>{
 const dir=await setup();await mkdir(join(dir,'jobs'),{recursive:true});
 await writeFile(join(dir,'jobs','part-1.json'),JSON.stringify({name:'part-1',attempt:1,status:'submitted',id:'saved-id'}));
 const g=google(),jobs=new VideoJobs(dir,opts(g));const r=await jobs.run('part-1',{input:[]});
 assert.equal(g.calls.post.length,0);assert.equal(r.id,'saved-id');assert.equal(r.status,'done');
 await writeFile(join(dir,'jobs','part-2.json'),JSON.stringify({name:'part-2',attempt:1,status:'submitting'}));
 await assert.rejects(jobs.run('part-2',{input:[]}),/may already be paid/);assert.equal(g.calls.post.length,0);
 await rm(dir,{recursive:true});
});

test('a retry is a new attempt; a failed job is saved as failed with its cost; a job without id fails loudly',async()=>{
 const dir=await setup(),g=google(),jobs=new VideoJobs(dir,opts(g));
 await jobs.run('part-1',{input:[]});const g2=google();const retry=await new VideoJobs(dir,opts(g2)).run('part-1',{attempt:2,input:[]});
 assert.equal(g2.calls.post.length,1);assert.match(retry.file,/part-1-a2\.mp4$/);
 const bad=google({fail:true});await assert.rejects(new VideoJobs(dir,opts(bad)).run('part-3',{input:[]}),/stopped \(failed\)/);
 assert.equal(JSON.parse(await readFile(join(dir,'jobs','part-3.json'),'utf8')).status,'failed');
 const noId=google({noId:true});await assert.rejects(new VideoJobs(dir,opts(noId)).run('part-4',{input:[]}),/no job id|did not return a job id/);
 assert.equal(JSON.parse(await readFile(join(dir,'jobs','part-4.json'),'utf8')).status,'failed');
 await rm(dir,{recursive:true});
});

test('a job that takes too long stays saved and says so',async()=>{
 const dir=await setup();const fetchImpl=async(url,o={})=>o.method==='POST'?Response.json({id:'slow'}):Response.json({status:'in_progress'});
 const jobs=new VideoJobs(dir,{key:'k',model:'gemini-omni-1.1-flash',fetchImpl,sleep:async()=>{},pollMs:0,maxWaitMs:-1});
 await assert.rejects(jobs.run('part-1',{input:[]}),/still being made/);assert.equal((await jobs.record('part-1')).status,'submitted');
 await rm(dir,{recursive:true});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pipeline,atomic} from '../lib/pipeline.mjs';
const keys=()=>({apify:'a',groq:'g',jev:'j'});
const settle=async p=>{while(p.active.size)await new Promise(r=>setTimeout(r,5));};
const jevOk=req=>({model:req.model,answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9,probabilities:{}}])),usage:{input_tokens:10}});

test('the launch marker is on disk before Apify is called, and a lost response blocks a relaunch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));const real=global.fetch;let file,job;
 global.fetch=async url=>{if(String(url).includes('/acts/')){file=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));throw new Error('socket hang up');}throw new Error('unexpected '+url);};
 try{const p=await new Pipeline(root,keys).init();job=await p.create({creator:'tester',limit:5});await p.run(job.id);await settle(p);await p.writes.get(job.id);
  assert.equal(file.scrapeUncertain,true);assert.equal(job.status,'failed');
  const again=await new Pipeline(root,keys).init();await assert.rejects(again.run(job.id),/launch response was lost/);
 }finally{global.fetch=real;await rm(root,{recursive:true,force:true});}
});

test('progress saves coalesce; durable saves write at once; final file equals final state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));let writes=0;const writer=async(path,value)=>{writes++;return atomic(path,value);};
 try{const p=await new Pipeline(root,keys,{saveDelayMs:40,writer}).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six seven'}]);
  assert.equal(writes,1);for(let i=0;i<20;i++){job.events.push({at:'t',message:String(i)});p.save(job);}
  assert.equal(writes,1);await new Promise(r=>setTimeout(r,80));await p.writes.get(job.id);assert.equal(writes,2);
  job.status='paused';await p.save(job,{durable:true});assert.equal(writes,3);
  const disk=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));assert.equal(disk.status,'paused');assert.equal(disk.events.at(-1).message,'19');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a durable save cancels the pending progress write and still contains its state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));let writes=0;const writer=async(path,value)=>{writes++;return atomic(path,value);};
 try{const p=await new Pipeline(root,keys,{saveDelayMs:30,writer}).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six seven'}]);
  job.events.push({at:'t',message:'progress'});p.save(job);await p.save(job,{durable:true});await new Promise(r=>setTimeout(r,60));
  assert.equal(writes,2);const disk=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));assert.equal(disk.events.at(-1).message,'progress');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a failed durable write rejects instead of disappearing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));let fail=false;const writer=async(path,value)=>{if(fail)throw new Error('disk full');return atomic(path,value);};
 try{const p=await new Pipeline(root,keys,{writer}).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six'}]);
  fail=true;await assert.rejects(p.save(job,{durable:true}),/disk full/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('observedAt comes from Apify finishedAt, retrievedAt from the download',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));const real=global.fetch;const finishedAt='2026-09-25T13:49:22.418Z';
 global.fetch=async(url,opts)=>{const u=String(url);
  if(u.includes('/acts/'))return Response.json({data:{id:'run1',status:'SUCCEEDED',finishedAt,defaultDatasetId:'ds1',usageTotalUsd:0.01}});
  if(u.includes('/datasets/'))return Response.json([{id:'abc',ownerUsername:'tester',transcript:'one two three four five six seven',videoPlayCount:1000,commentsCount:3,timestamp:'2026-09-01T00:00:00Z'}]);
  if(u.includes('typesafe.ai'))return Response.json(jevOk(JSON.parse(opts.body)));
  throw new Error('unexpected '+u);};
 try{const p=await new Pipeline(root,keys).init();const job=await p.create({creator:'tester',limit:1});await p.run(job.id);await settle(p);await p.writes.get(job.id);
  assert.equal(job.status,'complete');assert.equal(job.observedAt,finishedAt);assert.ok(Date.parse(job.retrievedAt)>=Date.parse(finishedAt));
  const disk=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));assert.equal(disk.observedAt,finishedAt);
 }finally{global.fetch=real;await rm(root,{recursive:true,force:true});}
});

test('a failed first save does not leave the run stuck as active',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));let fail=false;const writer=async(path,value)=>{if(fail)throw new Error('disk full');return atomic(path,value);};
 try{const p=await new Pipeline(root,keys,{writer}).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six'}]);
  const before=job.status;fail=true;await assert.rejects(p.run(job.id),/disk full/);assert.equal(p.active.has(job.id),false);
  assert.equal(job.status,before,'status restored so Resume stays available');assert.match(job.error,/Could not start this run: disk full/);
  fail=false;job.error=null;assert.equal(p.active.size,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a run stays active until its final save is on disk',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));const real=global.fetch;let release,hold=false;const gate=new Promise(r=>release=r);
 const writer=async(path,value)=>{if(hold&&value.status==='complete')await gate;return atomic(path,value);};
 global.fetch=async(url,opts)=>{if(String(url).includes('typesafe.ai'))return Response.json(jevOk(JSON.parse(opts.body)));throw new Error('unexpected '+url);};
 try{const p=await new Pipeline(root,keys,{writer}).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six seven'}]);
  hold=true;await p.run(job.id);while(job.status!=='complete')await new Promise(r=>setTimeout(r,5));await new Promise(r=>setTimeout(r,20));
  assert.equal(p.active.has(job.id),true,'released before the final save finished');release();await settle(p);assert.equal(p.active.has(job.id),false);
 }finally{global.fetch=real;await rm(root,{recursive:true,force:true});}
});

test('restart saves the interrupted status to disk',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));
 try{const p=await new Pipeline(root,keys).init();const job=await p.create({creator:'tester'},[{id:'x',ownerUsername:'tester',transcript:'one two three four five six'}]);
  job.status='running';await p.save(job,{durable:true});
  await new Pipeline(root,keys).init();const disk=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));assert.equal(disk.status,'interrupted');
 }finally{await rm(root,{recursive:true,force:true});}
});

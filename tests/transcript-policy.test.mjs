import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transcriptKey,transcriptPolicy} from '../lib/transcript-policy.mjs';
import {Pipeline} from '../lib/pipeline.mjs';

test('keys: policy 1 legacy, policy 2 carries language, provider and model',()=>{
 assert.equal(transcriptKey({},'abc','groq','whisper-large-v3-turbo'),'transcript-abc');
 assert.equal(transcriptKey({transcriptPolicy:transcriptPolicy('')},'abc','groq','whisper-large-v3-turbo'),'transcript-v2-abc-auto-groq-whisper-large-v3-turbo');
 assert.equal(transcriptKey({transcriptPolicy:transcriptPolicy('en')},'abc','fireworks','whisper-v3-turbo'),'transcript-v2-abc-en-fireworks-whisper-v3-turbo');
});

const jevOk=req=>({model:req.model,answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9,probabilities:{}}])),usage:{input_tokens:10}});
async function runOnce(root,{legacy}){
 let groq=0;const real=global.fetch;
 global.fetch=async(url,opts)=>{if(String(url).includes('groq.com')){groq++;return Response.json({text:'Doğru Türkçe metin burada var tamam mı',segments:[],duration:8});}if(String(url).includes('typesafe.ai'))return Response.json(jevOk(JSON.parse(opts.body)));throw new Error('unexpected '+url);};
 try{const p=await new Pipeline(root,()=>({groq:'g',jev:'j'})).init();const job=await p.create({creator:'tester',limit:1},[{id:'reel1',ownerUsername:'tester',videoUrl:'https://scontent.cdninstagram.com/v.mp4',videoDuration:8}]);
  if(legacy)delete job.transcriptPolicy;await p.run(job.id);while(p.active.size)await new Promise(r=>setTimeout(r,5));await p.writes.get(job.id);
  assert.equal(job.status,'complete');return {groq,text:job.posts[0].transcript.text};
 }finally{global.fetch=real;}
}

test('a new run never reads a legacy transcript; a legacy run still does; policy-2 cache is reused',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-tp-'));
 try{await new Pipeline(root,()=>({})).init();
  await writeFile(join(root,'cache','transcript-reel1.json'),JSON.stringify({text:'Wrong english words from before the fix',segments:[],source:'groq'}));
  const fresh=await runOnce(root,{legacy:false});assert.equal(fresh.groq,1);assert.match(fresh.text,/Türkçe/);
  const old=await runOnce(root,{legacy:true});assert.equal(old.groq,0);assert.match(old.text,/Wrong english/);
  const again=await runOnce(root,{legacy:false});assert.equal(again.groq,0);assert.match(again.text,/Türkçe/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new runs record their transcript policy',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-tp-'));
 try{const p=await new Pipeline(root,()=>({})).init();const job=await p.create({creator:'tester',language:'tr'});assert.deepEqual(job.transcriptPolicy,{version:2,language:'tr'});}
 finally{await rm(root,{recursive:true,force:true});}
});

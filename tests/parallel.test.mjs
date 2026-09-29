import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pipeline} from '../lib/pipeline.mjs';
import {parseHandles} from '../public/handles.mjs';
const jevOk=req=>({model:req.model,answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9,probabilities:{}}])),usage:{input_tokens:10}});

test('up to three runs can be active at once; a fourth is refused until one finishes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-par-'));const real=global.fetch;let release;const gate=new Promise(r=>release=r);
 global.fetch=async(url,opts)=>{if(String(url).includes('typesafe.ai')){await gate;return Response.json(jevOk(JSON.parse(opts.body)));}throw new Error('unexpected '+url);};
 try{const p=await new Pipeline(root,()=>({jev:'j',groq:'g'}),{groqRpm:60000}).init();const jobs=[];
  for(const name of ['a','b','c','d'])jobs.push(await p.create({creator:`brand_${name}`},[{id:`r_${name}`,ownerUsername:`brand_${name}`,transcript:'one two three four five six seven'}]));
  for(const j of jobs.slice(0,3))await p.run(j.id);
  assert.equal(p.active.size,3);
  await assert.rejects(p.run(jobs[3].id),/3 runs are already active/);
  assert.equal(p.active.has(jobs[3].id),false);assert.equal(jobs[3].status,'ready');
  release();while(p.active.size)await new Promise(r=>setTimeout(r,5));
  for(const j of jobs.slice(0,3))assert.equal(j.status,'complete');
  await p.run(jobs[3].id);while(p.active.size)await new Promise(r=>setTimeout(r,5));assert.equal(jobs[3].status,'complete');
  for(const j of jobs)await p.writes.get(j.id);
 }finally{global.fetch=real;await rm(root,{recursive:true,force:true});}
});

test('parseHandles: commas, spaces, @, links, duplicates, max three, invalid names',()=>{
 assert.deepEqual(parseHandles('@brand_a, brand.b  brand_c'),{handles:['brand_a','brand.b','brand_c'],error:null});
 assert.deepEqual(parseHandles('https://www.instagram.com/brand_a/ , brand_a'),{handles:['brand_a'],error:null});
 assert.match(parseHandles('a1, b2, c3, d4').error,/up to 3/);
 assert.match(parseHandles('good, bad!name').error,/bad!name/);
 assert.match(parseHandles('   ').error,/Enter/);
});

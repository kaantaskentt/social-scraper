import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {repeats,plainArgs,tally,byGroup,baseline,baselines,flips,lastRun,flipLine,freeze,freezeData} from '../evals/kit.mjs';

test('each exam case runs at least 3 times; --k raises it and the model name still comes through',()=>{
 assert.equal(repeats(['node','x']),3);assert.equal(repeats(['node','x','--k=5']),5);
 assert.throws(()=>repeats(['node','x','--k=1']),/at least 3/);assert.throws(()=>repeats(['node','x','--k=abc']),/at least 3/);
 assert.deepEqual(plainArgs(['node','x','--k=5','claude-x']),['claude-x']);
});

test('the majority decides a case, a tie is wrong, and agreement says how sure the runs were',()=>{
 assert.deepEqual(tally([true,false,true],true),{k:3,votes:[true,false,true],majority:true,agreement:0.67,right:true,rightRuns:2});
 assert.equal(tally([false,false,true],true).right,false);
 const tie=tally(['good','weak','broken'],'good');assert.equal(tie.majority,null);assert.equal(tie.right,false);assert.equal(tie.rightRuns,1);
 assert.equal(tally(['weak','weak','good','good'],'good').majority,null);
});

test('scores are split by group and set next to always-the-same-answer baselines',()=>{
 const rows=[{set:'in-prompt',right:true},{set:'in-prompt',right:true},{set:'hold-out',right:false},{set:'hold-out',right:true}];
 assert.deepEqual(byGroup(rows,'set'),{'in-prompt':{right:2,of:2},'hold-out':{right:1,of:2}});
 // The checker exam: 6 of 10 reels should be posted, so a checker that always says "post" gets 6 without looking.
 const post=[false,false,false,false,true,true,true,true,true,true];
 assert.equal(baseline(post,true),6);assert.deepEqual(baselines(post,[true,false]),{true:6,false:4});
});

test('a regression is a case whose majority went from right to wrong, only against an exam of 3 or more runs',()=>{
 const rows=[{name:'a',right:false},{name:'b',right:true},{name:'c',right:true}];
 assert.equal(flips(null,rows),null);assert.equal(flips({rows:[{name:'a',right:true}]},rows),null);
 assert.deepEqual(flips({k:3,rows:[{name:'a',right:true},{name:'b',right:false},{name:'c',right:true}]},rows),{worse:['a'],better:['b']});
 assert.match(flipLine({worse:['a'],better:[]}),/^Regression: .*a/);assert.match(flipLine(null),/No earlier exam/);assert.match(flipLine({worse:[],better:['b']}),/No case got worse.*b/);
});

test('the last comparable exam skips one-run lines and other models',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evalkit-'));
 try{
  const f=join(dir,'log.jsonl');assert.equal(await lastRun(f),null);
  await writeFile(f,[{at:1,rows:[]},{at:2,k:3,model:'x',rows:[]},{at:3,k:3,model:'y',rows:[]},{at:4,rows:[]}].map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.equal((await lastRun(f)).at,3);assert.equal((await lastRun(f,r=>r.model==='x')).at,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an exam input is frozen on first use, so a later re-edit of the live file does not change what is graded',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evalkit-'));
 try{
  const live=join(dir,'reel.mp4'),copy=join(dir,'frozen','checker','reel.mp4');await writeFile(live,'first cut');
  const a=await freeze(live,copy);assert.equal(a.file,copy);assert.equal(await readFile(copy,'utf8'),'first cut');
  await writeFile(live,'re-edited');const b=await freeze(live,copy);
  assert.equal(await readFile(b.file,'utf8'),'first cut');assert.equal(b.sha256,a.sha256);
  assert.equal(JSON.parse(await readFile(copy+'.json','utf8')).source,live);
  // Someone changes the frozen copy itself: the exam stops instead of grading other bytes under the old label.
  await writeFile(copy,'tampered');await assert.rejects(freeze(live,copy),/no longer matches/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a live file changed after its answer was checked is not frozen, and a missing one fails loudly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evalkit-'));
 try{
  const live=join(dir,'reel.mp4');await writeFile(live,'x');await utimes(live,new Date('2026-09-29T10:00:00Z'),new Date('2026-09-29T10:00:00Z'));
  await assert.rejects(freeze(live,join(dir,'f','a.mp4'),{labeledAt:'2026-09-28T22:06:00Z'}),/after its right answer was checked/);
  assert.equal((await freeze(live,join(dir,'f','b.mp4'),{labeledAt:'2026-09-30T00:00:00Z'})).file,join(dir,'f','b.mp4'));
  await assert.rejects(freeze(join(dir,'gone.mp4'),join(dir,'f','c.mp4')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('data an exam builds once is made on the first run and read back after',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evalkit-'));
 try{
  let made=0;const make=async()=>({n:++made}),f=join(dir,'b','x.json');
  assert.deepEqual(await freezeData(f,make),{n:1});assert.deepEqual(await freezeData(f,make),{n:1});assert.equal(made,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

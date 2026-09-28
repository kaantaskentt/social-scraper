import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {typicalReels,pairwiseRecord,rankAgainstTypical,rankSentence,PAIR_PROMPT} from '../lib/rank.mjs';

test('typical reels are the ones nearest their usual views (xNormal 1), either side',()=>{
 assert.deepEqual(typicalReels([{id:'a',xNormal:5},{id:'b',xNormal:1.1},{id:'c',xNormal:0.9},{id:'d',xNormal:0.2},{id:'e',xNormal:0}],2).map(r=>r.id),['b','c']);
});
test('ours wins a game only when the judge picks our side, whichever side it was on',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rank-'));
 try{
  for(const f of ['ours','t1','t2'])await writeFile(join(dir,f),f);
  // A judge that always prefers the reel whose bytes are "ours".
  const gemini=async({parts})=>{assert.equal(parts[4].text,PAIR_PROMPT);return {json:{more_views:String(parts[1].video)==='ours'?'A':'B',why:'w'},costUsd:0.01};};
  let flip=0;const r=await rankAgainstTypical({ours:join(dir,'ours'),opponents:[{id:'t1',file:join(dir,'t1'),xNormal:1},{id:'t2',file:join(dir,'t2'),xNormal:1}],gemini,key:'k',model:'m',rand:()=>(flip++%2)?0.9:0.1});
  assert.equal(r.wins,2);assert.equal(r.of,2);assert.equal(Math.round(r.costUsd*100),2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the card says whether the comparison is proven on this channel',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rank-'));
 try{
  await mkdir(join(root,'experiments'));await writeFile(join(root,'experiments','pairwise.jsonl'),[{runId:'ken',judge:'gemini',accuracy:0.717,ci:[0.59,0.82],pairs:60},{runId:'drz',judge:'gemini',accuracy:0.583,ci:[0.46,0.7],pairs:60}].map(r=>JSON.stringify(r)).join('\n')+'\n');
  const ken=await pairwiseRecord(root,'ken'),drz=await pairwiseRecord(root,'drz');assert.equal(ken.proven,true);assert.equal(drz.proven,false);assert.equal(await pairwiseRecord(root,'none'),null);
  assert.equal(rankSentence({wins:4,of:5},ken),'Beat 4 of 5 of their typical reels in a side-by-side watch. This comparison picked the better real reel 72% of the time on 60 past pairs from this channel.');
  assert.match(rankSentence({wins:4,of:5},drz),/Not proven here: .* 58%/);assert.match(rankSentence({wins:1,of:5},null),/treat it as a hint/);
 }finally{await rm(root,{recursive:true,force:true});}
});

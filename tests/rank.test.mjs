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
  for(const f of ['t3','t4'])await writeFile(join(dir,f),f);
  // A judge that prefers t1 and t2 over ours, and ours over t3 and t4. The old judge always preferred ours, so a
  // rankAgainstTypical that always said "won" still passed (audit, 2026-09-29). Sides alternate: ours is A against
  // t1 and t3, B against t2 and t4, so a loss and a win are each checked from both sides.
  const gemini=async({parts})=>{assert.equal(parts[4].text,PAIR_PROMPT);const a=String(parts[1].video),b=String(parts[3].video),beats=['t1','t2'];
   return {json:{more_views:beats.includes(a)?'A':beats.includes(b)?'B':a==='ours'?'A':'B',why:'w'},costUsd:0.01};};
  let flip=0;const r=await rankAgainstTypical({ours:join(dir,'ours'),opponents:['t1','t2','t3','t4'].map(id=>({id,file:join(dir,id),xNormal:1})),gemini,key:'k',model:'m',rand:()=>(flip++%2)?0.9:0.1});
  assert.equal(r.wins,2);assert.equal(r.of,4);assert.equal(Math.round(r.costUsd*100),4);
  assert.deepEqual(Object.fromEntries(r.games.map(g=>[g.against,g.won])),{t1:false,t2:false,t3:true,t4:true});
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

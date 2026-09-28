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
// Rows carry the gap they were tested at, as scripts/pairwise-test.mjs writes them (the old fixture left it out, and
// the old sentence dropped the condition the 72% was measured under; audit, 2026-09-29).
test('the card says whether the comparison is proven on this channel, and only for pairs with a clear gap',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rank-'));
 try{
  await mkdir(join(root,'experiments'));await writeFile(join(root,'experiments','pairwise.jsonl'),[{runId:'ken',judge:'gemini',gap:3,accuracy:0.717,ci:[0.59,0.82],pairs:60},{runId:'drz',judge:'gemini',gap:3,accuracy:0.583,ci:[0.46,0.7],pairs:60},
   {runId:'ken',judge:'gemini',gap:1.5,accuracy:0.9,ci:[0.8,0.95],pairs:20}].map(r=>JSON.stringify(r)).join('\n')+'\n');
  const ken=await pairwiseRecord(root,'ken'),drz=await pairwiseRecord(root,'drz');assert.equal(ken.proven,true);assert.equal(drz.proven,false);assert.equal(await pairwiseRecord(root,'none'),null);
  assert.equal(ken.accuracy,0.717,'a later run at another gap does not replace the tested number');
  assert.equal(rankSentence({wins:4,of:5},ken),'Beat 4 of 5 of their typical reels in a side-by-side watch. On 60 past pairs from this channel where one reel had at least 3x the other\'s views, this comparison picked the better one 72% of the time. Close calls were not tested, so treat it as a hint.');
  assert.match(rankSentence({wins:4,of:5},drz),/Not proven here: .*at least 3x.* 58%/);assert.match(rankSentence({wins:1,of:5},null),/treat it as a hint/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('one failed side-by-side watch still reports what the finished ones cost',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rank-'));
 try{
  for(const f of ['ours','t1','t2','t3'])await writeFile(join(dir,f),f);let n=0;
  const gemini=async()=>{if(++n===2)throw Object.assign(new Error('Gemini: HTTP 429'),{costUsd:0});return {json:{more_views:'A',why:'w'},costUsd:0.01};};
  const e=await rankAgainstTypical({ours:join(dir,'ours'),opponents:['t1','t2','t3'].map(id=>({id,file:join(dir,id),xNormal:1})),gemini,key:'k',model:'m'}).catch(e=>e);
  assert.match(e.message,/HTTP 429/);assert.equal(Math.round(e.costUsd*100),2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

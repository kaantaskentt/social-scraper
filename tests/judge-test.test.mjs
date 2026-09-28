import test from 'node:test';
import assert from 'node:assert/strict';
import {auc,judgeTest,judgeSentence} from '../lib/judge-test.mjs';
import {PARTS} from '../lib/reel-score.mjs';
import {rng} from '../lib/dna.mjs';

// Synthetic channels with a known answer: the judge's score follows the reel's quality by `link`, plus noise.
function channel({n=80,link=1,noise=1,seed=3}={}){
 const r=rng(seed);
 return Array.from({length:n},(_,i)=>{const quality=r()*2-1,logx=quality+(r()-0.5)*0.6;
  const run=()=>Object.fromEntries(PARTS.map(k=>[k,Math.max(0,Math.min(10,Math.round(5+link*quality*3+(r()-0.5)*noise*4)))]));
  return {id:`r${i}`,xNormal:Math.exp(logx),runs:[run(),run()]};});
}

test('AUC is 1 when every winner outscores every other reel, 0.5 for ties, null without both groups',()=>{
 assert.equal(auc([9,8,1,2],[true,true,false,false]),1);assert.equal(auc([5,5],[true,false]),0.5);assert.equal(auc([5],[true]),null);
});

test('a judge that follows quality is called "predicts"; a judge of pure noise is not',()=>{
 const good=judgeTest(channel(),{perms:300,boots:200});assert.equal(good.verdict,'predicts');assert.ok(good.total.rho>0.4);assert.ok(good.winners.auc>0.7);assert.ok(good.selfRho>0.5);
 const blind=judgeTest(channel({link:0,seed:5}),{perms:300,boots:200});assert.notEqual(blind.verdict,'predicts');assert.ok(blind.winners.auc<0.7);
 assert.equal(judgeTest(channel({n:20})).verdict,'too_few');
});

test('the sentence carries the computed numbers, and says coin flip for 50%',()=>{
 const t=judgeTest(channel(),{perms:200,boots:100}),s=judgeSentence(t);
 assert.match(s,new RegExp(`rho ${t.total.rho}`));assert.match(s,/50% = coin flip/);assert.match(s,/^The judge spots/);
 assert.match(judgeSentence({verdict:'too_few',reels:12}),/12; it needs 30/);
});

test('a judge that leans the right way but scores winners like everyone else is "weak", never "predicts"',()=>{
 // Ken's real numbers: rho 0.24 over 79 reels, winners 5.67 vs 5.65, AUC 0.53.
 const r=rng(8),items=Array.from({length:79},(_,i)=>{const logx=(r()-0.5)*2,lean=logx>0.6?0:(logx+0.2)*0.8;/* others lean with views around 0; winners sit at 0 like the average */const run=()=>Object.fromEntries(PARTS.map(k=>[k,Math.max(0,Math.min(10,Math.round(5.6+lean+(r()-0.5)*2.5)))]));return {id:`k${i}`,xNormal:Math.exp(logx),runs:[run(),run()]};});
 const t=judgeTest(items,{perms:300,boots:200});assert.notEqual(t.verdict,'predicts');
});

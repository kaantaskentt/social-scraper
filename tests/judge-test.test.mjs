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

// Ken-like channels: 79 reels ranked by views; the top fifth (the winners) score at the channel's average by
// construction, the rest lean with views by `lean`, plus seeded noise.
function kenLike({seed,lean,noise=3}){
 const r=rng(seed),n=79,w=Math.floor(n/5);
 return Array.from({length:n},(_,i)=>{const logx=-1+2*i/(n-1),base=i>=n-w?0:lean*(logx+w/n);
  const run=()=>Object.fromEntries(PARTS.map(k=>[k,Math.max(0,Math.min(10,Math.round(5.6+base+(r()-0.5)*noise)))]));
  return {id:`k${i}`,xNormal:Math.exp(logx),runs:[run(),run()]};});
}

test('Ken\'s real numbers (rho 0.24, winners 5.67 vs 5.65, AUC 0.53) give "weak"',()=>{
 // The old version of this test used a generator whose rho was 0.62, not Ken's 0.24, and only asserted "not predicts";
 // its seed passed by luck (seed 1 gave "predicts"). These items reproduce Ken's numbers and the verdict is exact (audit, 2026-09-29).
 const t=judgeTest(kenLike({seed:26,lean:0.25}),{perms:300,boots:200});
 assert.equal(t.verdict,'weak');assert.ok(t.total.rho>=0.22&&t.total.rho<=0.26,`rho ${t.total.rho}`);assert.ok(t.total.ci[0]>0);
 assert.ok(t.winners.auc>=0.51&&t.winners.auc<=0.55,`auc ${t.winners.auc}`);assert.ok(Math.abs(t.winners.winnersAvg-t.winners.othersAvg)<=0.05);
});

test('a judge that leans the right way but scores winners like everyone else is "weak" on every seed, never "predicts"',()=>{
 // A stronger lean (rho 0.4 to 0.55) so only the winners check can stop "predicts": that is the rule Ken's case added.
 for(let seed=1;seed<=8;seed++){const t=judgeTest(kenLike({seed,lean:0.5}),{perms:300,boots:200});
  assert.equal(t.verdict,'weak',`seed ${seed}: ${t.verdict}, rho ${t.total.rho}, auc ${t.winners.auc}`);assert.ok(t.total.rho>=0.3,`seed ${seed}: rho ${t.total.rho}`);assert.ok(t.winners.auc<0.65);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreRun,reachOf,median,PARAMS} from '../public/money/1.0.mjs';
const DAY=864e5, OBS=Date.UTC(2026,8,25);
// n reels, one per day, oldest first; ages from n+10 days down to 11 days.
const account=(plays,extra=()=>({}))=>plays.map((p,i)=>({id:`r${String(i).padStart(3,'0')}`,publishedAt:new Date(OBS-(plays.length-i+10)*DAY).toISOString(),plays:p,views:null,comments:Math.round(p/100),caption:'',...extra(i)}));
const run=posts=>scoreRun({posts,observedAt:new Date(OBS).toISOString()});

test('median handles odd, even, empty and ignores non-finite',()=>{assert.equal(median([3,1,2]),2);assert.equal(median([4,1,2,3]),2.5);assert.equal(median([]),null);assert.equal(median([NaN,5]),5);});

test('reach prefers positive plays, falls back to positive views, flags >5% disagreement',()=>{
 assert.deepEqual(reachOf({plays:1000,views:null}),{reach:1000,disagree:false});
 assert.deepEqual(reachOf({plays:0,views:5000}),{reach:5000,disagree:false});
 assert.deepEqual(reachOf({plays:null,views:null}),{reach:null,disagree:false});
 assert.deepEqual(reachOf({plays:1000,views:1100}),{reach:1000,disagree:true});
 assert.deepEqual(reachOf({plays:1000,views:1040}),{reach:1000,disagree:false});
});

test('flat account: identical reels are exactly 1x and normal',()=>{
 const {results}=run(account(Array(20).fill(1000)));
 const r=results.r019;assert.equal(r.xNormal,1);assert.equal(r.label,'normal');assert.equal(r.z,null);assert.equal(r.windowSize,19);
});

test('one 20x spike in a flat-ish account is the only winner, and is big',()=>{
 const plays=Array.from({length:30},(_,i)=>1000+(i%3)*100);plays[25]=20000;
 const {results}=run(account(plays));
 const winners=Object.values(results).filter(r=>r.label==='winner'||r.label==='big_winner').map(r=>r.id);
 assert.deepEqual(winners,['r025']);assert.equal(results.r025.label,'big_winner');
});

test('hand-computed baseline, x and z',()=>{
 // window of 10 earlier reels: 1000..1900 step 100; target 5000
 const plays=[1000,1100,1200,1300,1400,1500,1600,1700,1800,1900,5000];
 const {results}=run(account(plays));const r=results.r010;
 const L=plays.slice(0,10).map(Math.log1p).sort((a,b)=>a-b);const mL=(L[4]+L[5])/2;
 const dev=L.map(v=>Math.abs(v-mL)).sort((a,b)=>a-b);const mad=(dev[4]+dev[5])/2;
 assert.ok(Math.abs(r.baseline-Math.expm1(mL))<1e-6);
 assert.ok(Math.abs(r.xNormal-5000/Math.expm1(mL))<1e-9);
 assert.ok(Math.abs(r.z-0.6745*(Math.log1p(5000)-mL)/mad)<1e-9);
 assert.equal(r.label,'winner');
});

test('buckets: no_date, no_reach, unknown_observation, too_new, short_history',()=>{
 const posts=account(Array(12).fill(1000));
 posts.push({id:'nodate',publishedAt:null,plays:1000,comments:1,caption:''});
 posts.push({id:'noreach',publishedAt:new Date(OBS-20*DAY).toISOString(),plays:0,views:0,comments:1,caption:''});
 posts.push({id:'fresh',publishedAt:new Date(OBS-3*DAY).toISOString(),plays:1000,comments:1,caption:''});
 const {results}=run(posts);
 assert.equal(results.nodate.bucket,'no_date');assert.equal(results.noreach.bucket,'no_reach');assert.equal(results.fresh.bucket,'too_new');
 assert.equal(results.r000.bucket,'short_history');assert.equal(results.r011.bucket,null);
 const unknown=scoreRun({posts:account(Array(12).fill(1000)),observedAt:null}).results;
 assert.equal(unknown.r011.bucket,'unknown_observation');
});

test('window: only strictly earlier reels, at most 30, within 90 days',()=>{
 const {results}=run(account(Array(50).fill(1000)));
 assert.equal(results.r049.windowSize,30);
 const old=account(Array(12).fill(1000)).map((p,i)=>i<11?{...p,publishedAt:new Date(OBS-(200+i)*DAY).toISOString()}:p);
 assert.equal(run(old).results.r011.bucket,'short_history');
 const same=account(Array(12).fill(1000));same[11].publishedAt=same[10].publishedAt;
 assert.equal(run(same).results.r011.windowSize,10);
});

test('future-append invariance: newer reels never change older results',()=>{
 const base=account(Array.from({length:40},(_,i)=>1000+((i*37)%11)*300));
 const before=run(base).results;
 const newer=[...base,...Array.from({length:10},(_,k)=>({id:`n${k}`,publishedAt:new Date(OBS-(8+k%2)*DAY+k*1000).toISOString(),plays:99999,comments:5000,caption:'Comment "NEW"'}))];
 const after=run(newer).results;
 for(const id of Object.keys(before))assert.deepEqual(after[id],before[id],id);
});

test('params match the spec',()=>{assert.deepEqual({...PARAMS},{minAgeDays:7,windowSize:30,windowDays:90,minWindow:10,winnerX:2,bigWinnerX:5,flopX:0.5,zGate:1,zConstant:0.6745,minReachForRate:1000,disagreeTolerance:0.05,growthUp:0.5,growthDown:-0.33,minGrowthTimestamps:5,tol:1e-9});});

test('growth: doubling every 30 days is flagged growing; flat is not; too few timestamps gives null',()=>{
 const grow=account(Array.from({length:30},(_,i)=>Math.round(1000*2**(i/30))));
 const g=run(grow).results.r029.growth;assert.equal(g.flag,'growing');assert.ok(Math.abs(g.change30-1)<0.05);
 assert.equal(run(account(Array(30).fill(1000))).results.r029.growth.flag,null);
 const sameDay=account(Array(12).fill(1000)).map((p,i)=>i<11?{...p,publishedAt:new Date(OBS-(30+(i%4))*DAY).toISOString()}:p);
 assert.equal(run(sameDay).results.r011.growth,null);
});
test('xExpected equals 1 for a reel exactly on a clean exponential trend',()=>{
 const plays=Array.from({length:21},(_,i)=>Math.expm1(Math.log1p(1000)+0.02*i));
 const r=run(account(plays)).results.r020;assert.ok(Math.abs(r.xExpected-1)<1e-6);
});

import {gammaPrior} from '../public/money/1.0.mjs';
test('gamma prior known answer: m=10, s2=12, e=1 gives alpha 50, beta 5',()=>{
 const rates=[8,9,10,11,12,10,10,6,14,10]; // mean 10
 const s2=rates.reduce((s,v)=>s+(v-10)**2,0)/(rates.length-1);
 const k=12/s2, scaled=rates.map(v=>10+(v-10)*Math.sqrt(k)); // rescale to s2 = 12 exactly
 const p=gammaPrior(scaled,Array(10).fill(1));
 assert.ok(Math.abs(p.m-10)<1e-9&&Math.abs(p.s2-12)<1e-9&&Math.abs(p.tau2-2)<1e-9);
 assert.ok(Math.abs(p.alpha-50)<1e-9&&Math.abs(p.beta-5)<1e-9);
 assert.ok(Math.abs((p.alpha+20)/(p.beta+1)-70/6)<1e-9);
});
test('gamma prior uses mean(1/e), not 1/mean(e)',()=>{
 const p=gammaPrior([10,10,10,10,10,10,10,10,10,30],[1,1,1,1,1,1,1,1,1,10]);
 const m=12, s2=40, meanInv=(9+0.1)/10;assert.ok(Math.abs(p.tau2-(s2-m*meanInv))<1e-9);
});
test('comment rate buckets and pooling',()=>{
 const noComments=account(Array(12).fill(5000),i=>i===11?{comments:null}:{});assert.equal(run(noComments).results.r011.rateBucket,'no_comments');
 const small=account(Array(12).fill(5000),i=>i===11?{plays:900}:{});assert.equal(run(small).results.r011.rateBucket,'too_few_plays');
 const flatRates=account(Array(12).fill(5000),()=>({comments:50}));const r=run(flatRates).results.r011;
 assert.equal(r.rateKind,'pooled');assert.equal(r.rate,10);
 const zeros=account(Array(12).fill(5000),()=>({comments:0}));const z=run(zeros).results.r011;assert.equal(z.rateKind,'pooled');assert.equal(z.rate,0);
});
test('with a fixed positive prior the shrunk rate approaches the raw rate as exposure grows',()=>{
 const p={alpha:50,beta:5};const raw=30;
 const at=e=>(p.alpha+raw*e)/(p.beta+e);assert.ok(Math.abs(at(1e6)-raw)<0.01);assert.ok(at(1)<raw&&at(1)>10);
});
test('quadrants: star, billboard, closer, dud; zero threshold with zero rate is low on comments',()=>{
 const varied=i=>({comments:Math.round((5000/1000)*(8+(i%5)))}); // earlier rates 8..12 per 1k
 const mk=(plays,comments)=>{const p=account([...Array(12).fill(5000),plays],varied);p[12].comments=comments;return run(p).results.r012;};
 assert.equal(mk(20000,20000/1000*40).quadrant,'star');
 assert.equal(mk(20000,20000/1000*2).quadrant,'billboard');
 assert.equal(mk(3000,3*40).quadrant,'closer');
 assert.equal(mk(3000,3*2).quadrant,'dud');
 // all comments 0: threshold 0 and rate 0 is low on comments; x = 1 is high on reach
 const zero=account(Array(13).fill(5000),()=>({comments:0}));assert.equal(run(zero).results.r012.quadrant,'billboard');
});

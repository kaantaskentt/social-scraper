# Money Radar build 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every reel in a Creator Lab run gets x normal, a label, a comment rate, a keyword CTA and a quadrant (or a named reason it has none), shown in a Money view; plus crash-safe saving and a language-aware transcript cache.

**Architecture:** Metrics are pure functions in an immutable, versioned module (`public/money/1.0.mjs`) behind a registry (`public/money/index.mjs`); the server computes a report per run on request and records which version was shown. Pipeline changes are limited to durable-vs-progress saves, observation time, and a transcript cache policy in a new small module. The UI is built by Codex GPT-6 Astra from a brief and inspected by Claude.

**Tech Stack:** Node 22+ ESM, `node:test`, no dependencies (matches upstream).

**Spec:** `docs/superpowers/specs/2026-09-25-money-radar-design.md` (v3), sections 3, 4, 5, 8, 9.

## Global Constraints
- Node >= 22.9, no npm dependencies, no build step.
- Dense one-line style of upstream files is kept in edited upstream files; new files use normal formatting with short comments.
- Formula id `money-1.0`; `public/money/1.0.mjs` is immutable after Task 5's golden test lands.
- Params (verbatim from spec): minAgeDays 7, window 30 reels within 90 days, minWindow 10, winner x >= 2, big winner x >= 5, flop x <= 0.5, z gate 1, z constant 0.6745, rate floor 1,000 reach, reach disagreement 5%, growth +50% / -33% per 30 days, growth needs 5 distinct timestamps, tolerance 1e-9.
- Paid calls: none in tests (mock `fetch`). No real run is started by Claude without Kaan's yes.
- `data/` is private: never committed. The fork on GitHub is public: never push creator content or keys. No pushing at all in this build.
- Wording on screen: "x its previous posts (at scrape time)", "comment rate", "comment rate, keyword CTA present". Never "leads" as a fact, never "exceptional content".

## File structure
| File | Responsibility |
|---|---|
| `public/money/1.0.mjs` (new) | Pure money-1.0 formulas: reach, window, x normal, z, labels, growth, comment rate, quadrant, keyword CTA, summary |
| `public/money/index.mjs` (new) | Version registry, observation time, input hash, `score(job, version)` |
| `lib/money-report.mjs` (new) | Server-side report + persisted manifest `data/scores/<runId>.json` |
| `lib/transcript-policy.mjs` (new) | Transcript cache policy 1 vs 2 keys |
| `lib/pipeline.mjs` (edit) | Durable vs progress saves, observedAt/retrievedAt, transcript key |
| `server.mjs` (edit) | `/api/runs/:id/money`, static `/money/*.mjs` |
| `tests/money.test.mjs`, `tests/keyword.test.mjs`, `tests/money-report.test.mjs`, `tests/checkpoints.test.mjs`, `tests/transcript-policy.test.mjs`, `tests/server-money.test.mjs` (new) | Tests |
| `tests/fixtures/money-1.0-golden.json` (new) | Frozen output of 1.0 on the synthetic account |
| `scripts/validate-money.mjs` (new) | Runs money-1.0 on real local runs for the hand check (reads `data/`, prints only) |
| UI files (Task 9, Astra) | `public/app.js`, `public/index.html`, `public/styles.css`, new `public/money-view.mjs`, new `tests/money-view.test.mjs` |

---

### Task 1: reach, window, x normal, z, labels

**Files:**
- Create: `public/money/1.0.mjs`
- Test: `tests/money.test.mjs`

**Interfaces:**
- Produces: `FORMULA`, `PARAMS`, `median(values)`, `reachOf(post) -> {reach:number|null, disagree:boolean}`, `scoreRun({posts, observedAt}) -> {results: {[id]: ReelScore}, summary}` (summary filled in Task 5). ReelScore fields used later: `id, publishedAt, reach, reachDisagree, ageDays, comments, bucket, xNormal, z, label, baseline, windowSize, windowMedianAgeDays, growth, xExpected, rate, rateKind, rateBucket, prior, threshold, quadrant, quadrantReason, keyword, keywordChannel, keywordEvidence, keywordMatches`.

- [ ] **Step 1: Write the failing tests** (`tests/money.test.mjs`)

```js
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
```

- [ ] **Step 2: Run to verify it fails**
Run: `node --test tests/money.test.mjs` — Expected: FAIL, cannot find module `public/money/1.0.mjs`.

- [ ] **Step 3: Implement** `public/money/1.0.mjs` (first part; Tasks 2 to 5 extend this same file before it is frozen in Task 5)

```js
// Money metrics, formula money-1.0. Pure: no I/O, no clock, no randomness.
// Frozen after release: a change goes in a new file (1.1.mjs). tests/fixtures/money-1.0-golden.json guards it.
// Spec: docs/superpowers/specs/2026-09-25-money-radar-design.md, section 4.
export const FORMULA='money-1.0';
export const PARAMS=Object.freeze({minAgeDays:7,windowSize:30,windowDays:90,minWindow:10,winnerX:2,bigWinnerX:5,flopX:0.5,zGate:1,zConstant:0.6745,minReachForRate:1000,disagreeTolerance:0.05,growthUp:0.5,growthDown:-0.33,minGrowthTimestamps:5,tol:1e-9});
const DAY=864e5;
const known=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const ge=(a,b)=>a>=b-PARAMS.tol, le=(a,b)=>a<=b+PARAMS.tol;
const time=iso=>{if(typeof iso!=='string')return null;const t=Date.parse(iso);return Number.isFinite(t)?t:null;};

export function median(values){
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;
 const m=(a.length-1)/2;return (a[Math.floor(m)]+a[Math.ceil(m)])/2;
}

// Instagram unified plays and views in August 2024; Apify fills one or the other.
export function reachOf(post){
 const plays=known(post.plays)&&post.plays>0?post.plays:null, views=known(post.views)&&post.views>0?post.views:null;
 const disagree=plays!==null&&views!==null&&Math.abs(plays-views)/Math.max(plays,views)>PARAMS.disagreeTolerance;
 return {reach:plays??views,disagree};
}

// Up to 30 immediately earlier reels (strictly earlier publish time) within 90 days, with known reach and 7+ days old.
function windowFor(r,dated){
 const from=r.t-PARAMS.windowDays*DAY, out=[];
 for(let i=dated.length-1;i>=0&&out.length<PARAMS.windowSize;i--){
  const q=dated[i];if(q.t>=r.t)continue;if(q.t<from)break;
  if(q.reach===null||q.age===null||q.age<PARAMS.minAgeDays)continue;out.push(q);
 }
 return out.reverse();
}

function reachScore(r,B){
 const L=B.map(q=>Math.log1p(q.reach)), mL=median(L), mad=median(L.map(v=>Math.abs(v-mL)));
 const baseline=Math.expm1(mL);let x=r.reach/baseline;if(Math.abs(x-1)<=PARAMS.tol)x=1;
 const z=mad>0?PARAMS.zConstant*(Math.log1p(r.reach)-mL)/mad:null;
 const up=z===null||ge(z,PARAMS.zGate), down=z===null||le(z,-PARAMS.zGate);
 const label=ge(x,PARAMS.bigWinnerX)&&up?'big_winner':ge(x,PARAMS.winnerX)&&up?'winner':le(x,PARAMS.flopX)&&down?'flop':'normal';
 return {baseline,xNormal:x,z,label,windowMedianAgeDays:median(B.map(q=>q.age))};
}

function scoreReel(r,dated){
 const out={id:r.id,publishedAt:r.publishedAt,reach:r.reach,reachDisagree:r.disagree,ageDays:r.age,comments:r.comments,
  bucket:null,xNormal:null,z:null,label:null,baseline:null,windowSize:0,windowMedianAgeDays:null,growth:null,xExpected:null,
  rate:null,rateKind:null,rateBucket:null,prior:null,threshold:null,quadrant:'insufficient',quadrantReason:null};
 out.bucket=r.t===null?'no_date':r.reach===null?'no_reach':r.age===null?'unknown_observation':r.age<PARAMS.minAgeDays?'too_new':null;
 if(!out.bucket){const B=windowFor(r,dated);out.windowSize=B.length;if(B.length<PARAMS.minWindow)out.bucket='short_history';else Object.assign(out,reachScore(r,B));}
 if(out.bucket){out.rateBucket=out.bucket;out.quadrantReason=out.bucket;}
 return out;
}

export function scoreRun({posts,observedAt}){
 const obs=time(observedAt);
 const rows=posts.map(p=>{const {reach,disagree}=reachOf(p),t=time(p.publishedAt);return {id:p.id,publishedAt:p.publishedAt??null,t,reach,disagree,comments:known(p.comments)?p.comments:null,caption:typeof p.caption==='string'?p.caption:'',age:obs!==null&&t!==null?(obs-t)/DAY:null};});
 const dated=rows.filter(r=>r.t!==null).sort((a,b)=>a.t-b.t||(a.id<b.id?-1:a.id>b.id?1:0));
 const results={};for(const r of rows)results[r.id]=scoreReel(r,dated);
 return {results,summary:null};
}
```

- [ ] **Step 4: Run tests** `node --test tests/money.test.mjs` — Expected: PASS (9 tests). The future-append test passes here because rate, quadrant and keyword are not computed yet; it is re-run in Tasks 3 to 5.
- [ ] **Step 5: Commit** `git add public/money/1.0.mjs tests/money.test.mjs && git commit -m "feat(money): reach, causal window, x normal, z and labels"`

### Task 2: growth flag and validation-only xExpected

**Files:** Modify `public/money/1.0.mjs`; Test `tests/money.test.mjs`

**Interfaces:** Produces `ReelScore.growth = {slopePerDay, change30, intercept, flag: 'growing'|'shrinking'|null} | null` and `ReelScore.xExpected: number|null`.

- [ ] **Step 1: Failing tests** (append)

```js
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
```

- [ ] **Step 2:** `node --test tests/money.test.mjs` — Expected: FAIL (`growth` is null / undefined values).
- [ ] **Step 3: Implement** (add to `1.0.mjs`, and call it inside `scoreReel` right after `Object.assign(out,reachScore(r,B))`)

```js
// Theil-Sen slope of log1p(reach) per day over the window; pairs with equal publish times are skipped.
function growthOf(B){
 const pts=B.map(q=>({t:q.t/DAY,y:Math.log1p(q.reach)}));
 if(new Set(pts.map(p=>p.t)).size<PARAMS.minGrowthTimestamps)return null;
 const slopes=[];for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(pts[j].t!==pts[i].t)slopes.push((pts[j].y-pts[i].y)/(pts[j].t-pts[i].t));
 const slope=median(slopes), intercept=median(pts.map(p=>p.y-slope*p.t)), change30=Math.expm1(30*slope);
 return {slopePerDay:slope,change30,intercept,flag:change30>PARAMS.growthUp?'growing':change30<PARAMS.growthDown?'shrinking':null};
}
```
In `scoreReel` after the reach score:
```js
 out.growth=growthOf(B);
 if(out.growth){const projected=Math.expm1(out.growth.intercept+out.growth.slopePerDay*r.t/DAY);out.xExpected=projected>0?r.reach/projected:null;}
```
(`B` must be in scope: restructure the `if(!out.bucket){...}` block into `const B=...; if(B.length<...) out.bucket='short_history'; else {Object.assign(out,reachScore(r,B)); /* growth lines */}`.)

- [ ] **Step 4:** tests PASS. **Step 5: Commit** `feat(money): Theil-Sen growth flag and validation-only xExpected`

### Task 3: comment rate and quadrant

**Files:** Modify `public/money/1.0.mjs`; Test `tests/money.test.mjs`

**Interfaces:** Produces `rate, rateKind ('shrunk'|'pooled'), rateBucket ('no_comments'|'too_few_plays'|'short_history'|bucket), prior {m,s2,tau2,alpha,beta}, threshold, quadrant ('star'|'billboard'|'closer'|'dud'|'insufficient'), quadrantReason`. Also exports `gammaPrior(rates, exposures)` for the known-answer test.

- [ ] **Step 1: Failing tests** (append)

```js
import {gammaPrior} from '../public/money/1.0.mjs';
test('gamma prior known answer: m=10, s2=12, e=1 gives alpha 50, beta 5',()=>{
 const rates=[8,9,10,11,12,10,10,6,14,10].map(v=>v); // mean 10
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
```

- [ ] **Step 2:** FAIL (`gammaPrior` not exported). 
- [ ] **Step 3: Implement** (add to `1.0.mjs`)

```js
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
// Method of moments for Gamma(shape alpha, rate beta) latent rates under Poisson counts with exposure e (1k reach).
// Observed-rate variance = latent variance + m * mean(1/e); subtract the Poisson part before fitting.
export function gammaPrior(rates,exposures){
 const m=mean(rates), s2=rates.reduce((s,v)=>s+(v-m)**2,0)/(rates.length-1), tau2=s2-m*mean(exposures.map(e=>1/e));
 if(!(tau2>0)||m===0)return {m,s2,tau2,alpha:null,beta:null};
 return {m,s2,tau2,alpha:m*m/tau2,beta:m/tau2};
}

function commentScore(r,B){
 if(r.comments===null)return {rateBucket:'no_comments'};
 if(r.reach<PARAMS.minReachForRate)return {rateBucket:'too_few_plays'};
 const P=B.filter(q=>q.comments!==null);if(P.length<PARAMS.minWindow)return {rateBucket:'short_history'};
 const e=P.map(q=>q.reach/1000), prior=gammaPrior(P.map((q,i)=>q.comments/e[i]),e);
 const rate=prior.alpha===null?prior.m:(prior.alpha+r.comments)/(prior.beta+r.reach/1000);
 return {rate,rateKind:prior.alpha===null?'pooled':'shrunk',rateBucket:null,prior};
}

// Comment threshold: median raw rate of window reels with known comments and 1,000+ reach; needs 10.
function quadrantOf(out,B){
 if(out.rate===null)return {quadrant:'insufficient',quadrantReason:out.rateBucket};
 const T=B.filter(q=>q.comments!==null&&q.reach>=PARAMS.minReachForRate).map(q=>q.comments/(q.reach/1000));
 if(T.length<PARAMS.minWindow)return {quadrant:'insufficient',quadrantReason:'short_history',threshold:null};
 const threshold=median(T), reachHigh=ge(out.xNormal,1), commentsHigh=out.rate>threshold+PARAMS.tol;
 return {threshold,quadrantReason:null,quadrant:reachHigh?(commentsHigh?'star':'billboard'):(commentsHigh?'closer':'dud')};
}
```
In `scoreReel`, inside the scored branch after growth:
```js
 Object.assign(out,commentScore(r,B));Object.assign(out,quadrantOf(out,B));
```

- [ ] **Step 4:** all money tests PASS, including the earlier future-append test (now covering rate and quadrant).
- [ ] **Step 5: Commit** `feat(money): shrunk comment rate with causal gamma prior, and quadrants`

### Task 4: keyword CTA parser

**Files:** Modify `public/money/1.0.mjs`; Test `tests/keyword.test.mjs`

**Interfaces:** Produces `keywordCtas(caption) -> {keyword:string|null, channel:'comment'|'dm'|null, evidence:string|null, matches:[{keyword, channel, evidence}]}`; `scoreReel` copies `keyword, keywordChannel, keywordEvidence, keywordMatches` into every ReelScore (all buckets).

- [ ] **Step 1: Failing tests** (`tests/keyword.test.mjs`; captions are paraphrased patterns, not copied creator content)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordCtas} from '../public/money/1.0.mjs';
const k=c=>keywordCtas(c).keyword;
test('positives: quoted, curly, mixed-case quoted, capitals, after emoji and line breaks',()=>{
 assert.equal(k('Comment “HAIR” and I’ll send you the routine 🌿👇'),'HAIR');
 assert.equal(k('Still bloated? 👀\n\nComment “Lime” and I’ll send you the recipe.'),'LIME');
 assert.equal(k('Want the plan? Comment YES below'),'YES');
 assert.equal(k('👉 comment "guide" for the full list'),'GUIDE');
 assert.equal(k('Type PLAN and I will DM you'),'PLAN');
 assert.equal(k('Recipe inside. Just comment TEA'),'TEA');
 assert.equal(k('Comment the word MORINGA for the routine'),'MORINGA');
 assert.equal(k('- Reply "7DAYS" to get it'),'7DAYS');
 assert.equal(k('Comment ‘ŞİFA’ ve gönderelim'),'ŞİFA');
});
test('negatives: ordinary sentences, stoplist, negation, narrative, overlong',()=>{
 for(const c of ['Comment your thoughts below','What type of business are you?','comment below if you agree','Comment BELOW','Don’t comment GUIDE yet','people keep asking me to comment LIME','Comment "ABCDEFGHIJKLMNOPQRSTU" now','I would comment YES','Comment A','Please don’t just comment TEA'])assert.equal(k(c),null,c);
});
test('DM channel, multiple CTAs, evidence',()=>{
 const dm=keywordCtas('DM me "START" for the plan');assert.deepEqual([dm.keyword,dm.channel],['START','dm']);
 const both=keywordCtas('DM me "START" for the plan.\nComment “TEA” for the recipe.');assert.equal(both.keyword,'TEA');assert.equal(both.channel,'comment');assert.equal(both.matches.length,2);
 assert.match(both.evidence,/Comment “TEA”/);
 assert.deepEqual(keywordCtas(''),{keyword:null,channel:null,evidence:null,matches:[]});
});
```

- [ ] **Step 2:** FAIL (no export).
- [ ] **Step 3: Implement** (add to `1.0.mjs`)

```js
// Keyword CTA: an imperative "Comment X" / "DM me X" where X is quoted, or in capitals in the original caption.
const ci=w=>[...w].map(c=>c===' '?'\\s+':/[a-z]/.test(c)?`[${c}${c.toUpperCase()}]`:c).join('');
const STOP=new Set(['YOUR','YOU','THE','OF','BELOW','THIS','THAT','ME','IT','A','AN','AND','OR','TO','FOR','IN','ON','WITH','DOWN','HERE']);
const LEAD=`(?:^\\s*|[.!?\\n\\-–—]\\s*|\\p{Extended_Pictographic}\\uFE0F?\\s*|${ci('just')}\\s+|${ci('please')}\\s+)`;
const VERB=`(?<c>${ci('comment')}|${ci('type')}|${ci('reply')}|${ci('write')})|(?<d>(?:${ci('dm')}|${ci('message')}|${ci('send')})\\s+${ci('me')})`;
const TOKEN=`(?:["“”'‘’](?<q>[\\p{L}\\p{N}]{2,20})["“”'‘’]|(?<u>(?=[\\p{Lu}\\p{N}]*\\p{Lu})[\\p{Lu}\\p{N}]{2,20})(?![\\p{L}\\p{N}]))`;
const CTA=new RegExp(`${LEAD}(?<verb>${VERB})\\s+(?:${ci('the word')}\\s+|${ci('word')}\\s+)?${TOKEN}`,'gdu');
const NEGATION=/\b(?:don'?t|do not|never|no need to)\b/;
export function keywordCtas(caption){
 const text=typeof caption==='string'?caption:'', matches=[];
 for(const m of text.matchAll(CTA)){
  const [verbStart]=m.indices.groups.verb, end=m.index+m[0].length;
  const before=text.slice(0,verbStart).replace(/[’‘]/g,"'").toLowerCase().split(/\s+/).filter(Boolean).slice(-3).join(' ');
  if(NEGATION.test(before))continue;
  const token=m.groups.q??m.groups.u;if(!m.groups.q&&STOP.has(token))continue;
  matches.push({keyword:token.toLocaleUpperCase('en'),channel:m.groups.c?'comment':'dm',evidence:text.slice(verbStart,end).trim().slice(0,80)});
 }
 const primary=matches.find(x=>x.channel==='comment')??matches[0]??null;
 return {keyword:primary?.keyword??null,channel:primary?.channel??null,evidence:primary?.evidence??null,matches};
}
```
In `scoreReel`, first line after `out` is created: `const kw=keywordCtas(r.caption);Object.assign(out,{keyword:kw.keyword,keywordChannel:kw.channel,keywordEvidence:kw.evidence,keywordMatches:kw.matches});` (and add `caption` to the `rows` objects already present).

Note on the "Please don’t just comment TEA" negative: LEAD `just` matches, NEGATION sees "please don't just" in the 3 tokens before the verb, so it is skipped. `ŞİFA` upper-cases with the `en` locale to `ŞİFA` (already upper case).

- [ ] **Step 4:** `node --test tests/keyword.test.mjs tests/money.test.mjs` — PASS. If a real-caption pattern fails in Task 7's validation, add it here as a test first, then fix.
- [ ] **Step 5: Commit** `feat(money): strict keyword CTA parser with channel and evidence`

### Task 5: summary, registry, manifest, golden freeze

**Files:** Modify `public/money/1.0.mjs`; Create `public/money/index.mjs`, `tests/fixtures/money-1.0-golden.json`; Test `tests/money.test.mjs`

**Interfaces:**
- Produces `summary = {reels, reelsWithReach, reelsScored, medianReach, winners, bigWinners, flops, quadrants:{star,billboard,closer,dud,insufficient}, ctaShare, topKeywords:[{keyword,reels,comments}], cumulativeComments, firstPublishedAt, lastPublishedAt, reelsPerWeek, growth}`.
- `index.mjs`: `VERSIONS`, `LATEST='money-1.0'`, `observedAtOf(job) -> {observedAt, source:'run'|'apify_finishedAt'|'unknown'}`, `hashInput(posts, observedAt) -> string`, `score(job, version=LATEST) -> {manifest:{formula,params,runId,observedAt,observedAtSource,inputHash}, results, summary}`.

- [ ] **Step 1: Failing tests** (append to `tests/money.test.mjs`)

```js
import {readFileSync,writeFileSync} from 'node:fs';
import {score,observedAtOf,LATEST,VERSIONS} from '../public/money/index.mjs';
const golden=()=>{const posts=account(Array.from({length:40},(_,i)=>1000+((i*37)%11)*300+(i===30?40000:0)),i=>({comments:Math.round((1000+((i*37)%11)*300)/1000*(5+(i*7)%9)),caption:i%3===0?`Comment "K${i%4}" and I will send it`:'no cta'}));return {id:'golden',scrape:{finishedAt:new Date(OBS).toISOString()},posts};};
test('summary counts and keywords',()=>{
 const {summary}=score(golden());
 assert.equal(summary.reels,40);assert.equal(summary.reelsScored,30);
 assert.equal(summary.topKeywords.length,4);assert.ok(summary.topKeywords[0].comments>=summary.topKeywords[1].comments);
 assert.ok(Math.abs(summary.ctaShare-14/40)<1e-9);assert.ok(Math.abs(summary.reelsPerWeek-40/(39/7))<1e-9);
});
test('observation time: run field, Apify finishedAt, or unknown for imports',()=>{
 assert.deepEqual(observedAtOf({observedAt:'2026-09-01T00:00:00Z'}),{observedAt:'2026-09-01T00:00:00Z',source:'run'});
 assert.deepEqual(observedAtOf({scrape:{finishedAt:'2026-09-02T00:00:00Z'}}),{observedAt:'2026-09-02T00:00:00Z',source:'apify_finishedAt'});
 assert.deepEqual(observedAtOf({imported:true,scrape:null}),{observedAt:null,source:'unknown'});
});
test('manifest names the formula and a stable input hash; unknown versions fail loudly',()=>{
 const a=score(golden()), b=score(golden());assert.equal(a.manifest.formula,'money-1.0');assert.equal(a.manifest.inputHash,b.manifest.inputHash);
 const changed=golden();changed.posts[0].plays+=1;assert.notEqual(score(changed).manifest.inputHash,a.manifest.inputHash);
 assert.throws(()=>score(golden(),'money-9.9'),/Unknown money formula/);assert.equal(LATEST,'money-1.0');assert.ok(VERSIONS['money-1.0']);
});
test('money-1.0 output is frozen (golden file)',()=>{
 const file=new URL('./fixtures/money-1.0-golden.json',import.meta.url);
 // Written once with UPDATE_GOLDEN=1 before money-1.0 is released; never regenerated afterwards.
 if(process.env.UPDATE_GOLDEN)writeFileSync(file,JSON.stringify(score(golden()),null,1)+'\n');
 const expected=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(JSON.parse(JSON.stringify(score(golden()))),expected);
});
```

- [ ] **Step 2:** FAIL (no index, no golden).
- [ ] **Step 3: Implement**

Add to `1.0.mjs` and return it from `scoreRun` (`return {results,summary:summarize(rows,results)};`):
```js
function summarize(rows,results){
 const all=Object.values(results), scored=all.filter(x=>x.xNormal!==null), withReach=rows.filter(r=>r.reach!==null);
 const count=l=>scored.filter(x=>x.label===l).length, quad=q=>all.filter(x=>x.quadrant===q).length;
 const kw=new Map();for(const x of all){if(!x.keyword)continue;const k=kw.get(x.keyword)??{keyword:x.keyword,reels:0,comments:0};k.reels++;k.comments+=x.comments??0;kw.set(x.keyword,k);}
 const ts=rows.map(r=>r.t).filter(t=>t!==null), first=ts.length?Math.min(...ts):null, last=ts.length?Math.max(...ts):null;
 const weeks=first!==null&&last>first?(last-first)/(7*DAY):null;
 const latest=[...scored].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0];
 return {reels:rows.length,reelsWithReach:withReach.length,reelsScored:scored.length,medianReach:median(withReach.map(r=>r.reach)),
  winners:count('winner')+count('big_winner'),bigWinners:count('big_winner'),flops:count('flop'),
  quadrants:{star:quad('star'),billboard:quad('billboard'),closer:quad('closer'),dud:quad('dud'),insufficient:quad('insufficient')},
  ctaShare:rows.length?all.filter(x=>x.keyword).length/rows.length:null,
  topKeywords:[...kw.values()].sort((a,b)=>b.comments-a.comments||a.keyword.localeCompare(b.keyword)).slice(0,10),
  cumulativeComments:scored.reduce((s,x)=>s+(x.comments??0),0),
  firstPublishedAt:first===null?null:new Date(first).toISOString(),lastPublishedAt:last===null?null:new Date(last).toISOString(),
  reelsPerWeek:weeks?ts.length/weeks:null,growth:latest?.growth?.flag??null};
}
```
Create `public/money/index.mjs`:
```js
// Registry of released money formulas. Old versions stay importable so any past result can be replayed exactly.
import * as v1_0 from './1.0.mjs';
export const VERSIONS=Object.freeze({[v1_0.FORMULA]:v1_0});
export const LATEST=v1_0.FORMULA;

// When the counts were read. Dataset download time is never used (spec 3.1).
export function observedAtOf(job){
 if(job.observedAt)return {observedAt:job.observedAt,source:'run'};
 if(!job.imported&&job.scrape?.finishedAt)return {observedAt:job.scrape.finishedAt,source:'apify_finishedAt'};
 return {observedAt:null,source:'unknown'};
}

// Identity of the inputs (FNV-1a, 32-bit): tells whether two reports were computed from the same data. Not security.
export function hashInput(posts,observedAt){
 const rows=posts.map(p=>[p.id,p.publishedAt??null,p.plays??null,p.views??null,p.comments??null,p.caption??'']).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 let h=0x811c9dc5;for(const ch of JSON.stringify([observedAt,rows])){h^=ch.codePointAt(0);h=Math.imul(h,0x01000193)>>>0;}
 return h.toString(16).padStart(8,'0');
}

export function score(job,version=LATEST){
 const impl=VERSIONS[version];if(!impl)throw new Error(`Unknown money formula ${version}`);
 const {observedAt,source}=observedAtOf(job);const {results,summary}=impl.scoreRun({posts:job.posts,observedAt});
 return {manifest:{formula:impl.FORMULA,params:impl.PARAMS,runId:job.id,observedAt,observedAtSource:source,inputHash:hashInput(job.posts,observedAt)},results,summary};
}
```
Generate the golden file once and review it by eye (r030 must be `big_winner`; counts must match the summary test) before committing:
```bash
UPDATE_GOLDEN=1 node --test tests/money.test.mjs && node --test tests/money.test.mjs
```

- [ ] **Step 4:** `npm test` — all PASS (existing 21 plus new).
- [ ] **Step 5: Commit** `feat(money): summary, version registry, manifest; freeze money-1.0 with a golden file`

### Task 6: durable checkpoints, progress coalescing, observation time

**Files:** Modify `lib/pipeline.mjs`; Test `tests/checkpoints.test.mjs`

**Interfaces:**
- `new Pipeline(root, keys, {..., saveDelayMs=1000, writer=atomic})`.
- `save(job, {durable=false}={}) -> Promise`: durable writes now (awaited, rejects on failure); progress writes at most once per `saveDelayMs`. `persist(job)` serializes writes and clones at write time.
- Jobs gain `observedAt` (Apify `finishedAt`) and `retrievedAt` (download time).

- [ ] **Step 0: Back up data** `cp -R data ~/Dev/archive/creator-lab-data-backup-2026-09-25` (copy, nothing deleted).
- [ ] **Step 1: Failing tests** (`tests/checkpoints.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pipeline,atomic} from '../lib/pipeline.mjs';
const keys=()=>({apify:'a',groq:'g',jev:'j'});
const settle=async p=>{while(p.active.size)await new Promise(r=>setTimeout(r,5));};
test('the launch marker is on disk before Apify is called, and a lost response blocks a relaunch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-ck-'));const real=global.fetch;let file;
 global.fetch=async url=>{if(String(url).includes('/acts/')){file=JSON.parse(await readFile(join(root,'runs',job.id+'.json'),'utf8'));throw new Error('socket hang up');}throw new Error('unexpected '+url);};
 let job;try{const p=await new Pipeline(root,keys).init();job=await p.create({creator:'tester',limit:5});await p.run(job.id);await settle(p);await p.writes.get(job.id);
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
  if(u.includes('typesafe.ai')){const req=JSON.parse(opts.body);return Response.json({model:req.model,answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9,probabilities:{}}])),usage:{input_tokens:10}});}
  throw new Error('unexpected '+u);};
 try{const p=await new Pipeline(root,keys).init();const job=await p.create({creator:'tester',limit:1});await p.run(job.id);await settle(p);await p.writes.get(job.id);
  assert.equal(job.status,'complete');assert.equal(job.observedAt,finishedAt);assert.ok(Date.parse(job.retrievedAt)>=Date.parse(finishedAt));
 }finally{global.fetch=real;await rm(root,{recursive:true,force:true});}
});
```

- [ ] **Step 2:** `node --test tests/checkpoints.test.mjs` — FAIL (writer option ignored, writes counted wrong, observedAt undefined).
- [ ] **Step 3: Implement** in `lib/pipeline.mjs` (keep the dense style):
  - Constructor signature: `constructor(root,keys,{groqRpm=20,transcriptionProvider='groq',fireworksRpm=60,saveDelayMs=1000,writer=atomic}={})` and add `this.saveDelayMs=saveDelayMs;this.writer=writer;this.saveTimers=new Map();`.
  - Replace `save(job)` with:
```js
 // Durable saves (launch markers, run ids, status changes) are written now and awaited; progress saves are coalesced.
 save(job,{durable=false}={}){this.emit(job);if(durable)return this.persist(job);if(!this.saveTimers.has(job.id))this.saveTimers.set(job.id,setTimeout(()=>{this.persist(job).catch(e=>console.error(`Creator Lab: progress save failed for ${job.id}: ${e.message}`));},this.saveDelayMs));return Promise.resolve();}
 // One serialized chain per run; the snapshot is taken when the write starts, so a later write never holds older state.
 persist(job){clearTimeout(this.saveTimers.get(job.id));this.saveTimers.delete(job.id);const prev=this.writes.get(job.id)||Promise.resolve();const next=prev.catch(()=>{}).then(()=>this.writer(join(this.root,'runs',job.id+'.json'),structuredClone(job)));this.writes.set(job.id,next);return next;}
```
  - Durable call sites (change `await this.save(j)` to `await this.save(j,{durable:true})`): `create()` final save; `pause()` return; `run()` first save after setting status; before `startScrape` (`j.scrapeUncertain=true`); after `startScrape` returns; after the dataset is collected (`j.status='running'`); the `finally` save; `attachScrape()` save. All other saves stay progress saves.
  - After `const raw=await providers.dataset(...)`: `j.observedAt=j.scrape.finishedAt||null;j.retrievedAt=new Date().toISOString();`.
  - `finally` becomes: `finally{j.elapsedMs+=Date.now()-start;this.active.delete(id);try{await this.save(j,{durable:true});}catch(e){j.error=`Could not save this run: ${e.message}`;this.emit(j);console.error(`Creator Lab: ${j.error}`);}}`.
- [ ] **Step 4:** `npm test` — all PASS, including the original pipeline tests.
- [ ] **Step 5: Commit** `fix(pipeline): durable checkpoints around paid launches, coalesced progress saves, observation time`

### Task 7: transcript cache policy

**Files:** Create `lib/transcript-policy.mjs`; Modify `lib/pipeline.mjs`; Test `tests/transcript-policy.test.mjs`

**Interfaces:** `TRANSCRIPT_POLICY=2`, `transcriptPolicy(language) -> {version:2, language}`, `transcriptKey(job, postId, provider, model) -> string`. `create()` stores `job.transcriptPolicy`.

- [ ] **Step 1: Failing tests**

```js
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
 let groq=0;const real=global.fetch;global.fetch=async(url,opts)=>{if(String(url).includes('groq.com')){groq++;return Response.json({text:'Doğru Türkçe metin burada var tamam mı',segments:[],duration:8});}if(String(url).includes('typesafe.ai'))return Response.json(jevOk(JSON.parse(opts.body)));throw new Error('unexpected');};
 try{const p=await new Pipeline(root,()=>({groq:'g',jev:'j'})).init();const job=await p.create({creator:'tester',limit:1},[{id:'reel1',ownerUsername:'tester',videoUrl:'https://scontent.cdninstagram.com/v.mp4',videoDuration:8}]);
  if(legacy)delete job.transcriptPolicy;await p.run(job.id);while(p.active.size)await new Promise(r=>setTimeout(r,5));await p.writes.get(job.id);return {groq,text:job.posts[0].transcript.text};
 }finally{global.fetch=real;}
}
test('a new run never reads a legacy transcript; a legacy run still does',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-tp-'));
 try{await (await new Pipeline(root,()=>({}))).init();await writeFile(join(root,'cache','transcript-reel1.json'),JSON.stringify({text:'Wrong english words from before the fix',segments:[],source:'groq'}));
  const fresh=await runOnce(root,{legacy:false});assert.equal(fresh.groq,1);assert.match(fresh.text,/Türkçe/);
  const old=await runOnce(root,{legacy:true});assert.equal(old.groq,0);assert.match(old.text,/Wrong english/);
  const again=await runOnce(root,{legacy:false});assert.equal(again.groq,0);assert.match(again.text,/Türkçe/);
 }finally{await rm(root,{recursive:true,force:true});}
});
```

- [ ] **Step 2:** FAIL (module missing).
- [ ] **Step 3: Implement** `lib/transcript-policy.mjs`:
```js
// Transcript cache keys. Policy 1 (upstream): one transcript per reel id, whatever language was requested, so a run
// set to English kept reusing wrong transcripts of Turkish speech. Policy 2 keys also carry the requested language
// (or auto), provider and model. Policy-2 runs never read policy-1 keys; no cache file is deleted.
export const TRANSCRIPT_POLICY=2;
export const transcriptPolicy=language=>({version:TRANSCRIPT_POLICY,language:language||''});
const safe=s=>String(s).replace(/[^\w.-]+/g,'_');
export function transcriptKey(job,postId,provider,model){
 if(job.transcriptPolicy?.version!==TRANSCRIPT_POLICY)return `transcript-${postId}`;
 return `transcript-v2-${safe(postId)}-${job.transcriptPolicy.language||'auto'}-${safe(provider)}-${safe(model)}`;
}
```
In `lib/pipeline.mjs`: `import {transcriptKey,transcriptPolicy} from './transcript-policy.mjs';`; in `create()` add `transcriptPolicy:transcriptPolicy(language),` to the job object; in the worker replace both `` `transcript-${p.id}` `` uses with `tkey` where `const tkey=transcriptKey(j,p.id,provider,providers.transcriptionProviders[provider].model);` is declared at the top of the `if(!p.transcript){...}` block.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5: Commit** `fix(pipeline): versioned transcript cache policy so wrong-language transcripts are never reused`

### Task 8: server report route, static modules, manifest record

**Files:** Create `lib/money-report.mjs`, `tests/money-report.test.mjs`, `tests/server-money.test.mjs`; Modify `server.mjs`

**Interfaces:** `moneyReport(job, version, root) -> Promise<{manifest, results, summary, versions}>` writes `data/scores/<runId>.json` = `{shownAt, manifest}`. HTTP: `GET /api/runs/:id/money?version=money-1.0`; static `GET /money/index.mjs`, `GET /money/1.0.mjs`.

- [ ] **Step 1: Failing tests**

`tests/money-report.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {moneyReport} from '../lib/money-report.mjs';
test('report returns results and records the manifest that was shown',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-mr-'));
 try{const job={id:'run1',scrape:{finishedAt:'2026-09-25T00:00:00Z'},posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'Comment "YES"'}]};
  const r=await moneyReport(job,undefined,root);assert.equal(r.manifest.formula,'money-1.0');assert.deepEqual(r.versions,['money-1.0']);assert.equal(r.results.a.keyword,'YES');
  const saved=JSON.parse(await readFile(join(root,'scores','run1.json'),'utf8'));assert.equal(saved.manifest.inputHash,r.manifest.inputHash);
  await assert.rejects(moneyReport(job,'money-0.1',root),/Unknown money formula/);
 }finally{await rm(root,{recursive:true,force:true});}
});
```
`tests/server-money.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server serves the money report and the money modules',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-'));const port=5400+Math.floor(Math.random()*400);
 await mkdir(join(root,'runs'),{recursive:true});
 await writeFile(join(root,'runs','run1.json'),JSON.stringify({id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',scrape:{finishedAt:'2026-09-25T00:00:00Z'},posts:[{id:'a',publishedAt:'2026-09-01T00:00:00Z',plays:1000,comments:2,caption:'Comment "YES"'}],events:[]}));
 const child=spawn(process.execPath,['server.mjs'],{env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;
  const rep=await (await fetch(`${base}/api/runs/run1/money`)).json();assert.equal(rep.manifest.formula,'money-1.0');assert.equal(rep.results.a.keyword,'YES');
  const bad=await fetch(`${base}/api/runs/run1/money?version=money-0.1`);assert.equal(bad.status,400);
  for(const f of ['/money/index.mjs','/money/1.0.mjs']){const r=await fetch(base+f);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);}
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** `lib/money-report.mjs`:
```js
// Money report for one run: computed on request from saved data; records which formula version was shown.
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {score,VERSIONS,LATEST} from '../public/money/index.mjs';
import {atomic} from './pipeline.mjs';
export async function moneyReport(job,version,root){
 const report=score(job,version||LATEST);
 await mkdir(join(root,'scores'),{recursive:true});
 await atomic(join(root,'scores',job.id+'.json'),{shownAt:new Date().toISOString(),manifest:report.manifest});
 return {...report,versions:Object.keys(VERSIONS)};
}
```
`server.mjs`: add `import {moneyReport} from './lib/money-report.mjs';`; extend the run route regex group to `(run|pause|export|metrics|attach|money)`; before the `export` branch add `if(action==='money'){json(res,200,await moneyReport(job,url.searchParams.get('version'),pipeline.root));return;}`; add `'/money/index.mjs':'money/index.mjs','/money/1.0.mjs':'money/1.0.mjs'` to the static `files` map.
- [ ] **Step 4:** `npm test` PASS; `npm run check` PASS.
- [ ] **Step 5: Commit** `feat(server): money report route, money modules served, shown-version record`

### Task 9: validate on real runs (hand check)

**Files:** Create `scripts/validate-money.mjs` (prints only; reads `data/runs`)

- [ ] **Step 1: Implement**
```js
// Hand check: run the latest money formula on every local run and print what a person should verify. Reads data/ only.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {score} from '../public/money/index.mjs';
const dir=join(process.cwd(),'data','runs');
for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')&&!n.endsWith('.raw.json')&&!n.endsWith('.summary.json'))){
 const job=JSON.parse(await readFile(join(dir,name),'utf8'));const {manifest,results,summary}=score(job);const R=Object.values(results);
 console.log(`\n@${job.creator} ${job.posts.length} reels · ${manifest.formula} · observed ${manifest.observedAt} (${manifest.observedAtSource})`);
 console.log(JSON.stringify({...summary,topKeywords:summary.topKeywords.slice(0,5)}));
 const buckets={};for(const r of R){const b=r.bucket??'scored';buckets[b]=(buckets[b]||0)+1;}console.log('buckets',JSON.stringify(buckets));
 for(const r of R.filter(r=>r.xNormal!==null).sort((a,b)=>b.xNormal-a.xNormal).slice(0,8))console.log(`  ${r.id} ${r.xNormal.toFixed(1)}x ${r.label} rate ${r.rate?.toFixed(1)} ${r.rateKind} ${r.quadrant} ${r.keyword??'-'} age ${r.ageDays.toFixed(0)}d${r.growth?.flag?' '+r.growth.flag:''}`);
 const missed=job.posts.filter(p=>/\b(comment|dm me|type)\b/i.test(p.caption||'')&&!results[p.id].keyword);
 console.log(`  captions mentioning comment/DM/type without a parsed keyword: ${missed.length}`);for(const p of missed.slice(0,5))console.log('   ?',(p.caption||'').replace(/\s+/g,' ').slice(0,120));
}
```
- [ ] **Step 2: Run** `node scripts/validate-money.mjs` and compare with the session's hand analysis of ken.remedie 100 reels: about 79 scored, 10 short history, 11 too new, about 31 winners and 21 big winners, RECIPE/FOOD/TEETH/LIME among the top by x normal, keyword CTA on 100 of 100 captions, top keywords by comments LIME, COOKIE, CHEESECAKE, YES. Any caption listed as missed is either a true negative (write down why) or a parser bug (add a test to `tests/keyword.test.mjs` first, fix, re-run). Differences from the spike are expected only where the spec changed a rule (expm1/log1p, strictly earlier window); explain each.
- [ ] **Step 3: Commit** `chore: script to validate money metrics on local runs`

### Task 10: Money UI (Codex GPT-6 Astra builds, Claude inspects)

**Files (Astra may touch only):** `public/app.js`, `public/index.html`, `public/styles.css`, new `public/money-view.mjs`, new `tests/money-view.test.mjs`, and one static-map line in `server.mjs` for `/money-view.mjs`. Everything else is read-only for Astra.

- [ ] **Step 1:** Write `docs/money-ui-brief.md` with: data source (`GET /api/runs/:id/money`, fields from Task 5), the reel-panel additions (x its previous posts with age, label, comment rate wording rules, keyword with evidence, quadrant or reason in plain words), the Money view (2x2 of thumbnails using `/media/<runId>/<postId>`, account summary, Stars/Billboards/Closers lists, version shown, a "How this is measured" panel with the spec's plain-language rules), demo mode shows "Run a real analysis to see money metrics", bucket reasons in plain words (too new: "under 7 days old, still collecting plays"; short history: "needs 10 earlier reels"; too few plays: "under 1,000 plays"; pooled: "not enough variation in earlier reels"), design matches the existing Creator Lab look, keyboard focus visible, reduced motion respected, 1440x900 and 1024x768 without overflow, and the list of files it must not touch.
- [ ] **Step 2:** Launch `codex exec -m gpt-6-astra -s workspace-write -C ~/Dev/active/creator-lab -o <scratchpad>/codex-money-ui.md "<brief pointer + rules>" < /dev/null > <scratchpad>/codex-money-ui.log 2>&1` in the background.
- [ ] **Step 3:** When done: `git status` shows only allowed files changed; `npm test` PASS; start the app (preview config `creator-lab`), open ken.remedie's run, screenshot the Money view and a reel panel at both sizes, check console errors, check the numbers on screen equal `scripts/validate-money.mjs` output for 3 reels.
- [ ] **Step 4:** Fix issues (small fixes by Claude; big ones back to Astra with the list). 
- [ ] **Step 5: Commit** named files only: `feat(ui): Money view and reel money fields`

### Task 11: final audit and hand-off

- [ ] **Step 1:** `npm test` and `npm run check` — all PASS; paste the counts.
- [ ] **Step 2:** Codex GPT-6 Astra read-only review of the full diff (`git diff upstream/main...HEAD -- . ':!docs'`) against the spec, same format as the design reviews. Fix every real finding with a test first.
- [ ] **Step 3:** Update `CLAUDE.md` (Money view, validation script), `lessons.md` (anything learned), `~/Dev/active/office/NEEDS.md` (Kaan: spot-check 10 reels in the Money view; re-run Slush'D with auto-detect when he wants, about $0.05).
- [ ] **Step 4:** Commit named files; do not push.
- [ ] **Step 5:** Open the app in Kaan's Chrome on the ken.remedie Money view; report with screenshots, test counts, what was not verified.

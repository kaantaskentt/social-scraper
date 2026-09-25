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

// Theil-Sen slope of log1p(reach) per day over the window; pairs with equal publish times are skipped.
function growthOf(B){
 const pts=B.map(q=>({t:q.t/DAY,y:Math.log1p(q.reach)}));
 if(new Set(pts.map(p=>p.t)).size<PARAMS.minGrowthTimestamps)return null;
 const slopes=[];for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(pts[j].t!==pts[i].t)slopes.push((pts[j].y-pts[i].y)/(pts[j].t-pts[i].t));
 const slope=median(slopes), intercept=median(pts.map(p=>p.y-slope*p.t)), change30=Math.expm1(30*slope);
 return {slopePerDay:slope,change30,intercept,flag:change30>PARAMS.growthUp?'growing':change30<PARAMS.growthDown?'shrinking':null};
}

function scoreReel(r,dated){
 const out={id:r.id,publishedAt:r.publishedAt,reach:r.reach,reachDisagree:r.disagree,ageDays:r.age,comments:r.comments,
  bucket:null,xNormal:null,z:null,label:null,baseline:null,windowSize:0,windowMedianAgeDays:null,growth:null,xExpected:null,
  rate:null,rateKind:null,rateBucket:null,prior:null,threshold:null,quadrant:'insufficient',quadrantReason:null};
 out.bucket=r.t===null?'no_date':r.reach===null?'no_reach':r.age===null?'unknown_observation':r.age<PARAMS.minAgeDays?'too_new':null;
 if(!out.bucket){
  const B=windowFor(r,dated);out.windowSize=B.length;
  if(B.length<PARAMS.minWindow)out.bucket='short_history';
  else{
   Object.assign(out,reachScore(r,B));
   out.growth=growthOf(B);
   // Validation only (spec 4.3): not shown until build 3 decides.
   if(out.growth){const projected=Math.expm1(out.growth.intercept+out.growth.slopePerDay*r.t/DAY);out.xExpected=projected>0?r.reach/projected:null;}
  }
 }
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

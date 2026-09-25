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

const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
// Method of moments for Gamma(shape alpha, rate beta) latent rates under Poisson counts with exposure e (1k reach).
// Observed-rate variance = latent variance + m * mean(1/e); subtract the Poisson part before fitting.
export function gammaPrior(rates,exposures){
 const m=mean(rates), s2=rates.reduce((s,v)=>s+(v-m)**2,0)/(rates.length-1), tau2=s2-m*mean(exposures.map(e=>1/e));
 if(!(tau2>0)||m===0)return {m,s2,tau2,alpha:null,beta:null};
 return {m,s2,tau2,alpha:m*m/tau2,beta:m/tau2};
}

// Comment rate per 1,000 reach, shrunk toward the earlier reels' typical rate (spec 4.4).
function commentScore(r,B){
 if(r.comments===null)return {rateBucket:'no_comments'};
 if(r.reach<PARAMS.minReachForRate)return {rateBucket:'too_few_plays'};
 const P=B.filter(q=>q.comments!==null);if(P.length<PARAMS.minWindow)return {rateBucket:'short_history'};
 const e=P.map(q=>q.reach/1000), prior=gammaPrior(P.map((q,i)=>q.comments/e[i]),e);
 const rate=prior.alpha===null?prior.m:(prior.alpha+r.comments)/(prior.beta+r.reach/1000);
 return {rate,rateKind:prior.alpha===null?'pooled':'shrunk',rateBucket:null,prior};
}

// Comment threshold: median raw rate of window reels with known comments and 1,000+ reach; needs 10 (spec 4.6).
function quadrantOf(out,B){
 if(out.rate===null)return {quadrant:'insufficient',quadrantReason:out.rateBucket};
 const T=B.filter(q=>q.comments!==null&&q.reach>=PARAMS.minReachForRate).map(q=>q.comments/(q.reach/1000));
 if(T.length<PARAMS.minWindow)return {quadrant:'insufficient',quadrantReason:'short_history',threshold:null};
 const threshold=median(T), reachHigh=ge(out.xNormal,1), commentsHigh=out.rate>threshold+PARAMS.tol;
 return {threshold,quadrantReason:null,quadrant:reachHigh?(commentsHigh?'star':'billboard'):(commentsHigh?'closer':'dud')};
}

// Keyword CTA: an imperative "Comment X" / "DM me X" where X is quoted, or in capitals in the original caption (spec 4.5).
const ci=w=>[...w].map(c=>c===' '?'\\s+':/[a-z]/.test(c)?`[${c}${c.toUpperCase()}]`:c).join('');
const STOP=new Set(['YOUR','YOU','THE','OF','BELOW','THIS','THAT','ME','IT','A','AN','AND','OR','TO','FOR','IN','ON','WITH','DOWN','HERE']);
const LEAD=`(?:^\\s*|[.!?…\\n\\-–—]\\s*|\\p{Extended_Pictographic}\\uFE0F?\\s*|(?<![\\p{L}\\p{N}])(?:${ci('just')}|${ci('please')}|${ci('or')}|${ci('and')})\\s+)`;
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

function scoreReel(r,dated){
 const kw=keywordCtas(r.caption);
 const out={id:r.id,publishedAt:r.publishedAt,reach:r.reach,reachDisagree:r.disagree,ageDays:r.age,comments:r.comments,
  keyword:kw.keyword,keywordChannel:kw.channel,keywordEvidence:kw.evidence,keywordMatches:kw.matches,
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
   Object.assign(out,commentScore(r,B));Object.assign(out,quadrantOf(out,B));
  }
 }
 if(out.bucket){out.rateBucket=out.bucket;out.quadrantReason=out.bucket;}
 return out;
}

// Account summary (spec 4.7). No per-day lead claim: one snapshot cannot show when comments arrived.
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

export function scoreRun({posts,observedAt}){
 const obs=time(observedAt);
 const rows=posts.map(p=>{const {reach,disagree}=reachOf(p),t=time(p.publishedAt);return {id:p.id,publishedAt:p.publishedAt??null,t,reach,disagree,comments:known(p.comments)?p.comments:null,caption:typeof p.caption==='string'?p.caption:'',age:obs!==null&&t!==null?(obs-t)/DAY:null};});
 const dated=rows.filter(r=>r.t!==null).sort((a,b)=>a.t-b.t||(a.id<b.id?-1:a.id>b.id?1:0));
 const results={};for(const r of rows)results[r.id]=scoreReel(r,dated);
 return {results,summary:summarize(rows,results)};
}

// Does our judge (lib/reel-score.mjs) know a winner when it sees one? It scores a channel's own past reels, and code
// checks whether higher scores go with more views against the creator's normal (xNormal). Kaan, 2026-09-28: "test the
// judge"; every number here is computed by code from saved scores, never written by a model.
import {PARTS,total} from './reel-score.mjs';
import {spearman,permutationP,bootstrapCI,bh} from './dna.mjs';

const r2=v=>Math.round(v*100)/100,r3=v=>Math.round(v*1000)/1000;
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;

// The chance that a random winner (top fifth by xNormal) scores higher than a random other reel; 0.5 = a coin flip.
export function auc(scores,isWinner){
 const w=scores.filter((_,i)=>isWinner[i]),o=scores.filter((_,i)=>!isWinner[i]);if(!w.length||!o.length)return null;
 let wins=0;for(const a of w)for(const b of o)wins+=a>b?1:a===b?0.5:0;return wins/(w.length*o.length);
}

// items: [{id, xNormal, runs:[rubric scores, ...]}] with at least two runs each for the self-agreement check.
export function judgeTest(items,{perms=2000,boots=1000}={}){
 if(items.length<30)return {verdict:'too_few',reels:items.length};
 const y=items.map(i=>Math.log(i.xNormal));
 const avg=k=>items.map(i=>mean(i.runs.map(s=>k==='total'?total(s):s[k]||0)));
 const rows=['total',...PARTS].map(k=>{const x=avg(k),rho=spearman(x,y);return {part:k,rho:r3(rho),p:permutationP(x,y,{n:perms}),ci:bootstrapCI(x,y,{n:boots}).map(r3)};});
 const q=bh(rows.map(r=>r.p));rows.forEach((r,i)=>{r.q=r3(q[i]);r.p=r3(r.p);});
 // Self-agreement: the same reel watched twice. A judge that disagrees with itself cannot rank reels.
 const two=items.filter(i=>i.runs.length>=2),a=two.map(i=>total(i.runs[0])),b=two.map(i=>total(i.runs[1]));
 const selfRho=two.length>=10?r3(spearman(a,b)):null,selfGap=two.length?r2(mean(a.map((v,i)=>Math.abs(v-b[i])))):null;
 // Winners: the top fifth by xNormal.
 const cut=[...items.map(i=>i.xNormal)].sort((p,q)=>q-p)[Math.max(0,Math.floor(items.length/5)-1)];
 const isWinner=items.map(i=>i.xNormal>=cut),totals=avg('total');
 const winnersAvg=r2(mean(totals.filter((_,i)=>isWinner[i]))),othersAvg=r2(mean(totals.filter((_,i)=>!isWinner[i])));
 const t=rows[0],clear=t.ci[0]>0;
 // Ken, 2026-09-28: rho 0.24 cleared zero, yet winners scored 5.67 vs 5.65 and a winner beat another reel 53% of
 // the time. "Predicts" therefore also needs the judge to pick out winners, not only lean the right way.
 const winAuc=auc(totals,isWinner);
 const verdict=clear&&t.q<=0.1&&t.rho>=0.3&&winAuc>=0.65?'predicts':clear?'weak':'no';
 return {verdict,reels:items.length,total:t,parts:rows.slice(1),selfRho,selfGap,winners:{n:isWinner.filter(Boolean).length,winnersAvg,othersAvg,auc:r3(winAuc)}};
}

// One plain sentence for the page and the report.
export function judgeSentence(t){
 if(!t||t.verdict==='too_few')return `Too few reels to test the judge (${t?.reels??0}; it needs 30).`;
 const w=t.winners;
 const head=t.verdict==='predicts'?'The judge spots this channel\'s winners':t.verdict==='weak'?'The judge leans the right way but cannot pick out winners':'The judge does not spot this channel\'s winners';
 return `${head}: across ${t.reels} reels, higher scores go with more views at rho ${t.total.rho} (range ${t.total.ci[0]} to ${t.total.ci[1]}). Top-fifth reels average ${w.winnersAvg} vs ${w.othersAvg} for the rest; a random winner outscores a random other reel ${Math.round(w.auc*100)}% of the time (50% = coin flip). Scored twice, the judge agrees with itself at rho ${t.selfRho}.`;
}

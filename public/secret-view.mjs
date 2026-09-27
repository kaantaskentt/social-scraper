// Channel Secret page: pure render (data in, HTML out), with playable proof.
import {LABELS} from './secret-labels.mjs';
import {MECHANISMS,STRENGTH_LABEL} from './secret-mechanisms.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`$${Number(n).toFixed(2)}`;
const CARDS=[['person','Person'],['setting','Setting'],['format','Format'],['script','Script'],['sound','Sound'],['pace','Pace']];
const KIND={risk:'Risk',weakness:'Weak spot',opportunity:'Opportunity'};
const section=(id,title,description,body)=>`<section id="${escape(id)}" class="secret-section"><div class="secret-section-head"><h3>${escape(title)}</h3><p>${escape(description)}</p></div>${body}</section>`;
const empty=text=>`<p class="secret-empty">${escape(text)}</p>`;

function proof(ids=[],imageFor,max=4){
 if(!ids.length)return '';
 return `<div class="secret-proof"><span class="secret-proof-label">Proof</span>${ids.slice(0,max).map(id=>`<button type="button" class="secret-thumb" data-secret-play="${escape(id)}" aria-label="Play reel ${escape(id)}"><img src="${escape(imageFor(id))}" alt="" loading="lazy" onerror="this.hidden=true"></button>`).join('')}${ids.length>max?`<span class="secret-more">+${ids.length-max}</span>`:''}</div>`;
}

function intro(account,plan){
 const what='<ul class="secret-what"><li>Watches the videos with sound</li><li>Finds the patterns they share</li><li>Compares the best reels with the weakest, with proof you can play</li></ul>';
 const title=`<h2>Why @${escape(account)} wins</h2>`;
 if(plan?.error)return `<div class="secret-intro">${title}${what}<p class="secret-error">${escape(plan.error)}</p></div>`;
 if(!plan)return `<div class="secret-intro">${title}<p>Choose an analysed channel to build its Secret.</p></div>`;
 return `<div class="secret-intro">${title}<p>Understand this channel’s formula in one clear page.</p>${what}
<button type="button" class="primary" data-secret="build">Build the Secret · about ${money(plan.usd)}</button>
<p class="secret-note">${escape(plan.winners)} best and ${escape(plan.flops)} weakest reels · ${Math.round(plan.seconds/60)} min of video. Nothing is spent until you press.</p></div>`;
}

export function renderSecret(status,{account,imageFor}){
 if(status.state==='building')return `<div class="secret-intro"><h2>Building the Secret for @${escape(account)}</h2><p class="secret-stage" role="status">${escape(status.stage)} · ${escape(status.done)} of ${escape(status.total)}</p><progress value="${escape(status.done)}" max="${escape(status.total)}" aria-label="Reels analysed"></progress><p class="secret-note">Usually a few minutes. You can use the other tabs meanwhile.</p></div>`;
 if(status.state!=='done'||!status.saved){
  if(status.state==='failed')return `<div class="secret-intro"><h2>The Secret stopped</h2><p class="secret-error">${escape(status.error)}</p>${status.plan&&!status.plan.error?'<button type="button" class="primary" data-secret="build">Try again</button>':''}<p class="secret-note">Reels already watched are not paid again.</p></div>`;
  return intro(account,status.plan);
 }
 const s=status.saved,sec=s.secret,st=s.stats,names=st.names||{};
 const labelText=(q,v)=>names[q]?.values?.[v]||LABELS[q]?.[1]?.[v]||v;
 const questionText=q=>names[q]?.title||LABELS[q]?.[0]||q;
 const winners=s.picked.filter(p=>p.group==='winner').length,flops=s.picked.length-winners;
 const differences=[...st.differences].sort((a,b)=>Math.abs(b.winners-b.flops)-Math.abs(a.winners-a.flops));
 const biggest=differences[0],common=[...st.house].sort((a,b)=>b.count-a.count)[0],n=st.numbers;
 const kpi=(label,value,detail,context)=>`<article class="secret-kpi"><h3>${escape(label)}</h3><p class="secret-kpi-value">${escape(value)}</p><p class="secret-kpi-detail">${escape(detail)}</p><p class="secret-note">${escape(context)}</p></article>`;
 const gapTile=biggest?kpi('Biggest difference',`${biggest.winners} vs ${biggest.flops}`,labelText(biggest.question,biggest.value),`of ${biggest.perSide} best / of ${biggest.perSide} weakest`):kpi('Biggest difference','No clear gap','No standout difference found','Across the reels watched');
 const likes=n.likesPer1k;
 const likesTile=likes?.clear&&Number.isFinite(likes.winners)&&Number.isFinite(likes.flops)?kpi('Likes per 1,000 views',`${likes.winners} vs ${likes.flops}`,'Best vs weakest','Typical likes for the same view count'):common?kpi('Most common pattern',`${common.count} of ${common.total}`,labelText(common.question,common.value),'reels share this house style'):kpi('House style','No shared pattern','No common house-style fact found','Across the reels watched');
 const kpis=`<div class="secret-kpis" aria-label="Channel at a glance">${gapTile}${likesTile}${kpi('Reels watched',`${winners} best + ${flops} weakest`,'reels watched','The sample behind this page')}</div>`;
 const cards=CARDS.filter(([k])=>sec[k]?.evidence?.length).map(([k,t])=>`<article class="secret-card"><h4 class="secret-card-label">${t}</h4><p>${escape(sec[k].text)}</p>${proof(sec[k].evidence,imageFor)}</article>`).join('');
 const why=(sec.why||[]).filter(w=>MECHANISMS[w.mechanism]).map(w=>{const m=MECHANISMS[w.mechanism];return `<article class="secret-card secret-why"><div class="secret-mech"><h4>${escape(m.name)}</h4><span class="secret-strength secret-${escape(m.strength)}">${escape(STRENGTH_LABEL[m.strength])}</span></div><p>${escape(w.pattern)}</p><p class="secret-meaning">${escape(m.meaning)}</p>${proof(w.evidence,imageFor,3)}<p class="secret-source">${escape(m.source)}</p></article>`;}).join('');
 const critique=sec.critique||[],risks=critique.filter(c=>c.kind==='risk');
 const risk=risks.length?`<aside class="secret-risk" aria-labelledby="secret-risk-title"><h3 id="secret-risk-title">Before you copy</h3><ul>${risks.map(c=>`<li><span class="secret-kind secret-kind-risk">Risk</span><p>${escape(c.point)}</p></li>`).join('')}</ul></aside>`:'';
 const watchouts=critique.filter(c=>c.kind==='weakness'||c.kind==='opportunity').map(c=>`<li><span class="secret-kind secret-kind-${escape(c.kind)}">${escape(KIND[c.kind])}</span><p>${escape(c.point)}</p>${proof(c.evidence,imageFor,3)}</li>`).join('');
 const bar=(count,total,group)=>{
  const width=total>0?Math.max(0,Math.min(100,Number(count)/Number(total)*100)):0;
  return `<div class="secret-bar-row"><span class="secret-bar-track" aria-hidden="true"><i class="secret-bar-${group}" style="width:${Number.isFinite(width)?width:0}%"></i></span><span>${escape(count)} of ${escape(total)} ${group}</span></div>`;
 };
 const diffs=differences.map(d=>{
  const gap=d.winners-d.flops;
  return `<li class="secret-diff"><div class="secret-diff-label"><small>${escape(questionText(d.question))}</small><p>${escape(labelText(d.question,d.value))}</p></div><div class="secret-bars">${bar(d.winners,d.perSide,'best')}${bar(d.flops,d.perSide,'weakest')}</div><span class="secret-gap ${gap>0?'secret-gap-best':gap<0?'secret-gap-weakest':''}">${gap?`+${escape(Math.abs(gap))} ${gap>0?'best':'weakest'}`:'No gap'}</span></li>`;
 }).join('');
 const numbers=[['Length',n.seconds,' s'],['New shot every',n.secondsPerShot,' s'],['Likes per 1,000 views',likes,'']].filter(([,v])=>v&&Number.isFinite(v.winners)&&Number.isFinite(v.flops))
  .map(([t,v,u])=>`<li class="secret-num${v.clear===false?' unclear':''}"><span>${t}${v.clear===false?' <small>no clear gap</small>':''}</span><b>${escape(v.winners)}${u} best</b><b>${escape(v.flops)}${u} weakest</b></li>`).join('');
 const house=st.house.map(h=>`<li>${escape(labelText(h.question,h.value))}<span> · ${escape(h.count)} of ${escape(h.total)} reels</span></li>`).join('');
 const comparison=`<div class="secret-comparison">${diffs?`<ul class="secret-diffs">${diffs}</ul>`:empty('No clear gap found.')}<div class="secret-numbers"><h4>Numbers</h4>${numbers?`<ul>${numbers}</ul>`:empty('No comparable numbers available.')}</div><div class="secret-house"><h4>What every reel has in common</h4><p class="secret-note">Recurring patterns across the sample, with counts showing how often.</p>${house?`<ul>${house}</ul>`:empty('Nothing shared by 70% of reels.')}</div></div>`;
 const recipe=(sec.recipe||[]).map((r,i)=>`<li><span class="secret-step-number" aria-hidden="true">${i+1}</span><div><p>${escape(r.step)}</p>${proof(r.evidence,imageFor,3)}</div></li>`).join('');
 const dropped=s.droppedWhy?.length?`<details class="secret-dropped"><summary>${s.droppedWhy.length} part${s.droppedWhy.length>1?'s':''} removed by the honesty check</summary><ul>${s.droppedWhy.map(d=>`<li><b>${escape(d.reason)}</b>: ${escape(d.text)}</li>`).join('')}</ul></details>`:s.dropped?.length?`<details class="secret-dropped"><summary>${s.dropped.length} part${s.dropped.length>1?'s':''} removed by the honesty check</summary><p>${s.dropped.length} part${s.dropped.length>1?'s':''} removed because ${s.dropped.length>1?'they':'it'} had no proof</p></details>`:'';
 return `<div class="secret-page"><header class="secret-head"><p class="secret-eyebrow">The Secret of @${escape(s.account)}</p><h2>${escape(sec.headline||`Why @${s.account} wins`)}</h2><p class="secret-note">${winners} best and ${flops} weakest reels watched · ${escape(new Date(s.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}))} · cost ${money(s.costUsd)}${s.spentAllTime>s.costUsd+0.00005?` (all builds ${money(s.spentAllTime)})`:''}</p></header>
${kpis}${risk}
<nav class="secret-nav" aria-label="On this page"><a href="#secret-formula">Formula</a><a href="#secret-why">Why it works</a><a href="#secret-comparison">Best vs weakest</a><a href="#secret-recipe">Recipe</a><a href="#secret-watchouts">Watch-outs</a></nav>
${section('secret-formula','The formula','The building blocks of this channel’s reels.',cards?`<div class="secret-cards secret-formula">${cards}</div>`:empty('No formula parts with proof yet.'))}
${section('secret-why','Why it works on people','The viewer response each pattern may trigger, and the evidence behind it.',why?`<div class="secret-cards">${why}</div>`:empty('No supported explanations yet.'))}
${section('secret-comparison','Best vs weakest','The biggest differences first, counted from the reels watched.',comparison)}
${section('secret-recipe','The recipe','A practical sequence to adapt for your next reel.',recipe?`<ol class="secret-recipe" role="list">${recipe}</ol>`:empty('No supported recipe steps yet.'))}
${section('secret-watchouts','Watch-outs','Weak spots and opportunities to consider when adapting the formula.',watchouts?`<ul class="secret-critique">${watchouts}</ul>`:empty('No additional watch-outs flagged.'))}
<div class="secret-footer"><div class="secret-rewrite"><button type="button" class="quiet" data-secret="rewrite">Write it again</button><p class="secret-note">Reuses the watched reels, so it costs a few cents.</p></div>${dropped}</div></div>`;
}

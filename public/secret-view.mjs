// Channel Secret page: why a channel's best reels win, with playable proof for every point.
// Pure render (data in, HTML out) so Node tests can import it.
import {LABELS} from './secret-labels.mjs';
import {MECHANISMS,STRENGTH_LABEL} from './secret-mechanisms.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`$${Number(n).toFixed(2)}`;
let names={};const labelText=(q,v)=>names[q]?.values?.[v]||LABELS[q]?.[1]?.[v]||v;

function proof(ids,imageFor,max=4){
 const shown=ids.slice(0,max);
 return `<div class="secret-proof">${shown.map(id=>`<button type="button" class="secret-thumb" data-secret-play="${escape(id)}" aria-label="Play this reel"><img src="${escape(imageFor(id))}" alt="" onerror="this.hidden=true"></button>`).join('')}${ids.length>max?`<span class="secret-more">+${ids.length-max}</span>`:''}</div>`;
}
const CARDS=[['person','The person'],['setting','The setting'],['format','The format'],['script','The script'],['sound','Sound'],['pace','Pace']];

function intro(account,plan){
 const what=`<ul class="secret-what"><li>Watches the videos with sound (Gemini)</li><li>Labels each one the same way (Jev)</li><li>Compares his best reels with his weakest, and writes the page</li></ul>`;
 if(plan?.error)return `<div class="secret-intro"><h2>Why @${escape(account)} wins</h2>${what}<p class="replica-error">${escape(plan.error)}</p></div>`;
 return `<div class="secret-intro"><h2>Why @${escape(account)} wins</h2><p>One page that explains this channel's formula, with proof you can play.</p>${what}
<button type="button" class="primary" data-secret="build">Build the Secret · about ${money(plan.usd)}</button>
<p class="secret-note">${plan.winners} best and ${plan.flops} weakest reels · ${Math.round(plan.seconds/60)} min of video. Nothing is spent until you press.</p></div>`;
}

export function renderSecret(status,{account,imageFor}){
 if(status.state==='building')return `<div class="secret-intro"><h2>Building the Secret for @${escape(account)}</h2><p class="secret-stage">${escape(status.stage)} · ${status.done} of ${status.total}</p><progress value="${status.done}" max="${status.total}"></progress><p class="secret-note">Usually a few minutes. You can use the other tabs meanwhile.</p></div>`;
 if(status.state!=='done'||!status.saved){
  if(status.state==='failed')return `<div class="secret-intro"><h2>The Secret stopped</h2><p class="replica-error">${escape(status.error)}</p>${status.plan&&!status.plan.error?`<button type="button" class="primary" data-secret="build">Try again</button>`:''}<p class="secret-note">Reels already watched are not paid again.</p></div>`;
  return intro(account,status.plan);
 }
 const s=status.saved,sec=s.secret,st=s.stats,side=n=>`of ${n}`;names=st.names||{};
 const cards=CARDS.filter(([k])=>sec[k]).map(([k,t])=>`<article class="secret-card"><h3>${t}</h3><p>${escape(sec[k].text)}</p>${proof(sec[k].evidence,imageFor)}</article>`).join('');
 const house=st.house.map(h=>`<li><span>${escape(labelText(h.question,h.value))}</span><b>${h.count} of ${h.total} reels</b></li>`).join('');
 const diffs=st.differences.map(d=>`<li class="secret-diff"><span>${escape(labelText(d.question,d.value))}</span><span class="secret-bars"><i style="--w:${d.winners/d.perSide}"></i><b>${d.winners} ${side(d.perSide)} best</b><i class="flop" style="--w:${d.flops/d.perSide}"></i><b>${d.flops} ${side(d.perSide)} weakest</b></span></li>`).join('');
 const n=st.numbers,numbers=[['Length',n.seconds,' s'],['New shot every',n.secondsPerShot,' s'],['Likes per 1,000 views',n.likesPer1k||{winners:null},'']].filter(([,v])=>v.winners!==null&&v.flops!==null&&v.winners!==undefined)
  .map(([t,v,u])=>`<li class="secret-num${v.clear===false?' unclear':''}"><span>${t}${v.clear===false?' <small>no clear gap</small>':''}</span><b>${v.winners}${u} best</b><b>${v.flops}${u} weakest</b></li>`).join('');
 const claims=(sec.differences||[]).map(d=>`<li><p>${escape(d.claim)}</p>${proof(d.evidence,imageFor)}</li>`).join('');
 const why=(sec.why||[]).map(w=>{const m=MECHANISMS[w.mechanism];return `<article class="secret-card secret-why"><p class="secret-mech"><b>${escape(m.name)}</b><span class="secret-strength secret-${m.strength}">${STRENGTH_LABEL[m.strength]}</span></p><p>${escape(w.pattern)}</p><p class="secret-meaning">${escape(m.meaning)}</p>${proof(w.evidence,imageFor,3)}<p class="secret-source">${escape(m.source)}</p></article>`;}).join('');
 const KIND={risk:'Risk',weakness:'Weak spot',opportunity:'Opportunity'};
 const critique=(sec.critique||[]).map(c=>`<li><span class="secret-kind secret-kind-${escape(c.kind)}">${KIND[c.kind]}</span><p>${escape(c.point)}</p>${proof(c.evidence,imageFor,3)}</li>`).join('');
 const recipe=(sec.recipe||[]).map(r=>`<li><p>${escape(r.step)}</p>${proof(r.evidence,imageFor,3)}</li>`).join('');
 const winners=s.picked.filter(p=>p.group==='winner').length,flops=s.picked.length-winners;
 return `<div class="secret-page"><header class="secret-head"><p class="secret-eyebrow">The Secret of @${escape(s.account)}</p><h2>${escape(sec.headline||`Why @${s.account} wins`)}</h2>
<p class="secret-note">${winners} best and ${flops} weakest reels watched · ${new Date(s.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · cost ${money(s.costUsd)}${s.spentAllTime>s.costUsd+0.00005?` (all builds ${money(s.spentAllTime)})`:''}</p>${s.droppedWhy?.length?`<details class="secret-dropped"><summary>${s.droppedWhy.length} part${s.droppedWhy.length>1?'s':''} removed by the honesty check</summary><ul>${s.droppedWhy.map(d=>`<li><b>${escape(d.reason)}</b>: ${escape(d.text)}</li>`).join('')}</ul></details>`:s.dropped?.length?`<p class="secret-note">${s.dropped.length} part${s.dropped.length>1?'s':''} removed because ${s.dropped.length>1?'they':'it'} had no proof</p>`:''}</header>
<section><h3 class="secret-h">The formula</h3><div class="secret-cards">${cards}</div></section>
${why?`<section><h3 class="secret-h">Why it works on people</h3><div class="secret-cards">${why}</div></section>`:''}
${claims?`<section><h3 class="secret-h">What the best reels do more</h3><ul class="secret-claims">${claims}</ul></section>`:''}
<section class="secret-facts"><div><h3 class="secret-h">Every reel does this</h3><ul class="secret-list">${house||'<li><span>Nothing shared by 70% of reels</span></li>'}</ul></div>
<div><h3 class="secret-h">Best vs weakest, counted</h3><ul class="secret-list">${diffs||'<li><span>No clear gap found</span></li>'}${numbers}</ul></div></section>
${critique?`<section><h3 class="secret-h">What a strategist would flag</h3><ul class="secret-critique">${critique}</ul></section>`:''}
${recipe?`<section><h3 class="secret-h">The recipe</h3><ol class="secret-recipe">${recipe}</ol></section>`:''}
<p class="secret-note"><button type="button" class="quiet" data-secret="rewrite">Write it again</button> Reuses the watched reels, so it costs a few cents.</p></div>`;
}

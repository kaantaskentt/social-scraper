// Create studio: pick a winning reel, add your product, recreate it; every recreation for the run in one tray.
// Pure render (data in, HTML out) so Node tests can import it.
import {span} from './shotlist-text.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):'';
const BOX={star:'Star',billboard:'Billboard'};
const STATUS={dismissed:'Cleared',submitting:'Sending…',generating:'Generating… 3 to 8 min',finishing:'Saving…',done:'Done',failed:'Failed',uncertain:'Check Higgsfield'};

// Winners = the high-reach boxes (Star, Billboard) that still have a video to copy, best "x its normal" first.
export function pickWinners(posts,results,{hasVideo,limit=10}){
 return posts.map(p=>({p,r:results?.[p.id]})).filter(({p,r})=>r&&BOX[r.quadrant]&&Number.isFinite(r.xNormal)&&hasVideo(p))
  .sort((a,b)=>b.r.xNormal-a.r.xNormal).slice(0,limit)
  .map(({p,r})=>({id:p.id,xNormal:r.xNormal,box:BOX[r.quadrant],reach:r.reach}));
}

const cover=src=>src?`<img src="${escape(src)}" alt="" loading="lazy" onerror="this.classList.add('missing')">`:'<span class="studio-cover-missing"></span>';
export function renderPicks(winners,selectedId,{loading=false,error=''}={}){
 if(!winners.length){
  if(error)return `<p class="replica-error">Could not load the scores: ${escape(error)}</p>`;
  if(loading)return '<p class="studio-empty">Scoring this account…</p>';
  return '<p class="studio-empty">No winners with a video yet. Star and Billboard reels that still have a video show up here.</p>';
 }
 return `<div class="studio-picks">${winners.map(w=>`<button type="button" class="studio-pick" data-studio-pick="${escape(w.id)}" aria-pressed="${w.id===selectedId}">${cover(w.image)}<span class="studio-x">${escape(w.xNormal.toFixed(1))}×</span><span class="studio-meta">${escape(w.box)}${w.reach?` · ${escape(compact(w.reach))}`:''}</span></button>`).join('')}</div>`;
}

export function renderJobs(jobs,imageFor){
 if(!jobs.length)return '<p class="studio-empty">Nothing generating yet. Your recreations appear here.</p>';
 return `<div class="studio-jobs">${jobs.map(j=>`<article class="studio-job studio-job-${escape(j.status)}">${j.status==='done'&&j.video
  ?`<video src="${escape(j.video)}#t=0.5" controls playsinline preload="auto"></video>`:cover(imageFor(j.postId))}
<p class="studio-job-status">${escape(STATUS[j.status]||j.status)}${j.credits?` · ${escape(j.credits)} cr`:''}</p>${j.error?`<p class="replica-error">${escape(j.error)}</p>`:''}${j.status==='uncertain'?`${j.jobId?`<p class="studio-empty">Higgsfield job: ${escape(j.jobId)}</p>`:''}<button type="button" class="quiet" data-dismiss-rep="${escape(j.id)}">I checked Higgsfield</button>`:''}${j.status==='done'&&j.video?`<a class="quiet" href="${escape(j.video)}" download>Download ↓</a>`:''}</article>`).join('')}</div>`;
}

// The original reel uses the whole channel; the other modes use a picked winner.
export function renderModeSwitch(mode){
 const b=(id,title,note)=>`<button type="button" class="studio-mode" data-studio-mode="${id}" aria-pressed="${mode===id}"><strong>${title}</strong><span>${note}</span></button>`;
 return `<div class="studio-modes" role="group" aria-label="How to make your version">${b('film','Film it yourself','Free · a shot list for your phone')}${b('ai','Recreate with AI','Uses Higgsfield credits')}${b('new','New faceless reel',"An original reel in this channel's style · AI makes it")}</div>`;
}

const ROLE={hook:'Hook',setup:'Setup',problem:'Problem',example:'Example',advice:'Advice',payoff:'Payoff',cta:'Call to action',other:'Other',unclear:'Other',visual:'Scene'};
export function renderShotList(list,{loading=false,error=''}={}){
 if(error)return `<p class="replica-error">${escape(error)}</p><button type="button" class="quiet" data-shot="retry">Try again</button>`;
 if(loading||!list)return '<p class="studio-empty">Cutting the reel into shots… the first time takes a few seconds.</p>';
 const parts=list.parts.map((p,i)=>{
  const frames=p.shots.slice(0,3).map(s=>list.frames[s]).filter(Boolean).map(src=>`<img src="${escape(src)}" alt="" onerror="this.hidden=true">`).join('');
  return `<li class="shot-part"><div class="shot-head"><span class="shot-num">${i+1}</span><strong>${ROLE[p.role]||ROLE.other}</strong><span class="shot-time">${span(p)}</span></div>
<div class="shot-frames">${frames}</div><div class="shot-body">${p.said?`<p class="shot-said">“${escape(p.said)}”</p>`:''}<p class="shot-tip">${escape(p.tip)}</p>
<label class="shot-line">Your line<textarea data-shot-line="${i}" rows="2" maxlength="500" placeholder="${p.role==='visual'?'What you show here':'What you will say here'}">${escape(list.lines[i]||'')}</textarea></label><p class="shot-line-print" data-shot-print="${i}">${escape(list.lines[i]||'')}</p></div></li>`;}).join('');
 const print=`<p class="shot-print-head">Shot list · @${escape(list.account)} · ${Math.round(list.duration)} s · ${list.parts.length} parts${list.url?` · ${escape(list.url)}`:''}</p>`;
 return `${print}<ol class="shot-parts">${parts}</ol>`;
}
// Beside the reel: the reel in numbers, and the two ways to take the list with you.
export function renderShotSide(list){
 if(!list)return '';
 return `<ol class="shot-howto"><li>Watch their reel on the left.</li><li>Write your line under each part below.</li><li>Copy it to your phone and film.</li></ol><p class="shot-summary"><strong>${Math.round(list.duration)} s</strong> · ${list.pace.shots} shots · a new shot every ${list.pace.secondsPerShot} s · ${list.parts.length} parts</p>
<div class="shot-actions"><button type="button" class="primary" data-shot="copy">Copy as text</button><button type="button" class="quiet" data-shot="print">Print / save PDF</button></div><p class="shot-saved" aria-live="polite"></p>${list.unplaced?.length?`<div class="shot-unplaced"><p>Lines from an earlier version of this list:</p><ul>${list.unplaced.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></div>`:''}`;
}

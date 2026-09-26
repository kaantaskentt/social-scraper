// Create studio: pick a winning reel, add your product, recreate it; every recreation for the run in one tray.
// Pure render (data in, HTML out) so Node tests can import it.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):'';
const BOX={star:'Star',billboard:'Billboard'};
const STATUS={submitting:'Sending…',generating:'Generating… 3 to 8 min',finishing:'Saving…',done:'Done',failed:'Failed',uncertain:'Check Higgsfield'};

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
<p class="studio-job-status">${escape(STATUS[j.status]||j.status)}${j.credits?` · ${escape(j.credits)} cr`:''}</p>${j.error?`<p class="replica-error">${escape(j.error)}</p>`:''}${j.status==='uncertain'&&j.jobId?`<p class="studio-empty">Higgsfield job: ${escape(j.jobId)}</p>`:''}${j.status==='done'&&j.video?`<a class="quiet" href="${escape(j.video)}" download>Download ↓</a>`:''}</article>`).join('')}</div>`;
}

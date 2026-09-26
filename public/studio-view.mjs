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

export function renderPicks(winners,selectedId){
 if(!winners.length)return '<p class="studio-empty">No winners with a video yet. Run the Money scores on an account first.</p>';
 return `<div class="studio-picks">${winners.map(w=>`<button type="button" class="studio-pick" data-studio-pick="${escape(w.id)}" aria-pressed="${w.id===selectedId}"><img src="${escape(w.image)}" alt="" loading="lazy"><span class="studio-x">${escape(w.xNormal.toFixed(1))}×</span><span class="studio-meta">${escape(w.box)}${w.reach?` · ${escape(compact(w.reach))}`:''}</span></button>`).join('')}</div>`;
}

export function renderJobs(jobs,imageFor){
 if(!jobs.length)return '<p class="studio-empty">Nothing generating yet. Your recreations appear here.</p>';
 return `<div class="studio-jobs">${jobs.map(j=>`<article class="studio-job studio-job-${escape(j.status)}">${j.status==='done'&&j.video
  ?`<video src="${escape(j.video)}#t=0.5" controls playsinline preload="auto"></video>`:`<img src="${escape(imageFor(j.postId))}" alt="">`}
<p class="studio-job-status">${escape(STATUS[j.status]||j.status)}${j.credits?` · ${escape(j.credits)} cr`:''}</p>${j.error?`<p class="replica-error">${escape(j.error)}</p>`:''}${j.status==='done'&&j.video?`<a class="quiet" href="${escape(j.video)}" download>Download ↓</a>`:''}</article>`).join('')}</div>`;
}

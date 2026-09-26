// Replicate panel in the reel sidebar: references in, cost confirmed, then the new video next to the original.
// Pure render (data in, HTML out) so Node tests can import it.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUS={submitting:'Sending to Higgsfield…',generating:'Generating… usually 3 to 8 minutes',finishing:'Saving the video…',done:'Done',failed:'Failed',uncertain:'Check Higgsfield'};

function replicaRow(r,originalSrc){
 const head=`<p class="replica-status replica-${escape(r.status)}">${escape(STATUS[r.status]||r.status)}${r.credits?` · ${escape(r.credits)} credits`:''}</p>`;
 if(r.status==='done'&&r.video)return `<div class="replica">${head}<div class="replica-compare"><figure><video src="${escape(originalSrc)}" controls playsinline muted preload="metadata"></video><figcaption>Original</figcaption></figure><figure><video src="${escape(r.video)}" controls playsinline preload="metadata"></video><figcaption>Yours</figcaption></figure></div><a class="quiet" href="${escape(r.video)}" download>Download video ↓</a></div>`;
 return `<div class="replica">${head}${r.error?`<p class="replica-error">${escape(r.error)}</p>`:''}</div>`;
}

export function renderReplicatePanel(s){
 const originalSrc=s.savedVideo?`/videos/${encodeURIComponent(s.runId)}/${encodeURIComponent(s.post.id)}`:s.post.videoUrl;
 const list=s.replicas.length?`<div class="replicas">${s.replicas.map(r=>replicaRow(r,originalSrc)).join('')}</div>`:'';
 if(!s.open)return `<button type="button" class="primary replicate-open" data-replicate="open">Replicate this reel</button>${list}`;
 const refs=s.refs.map(r=>`<figure class="ref"><img src="${escape(r.url)}" alt="Reference image"><button type="button" data-remove-ref="${escape(r.id)}" aria-label="Remove reference">×</button></figure>`).join('');
 const canAdd=s.refs.length<4;
 const action=s.estimate?`<button type="button" class="primary" data-replicate="start">Replicate for ${escape(s.estimate.credits)} credits</button><span class="replicate-hint">${escape(s.estimate.seconds)} s video · 720p</span>`
  :`<button type="button" class="primary" data-replicate="estimate"${s.refs.length&&!s.busy?'':' disabled'}>Check cost</button>`;
 return `<div class="replicate-form"><p class="replicate-title">Add your product images</p><p class="replicate-hint">Front and back work best. The reel's camera, timing and place are copied; people and text are new.</p>
<div class="refs">${refs}${canAdd?`<label class="ref-add">+<input type="file" accept="image/png,image/jpeg,image/webp" multiple data-replicate="files" hidden></label>`:''}</div>
<label class="replicate-field">Text on screen (optional)<input type="text" maxlength="80" data-replicate="text" value="${escape(s.overlayText)}" placeholder="e.g. dev team justifying a dinner"></label>
<label class="replicate-check"><input type="checkbox" data-replicate="sound"${s.keepSound?' checked':''}> Keep the original sound</label>
${s.busy?`<p class="replicate-hint">${escape(s.busy)}</p>`:''}${s.error?`<p class="replica-error">${escape(s.error)}</p>`:''}
<div class="replicate-actions">${action}<button type="button" class="quiet" data-replicate="cancel">Cancel</button></div></div>${list}`;
}

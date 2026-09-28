// The copy studio page (Make step): the five winners to copy, then your Instagram profile with five reels filling in
// live, then "Compare": each original under its copy, played in sync, with the shot-by-shot match. Pure HTML strings.
import {esc} from './flow-views.mjs';

const n0=v=>Number.isFinite(v)?v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${Math.round(v/1e3)}k`:String(v):'?';
const clock=s=>!Number.isFinite(s)?'':s<60?`${Math.max(1,Math.round(s))} s`:`${Math.floor(s/60)} min ${String(Math.round(s%60)).padStart(2,'0')} s`;
const handleOf=name=>String(name||'our.channel').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'');

// The profile header, the same look as the Kit step's preview: avatar, handle, bio.
function profile(kit,count){
 const pics=Object.fromEntries((kit?.pictures||[]).filter(p=>p.url).map(p=>[p.role,p])),avatar=pics.face0||pics.hands||pics.place,k=kit?.kit||{};
 return `<div class="ig-head">${avatar?`<img class="ig-avatar" src="${esc(avatar.url)}" alt="">`:'<span class="ig-avatar"></span>'}<div><b class="ig-handle">@${esc(handleOf(k.name))}</b><div class="ig-stats"><span><b>${esc(count)}</b> posts</span><span class="hint">internal test</span></div></div></div><p class="ig-bio"><b>${esc(k.name||'')}</b><br>${esc(k.promise||'')}</p>`;
}
// Step 1: nothing picked yet, or picking now.
function intro(copy,{busy}){
 if(copy?.picking?.state==='working')return `<div class="card writing rise"><span class="cmp-label">Picking the winners to copy</span><h3>${esc(copy.picking.stage||'Working')}</h3><div class="shimmer" aria-hidden="true"></div><p class="hint">Their best reels, studied shot by shot; Jev judges which ones AI video can copy faithfully. A few cents, no video yet.</p></div>`;
 return `<div class="card hero rise"><span class="cmp-label">✦ Copy what already works</span><h3>Copy their 5 best reels with your hosts</h3>
<p class="hint">The same shots, words, timing and sounds as their winners; only the people and the place are yours. Picks their strongest winners that AI video can copy faithfully.</p>
${copy?.picking?.state==='failed'?`<p class="err">${esc(copy.picking.error)}</p>`:''}
<div class="hero-cta"><button type="button" class="btn btn-primary btn-big" data-act="copy-pick"${busy?' disabled':''}>Find the 5 to copy · a few cents</button></div></div>`;
}
// Step 2: the picks, each with its original, why it was picked and its price; one button for all.
function picks(copy,{busy,unpicked}){
 const list=copy.picks.picks,chosen=list.filter(p=>!unpicked.has(p.id)),usd=Math.round(chosen.reduce((a,p)=>a+p.usd,0)*100)/100;
 const cards=list.map((p,i)=>`<label class="card pick rise${unpicked.has(p.id)?' is-off':''}" style="--i:${i}"><input type="checkbox" data-copy-pick="${esc(p.id)}"${unpicked.has(p.id)?'':' checked'}><img src="/media/${esc(copy.runId)}/${esc(p.id)}" alt="" loading="lazy"><div class="pick-body"><b>${n0(p.plays)} plays · ${esc(Math.round(p.xNormal))}× their normal</b><p class="quote">“${esc(p.opening)}…”</p><p class="hint">${esc(p.why)}</p><span class="hint">${esc(Math.round(p.seconds))} s · ${esc(p.parts)} parts · $${esc(p.usd.toFixed(2))}</span></div></label>`).join('');
 return `<section class="block"><div class="row-between"><h2 class="sub-title">The ${list.length} winners to copy</h2><button type="button" class="btn btn-ghost" data-act="copy-pick"${busy?' disabled':''}>Pick again</button></div>
<div class="pick-grid">${cards}</div>${copy.picks.skipped?`<p class="hint">${esc(copy.picks.skipped)} other winner${copy.picks.skipped>1?'s':''} skipped: Jev judged they would not copy well, or they need people we do not have.</p>`:''}
<div class="hero-cta"><button type="button" class="btn btn-primary btn-big" data-act="copy-start" data-usd="${usd}" data-ids="${esc(chosen.map(p=>p.id).join(','))}"${busy||!chosen.length?' disabled':''}>Copy ${chosen.length===1?'this one':chosen.length===list.length?`these ${chosen.length}`:`these ${chosen.length}`} · $${usd.toFixed(2)}</button><span class="hint">All at once, about ${esc(Math.round(Math.max(...chosen.map(p=>p.parts),1)*1.4+3))} minutes. Each part is checked against the original before the next is paid for.</span></div></section>`;
}
// One tile: a ring that fills with real progress while it is made, then the reel.
// The badge is a match score, most of it Gemini's beat-by-beat rating, so it does not claim a measured "% same".
// A comparison that failed offers to compare again ($0 filming: the copy-retry route only compares a made copy).
function tile(it,i){
 const f=it.fidelity,badge=Number.isFinite(f?.score)?`<span class="fid ${f.faithful?'is-ok':'is-off'}">${esc(f.score)}/100 match</span>`:f?.error&&it.retryUsd===0?`<button type="button" class="tile-retry" data-act="copy-retry" data-post="${esc(it.postId)}" data-usd="0">Compare again</button>`:'';
 if(it.reel&&it.state==='done')return `<div class="ig-cell copy-tile is-done" data-tile="${esc(it.postId)}"><video src="${esc(it.reel.url)}#t=1" ${it.reel.cover?`poster="${esc(it.reel.cover)}"`:''} playsinline preload="metadata" controls></video>${badge}</div>`;
 const state=it.state==='failed'||it.state==='stopped'?'is-failed':it.state==='working'?'is-working':'';
 return `<div class="ig-cell copy-tile ${state}" data-tile="${esc(it.postId)}" style="--p:${it.pct};--i:${i}"><img src="${esc(it.originalImage)}" alt="" loading="lazy"><div class="ring-wrap"><div class="ring" aria-hidden="true"></div><b class="ring-n" data-live="pct">${it.state==='failed'||it.state==='stopped'?'!':`${it.pct}%`}</b></div>
<span class="tile-stage" data-live="stage">${esc(it.state==='failed'||it.state==='stopped'?it.error:it.stage||'Waiting')}</span>${(it.state==='failed'||it.state==='stopped')&&Number.isFinite(it.retryUsd)?`<button type="button" class="tile-retry" data-act="copy-retry" data-post="${esc(it.postId)}" data-usd="${esc(it.retryUsd)}">Try again · $${esc(it.retryUsd.toFixed(2))}</button>`:''}<span class="tile-eta" data-live="eta">${it.state==='working'?`${clock(it.left)} left`:''}</span></div>`;
}
// Under each copy, the original and how close the copy is, beat by beat.
function compare(it){
 const f=it.fidelity;
 const beats=f?.beats?.length?`<ol class="fid-beats">${f.beats.map(b=>`<li class="m${b.match}"><span class="shot-s">${esc(b.from)}–${esc(b.to)} s</span><span>${esc(b.happens||'')}</span><b>${['missing','different','close','same'][b.match]||''}</b>${b.differs&&!/^nothing/i.test(b.differs)?`<em>${esc(b.differs)}</em>`:''}</li>`).join('')}</ol>`:'';
 return `<div class="cmp-col"><div class="ig-cell"><video src="${esc(it.original)}#t=1" playsinline preload="metadata" controls data-orig="${esc(it.postId)}"></video><span class="fid-label">Original</span></div>
${f?.error?`<p class="hint">Not compared: ${esc(f.error)}</p>`:f?`<div class="fid-card"><b>Match score ${esc(f.score)} of 100</b> <span class="hint">shots ${esc(f.shots??'?')}% (Gemini watched both) · words ${esc(f.words??'?')}% · length ${esc(f.length??'?')}%</span>
<p class="hint">${f.faithful?'A faithful copy.':`Not faithful yet${f.redo?`: film ${esc(f.redo.replace('_',' '))} again`:''}.`} ${f.gap&&!/^nothing/i.test(f.gap)?esc(f.gap):''}</p>${it.reel?`<button type="button" class="chip chip-btn" data-act="copy-sync" data-post="${esc(it.postId)}">▶ Play both together</button>`:''}${beats}</div>`:`<p class="hint">${it.state==='done'?'Not compared.':'Compared when the copy is made.'}</p>`}</div>`;
}
export function renderCopyStudio({copy,kit,busy=false,unpicked=new Set(),compareOpen=false}){
 if(!copy?.picks&&!copy?.batch)return intro(copy,{busy});
 // Picking again, or picks newer than the batch, come first; the last batch stays below. Once a batch existed the
 // picks never came back, so a paid re-pick showed nothing (audit, 2026-09-29).
 const b=copy.batch,after=t=>!b||String(t||'')>String(b.createdAt||''),fresh=!!copy.picks&&after(copy.picks.createdAt);
 const pick=copy.picking&&copy.picking.state!=='done'&&after(copy.picking.at)?copy.picking:null;
 const top=`${pick?.state==='working'?intro(copy,{busy}):pick?.state==='failed'?`<p class="err">Picking failed: ${esc(pick.error)}</p>`:''}${fresh?picks(copy,{busy,unpicked}):''}`;
 if(!b)return top;
 const done=b.items.filter(i=>i.state==='done').length,working=b.items.some(i=>i.state==='working'||i.state==='waiting');
 const bar=`<div class="copy-bar"><div class="row-between"><b data-live="batch-label">${working?`Making ${b.items.length} copies`:`${done} of ${b.items.length} copies made`}</b><span class="hint" data-live="batch-eta">${working?`${b.pct}% · about ${clock(b.left)} left`:`$${esc(b.usd.toFixed(2))} confirmed`}</span></div><div class="bar"><i data-live="batch-bar" style="width:${b.pct}%"></i></div></div>`;
 // Made copies are downloaded, covered and captioned on Ready to post, the same next step as the other Make screen.
 const ready=done&&!working?'<button type="button" class="btn btn-primary" data-step="ready">Open Ready to post →</button>':'';
 return `${top}<section class="block">${top?'<h2 class="sub-title">Your last copies</h2>':''}<div class="card ig ig-wide rise">${profile(kit,done)}${bar}
<div class="ig-grid copy-grid">${b.items.map(tile).join('')}</div></div>
<div class="hero-cta">${ready}${done?`<button type="button" class="btn${compareOpen||ready?'':' btn-primary'}" data-act="copy-compare">${compareOpen?'Hide the originals':'Compare with the originals'}</button>`:''}${working||fresh||pick?.state==='working'?'':`<button type="button" class="btn btn-ghost" data-act="copy-new">Copy other winners</button>`}</div>
${compareOpen?`<div class="cmp-grid">${b.items.map(compare).join('')}</div>`:''}</section>`;
}
// What changes second to second while copies are made, so the page can update numbers without redrawing videos.
export function copyLive(copy){
 const b=copy?.batch;if(!b)return null;
 return {items:b.items.map(i=>({postId:i.postId,pct:i.pct,stage:i.state==='failed'||i.state==='stopped'?i.error:i.stage||'Waiting',eta:i.state==='working'?`${clock(i.left)} left`:'',state:i.state})),pct:b.pct,eta:`${b.pct}% · about ${clock(b.left)} left`};
}
// The page's shape: when this changes the page is redrawn; otherwise only the live numbers move.
export const copyShape=copy=>JSON.stringify([copy?.picking?.state,copy?.picking?.at,!!copy?.picks,copy?.picks?.createdAt,copy?.batch?.id,copy?.batch?.items.map(i=>[i.state,i.reel?.url,i.fidelity?.score??i.fidelity?.error??null,i.retryUsd??null])]);

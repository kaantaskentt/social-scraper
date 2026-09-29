// The copy studio page (Make step): the five winners to copy, then your Instagram profile with five reels filling in
// live, then "Compare": each original under its copy, played in sync, with the shot-by-shot match. Pure HTML strings.
import {esc} from './flow-views.mjs';

// The video models, as the page names them; 'both' copies each winner once with each.
export const ENGINE_LABEL={omni:'Gemini Omni','veo-fast':'Veo 3.1 Fast'};
const ENGINE_CHOICES=[['veo-fast','Veo 3.1 Fast'],['omni','Gemini Omni'],['both','Both, side by side']];
export const enginesOf=choice=>choice==='both'?['omni','veo-fast']:[choice];
export const priceOf=(p,e)=>e==='omni'?(p.seconds>40?null:Number.isFinite(p.usd)?p.usd:null):(Number.isFinite(p.veo?.usd)?p.veo.usd:null);
const priceText=(p,e)=>Number.isFinite(priceOf(p,e))?`$${priceOf(p,e).toFixed(2)}`:e==='omni'&&p.seconds>40?'unavailable · longer than 40 s':'price unavailable';
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
function picks(copy,{busy,unpicked,engine='veo-fast'}){
 const list=copy.picks.picks,chosen=list.filter(p=>!unpicked.has(p.id)),eng=enginesOf(engine),unavailable=chosen.some(p=>eng.some(e=>priceOf(p,e)===null)),usd=Math.round(chosen.reduce((a,p)=>a+eng.reduce((x,e)=>x+priceOf(p,e),0),0)*100)/100;
 const choose=`<div class="engine-row"><span class="label">Video model</span><div class="seg" role="group" aria-label="Video model">${ENGINE_CHOICES.map(([id,label])=>`<button type="button" data-copy-engine="${id}" aria-pressed="${engine===id}">${label} · ${chosen.some(p=>enginesOf(id).some(e=>priceOf(p,e)===null))?'unavailable':'$'+(Math.round(chosen.reduce((a,p)=>a+enginesOf(id).reduce((x,e)=>x+priceOf(p,e),0),0)*100)/100)}</button>`).join('')}</div><span class="hint">Veo 3.1 Fast is selected by default. Gemini Omni supports reels up to 40 seconds.</span></div>`;
 const cards=list.map((p,i)=>`<label class="card pick rise${unpicked.has(p.id)?' is-off':''}" style="--i:${i}"><input type="checkbox" data-copy-pick="${esc(p.id)}"${unpicked.has(p.id)?'':' checked'}><img src="/media/${esc(copy.runId)}/${esc(p.id)}" alt="" loading="lazy"><div class="pick-body"><b>${n0(p.plays)} plays · ${Number.isFinite(p.xNormal)?Math.round(p.xNormal):'–'}× their normal</b><p class="quote">“${esc(p.opening)}…”</p><p class="hint">${esc(p.why)}</p><span class="hint">${Number.isFinite(p.seconds)?`${Math.round(p.seconds)} s`:'Length unavailable'} · ${['veo-fast','omni'].map(e=>`${ENGINE_LABEL[e]} ${esc(priceText(p,e))}`).join(' · ')}</span></div></label>`).join('');
 return `<section class="block"><div class="row-between"><h2 class="sub-title">The ${list.length} winners to copy</h2><button type="button" class="btn btn-ghost" data-act="copy-pick"${busy?' disabled':''}>Pick again</button></div>
<div class="pick-grid">${cards}</div>${copy.picks.skipped?`<p class="hint">${esc(copy.picks.skipped)} other winner${copy.picks.skipped>1?'s':''} skipped: Jev judged they would not copy well, or they need people we do not have.</p>`:''}
${choose}<div class="hero-cta"><button type="button" class="btn btn-primary btn-big" data-act="copy-start" data-usd="${usd}" data-engines="${esc(eng.join(','))}" data-ids="${esc(chosen.map(p=>p.id).join(','))}"${busy||!chosen.length||unavailable?' disabled':''}>Copy ${chosen.length===1?'this one':`these ${chosen.length}`}${eng.length>1?' with both models':''} · ${unavailable?'choose available reels':`$${usd.toFixed(2)}`}</button><span class="hint">All at once, about ${esc(Math.round(Math.max(...chosen.map(p=>engine==='veo-fast'?(p.veo?.parts||p.parts||1):(p.parts||1)),1)*1.4+3))} minutes. Each part is checked against the original before the next is paid for.</span></div></section>`;
}
// One tile: a ring that fills with real progress while it is made, then the reel.
// The badge is a match score, most of it Gemini's beat-by-beat rating, so it does not claim a measured "% same".
// A comparison that failed offers to compare again ($0 filming: the copy-retry route only compares a made copy).
function tile(it,i){
 const f=it.fidelity,badge=Number.isFinite(f?.score)?`<span class="fid ${f.faithful?'is-ok':'is-off'}">${esc(f.score)}/100 match</span>`:f?.error&&it.retryUsd===0?`<button type="button" class="tile-retry" data-act="copy-retry" data-post="${esc(it.key||it.postId)}" data-usd="0">Compare again</button>`:'';
 const tag=`<span class="engine-tag">${esc(ENGINE_LABEL[it.engine]||'Gemini Omni')}</span>`;
 if(it.reel&&it.state==='done')return `<div class="ig-cell copy-tile is-done" data-tile="${esc(it.key||it.postId)}">${tag}<video src="${esc(it.reel.url)}#t=1" ${it.reel.cover?`poster="${esc(it.reel.cover)}"`:''} playsinline preload="metadata" controls></video>${badge}</div>`;
 const state=it.state==='failed'||it.state==='stopped'?'is-failed':it.state==='working'?'is-working':'';
 // The latest filmed part plays in the tile as soon as it passed its check, so the reel visibly grows.
 const pv=it.preview?.url,media=pv?`<video class="tile-preview" src="${esc(pv)}" autoplay muted loop playsinline></video><span class="tile-parts">${esc(it.preview.parts)} of ${esc(it.preview.of)} parts filmed</span>`:`<img src="${esc(it.originalImage)}" alt="" loading="lazy">`;
 return `<div class="ig-cell copy-tile ${state}${pv?' has-preview':''}" data-tile="${esc(it.key||it.postId)}" style="--p:${it.pct};--i:${i}">${tag}${media}<div class="ring-wrap"><div class="ring" aria-hidden="true"></div><b class="ring-n" data-live="pct">${it.state==='failed'||it.state==='stopped'?'!':`${it.pct}%`}</b></div>
<span class="tile-stage" data-live="stage">${esc(it.state==='failed'||it.state==='stopped'?it.error:it.stage||'Waiting')}</span>${(it.state==='failed'||it.state==='stopped')&&Number.isFinite(it.retryUsd)?`<button type="button" class="tile-retry" data-act="copy-retry" data-post="${esc(it.key||it.postId)}" data-usd="${esc(it.retryUsd)}">Try again · $${esc(it.retryUsd.toFixed(2))}</button>`:''}<span class="tile-eta" data-live="eta">${it.state==='working'?`${clock(it.left)} left`:''}</span></div>`;
}
// Under each winner: the original once, then each model's copy with how close it is, beat by beat.
function fidCard(it){
 const f=it.fidelity,name=ENGINE_LABEL[it.engine]||'Gemini Omni';
 const beats=f?.beats?.length?`<ol class="fid-beats">${f.beats.map(b=>`<li class="m${b.match}"><span class="shot-s">${esc(b.from)}–${esc(b.to)} s</span><span>${esc(b.happens||'')}</span><b>${['missing','different','close','same'][Math.min(b.match??0,b.framing??b.match??0)]||''}${Number.isFinite(b.framing)&&b.framing<b.match?' (framing)':''}${b.result_visible==='no'?' · result not visible':''}</b>${b.differs&&!/^nothing/i.test(b.differs)?`<em>${esc(b.differs)}</em>`:''}</li>`).join('')}</ol>`:'';
 if(f?.error)return `<p class="hint"><b>${esc(name)}:</b> not compared: ${esc(f.error)}</p>`;
 if(!f)return `<p class="hint"><b>${esc(name)}:</b> ${it.state==='done'?'not compared.':'compared when the copy is made.'}</p>`;
 return `<div class="fid-card"><b>${esc(name)} · match score ${esc(f.score)} of 100</b> <span class="hint">shots ${esc(f.shots??'?')}% (Gemini watched both) · words ${esc(f.words??'?')}% · length ${esc(f.length??'?')}%</span>
<p class="hint">${f.faithful?'A faithful copy.':`Not faithful yet${f.redo?`: film ${esc(f.redo.replace('_',' '))} again`:''}.`} ${f.gap&&!/^nothing/i.test(f.gap)?esc(f.gap):''}</p>${it.reel?`<button type="button" class="chip chip-btn" data-act="copy-sync" data-post="${esc(it.key||it.postId)}" data-orig-of="${esc(it.postId)}">▶ Play both together</button>`:''}${beats}</div>`;
}
function compareGroups(items){
 const groups=[];for(const it of items){const g=groups.find(x=>x.postId===it.postId);g?g.items.push(it):groups.push({postId:it.postId,original:it.original,items:[it]});}
 return groups.map(g=>`<div class="cmp-col"><div class="ig-cell"><video src="${esc(g.original)}#t=1" playsinline preload="metadata" controls data-orig="${esc(g.postId)}"></video><span class="fid-label">Original</span></div>${g.items.map(fidCard).join('')}</div>`).join('');
}
export function renderCopyStudio({copy,kit,busy=false,unpicked=new Set(),compareOpen=false,engine='veo-fast'}){
 if(!copy?.picks&&!copy?.batch)return intro(copy,{busy});
 // Picking again, or picks newer than the batch, come first; the last batch stays below. Once a batch existed the
 // picks never came back, so a paid re-pick showed nothing (audit, 2026-09-29).
 const b=copy.batch,after=t=>!b||String(t||'')>String(b.createdAt||''),fresh=!!copy.picks&&after(copy.picks.createdAt);
 const pick=copy.picking&&copy.picking.state!=='done'&&after(copy.picking.at)?copy.picking:null;
 const top=`${pick?.state==='working'?intro(copy,{busy}):pick?.state==='failed'?`<p class="err">Picking failed: ${esc(pick.error)}</p>`:''}${fresh?picks(copy,{busy,unpicked,engine}):''}`;
 if(!b)return top;
 const done=b.items.filter(i=>i.state==='done').length,working=b.items.some(i=>i.state==='working'||i.state==='waiting');
 const bar=`<div class="copy-bar"><div class="row-between"><b data-live="batch-label">${working?`Making ${b.items.length} copies`:`${done} of ${b.items.length} copies made`}</b><span class="hint" data-live="batch-eta">${working?`${b.pct}% · about ${clock(b.left)} left`:`$${esc(b.usd.toFixed(2))} confirmed`}</span></div><div class="bar"><i data-live="batch-bar" style="width:${b.pct}%"></i></div></div>`;
 // Made copies are downloaded, covered and captioned on Ready to post, the same next step as the other Make screen.
 const ready=done&&!working?'<button type="button" class="btn btn-primary" data-step="ready">Open Ready to post →</button>':'';
 return `${top}<section class="block">${top?'<h2 class="sub-title">Your last copies</h2>':''}<div class="card ig ig-wide rise">${profile(kit,done)}${bar}
<div class="ig-grid copy-grid">${b.items.map(tile).join('')}</div></div>
<div class="hero-cta">${ready}${done?`<button type="button" class="btn${compareOpen||ready?'':' btn-primary'}" data-act="copy-compare">${compareOpen?'Hide the originals':'Compare with the originals'}</button>`:''}${working||fresh||pick?.state==='working'?'':`<button type="button" class="btn btn-ghost" data-act="copy-new">Find other winners · a few cents</button>`}</div>
${compareOpen?`<div class="cmp-grid">${compareGroups(b.items)}</div>`:''}</section>`;
}
// What changes second to second while copies are made, so the page can update numbers without redrawing videos.
export function copyLive(copy){
 const b=copy?.batch;if(!b)return null;
 return {items:b.items.map(i=>({key:i.key||i.postId,postId:i.postId,pct:i.pct,stage:i.state==='failed'||i.state==='stopped'?i.error:i.stage||'Waiting',eta:i.state==='working'?`${clock(i.left)} left`:'',state:i.state})),pct:b.pct,eta:`${b.pct}% · about ${clock(b.left)} left`};
}
// The page's shape: when this changes the page is redrawn; otherwise only the live numbers move.
export const copyShape=copy=>JSON.stringify([copy?.picking?.state,copy?.picking?.at,!!copy?.picks,copy?.picks?.createdAt,copy?.batch?.id,copy?.batch?.items.map(i=>[i.key,i.state,i.reel?.url,i.preview?.url??null,i.fidelity?.score??i.fidelity?.error??null,i.retryUsd??null])]);

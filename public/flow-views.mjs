// The six-step app: Scan → Winners → Secret → Kit → Make → Ready to post. Pure render functions (data in, HTML out) so
// Node tests can check them. Short words, visuals first; the long research views live at /lab.
import {SHORT,LABELS,PLAIN} from './secret-labels.mjs';
import {MECHANISMS} from './secret-mechanisms.mjs';

export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):'–';
const name=(q,v)=>SHORT[q]?.[v]||LABELS[q]?.[1]?.[v]||v;
const plain=(q,v)=>PLAIN[q]?.[v]||'';

export const STEPS=[['scan','Scan'],['winners','Winners'],['secret','Secret'],['kit','Kit'],['make','Make'],['ready','Ready to post']];
// Which steps can be opened: each needs the one before it to be done.
export function reachable({scanned=false,scored=false,secret=false,reels=0}){
 return {scan:true,winners:scanned&&scored,secret:scanned&&scored,kit:secret,make:secret,ready:reels>0};
}
export function renderStepper(current,open,done){
 return `<nav class="steps" aria-label="Steps">${STEPS.map(([id,label],i)=>`<button type="button" class="step${id===current?' is-current':''}${done[id]?' is-done':''}" data-step="${id}"${open[id]?'':' disabled'} aria-current="${id===current?'step':'false'}"><span class="step-dot">${done[id]&&id!==current?'✓':i+1}</span><span class="step-label">${label}</span></button>`).join('<span class="step-line" aria-hidden="true"></span>')}</nav>`;
}
const next=(to,label)=>`<div class="next-row"><button type="button" class="btn btn-primary" data-step="${to}">${esc(label)} →</button></div>`;
const head=(title,sub)=>`<header class="step-head"><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</header>`;

// 1 · Scan
// One card per account: the fullest scan (most reels, then newest) stands for it.
export function latestRuns(runs){const by=new Map();for(const r of runs){const k=r.creator,have=by.get(k);if(!have||r.count>have.count||(r.count===have.count&&String(r.createdAt)>String(have.createdAt)))by.set(k,r);}return [...by.values()];}
export function renderScan({runs=[],run=null,progress=null,error=''}){
 runs=latestRuns(runs);
 const list=runs.length?`<div class="acct-list">${runs.map(r=>`<button type="button" class="acct${run?.id===r.id?' is-on':''}" data-run="${esc(r.id)}"><b>@${esc(r.creator)}</b><span>${esc(r.count)} reels · ${esc(r.status)}</span></button>`).join('')}</div>`:'';
 const form=`<form class="card scan-form" data-form="scan"><label for="scan-handle">Instagram account</label><div class="scan-row"><span class="at">@</span><input id="scan-handle" name="handle" autocomplete="off" placeholder="ken.remedie" required><button class="btn btn-primary" type="submit">Scan 100 reels · about $0.35</button></div><p class="hint">Collects the reels, listens to them and labels what is said. Takes about 10 minutes.</p>${error?`<p class="err">${esc(error)}</p>`:''}</form>`;
 const status=run?(progress&&progress.state!=='done'?`<div class="card scan-status"><b>Scanning @${esc(run.creator)}</b><progress value="${progress.done}" max="${progress.total}"></progress><span class="hint">${esc(progress.label)}</span></div>`:`<div class="card scan-status is-done"><b>@${esc(run.creator)} is scanned</b><span class="hint">${esc(run.count)} reels</span></div>`):'';
 return `${head('Pick an account','Scan any public Instagram account, or open one you scanned before.')}${form}${list}${status}${run&&(!progress||progress.state==='done')?next('winners','See the winners'):''}`;
}

// 2 · Winners
function reelTile(p,{badge,sub}){return `<button type="button" class="reel" data-play="${esc(p.id)}"><img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.hidden=true"><span class="reel-badge">${esc(badge)}</span><span class="reel-sub">${esc(sub)}</span></button>`;}
export function renderWinners({account,winners=[],weakest=[]}){
 if(!winners.length)return `${head('No winners yet','This account needs scored reels with a saved video.')}`;
 return `${head(`@${account}'s winners`,'These reels got many more views than this account normally gets.')}
<div class="reel-grid">${winners.map(w=>reelTile(w,{badge:`${w.xNormal.toFixed(1)}× normal`,sub:`${compact(w.reach)} views`})).join('')}</div>
${weakest.length?`<h2 class="sub-title">Their weakest, for contrast</h2><div class="reel-grid is-small">${weakest.map(w=>reelTile(w,{badge:`${w.xNormal.toFixed(1)}×`,sub:`${compact(w.reach)} views`})).join('')}</div>`:''}
${next('secret','Why do these win?')}`;
}

// 3 · Secret, readable by a 10-year-old: 3 things to do, 1 to avoid, what every reel has, why it works, a check.
const dots=(n,of,cls)=>`<span class="dots ${cls}" aria-label="${n} of ${of}">${Array.from({length:of},(_,i)=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
function compareRow(d){return `<div class="compare"><div><span class="cmp-label">Best reels</span>${dots(d.winners,d.perSide,'best')}<b>${d.winners} of ${d.perSide}</b></div><div><span class="cmp-label">Weakest</span>${dots(d.flops,d.perSide,'weak')}<b>${d.flops} of ${d.perSide}</b></div></div>`;}
const thumbs=(ids,imageFor,n=3)=>`<div class="proof">${ids.slice(0,n).map(id=>`<button type="button" class="proof-thumb" data-play="${esc(id)}" aria-label="Play a reel that does this"><img src="${esc(imageFor(id))}" alt="" loading="lazy" onerror="this.hidden=true"></button>`).join('')}</div>`;
export function renderSecret({account,status,imageFor,feedback=null}){
 if(!status||status.state==='none'||!status.saved){
  if(status?.state==='building')return `${head('Reading the channel…',status.stage||'')}<div class="card"><progress value="${status.done||0}" max="${status.total||30}"></progress><p class="hint">Watching ${status.done||0} of ${status.total||30} reels. About 3 minutes.</p></div>`;
  const plan=status?.plan;
  if(plan?.error)return `${head('The Secret needs more reels',plan.error)}`;
  return `${head(`Why does @${account} win?`,'The app watches their best and weakest reels and finds what the best ones do differently.')}
<div class="card cta-card"><ul class="ticks"><li>Watches ${plan?.reels||30} reels with sound</li><li>Compares the best with the weakest</li><li>Shows the proof you can play</li></ul>${status?.error?`<p class="err">${esc(status.error)}</p>`:''}<button type="button" class="btn btn-primary" data-act="secret-build">Find the secret · about $${(plan?.usd??0.35).toFixed(2)}</button></div>`;
 }
 const s=status.saved,st=s.stats,sec=s.secret,diffs=[...st.differences].sort((a,b)=>Math.abs(b.winners-b.flops)-Math.abs(a.winners-a.flops));
 const doMore=diffs.filter(d=>d.winners>d.flops).slice(0,3),avoid=diffs.find(d=>d.flops>d.winners);
 const dos=doMore.map((d,i)=>`<article class="card do-card"><span class="num">${i+1}</span><h3>${esc(name(d.question,d.value))}</h3><p class="plain">${esc(plain(d.question,d.value))}</p>${compareRow(d)}${thumbs(d.evidence,imageFor)}</article>`).join('');
 const avoidCard=avoid?`<article class="card avoid-card"><span class="tag tag-avoid">Their weakest reels do this more</span><h3>${esc(name(avoid.question,avoid.value))}</h3><p class="plain">${esc(plain(avoid.question,avoid.value))}</p>${compareRow(avoid)}</article>`:'';
 // What every reel has, minus anything already shown as a difference (no saying the same thing twice).
 const shown=new Set([...doMore,avoid].filter(Boolean).map(d=>`${d.question}.${d.value}`));
 const every=(st.house||[]).filter(h=>!shown.has(`${h.question}.${h.value}`)).slice(0,6).map(h=>`<span class="chip">${esc(name(h.question,h.value))}</span>`).join('');
 // Why it works: only the plain sentence, with a small tag for how solid the science is.
 const why=(sec.why||[]).slice(0,3).map(w=>{const m=MECHANISMS[w.mechanism];return m?`<li><p class="why-kid">${esc(m.kid||m.meaning)}</p><span class="tag tag-${esc(m.strength)}">${m.strength==='strong'?'Proven by research':'Backed by research'}</span></li>`:'';}).join('');
 const risk=(sec.critique||[]).find(c=>c.kind==='risk');
 // What the system understood, in its own short labels with a picture: who, where, what happens.
 const labelOf=(q)=>{const h=(st.house||[]).find(x=>x.question===q);return h?name(q,h.value):null;};
 const seenRows=[['Who',[labelOf('presenter'),labelOf('look')].filter(Boolean).join(' · '),sec.person],['Where',labelOf('setting')||'',sec.setting],['What happens',[labelOf('format'),labelOf('angle')].filter(Boolean).join(' · '),sec.format]];
 const formula=seenRows.filter(([,label,part])=>label||part).map(([title,label,part])=>`<div class="seen">${part?.evidence?.[0]?`<img src="${esc(imageFor(part.evidence[0]))}" alt="" onerror="this.hidden=true">`:''}<div><span class="cmp-label">${title}</span><p>${esc(label||part?.text||'')}</p></div></div>`).join('');
 const check=feedback?`<p class="hint">${feedback==='yes'?'Thanks. The ideas will follow this.':'Noted. Tell Claude what is off and it will rebuild the Secret.'}</p>`:`<div class="check-row"><button type="button" class="btn" data-feedback="yes">Yes, that's it</button><button type="button" class="btn btn-ghost" data-feedback="no">Not quite</button></div>`;
 return `${head(sec.headline||`Why @${account} wins`,'What their best reels do more than their weakest ones.')}
<section class="block"><h2 class="sub-title">Do these</h2><div class="do-grid">${dos||'<p class="hint">No clear difference found.</p>'}</div></section>
<section class="block two-col">${avoidCard}<article class="card"><h3 class="card-title">Every reel has</h3><div class="chips">${every}</div></article></section>
${why?`<section class="block"><h2 class="sub-title">Why it works on people</h2><ul class="why-list card">${why}</ul></section>`:''}
${risk?`<div class="card risk"><b>Before you copy</b><p>${esc(risk.point)}</p></div>`:''}
<section class="block"><h2 class="sub-title">Did we understand it right?</h2><div class="card"><div class="seen-grid">${formula}</div>${check}</div></section>
${next('kit','Build the look')}`;
}

// 4 · Kit: the brand memory. The host, the place and the sound every reel shares, drawn and checked.
const FORMAT_NAMES={ai_host:'AI host',hands_pov:'Hands only',visuals:'No person',animated:'Animated'};
const KIND={object:'Prop',colour:'Colour',action:'Move',sound:'Sound',words:'Words',effect:'Edit'};
function kitPic(p,{big=false}={}){
 if(!p)return '';const flag=p.check&&!p.check.pass;
 return `<figure class="kit-pic${big?' is-big':''}${p.role.startsWith('turn')?' is-wide':''}"><a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(p.label)}" loading="lazy"></a><figcaption>${esc(p.label.replace(/^[^:]+: /,'').replace(/^./,c=>c.toUpperCase()))}${flag?`<span class="tag tag-avoid" title="${esc(p.check.problems.join('; '))}">Check: ${esc(p.check.problems[0])}</span>`:''}</figcaption></figure>`;
}
export function renderKit({account,status,busy=false,error=''}){
 const err=error||status?.error?`<p class="err">${esc(error||status.error)}</p>`:'';
 if(status?.state==='working'){const pr=status.progress||{};return `${head('Building your look…',status.stage||'')}<div class="card"><progress${pr.total>1?` value="${pr.done||0}" max="${pr.total}"`:''}></progress><p class="hint">${pr.total>1?`Picture ${Math.min((pr.done||0)+1,pr.total)} of ${pr.total}. `:''}About 2 minutes. Every picture is checked before the next one.</p></div>`;}
 const k=status?.saved;
 if(!k)return `${head(`Your look, in @${account}'s style`,'The face, the place and the sound every reel will share, so people recognise you in the first second.')}${err}
<div class="card cta-card"><ul class="ticks"><li>Studies 3 of their best reels, with sound</li><li>Picks the format: AI host, hands only, no person or animated</li><li>Draws your host and your place, and checks every picture</li></ul><button type="button" class="btn btn-primary" data-act="kit-build"${busy?' disabled':''}>Build my look · up to $${esc((status?.estimate?.usd??0.7).toFixed(2))}</button></div>`;
 const kit=k.kit,pics=Object.fromEntries(k.pictures.map(p=>[p.role,p])),flagged=k.pictures.filter(p=>!p.check.pass).length,hosts=kit.cast||[];
 const switches=Object.keys(FORMAT_NAMES).filter(f=>f!==k.format).map(f=>`<button type="button" class="chip chip-btn" data-kit-format="${f}"${busy?' disabled':''}>${FORMAT_NAMES[f]}</button>`).join('');
 const format=`<article class="card kit-format"><span class="cmp-label">The format${k.byJev?' · picked by Jev':' · your choice'}</span><h3>${esc(FORMAT_NAMES[k.format])}</h3><p class="plain">${esc(k.formatWhy)}</p><div class="switch-row"><span class="hint">Switch to</span>${switches}</div></article>`;
 const cast=hosts.map((h,i)=>`<article class="card kit-host"><div class="kit-host-pics">${kitPic(pics[`face${i}`],{big:true})}${kitPic(pics[`body${i}`])}</div>${kitPic(pics[`turn${i}`])}<div class="kit-host-text"><h3>${esc(h.name)}</h3><p class="plain">${esc(h.role)}</p><dl class="kit-facts"><dt>Wears</dt><dd>${esc(h.outfit)}</dd><dt>Sounds</dt><dd>${esc(h.voice)}</dd></dl></div></article>`).join('');
 const hands=pics.hands?`<article class="card kit-host"><div class="kit-host-pics">${kitPic(pics.hands,{big:true})}</div><div class="kit-host-text"><h3>The hands</h3><p class="plain">${esc(kit.hands)}</p></div></article>`:'';
 const others=(kit.places||[]).filter(Boolean);
 const place=`<div class="kit-place">${kitPic(pics.place)}${kitPic(pics.scene)}<article class="card"><dl class="kit-facts kit-facts-stack"><dt>Main place</dt><dd>${esc(kit.place)}</dd>${others.length?`<dt>Also films in</dt><dd>${others.map(esc).join('<br>')}</dd>`:''}<dt>Camera</dt><dd>${esc(kit.camera)}</dd><dt>Light</dt><dd>${esc(kit.light)}</dd></dl></article></div>`;
 const assets=(kit.assets||[]).map(a=>`<li><span class="tag">${esc(KIND[a.kind]||a.kind)}</span><div><b>${esc(a.what)}</b><p class="hint">${esc(a.how)}</p></div></li>`).join('');
 const palette=(kit.palette||[]).map(c=>`<span class="swatch"><i style="background:${/^#[0-9a-f]{6}$/i.test(c.hex)?c.hex:'#ccc'}"></i>${esc(c.name)}</span>`).join('');
 const none=v=>!v||/^none$/i.test(v);
 const sound=[['Voice',kit.sound?.voice],['Music',kit.sound?.music],['Real sounds',kit.sound?.natural]].filter(([,v])=>!none(v)).map(([t,v])=>`<dt>${t}</dt><dd>${esc(v)}</dd>`).join('');
 const redo=[hosts.length?`<button type="button" class="btn" data-act="kit-character"${busy?' disabled':''}>New ${hosts.length>1?'hosts':'host'} · about $${esc(status.estimate.usd.toFixed(2))}</button>`:'',flagged?`<button type="button" class="btn" data-act="kit-pictures"${busy?' disabled':''}>Draw the ${flagged} flagged again · about $${(flagged*0.07).toFixed(2)}</button>`:''].join('');
 const use=k.approved?`<span class="pill pill-ok">In use ✓</span>`:`<button type="button" class="btn btn-primary" data-act="kit-approve"${busy?' disabled':''}>Use this look</button>`;
 return `<header class="step-head"><span class="eyebrow">Your new channel, in @${esc(account)}'s style</span><h1>${esc(kit.name)}</h1><p>${esc(kit.promise)}</p></header>${err}
<section class="block">${format}</section>
${hosts.length||hands?`<section class="block"><h2 class="sub-title">${hosts.length?`Your host${hosts.length>1?'s':''}`:'On camera'}</h2><div class="kit-cast">${cast}${hands}</div>${hosts.length?'<p class="hint">Made-up people, not the real creators. Every caption says they are AI.</p>':''}</section>`:''}
<section class="block"><h2 class="sub-title">Where it happens</h2>${place}</section>
<section class="block two-col"><article class="card"><h3 class="card-title">In every reel</h3><ul class="kit-assets">${assets}</ul><div class="palette">${palette}</div></article><article class="card"><h3 class="card-title">How it sounds</h3><dl class="kit-facts">${sound}</dl></article></section>
<div class="card kit-actions">${use}${redo}<span class="hint">This look cost $${esc(k.costUsd.toFixed(2))}.</span></div>
${k.approved?next('make','Make a reel with this look'):''}`;
}

// 5 · Make: ideas → script and price → confirm → progress → video.
const meter=(label,v)=>`<div class="meter"><span>${label}</span><i><b style="width:${Math.round(Math.max(0,Math.min(3,v||0))/3*100)}%"></b></i></div>`;
export function renderIdeas(plan,{busy,made=new Set()}){
 return `<div class="idea-grid">${plan.picked.slice(0,4).map((p,i)=>`<article class="card idea${plan.chosen===i?' is-on':''}">${made.has(i)?'<span class="pill pill-ok made">Made ✓</span>':''}<h3>${esc(p.idea.title)}</h3><p class="quote">“${esc(p.idea.hook_line)}”</p>${meter('Fits the winners',p.scores.fit)}${meter('Easy for AI',p.scores.ai_ready)}${meter('Strong start',p.scores.hook)}<button type="button" class="btn${plan.chosen===i?'':' btn-primary'}" data-idea="${i}"${busy?' disabled':''}>${plan.chosen===i?'Chosen':'Use this idea'}</button></article>`).join('')}</div>
${plan.rejected?.length?`<p class="hint">Jev removed ${plan.rejected.length} idea${plan.rejected.length>1?'s':''}: ${plan.rejected.map(r=>`${esc(r.idea.title)} (${esc(r.reason)})`).join(', ')}.</p>`:''}`;
}
export function renderScript(plan){
 const s=plan.script,lines=id=>s.voiceover.filter(v=>v.shot===id).map(v=>v.line).join(' ');
 const checks=[['Starts mid-action',/mid-action/],['One clear action',/clear action/],['No health claim',/health claim/],['One feeling',/feeling/]].map(([label,re])=>{const bad=(plan.check?.problems||[]).some(p=>re.test(p));return `<span class="pill ${bad?'pill-bad':'pill-ok'}">${bad?'!':'✓'} ${label}</span>`;}).join('');
 return `<div class="card script"><div class="script-top"><div><span class="cmp-label">On screen first</span><h3>${esc(s.hook_title)}</h3></div><span class="pill">Comment ${esc(s.keyword)}</span></div>
<ol class="board">${s.shots.map((sh,i)=>`<li><span class="shot-n">${i+1}</span><span class="shot-s">${esc(sh.seconds)} s</span><p class="shot-v">${esc(sh.visual)}</p><p class="shot-l">“${esc(lines(sh.id))}”</p></li>`).join('')}</ol>
<div class="pills">${checks}</div></div>`;
}
export function renderPrice(price,{mode,balance,busy}){
 const opt=(id,title,credits,max)=>`<button type="button" class="price-opt${mode===id?' is-on':''}" data-mode="${id}"><b>${title}</b><span class="price-n">${credits}</span><span class="hint">credits · up to ${max} with retries</span></button>`;
 const total=mode==='fast'?price.fastTotal:price.total,max=mode==='fast'?price.fastWithOneRetryEach:price.withOneRetryEach,enough=!Number.isFinite(balance)||balance>=total;
 return `<div class="card price"><div class="price-opts">${opt('std','Best quality',price.total,price.withOneRetryEach)}${opt('fast','Fast and cheaper',price.fastTotal,price.fastWithOneRetryEach)}</div>
<div class="price-foot"><span class="hint">${Number.isFinite(balance)?`You have ${balance} credits.`:''} ${enough?'':'Not enough credits: top up on Higgsfield first.'}</span><button type="button" class="btn btn-primary" data-act="make" data-credits="${total}" data-max="${max}"${busy||!enough?' disabled':''}>Make the reel · ${total} credits</button></div></div>`;
}
export function renderProgress(st){
 const p=st.progress||{done:0,total:1};
 return `<div class="card progress-card"><b>${esc(st.stage||'Working')}</b><progress value="${p.done}" max="${p.total}"></progress><p class="hint">Step ${Math.min(p.done+1,p.total)} of ${p.total}. Each shot is checked before the next one is paid for. You can leave this page.</p></div>`;
}
// Ideas already made have a reel whose id starts with the idea's number.
export const madeIdeas=reels=>new Set((reels||[]).map(r=>Number(String(r.id).split('-')[0])).filter(Number.isInteger));
export function renderMake({account,plan,make,balance,mode='fast',busy=false,error='',pricing=false}){
 const top=head(`Make a reel in @${account}'s style`,'Hands and a voice, no face. Jev picks the ideas that fit the winners and checks the script.');
 const err=error||make?.error||plan?.error?`<p class="err">${esc(error||make?.error||plan?.error)}</p>`:'';
 if(make?.state==='working')return `${top}${renderProgress(make)}`;
 if(plan?.state==='working')return `${top}<div class="card"><b>${esc(plan.stage||'Working')}</b><progress></progress></div>`;
 const p=plan?.plan;
 if(!p)return `${top}${err}<div class="card cta-card"><ul class="ticks"><li>4 ideas in the winners' style</li><li>Health claims and fake tests removed</li><li>You pick one and see the exact price</li></ul><button type="button" class="btn btn-primary" data-act="ideas"${busy?' disabled':''}>Get ideas · a few cents</button></div>`;
 const made=madeIdeas(make?.reels),doneReel=(make?.reels||[]).find(r=>Number(String(r.id).split('-')[0])===p.chosen);
 const finished=doneReel?`<div class="card done"><video src="${esc(doneReel.url)}#t=0.5" controls playsinline preload="metadata"></video><div><span class="pill pill-ok">Made ✓</span><h3>${esc(doneReel.title||'Your reel')}</h3><p class="hint">This idea is made. Pick another idea above to make a new reel.</p>${next('ready','Open Ready to post')}</div></div>`:'';
 const makeIt=finished||(pricing||!p.price||p.price.kit===undefined?'<div class="card"><b>Checking the price…</b><progress></progress></div>':p.check?.pass?renderPrice(p.price,{mode,balance,busy}):'<p class="err">Jev found problems in this script. Pick the idea again to rewrite it.</p>');
 return `${top}${err}<section class="block"><h2 class="sub-title">1 · Pick an idea</h2>${renderIdeas(p,{busy,made})}</section>
${p.script?`<section class="block"><h2 class="sub-title">2 · Check the script</h2>${renderScript(p)}</section><section class="block"><h2 class="sub-title">3 · Make it</h2>${makeIt}</section>`:''}`;
}

// 6 · Ready to post
export function renderReady({reels=[]}){
 if(!reels.length)return `${head('Nothing ready yet','Make a reel first.')}`;
 return `${head('Ready to post','Download the video, copy the caption, post it yourself.')}<div class="ready-grid">${reels.map(r=>`<article class="card ready"><video src="${esc(r.url)}#t=0.5" controls playsinline preload="metadata"></video><div class="ready-body"><h3>${esc(r.title||'Reel')}</h3><p class="caption" id="cap-${esc(r.id)}">${esc(r.caption||'')}</p><div class="ready-actions"><a class="btn btn-primary" href="${esc(r.url)}" download>Download</a><button type="button" class="btn" data-copy="cap-${esc(r.id)}">Copy caption</button></div><span class="hint">${esc(Math.round(r.seconds||0))} s · ${esc(r.spent??'')} credits</span></div></article>`).join('')}</div>`;
}

// The five-step app: Scan → Winners → Look → Copy → Ready to post (the Secret is built inside Look; 2026-09-29). Pure render functions (data in, HTML out) so
// Node tests can check them. Short words, visuals first; the long research views live at /lab.
import {SHORT,LABELS,PLAIN} from './secret-labels.mjs';
import {MECHANISMS} from './secret-mechanisms.mjs';

export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):'–';
const name=(q,v)=>SHORT[q]?.[v]||LABELS[q]?.[1]?.[v]||v;
const plain=(q,v)=>PLAIN[q]?.[v]||'';

// Kaan, 2026-09-29: continue from the winners with the copy path. The Secret page stays reachable from Winners
// ("Why do these win?") but is no longer a step: Look builds it when it is missing.
export const STEPS=[['scan','Scan'],['winners','Winners'],['kit','Look'],['make','Copy'],['ready','Ready to post']];
// Which steps can be opened: each needs the one before it to be done.
export function reachable({scanned=false,scored=false,kit=false,reels=0,winnersReady=false}){
 return {scan:true,winners:scored,secret:scanned&&scored,kit:scored&&(scanned||winnersReady),make:kit&&(scanned||winnersReady),ready:reels>0};
}
export function renderStepper(current,open,done){
 if(current==='secret')current='winners'; // "Why do these win?" belongs to Winners now
 return `<nav class="steps" aria-label="Steps">${STEPS.map(([id,label],i)=>`<button type="button" class="step${id===current?' is-current':''}${done[id]?' is-done':''}" data-step="${id}"${open[id]?'':' disabled'} aria-current="${id===current?'step':'false'}"><span class="step-dot">${done[id]&&id!==current?'✓':i+1}</span><span class="step-label">${label}</span></button>`).join('<span class="step-line" aria-hidden="true"></span>')}</nav>`;
}
const next=(to,label)=>`<div class="next-row"><button type="button" class="btn btn-primary" data-step="${to}">${esc(label)} →</button></div>`;
const head=(title,sub)=>`<header class="step-head"><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</header>`;

// 1 · Scan
// Where a scan stands. A scan that stopped (failed, paused, cut off by a restart, or never started) says why and can be
// resumed: it read "Scanning…" forever, with no polling and no way out (audit 2026-09-29).
const STOPPED={failed:'The scan stopped',paused:'The scan is paused',interrupted:'The scan was cut off when the app restarted',ready:'The scan has not started'};
export function scanState(job){
 if(!job)return null;if(['complete','partial'].includes(job.status))return {state:'done'};
 const total=job.posts.length||job.limit||100,done=job.posts.filter(p=>finishedPost(p)||p.analysis||p.excludedReason).length;
 if(!['running','scraping'].includes(job.status))return {state:'stopped',done,total,label:STOPPED[job.status]||`The scan is ${job.status}`,error:job.error||''};
 return {state:'running',done,total,label:job.posts.length?`Listening to reel ${done} of ${total}`:'Collecting reels'};
}
// The account list follows the loaded run: it said "0 reels · running" next to "@x is scanned" (audit 2026-09-29).
export const syncRuns=(runs,job)=>job?runs.map(r=>r.id===job.id?{...r,count:job.posts.length,status:job.status}:r):runs;
// One card per account: the fullest scan (most reels, then newest) stands for it.
export function latestRuns(runs){const by=new Map();for(const r of runs){const k=r.creator,have=by.get(k);if(!have||r.count>have.count||(r.count===have.count&&String(r.createdAt)>String(have.createdAt)))by.set(k,r);}return [...by.values()];}
export const REEL_COUNTS=[{limit:30,time:3,usd:0.12},{limit:60,time:4,usd:0.22},{limit:100,time:6,usd:0.35}];
export function renderAnalysisSheet(){return `<button type="button" class="x" data-close aria-label="Close new analysis">×</button><form data-form="scan" class="scan-form"><h2 id="analysis-title">New analysis</h2><p class="hint">Find the reels worth making your own.</p><label for="scan-handle">Instagram account</label><input id="scan-handle" name="handle" autocomplete="off" placeholder="@name or instagram.com/name" required><fieldset class="count-choice"><legend>How many reels?</legend>${REEL_COUNTS.map(c=>`<label><input type="radio" name="limit" value="${c.limit}"${c.limit===60?' checked':''}><span><b>${c.limit} reels</b><small>About ${c.time} min</small><small>About $${c.usd.toFixed(2)}</small></span></label>`).join('')}</fieldset><label class="fresh"><input type="checkbox" name="fresh" checked><span>Fresh start <small>Reuse nothing from earlier scans</small></span></label><p class="hint prep-note">When the scan ends, the Look and Copy steps get ready in the background (about $0.30 more), so they start instantly.</p><p class="err" id="analysis-error" role="alert"></p><button class="btn btn-primary" type="submit">Start →</button></form>`;}
export function renderAccounts(runs,run){return `<details class="account-menu"><summary aria-label="Switch account">${run?`@${esc(run.creator)}`:'Choose an account'} <span aria-hidden="true">⌄</span></summary><div class="account-options"><button class="btn" data-act="new-analysis">＋ New analysis</button>${latestRuns(runs).map(r=>`<button class="acct${run?.id===r.id?' is-on':''}" data-run="${esc(r.id)}"><b>@${esc(r.creator)}</b><span>${esc(r.count)} reels</span></button>`).join('')}</div></details>`;}
export const finishedPost=p=>['complete','no_speech','music','no_audio','failed'].includes(p.status);
export function winnersFinished(posts,results){const top=posts.filter(p=>['winner','big_winner'].includes(results?.[p.id]?.label)).sort((a,b)=>results[b.id].xNormal-results[a.id].xNormal).slice(0,6);return top.length>0&&top.every(finishedPost);}
export function scanSummary(posts=[],results={}){const counts=posts.map(p=>p.plays||p.views).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b),n=counts.length;const median=n?(counts[(n-1)>>1]+counts[n>>1])/2:null;const normals=Object.values(results).filter(r=>r.xNormal>0&&r.reach>0).map(r=>r.reach/r.xNormal).sort((a,b)=>a-b);return [['Reels',posts.length],['Winners',normals.length?Object.values(results).filter(r=>r.xNormal>=2).length:null],['Best reel',n?counts[n-1]:null],['Usual plays',normals.length?normals[normals.length>>1]:null]];}
export function renderScan({runs=[],run=null,posts=[],results={},progress=null,error='',scored=false,scoreError=''}){
 if(!run)return `${head('Find your next great reel','Start with an account you love. See what wins, then make it yours.')}<div class="card empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h2>Every great reel starts somewhere.</h2><p>Choose an Instagram account to explore its best ideas.</p><button class="btn btn-primary" data-act="new-analysis">New analysis →</button>${error?`<p class="err">${esc(error)}. Choose an account to try again.</p>`:''}</div>${runs.length?`<div class="acct-list">${latestRuns(runs).map(r=>`<button class="acct" data-run="${esc(r.id)}"><b>@${esc(r.creator)}</b><span>${r.count} reels</span></button>`).join('')}</div>`:''}`;
 const running=progress?.state==='running',stopped=progress?.state==='stopped';
 const status=running||stopped?`<section class="scan-status card${stopped?' is-stopped':''}"><span class="hint">${stopped?'Needs your attention':'Live scan'}</span><h2>${esc(progress.label)}${stopped?`: @${esc(run.creator)}`:''}</h2><progress value="${progress.done}" max="${progress.total}"></progress><p class="hint">${scored&&running?`Still listening: ${progress.done} of ${progress.total}. Your winners are ready to explore.`:`${progress.done} of ${progress.total} reels finished.`}</p>${stopped?`<p class="err">${esc(progress.error)} Resume to finish the remaining reels.</p><button class="btn" data-act="scan-resume">Resume the scan</button>`:''}</section>`:`<div class="summary-strip">${scanSummary(posts,results).map(([label,value])=>`<div><span>${label}</span><strong>${compact(value)}</strong></div>`).join('')}</div>`;
 return `${head(running?`Finding @${run.creator}’s best ideas`:stopped?`Finish scanning @${run.creator}`:`@${run.creator} is scanned`,running?'Winners appear as soon as the reels are collected.':'The whole account, with the standouts in plain sight.')}${status}${error?`<p class="err">${esc(error)}. Try refreshing this account.</p>`:''}<section class="card scan-live"><div class="scan-top"><h2>The reels, at a glance</h2><span class="scan-count hint"></span></div><div class="scan-grid"><div class="scan-stage" data-run="${esc(run.id)}"><svg aria-hidden="true"></svg><span class="scan-lab">Thumbnail wall</span><span class="scan-lab right">Performance map</span></div><aside class="scan-player"><p class="hint">Choose a reel to play it here.</p></aside></div></section>${scored?next('winners','See the winners'):scoreError?`<p class="err">Could not find the winners: ${esc(scoreError)}. Refresh to try again.</p>`:!running?'<p class="hint">Not enough reels with view and comment counts to find winners.</p>':''}`;
}

// 2 · Winners
// Winners are the reels the Money view calls winners (at least 2x their normal and clearly above the usual ups and
// downs), not every reel above 1x: "1.1× normal" sat under "many more views" (audit 2026-09-29).
export function topWinners(posts,results,{hasVideo,limit=6}){
 return posts.map(p=>({p,r:results?.[p.id]})).filter(({p,r})=>r&&['winner','big_winner'].includes(r.label)&&Number.isFinite(r.xNormal)&&hasVideo(p))
  .sort((a,b)=>b.r.xNormal-a.r.xNormal).slice(0,limit).map(({p,r})=>({id:p.id,xNormal:r.xNormal,reach:r.reach}));
}
function reelTile(p,{small=false,index=0}={}){return `<article class="winner-card rise" style="--i:${index}"><button type="button" class="reel" data-preview="${esc(p.id)}" aria-label="Play reel with ${compact(p.reach)} plays"><img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.hidden=true">${p.video?`<video data-src="${esc(p.video)}" muted playsinline loop preload="none"></video>`:''}<span class="reel-play" aria-hidden="true">↗</span></button><div class="winner-copy"><h2>${compact(p.reach)} <span>plays</span></h2><p>${Number(p.xNormal).toFixed(1).replace(/\.0$/,'')}× their usual</p>${small?'':`<span class="hint">${Number.isFinite(p.engagement)?`Engagement ${Math.round(p.engagement)} per 1K plays`:'Engagement unavailable'}</span>`}</div></article>`;}
// Prep ahead's one quiet line: the next steps are being readied in the background, are ready, or could not be.
export function prepLine(prep){
 if(prep?.state==='working')return '<p class="prep-line is-working"><span class="prep-dot" aria-hidden="true"></span>Getting your Look and Copy ready in the background</p>';
 if(prep?.state==='done')return '<p class="prep-line is-done">Look and Copy are ready to start</p>';
 if(prep?.state==='failed')return `<p class="prep-line is-failed">Could not prepare ahead (${esc(prep.error||'unknown error')}). The next steps still work, a little slower.</p>`;
 return '';
}
export function renderWinners({account,winners=[],weakest=[],secretOpen=true,lookOpen=true,prep=null}){
 if(!winners.length)return `${head('No clear winners yet','No saved reel got at least twice this account’s usual plays. Try a larger scan.')}<button class="btn btn-primary" data-act="new-analysis">New analysis →</button>`;
 return `${head(`@${account}’s winners`,'Proven ideas. Now imagine them with your hosts.')}${prepLine(prep)}<div class="reel-grid">${winners.map((w,index)=>reelTile(w,{index})).join('')}</div>${weakest.length?`<section class="weak-section"><h2 class="sub-title">Their weakest, for perspective</h2><div class="reel-grid is-small">${weakest.map(w=>reelTile(w,{small:true})).join('')}</div></section>`:''}<div class="next-row"><button type="button" class="btn btn-ghost" data-step="secret"${secretOpen?'':' disabled'}>Why do these win?${secretOpen?'':' · listening'}</button><button type="button" class="btn btn-primary" data-step="kit"${lookOpen?'':' disabled'}>${lookOpen?'Make your look →':'Listening to the winners…'}</button></div>`;
}

// 3 · Secret, readable by a 10-year-old: 3 things to do, 1 to avoid, what every reel has, why it works, a check.
const dots=(n,of,cls)=>`<span class="dots ${cls}" aria-label="${n} of ${of}">${Array.from({length:of},(_,i)=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
// One plain sentence first, then the dots ("3 of 9 best / weakest" read as soup, Kaan 2026-09-28).
export function compareSentence(d){const n=d.perSide;return d.winners>=d.flops?`${d.winners} of their ${n} best reels do this, but only ${d.flops} of their ${n} weakest.`:`Only ${d.winners} of their ${n} best reels do this, but ${d.flops} of their ${n} weakest do.`;}
function compareRow(d){return `<div class="compare"><p class="cmp-say">${esc(compareSentence(d))}</p><div><span class="cmp-label">${d.perSide} best</span>${dots(d.winners,d.perSide,'best')}</div><div><span class="cmp-label">${d.perSide} weakest</span>${dots(d.flops,d.perSide,'weak')}</div></div>`;}
const thumbs=(ids,imageFor,n=3)=>`<div class="proof">${ids.slice(0,n).map(id=>`<button type="button" class="proof-thumb" data-play="${esc(id)}" aria-label="Play a reel that does this"><img src="${esc(imageFor(id))}" alt="" loading="lazy" onerror="this.hidden=true"></button>`).join('')}</div>`;
// Winner DNA on the Secret page: the honest verdict first, then each detail with evidence and its numbers, what showed
// no effect, and a spot check of how the app read a few reels.
const DETAIL_NAME={people:'number of people',pair:'who is on camera',age:'host age',glasses:'glasses',facial_hair:'beard',polish:'styling',first_frame:'first frame',first_expression:'first expression',gaze:'where the host looks',first_speaker:'who speaks first',reaction:'reaction shots',hook:'hook type',arc:'story or steps',payoffs:'number of payoffs',payoff_closeup:'result up close',humor:'humor',twist:'twist',emotion:'feeling',voice:'voice style',music:'music',real_sounds:'real sounds',text:'text on screen',intensity:'intensity',setting:'place',length:'length'};
export function renderDna(dna,{imageFor}){
 if(!dna)return '';
 if(dna.state==='working')return `<section class="block"><h2 class="sub-title">Winner DNA</h2><div class="card"><b>${esc(dna.stage||'Working')}</b><progress value="${dna.done||0}" max="${dna.total||1}"></progress><p class="hint">Reel ${Math.min((dna.done||0)+1,dna.total||1)} of ${dna.total}. About 3 minutes.</p></div></section>`;
 if(!dna.saved)return `<section class="block"><h2 class="sub-title">Winner DNA</h2><div class="card cta-card"><p class="plain">Do the small details matter here? Glasses, a second person, the voice, how many reveals, the sounds, the length.</p><ul class="ticks"><li>Checks about 25 details on all ${esc(dna.estimate?.reels||0)} scored reels</li><li>Tests each against their own normal, not against other channels</li><li>Checks whether it predicts reels it has not seen, and says so if not</li></ul>${dna.error?`<p class="err">${esc(dna.error)}</p>`:''}<button type="button" class="btn btn-primary" data-act="dna-build">Find the Winner DNA · about $${esc((dna.estimate?.usd??0.5).toFixed(2))}</button></div></section>`;
 const d=dna.saved,v=d.validation||{},shown=dna.view?.shown||[],none=dna.view?.noEffect||[];
 const verdict=v.verdict==='predictable'?['good','Their wins follow a pattern',`These details predicted reels the test had not seen (rank correlation ${v.rho}). Follow them.`]
  :v.verdict==='weak'?['warn','A weak pattern',`The details predicted unseen reels only a little (rank correlation ${v.rho}). Use them as tie-breakers.`]
  :['warn','Their wins look mostly like luck and timing',`No set of details predicted reels the test had not seen (rank correlation ${v.rho??'–'}). The hints below lean one way, but they are tie-breakers, not rules.`];
 const bar=(x,max)=>`<i class="dna-bar"><b style="width:${Math.round(Math.min(1,x/max)*100)}%"></b></i>`;
 const rows=shown.map(r=>{const max=Math.max(r.withX,r.withoutX,0.01);return `<li class="dna-row"><span class="dna-dir ${r.rho>0?'up':'down'}">${r.rho>0?'▲':'▼'}</span><div><b>${esc(r.plain)}</b><div class="dna-cmp"><span>with it</span>${bar(r.withX,max)}<b>${esc(r.withX)}×</b><span>without</span>${bar(r.withoutX,max)}<b>${esc(r.withoutX)}×</b></div><span class="hint">${esc(r.n)} of ${esc(d.reels)} reels · ${r.evidence==='signal'?'proven for this channel':'a hint'}</span></div></li>`;}).join('');
 const spot=(d.labels||[]).slice().sort((a,b)=>b.xNormal-a.xNormal).slice(0,4).map(x=>`<figure class="dna-spot"><img src="${esc(imageFor(x.id))}" alt="" loading="lazy" onerror="this.hidden=true"><figcaption><b>${esc(x.xNormal)}× normal</b><br>${esc([x.labels.pair,x.labels.glasses==='yes'?'glasses':null,x.labels.hook,x.labels.voice+' voice',x.labels.payoffs+' payoffs'].filter(Boolean).join(' · ').replace(/_/g,' '))}</figcaption></figure>`).join('');
 return `<section class="block"><h2 class="sub-title">Winner DNA · ${esc(d.reels)} reels tested</h2>
<div class="card dna-verdict is-${verdict[0]}"><b>${esc(verdict[1])}</b><p>${esc(verdict[2])}</p></div>
${rows?`<ul class="card dna-list">${rows}</ul>`:''}
${none.length?`<p class="hint dna-none">No effect either way: ${esc(none.map(k=>DETAIL_NAME[k]||k).join(', '))}.</p>`:''}
<details class="card dna-check"><summary>Check how the app read their top reels</summary><div class="dna-spots">${spot}</div><p class="hint">If a label is wrong, tell Claude: the test is only as good as these readings.</p></details></section>`;
}
// What Instagram says about itself is not research: it gets its own tag, and a sentence no source measured is said
// the way the source says it (audit 2026-09-29; the better home for this line is secret-mechanisms.mjs).
const PLATFORM_LINE={stop_in_3_seconds:'Instagram counts who leaves in the first 3 seconds.'};
export function whyTag(id,m){
 if(/^Instagram\b/.test(m.source||''))return {line:PLATFORM_LINE[id]||m.kid||m.meaning,tag:'Instagram says',cls:'platform'};
 return {line:m.kid||m.meaning,tag:m.strength==='strong'?'Proven by research':'Backed by research',cls:m.strength};
}
export function renderSecret({account,status,imageFor,feedback=null,dna=null}){
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
 const why=(sec.why||[]).slice(0,3).map(w=>{const m=MECHANISMS[w.mechanism];if(!m)return '';const t=whyTag(w.mechanism,m);return `<li><p class="why-kid">${esc(t.line)}</p><span class="tag tag-${esc(t.cls)}">${t.tag}</span></li>`;}).join('');
 const risk=(sec.critique||[]).find(c=>c.kind==='risk');
 // What the system understood, in its own short labels with a picture: who, where, what happens.
 const labelOf=(q)=>{const h=(st.house||[]).find(x=>x.question===q);return h?name(q,h.value):null;};
 const seenRows=[['Who',[labelOf('presenter'),labelOf('look')].filter(Boolean).join(' · '),sec.person],['Where',labelOf('setting')||'',sec.setting],['What happens',[labelOf('format'),labelOf('angle')].filter(Boolean).join(' · '),sec.format]];
 const formula=seenRows.filter(([,label,part])=>label||part).map(([title,label,part])=>`<div class="seen">${part?.evidence?.[0]?`<img src="${esc(imageFor(part.evidence[0]))}" alt="" onerror="this.hidden=true">`:''}<div><span class="cmp-label">${title}</span><p>${esc(label||part?.text||'')}</p></div></div>`).join('');
 const check=feedback?`<p class="hint">${feedback==='yes'?'Thanks. The ideas will follow this.':'Noted. Tell Claude what is off and it will rebuild the Secret.'}</p>`:`<div class="check-row"><button type="button" class="btn" data-feedback="yes">Yes, that's it</button><button type="button" class="btn btn-ghost" data-feedback="no">Not quite</button></div>`;
 return `${head(sec.headline||`Why @${account} wins`,'What their best reels do more than their weakest ones.')}
<section class="block"><h2 class="sub-title">Do these</h2><div class="do-grid">${dos||'<p class="hint">No clear difference found.</p>'}</div></section>
${renderDna(dna,{imageFor})}
<section class="block two-col">${avoidCard}<article class="card"><h3 class="card-title">Every reel has</h3><div class="chips">${every}</div></article></section>
${why?`<section class="block"><h2 class="sub-title">Why it works on people</h2><ul class="why-list card">${why}</ul></section>`:''}
${risk?`<div class="card risk"><b>Before you copy</b><p>${esc(risk.point)}</p></div>`:''}
<section class="block"><h2 class="sub-title">Did we understand it right?</h2><div class="card"><div class="seen-grid">${formula}</div>${check}</div></section>
${next('kit','Make your look')}`;
}

// 4 · Kit: the brand memory. The host, the place and the sound every reel shares, drawn and checked.
const FORMAT_NAMES={ai_host:'AI host',hands_pov:'Hands only',visuals:'No person',animated:'Animated'};
// The page's copy of estimateKit (lib/kit.mjs), for the price on each format button; a test keeps the two equal.
const KIT_PRICE={picture:0.067,check:0.003,study:0.012,write:0.06};
export function kitEstimate(format,cast=1){
 const hosts=['ai_host','animated'].includes(format)?cast:0,pictures=hosts*3+2+hosts*2+(format==='hands_pov'?1:0)+1;
 const once=pictures*(KIT_PRICE.picture+KIT_PRICE.check),P=KIT_PRICE;
 return {pictures,usd:Math.round((3*P.study+P.write+once)*100)/100,ceiling:Math.round((3*P.study+P.write*2+once*2)*100)/100};
}
const usd2=v=>esc(Number(v).toFixed(2));
const KIND={object:'Prop',colour:'Colour',action:'Move',sound:'Sound',words:'Words',effect:'Edit'};
function kitPic(p,{big=false}={}){
 if(!p)return '';const flag=p.check&&!p.check.pass;
 return `<figure class="kit-pic${big?' is-big':''}${p.role.startsWith('turn')?' is-wide':''}">${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(p.label)}" loading="lazy"></a>`:'<div class="kit-gap">Not drawn</div>'}<figcaption>${esc(p.label.replace(/^[^:]+: /,'').replace(/^./,c=>c.toUpperCase()))}${flag?`<span class="tag tag-avoid" title="${esc(p.check.problems.join('; '))}">Check: ${esc(p.check.problems[0])}</span>`:''}</figcaption></figure>`;
}
// Choosing the look: 3 host options and 3 places, each checked, with Jev's pick marked and why (from its scores).
function renderChoose(k,{account,busy,pick,estimate}){
 const o=k.options,cast=pick?.cast??o.pick.cast?.index??0,place=pick?.place??o.pick.place?.index??0;
 const bar=v=>`<i class="fit"><b style="width:${Math.round(Math.max(0,Math.min(3,v||0))/3*100)}%"></b></i>`;
 const flag=p=>p&&!p.check?.pass?`<span class="tag tag-avoid">Check: ${esc(p.check?.problems?.[0]||'')}</span>`:'';
 const hosts=o.casts.map((c,i)=>`<button type="button" class="opt${i===cast?' is-on':''}" data-kit-cast="${i}" aria-pressed="${i===cast}">${o.pick.cast?.index===i?'<span class="pill pill-ok opt-pick">Jev\'s pick</span>':''}<div class="opt-faces">${c.hosts.map(h=>h.picture?`<img src="${esc(h.picture.url)}" alt="${esc(h.name)}" loading="lazy">`:'').join('')}</div><b>${esc(c.hosts.map(h=>h.name).join(' & '))}</b><span class="hint">${esc(c.hosts.map(h=>h.outfit).join(' · '))}</span><span class="opt-fit">Fit ${bar(c.score)}</span>${c.hosts.map(h=>flag(h.picture)).join('')}</button>`).join('');
 const places=o.places.map((p,i)=>`<button type="button" class="opt opt-place${i===place?' is-on':''}" data-kit-place="${i}" aria-pressed="${i===place}">${o.pick.place?.index===i?'<span class="pill pill-ok opt-pick">Jev\'s pick</span>':''}${p.picture?`<img src="${esc(p.picture.url)}" alt="" loading="lazy">`:''}<span class="hint">${esc(p.text)}</span><span class="opt-fit">Fit ${bar(p.score)}</span>${flag(p.picture)}</button>`).join('');
 return `<header class="step-head"><span class="eyebrow">Your new channel, in @${esc(account)}'s style</span><h1>${esc(k.kit.name)}</h1><p>${esc(k.kit.promise)}</p></header>
${o.casts.length?`<section class="block"><h2 class="sub-title">1 · Pick your host${k.cast>1?'s':''}</h2>${o.pick.cast?`<p class="why-pick">${esc(o.pick.cast.why)}</p>`:''}<div class="opt-grid">${hosts}</div><p class="hint">Made-up people, not the real creators. The one you pick is locked: the same face in every reel.</p></section>`:''}
<section class="block"><h2 class="sub-title">${o.casts.length?'2':'1'} · Pick the place</h2>${o.pick.place?`<p class="why-pick">${esc(o.pick.place.why)}</p>`:''}<div class="opt-grid">${places}</div></section>
<div class="card kit-actions"><button type="button" class="btn btn-primary" data-act="kit-choose"${busy?' disabled':''}>Draw my look · about $${esc((((o.casts.length?k.cast*2:1)+1)*0.07).toFixed(2))}</button><button type="button" class="btn" data-act="kit-character"${busy?' disabled':''}>Show me other options${estimate?` · about $${usd2(estimate.usd)}`:''}</button><span class="hint">Options cost $${esc(k.costUsd.toFixed(2))} so far.</span></div>`;
}
// How the new channel will look on Instagram: profile, highlights (the signature things), the grid (made reels first,
// then upcoming frames) and the hosts' voices. No invented follower counts.
export const handleOf=name=>String(name||'channel').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'').slice(0,28)||'channel';
export function renderChannelPreview(k,{reels=[],voices=[]}={}){
 const pics=Object.fromEntries((k.pictures||[]).filter(p=>p.url).map(p=>[p.role,p])),avatar=pics.face0||pics.hands||pics.place,kit=k.kit;
 const grid=[...reels.filter(r=>r.url).map(r=>`<a class="ig-cell" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="Open reel"><video src="${esc(r.url)}#t=1" muted playsinline preload="metadata"></video><span class="ig-play">▶</span></a>`),
  ...['scene','place','body0','face1','turn0','body1','face0'].map(r=>pics[r]).filter(p=>p?.url).map(p=>`<div class="ig-cell is-next"><img src="${esc(p.url)}" alt="" loading="lazy"><span class="ig-soon">Next</span></div>`)].slice(0,9).join('');
 const highlights=(kit.assets||[]).slice(0,3).map((a,i)=>`<div class="ig-hl"><i style="background:${/^#[0-9a-f]{6}$/i.test(kit.palette?.[i]?.hex||'')?kit.palette[i].hex:'#ddd'}"></i><span>${esc(String(a.what).replace(/^(a|an|the)\s+/i,'').split(/\s+/).slice(0,2).join(' '))}</span></div>`).join('');
 const hosts=kit.cast?.length?' · Our hosts are AI':'';
 const voiceRow=voices.length?`<div class="ig-voices">${voices.map(v=>`<button type="button" class="chip chip-btn" data-voice="${esc(v.url)}">▶ Hear ${esc(v.name)}</button>`).join('')}</div>`:(kit.cast?.length?'<div class="ig-voices"><button type="button" class="chip chip-btn" data-act="kit-voices">Make their voices · about $0.05</button></div>':'');
 return `<section class="block"><h2 class="sub-title">Your channel on Instagram</h2><div class="card ig">
<div class="ig-head">${avatar?`<img class="ig-avatar" src="${esc(avatar.url)}" alt="">`:'<span class="ig-avatar"></span>'}<div><b class="ig-handle">@${esc(handleOf(kit.name))}</b><div class="ig-stats"><span><b>${reels.filter(r=>r.url).length}</b> posts</span><span class="hint">new channel</span></div></div></div>
<p class="ig-bio"><b>${esc(kit.name)}</b><br>${esc(kit.promise)}${esc(hosts)}</p>${voiceRow}<div class="ig-hls">${highlights}</div><div class="ig-grid">${grid}</div></div></section>`;
}
export function renderKit({account,status,busy=false,error='',pick=null,reels=[]}){
 const err=error||status?.error?`<p class="err">${esc(error||status.error)}</p>`:'';
 if(status?.state==='working'){const pr=status.progress||{};return `${head('Building your look…',status.stage||'')}<div class="card"><progress${pr.total>1?` value="${pr.done||0}" max="${pr.total}"`:''}></progress><p class="hint">${pr.total>1?`Picture ${Math.min((pr.done||0)+1,pr.total)} of ${pr.total}. `:''}About 2 minutes. Every picture is checked before the next one.</p></div>`;}
 const k=status?.saved;
 if(!k)return `${head(`Your look, in @${account}'s style`,'The face, the place and the sound every reel will share, so people recognise you in the first second.')}${err}
<div class="card cta-card"><ul class="ticks"><li>Studies 3 of their best reels, with sound</li><li>Picks the format: AI host, hands only, no person or animated</li><li>Draws your host and your place, and checks every picture</li></ul><button type="button" class="btn btn-primary" data-act="kit-build"${busy?' disabled':''}>Build my look · about $${usd2(status?.estimate?.usd??0.7)}</button>${status?.estimate?.ceiling?`<span class="hint">Up to $${usd2(status.estimate.ceiling)} if pictures fail their check and are drawn again.</span>`:''}</div>`;
 if(k.stage==='choose')return `${err}${renderChoose(k,{account,busy,pick,estimate:status?.estimate})}`;
 const kit=k.kit,pics=Object.fromEntries(k.pictures.map(p=>[p.role,p])),flagged=k.pictures.filter(p=>!p.check.pass).length,hosts=kit.cast||[];
 // Each switch builds a new look, so it shows its price (about the same host count; 2 when it cannot be known yet).
 const castFor=f=>['ai_host','animated'].includes(k.format)?k.cast||1:2;
 const switches=Object.keys(FORMAT_NAMES).filter(f=>f!==k.format).map(f=>`<button type="button" class="chip chip-btn" data-kit-format="${f}" data-usd="${kitEstimate(f,castFor(f)).usd}"${busy?' disabled':''}>${FORMAT_NAMES[f]} · about $${usd2(kitEstimate(f,castFor(f)).usd)}</button>`).join('');
 const format=`<article class="card kit-format"><span class="cmp-label">The format${k.byJev?' · picked by Jev':' · your choice'}</span><h3>${esc(FORMAT_NAMES[k.format])}</h3><p class="plain">${esc(k.formatWhy)}</p><div class="switch-row"><span class="hint">Switch to</span>${switches}</div></article>`;
 const cast=hosts.map((h,i)=>`<article class="card kit-host"><div class="kit-host-pics">${kitPic(pics[`face${i}`],{big:true})}${kitPic(pics[`body${i}`])}</div>${kitPic(pics[`turn${i}`])}<div class="kit-host-text"><h3>${esc(h.name)}</h3><p class="plain">${esc(h.role)}</p><dl class="kit-facts"><dt>Wears</dt><dd>${esc(h.outfit)}</dd><dt>Sounds</dt><dd>${esc(h.voice)}</dd></dl></div></article>`).join('');
 const hands=pics.hands?`<article class="card kit-host"><div class="kit-host-pics">${kitPic(pics.hands,{big:true})}</div><div class="kit-host-text"><h3>The hands</h3><p class="plain">${esc(kit.hands)}</p></div></article>`:'';
 const others=(kit.places||[]).filter(Boolean);
 const place=`<div class="kit-place">${kitPic(pics.place)}${kitPic(pics.scene)}<article class="card"><dl class="kit-facts kit-facts-stack"><dt>Main place</dt><dd>${esc(kit.place)}</dd>${others.length?`<dt>Also films in</dt><dd>${others.map(esc).join('<br>')}</dd>`:''}<dt>Camera</dt><dd>${esc(kit.camera)}</dd><dt>Light</dt><dd>${esc(kit.light)}</dd></dl></article></div>`;
 const assets=(kit.assets||[]).map(a=>`<li><span class="tag">${esc(KIND[a.kind]||a.kind)}</span><div><b>${esc(a.what)}</b><p class="hint">${esc(a.how)}</p></div></li>`).join('');
 const palette=(kit.palette||[]).map(c=>`<span class="swatch"><i style="background:${/^#[0-9a-f]{6}$/i.test(c.hex)?c.hex:'#ccc'}"></i>${esc(c.name)}</span>`).join('');
 const none=v=>!v||/^none$/i.test(v);
 const sound=[['Voice',kit.sound?.voice],['Music',kit.sound?.music],['Real sounds',kit.sound?.natural]].filter(([,v])=>!none(v)).map(([t,v])=>`<dt>${t}</dt><dd>${esc(v)}</dd>`).join('');
 const redo=[hosts.length?`<button type="button" class="btn" data-act="kit-character" data-usd="${esc(status.estimate.usd)}"${busy?' disabled':''}>New ${hosts.length>1?'hosts':'host'} · about $${esc(status.estimate.usd.toFixed(2))}</button>`:'',flagged?`<button type="button" class="btn" data-act="kit-pictures"${busy?' disabled':''}>Draw the ${flagged} flagged again · about $${(flagged*0.07).toFixed(2)}</button>`:''].join('');
 const use=k.approved?`<span class="pill pill-ok">In use ✓</span>`:`<button type="button" class="btn btn-primary" data-act="kit-approve"${busy?' disabled':''}>Use this look</button>`;
 const voices=Object.entries(k.voices||{}).map(([name,v])=>({name,url:v.sample}));
 return `<header class="step-head"><span class="eyebrow">Your new channel, in @${esc(account)}'s style</span><h1>${esc(kit.name)}</h1><p>${esc(kit.promise)}</p></header>${err}
${renderChannelPreview(k,{reels,voices:voices.filter(v=>v.url)})}
<section class="block">${format}</section>
${hosts.length||hands?`<section class="block"><h2 class="sub-title">${hosts.length?`Your host${hosts.length>1?'s':''}`:'On camera'}</h2><div class="kit-cast">${cast}${hands}</div>${hosts.length?'<p class="hint">Made-up people, not the real creators. Every caption says they are AI.</p>':''}</section>`:''}
<section class="block"><h2 class="sub-title">Where it happens</h2>${place}</section>
<section class="block two-col"><article class="card"><h3 class="card-title">In every reel</h3><ul class="kit-assets">${assets}</ul><div class="palette">${palette}</div></article><article class="card"><h3 class="card-title">How it sounds</h3><dl class="kit-facts">${sound}</dl></article></section>
<div class="card kit-actions">${use}${redo}<span class="hint">This look cost $${esc(k.costUsd.toFixed(2))}.</span></div>
${k.approved?next('make','Copy their winners with this look'):''}`;
}

// 5 · Make: ideas → script and price → confirm → progress → video.
const meter=(label,v)=>`<div class="meter"><span>${label}</span><i><b style="width:${Math.round(Math.max(0,Math.min(3,v||0))/3*100)}%"></b></i></div>`;
// Up to 12 ideas, best first: 6 shown, the rest one tap away. Each says why it is true and how big the payoff is.
export function renderIdeas(plan,{busy,made=new Set(),showAll=false,limit=6,skip=null}){
 // Ideas Jev already stopped go last, marked, so the fresh ones are the first thing you see.
 const stopped=new Set((plan.blocked||[]).map(b=>b.index));
 const list=plan.picked.map((p,i)=>({p,i})).filter(x=>x.i!==skip).sort((a,b)=>stopped.has(a.i)-stopped.has(b.i)),shown=showAll?list:list.slice(0,limit),more=list.length-shown.length;
 return `<div class="idea-grid">${shown.map(({p,i},n)=>`<article class="card idea rise" style="--i:${n}">${made.has(i)?'<span class="pill pill-ok made">Made ✓</span>':stopped.has(i)?'<span class="pill pill-bad made">Jev stopped it</span>':''}<h3>${esc(p.idea.title)}</h3><p class="quote">“${esc(p.idea.hook_line)}”</p>${Number.isFinite(p.scores.novel)?meter('New to most people',p.scores.novel)+meter('A problem people feel',p.scores.pain_point):meter('Fits the winners',p.scores.fit)+(Number.isFinite(p.scores.payoff)?meter('Big payoff',p.scores.payoff):meter('Strong start',p.scores.hook))}<details class="why"><summary>Why this idea</summary>${Number.isFinite(p.scores.novel)?meter('Fits the winners',p.scores.fit)+meter('Big payoff',p.scores.payoff):''}${p.idea.why_true?`<p class="why-true"><b>Why it's true:</b> ${esc(p.idea.why_true)}</p>`:''}${meter('Easy for AI',p.scores.ai_ready)}${meter('Strong start',p.scores.hook)}<p class="hint">Jev's scores, 0 to 3.</p></details><button type="button" class="btn${stopped.has(i)||plan.chosen===i&&plan.script?'':' btn-primary'}" data-idea="${i}"${busy?' disabled':''}>${stopped.has(i)||plan.chosen===i&&plan.script?'Try it again':'Use this idea'}</button></article>`).join('')}</div>${more>0?`<div class="next-row left"><button type="button" class="btn btn-ghost" data-act="ideas-all">Show ${more} more idea${more>1?'s':''}</button></div>`:''}
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
// Ideas already made: reels from THIS plan (kit reels carry the plan's time; older hands-only reels carry none).
const ofPlan=(r,plan)=>plan?.mode==='kit'?r.planAt===plan.createdAt:!r.planAt;
const ideaOf=r=>Number.isInteger(r.idea)?r.idea:Number(String(r.id).split('-')[0]);
export const madeIdeas=(reels,plan=null)=>new Set((reels||[]).filter(r=>ofPlan(r,plan)).map(ideaOf).filter(Number.isInteger));
// A kit script: two 10-second parts, each a few timed beats (who does what, who says what).
// Talking on camera or voice-over: the decision, its reason from the channel's data, and one tap to switch.
export function renderVoiceChoice(plan,{busy=false}={}){
 const v=plan.voice;if(!v)return '';const talking=v.mode==='talking';
 return `<div class="voice-choice"><span class="pill ${talking?'pill-ok':''}">${talking?'🗣 Hosts talk on camera':'🎙 Voice-over'}</span><span class="hint">${esc(v.why||'')}</span><button type="button" class="chip chip-btn" data-voice-mode="${talking?'voiceover':'talking'}"${busy?' disabled':''}>${talking?'Use a voice-over instead':'Let the hosts talk instead'}</button></div>`;
}
export function renderKitScript(plan,{busy=false}={}){
 const s=plan.script,problems=plan.check?.problems||[];
 const checks=[['Starts mid-action',/mid-action/],['One clear action',/clear action/],['True',/may not be true/],['No health claim',/health claim/],['One feeling',/feeling/],['Easy for AI video',/risky|part \d|beat|words|keyword/i]].map(([label,re])=>{const bad=problems.some(p=>re.test(p));return `<span class="pill ${bad?'pill-bad':'pill-ok'}">${bad?'!':'✓'} ${label}</span>`;}).join('');
 return `<div class="card script"><div class="script-top"><div><span class="cmp-label">On screen first</span><h3>${esc(s.hook_title)}</h3></div>${s.keyword?`<span class="pill">Comment ${esc(s.keyword)}</span>`:''}</div>
${renderVoiceChoice(plan,{busy})}<div class="parts">${s.parts.map((p,i)=>`<section class="part"><span class="cmp-label">Part ${i+1} · ${i*10}–${i*10+10} s</span><ol class="beats">${p.beats.map(b=>`<li><span class="shot-s">${esc(i*10+b.from)}–${esc(i*10+b.to)} s</span><div><p class="shot-v"><b>${esc(b.who)}</b> ${esc(b.does)}</p>${b.says?`<p class="shot-l">“${esc(b.says)}”</p>`:''}</div></li>`).join('')}</ol></section>`).join('')}</div>
<div class="pills">${checks}</div></div>`;
}
// What the viewer hears, beat by beat: the short version of the script (every shot is under "Why this script").
const sayLines=s=>s.parts.flatMap((p,i)=>p.beats.filter(b=>b.says).map(b=>`<li><span class="shot-s">${esc(i*10+b.from)}–${esc(i*10+b.to)} s</span><p>${/voice|narrator/i.test(b.who)?'':`<b>${esc(b.who)}</b> `}“${esc(b.says)}”</p></li>`)).join('');
const jevRow=(label,v)=>Number.isFinite(v)?`<li><span>${label}</span><b>${v.toFixed(2)} of 3</b></li>`:'';
// Why this script: Jev's stored numbers, the voice decision, ideas the autopilot skipped and why, and every shot.
function scriptWhy(p,{busy}){
 const c=p.check||{},skipped=(p.blocked||[]).filter(b=>b.index!==p.chosen);
 return `<details class="why"><summary>Why this script</summary><div class="why-body">
<ul class="jev-nums">${jevRow('Gripping',c.gripping)}${jevRow('First second',c.firstSecond)}${jevRow('Matches the winners\' details',c.dnaMatch)}${c.emotion?`<li><span>Feeling</span><b>${esc(c.emotion)}</b></li>`:''}</ul>
<p class="hint">Jev checked it is true, the method is the standard one, and every line fits its beat${c.rewritten?' (it was rewritten once to pass)':''}.</p>
${renderVoiceChoice(p,{busy})}${p.result?.why?`<p class="hint">${esc(p.result.why)}</p>`:''}
${skipped.length?`<h4>Ideas Jev skipped</h4><ul class="skipped">${skipped.map(b=>`<li><b>${esc(b.title)}</b>: ${esc(b.problems.join('; '))}</li>`).join('')}</ul>`:''}
<h4>Every shot</h4><div class="parts">${p.script.parts.map((pt,i)=>`<section class="part"><span class="cmp-label">Part ${i+1} · ${i*10}–${i*10+10} s</span><ol class="beats">${pt.beats.map(b=>`<li><span class="shot-s">${esc(i*10+b.from)}–${esc(i*10+b.to)} s</span><div><p class="shot-v">${esc(b.does)}</p>${b.says?`<p class="shot-l">“${esc(b.says)}”</p>`:''}</div></li>`).join('')}</ol></section>`).join('')}</div>
</div></details>`;
}
export function renderKitHero(p,{busy=false,pricing=false}={}){
 const s=p.script,v=p.voice,secs=s.parts.length*10,price=p.price;
 const button=pricing||!Number.isFinite(price?.usd)?'<button type="button" class="btn btn-primary btn-big" disabled>Checking the price…</button>'
  :`<button type="button" class="btn btn-primary btn-big" data-act="make" data-usd="${price.usd}" data-max="${price.maxUsd}"${busy?' disabled':''}>Make the reel · $${esc(price.usd.toFixed(2))}</button>`;
 return `<div class="card hero rise"><span class="cmp-label">✦ Ready to make · Jev passed it</span><h3>${esc(s.hook_title)}</h3>
<p class="hint">${esc(p.picked[p.chosen]?.idea?.title||'')} · ${secs} s · ${v?.mode==='talking'?'Hosts talk on camera':'Voice-over'}</p>
<ol class="say">${sayLines(s)}</ol>
<div class="hero-cta">${button}<span class="hint">For the video. Up to $${esc((price?.maxUsd??0).toFixed(2))} if a part is redone. Each part is checked before the next is paid for; the checks and voices cost a little extra.</span></div>
${scriptWhy(p,{busy})}</div>`;
}
export function renderWriting(st){
 return `<div class="card writing rise"><span class="cmp-label">Writing your script</span><h3>${esc(st.stage||'Working')}</h3><div class="shimmer" aria-hidden="true"></div>
<p class="hint">Jev checks every draft for truth, the right method and timing. If an idea cannot pass, the next best idea is tried by itself. No video is paid for until you press Make.</p></div>`;
}
export function renderAllBlocked(p,{busy=false}={}){
 // Plans from before the autopilot have no list of skipped ideas: the chosen idea's own reasons stand in.
 const tried=p.blocked?.length?p.blocked.slice(-3):[{title:p.picked[p.chosen]?.idea?.title||'This idea',problems:p.check?.problems||[]}];
 return `<div class="card blocked rise"><span class="cmp-label">No script yet · nothing spent on video</span><h3>Jev did not pass ${tried.length>1?`these ${tried.length} ideas`:'this idea'}</h3>
<p class="hint">It stops scripts that could show something untrue or would not hold attention. New ideas usually fix it.</p>
<div class="hero-cta"><button type="button" class="btn btn-primary btn-big" data-act="ideas"${busy?' disabled':''}>Get new ideas · a few cents</button></div>
<details class="why"><summary>Why</summary><ul class="skipped">${tried.map(b=>`<li><b>${esc(b.title)}</b>: ${esc(b.problems.join('; '))}</li>`).join('')}</ul></details></div>`;
}
export function renderKitPrice(price,{busy}){
 return `<div class="card price"><div class="price-kit"><span class="price-n">$${esc(price.usd.toFixed(2))}</span><span class="hint">on your Gemini key, for ${price.parts*price.partSeconds} seconds of video. Up to $${esc(price.maxUsd.toFixed(2))} if a part needs its one retry. Each part is checked before the next one is paid for. The checks and voices cost a little extra.</span></div>
<div class="price-foot"><span class="hint">Made with Gemini Omni Flash from your look's pictures.</span><button type="button" class="btn btn-primary" data-act="make" data-usd="${price.usd}" data-max="${price.maxUsd}"${busy?' disabled':''}>Make the reel · $${esc(price.usd.toFixed(2))}</button></div></div>`;
}
export function renderMake({account,plan,make,balance,mode='fast',busy=false,error='',pricing=false,kit=null,fbOpen=null,showAll=false}){
 const useKit=kit?.approved,hosts=(kit?.kit?.cast||[]).map(h=>h.name);
 const top=head(`Make a reel in @${account}'s style`,useKit?`Made from your look${hosts.length?`: ${hosts.join(' and ')}`:''}. Jev picks the ideas that fit the winners and checks the script.`:'Hands and a voice, no face. Jev picks the ideas that fit the winners and checks the script.');
 const err=error||make?.error||plan?.error?`<p class="err">${esc(error||make?.error||plan?.error)}</p>`:'';
 if(make?.state==='working')return `${top}${renderProgress(make)}`;
 if(plan?.state==='working')return `${top}${renderWriting(plan)}`;
 const p0=plan?.plan,stale=useKit&&p0&&(p0.mode!=='kit'||p0.kitAt!==kit.createdAt),p=stale?null:p0;
 if(!p)return `${top}${err}<div class="card cta-card"><ul class="ticks"><li>${useKit?'Up to 12 ideas for your look':'Up to 8 ideas in the winners\' style'}</li><li>Health claims and fake tests removed</li><li>You pick one and see the exact price</li></ul><button type="button" class="btn btn-primary" data-act="ideas"${busy?' disabled':''}>Get ideas · a few cents</button></div>`;
 const made=madeIdeas(make?.reels,p),doneReel=(make?.reels||[]).find(r=>r.url&&ofPlan(r,p)&&ideaOf(r)===p.chosen);
 const finished=doneReel?`<div class="card done"><video src="${esc(doneReel.url)}#t=0.5" controls playsinline preload="metadata"></video><div><span class="pill pill-ok">Made ✓</span><h3>${esc(doneReel.title||'Your reel')}</h3>${renderReelScore(doneReel,{open:fbOpen===doneReel.id,judge:make?.judge})}<p class="hint">Pick another idea below to make a new reel.</p>${next('ready','Open Ready to post')}</div></div>`:'';
 if(p.mode==='kit'){
  // The answer first: the finished reel, a script ready to make, or why nothing passed; other ideas below.
  const hero=finished||(p.script?(p.check?.pass?renderKitHero(p,{busy,pricing}):renderAllBlocked(p,{busy})):'');
  return `${top}${err}${hero}${renderLearned(make?.reels)}<section class="block"><h2 class="sub-title">${hero?'Or pick a different idea':'Pick an idea'}</h2>${renderIdeas(p,{busy,made,showAll,limit:hero?3:6,skip:p.script&&p.check?.pass?p.chosen:null})}<div class="next-row left"><button type="button" class="btn btn-ghost" data-act="ideas"${busy?' disabled':''}>New ideas · a few cents</button></div></section>`;
 }
 const kitMode=p.mode==='kit',priced=kitMode?Number.isFinite(p.price?.usd):p.price&&p.price.kit!==undefined;
 const makeIt=finished||(pricing||!priced?'<div class="card"><b>Checking the price…</b><progress></progress></div>':p.check?.pass?(kitMode?renderKitPrice(p.price,{busy}):renderPrice(p.price,{mode,balance,busy})):`<div class="card blocked"><p class="err">Jev stopped this script before any money was spent: ${esc((p.check?.problems||[]).join('; '))}.</p><div class="next-row left">${p.picked[p.chosen+1]?`<button type="button" class="btn btn-primary" data-idea="${p.chosen+1}"${busy?' disabled':''}>Try the next idea: ${esc(p.picked[p.chosen+1].idea.title)}</button>`:''}<button type="button" class="btn" data-idea="${p.chosen}"${busy?' disabled':''}>Write this one again</button></div></div>`);
 return `${top}${err}${renderLearned(make?.reels)}<section class="block"><h2 class="sub-title">1 · Pick an idea</h2>${renderIdeas(p,{busy,made,showAll})}<div class="next-row left"><button type="button" class="btn btn-ghost" data-act="ideas"${busy?' disabled':''}>New ideas · a few cents</button></div></section>
${p.script?`<section class="block"><h2 class="sub-title">2 · Check the script</h2>${kitMode?renderKitScript(p,{busy}):renderScript(p)}</section><section class="block"><h2 class="sub-title">3 · Make it</h2>${makeIt}</section>`:''}`;
}

// The confirm pop-up before a reel is made: who and where, exactly as the video will use them (the kit's pictures).
export function renderConfirmLook(k){
 if(!k?.pictures?.length)return '';const pics=Object.fromEntries(k.pictures.map(p=>[p.role,p])),hosts=k.kit.cast||[];
 const faces=hosts.map((h,i)=>pics[`face${i}`]?`<figure><img src="${esc(pics[`face${i}`].url)}" alt=""><figcaption>${esc(h.name)}${k.voices?.[h.name]?.sample?` <button type="button" class="chip chip-btn" data-voice="${esc(k.voices[h.name].sample)}" aria-label="Hear ${esc(h.name)}">▶</button>`:''}</figcaption></figure>`:'').join('');
 const hands=pics.hands?`<figure><img src="${esc(pics.hands.url)}" alt=""><figcaption>The hands</figcaption></figure>`:'';
 return `<div class="confirm-look">${faces}${hands}${pics.place?`<figure><img src="${esc(pics.place.url)}" alt=""><figcaption>The place</figcaption></figure>`:''}</div>`;
}
// The feedback loop on a finished reel: its score against the winners, and one tap (👍 or 👎 with reasons).
const PART_NAME={stops_scroll:'the first second',visuals:'the images',sound:'the sounds',voice:'the voice',payoff:'the payoff',pace:'the pace',looks_real:'looking real'};
export const FB_REASONS={boring_start:'Boring start',weak_payoff:'Weak payoff',voice:'The voice',looks_fake:'Looks fake',too_slow:'Too slow',wrong_topic:'Wrong topic'};
export function renderReelScore(r,{open=false,judge=null}={}){
 // The judge's notes, never a score to trust: its test on this channel's own past reels says how well it picks winners.
 const jt=judge?.auc!=null?` On ${esc(judge.reels)} of this channel's past reels it picked the winner ${Math.round(judge.auc*100)}% of the time (50% is a coin flip), so only real views decide.`:'';
 const sc=r.score?`<details class="why judge-note"><summary>Judge's note: weakest part is ${esc(PART_NAME[r.score.weakest]||r.score.weakest)}</summary><p class="hint">${r.score.fix?`Fix: ${esc(r.score.fix)} `:''}An opinion, not a forecast.${jt}</p></details>`:r.scoreError?`<p class="hint">Not scored: ${esc(r.scoreError)}</p>`:'';
 if(r.mode!=='kit')return sc;
 const f=r.feedback,down=f?.verdict==='down'||open;
 const chips=down?`<div class="chips fb-reasons">${Object.entries(FB_REASONS).map(([k,v])=>`<button type="button" class="chip chip-btn${f?.reasons?.includes(k)?' is-on':''}" data-fb-reason="${k}" data-reel="${esc(r.id)}">${v}</button>`).join('')}</div>`:'';
 return `${sc}<div class="fb-row"><span class="hint">Your call:</span><button type="button" class="btn${f?.verdict==='up'?' btn-primary':''}" data-fb="up" data-reel="${esc(r.id)}" aria-pressed="${f?.verdict==='up'}">👍 Post it</button><button type="button" class="btn${f?.verdict==='down'?' btn-primary':''}" data-fb="down" data-reel="${esc(r.id)}" aria-pressed="${f?.verdict==='down'}">👎 Not this</button></div>${chips}`;
}
// What the engine learned from Kaan's taps, as counts (the same reasons the next scripts are told to fix).
export function renderLearned(reels){
 const n={};for(const r of reels||[])for(const k of r.feedback?.verdict==='down'?r.feedback.reasons:[])n[k]=(n[k]||0)+1;
 const liked=(reels||[]).filter(r=>r.feedback?.verdict==='up').length,list=Object.entries(n).sort((a,b)=>b[1]-a[1]);
 if(!list.length&&!liked)return '';
 return `<div class="card learned"><b>Learned from your feedback</b><p class="hint">${liked?`${liked} reel${liked>1?'s':''} you liked. `:''}${list.length?`The next scripts fix: ${list.map(([k,c])=>`${esc(FB_REASONS[k])} (${c}×)`).join(', ')}.`:''}</p></div>`;
}
// 6 · Ready to post
// Everything needed to post on Instagram: the cover picture, the reel and the caption, each with one button.
// Real results, from Kaan's own account after he posts: the handle, one check button, and each reel's latest numbers.
const n0=v=>Number.isFinite(v)?v.toLocaleString('en-US'):'?';
const ago=h=>h<48?`${Math.round(h)} h`:`${Math.round(h/24)} days`;
export function renderResultsCard(res,{busy=false}={}){
 if(!res)return '';
 if(!res.handle)return `<form class="card results-card rise" data-form="track"><div><b>Track real results</b><p class="hint">After you post, the app reads your public numbers (plays, likes, comments, shares) and puts them on each reel. Real views are the only score that counts.</p></div><div class="track-row"><span class="at">@</span><input name="handle" placeholder="your.account" autocomplete="off" required><button class="btn btn-primary"${busy?' disabled':''}>Track</button></div></form>`;
 const last=res.checks?.at(-1),working=res.state==='working';
 return `<div class="card results-card rise"><div><b>Real results · @${esc(res.handle)}</b><p class="hint">${working?'Reading your account…':last?`Last checked ${esc(new Date(last.at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}))}: ${esc(last.matched)} of our reels found in your last ${esc(last.posts)} posts.`:'Not checked yet. Check after you post.'}${res.error?` <span class="err">${esc(res.error)}</span>`:''}</p></div><button type="button" class="btn${last?'':' btn-primary'}" data-act="results-check"${busy||working?' disabled':''}>${working?'Checking…':'Check now · about 3 cents'}</button></div>`;
}
export function renderReelResult(t){
 const s=t?.snapshots?.at(-1);if(!s)return '';
 return `<div class="reel-result"><span>▶ <b>${n0(s.plays)}</b> plays</span><span>♥ ${n0(s.likes)}</span><span>💬 ${n0(s.comments)}</span>${Number.isFinite(s.shares)?`<span>↗ ${n0(s.shares)}</span>`:''}<span class="hint">${Number.isFinite(s.ageHours)?`${ago(s.ageHours)} after posting`:''} · <a href="${esc(t.url)}" target="_blank" rel="noopener">open</a></span></div>`;
}
// Only finished reels are ready: one still being made (or failed) has no video, and its Download link fetched this page
// (audit 2026-09-29).
export const readyReels=reels=>(reels||[]).filter(r=>r.url);
export function renderReady({reels=[],fbOpen=null,judge=null,results=null,busy=false}){
 reels=readyReels(reels);
 if(!reels.length)return `${head('Nothing ready yet','Your finished reels will live here, ready for their first audience.')}${next('make','Make a reel')}`;
 return `${head('Ready for your audience','Your reels, covers and captions. All in one place.')}<div class="ready-grid">${reels.map(r=>`<article class="card ready"><div class="ready-media"><video src="${esc(r.url)}#t=0.5"${r.cover?` poster="${esc(r.cover)}"`:''} controls playsinline preload="metadata"></video></div><div class="ready-body"><h3>${esc(r.title||'Your reel')}</h3>${r.review?.postable===false||r.heard&&!r.heard.all?'<p class="ready-warn">Not ready: review the issues in Details.</p>':''}<button type="button" class="caption-toggle" data-caption="cap-${esc(r.id)}" aria-expanded="false" aria-label="Expand caption"><span class="caption" id="cap-${esc(r.id)}">${esc(r.caption||'No caption yet.')}</span><span class="caption-more">Read caption</span></button><div class="ready-actions"><button type="button" class="btn" data-download="${esc(r.id)}">Download reel and cover</button><button type="button" class="btn" data-copy="cap-${esc(r.id)}">Copy caption</button></div><details class="ready-details"><summary>Details</summary><a class="btn" href="${esc(r.url)}" download>Download video only</a>${r.cover?`<a class="cover-link" href="${esc(r.cover)}" download><img src="${esc(r.cover)}" alt="Download cover"></a>`:`<button class="btn" data-act="make-cover" data-reel="${esc(r.id)}">Make the cover · free</button>`}${renderReelResult(results?.reels?.[r.id])}${r.check&&r.check.level!=='good'?`<p class="hint">Second opinion: ${esc(r.check.problems?.[0]||r.check.weaknesses?.[0]||'Review before posting.')}</p>`:''}${r.rank?.sentence?`<p class="hint">${esc(r.rank.sentence)}</p>`:''}${r.review?.postable===false?`<p class="err">${esc(r.review.why)}</p>`:''}${r.heard&&!r.heard.all?`<p class="err">Missing speech: ${esc((r.heard.missing||[]).join('; '))}</p>`:''}<p class="hint">${Math.round(r.seconds||0)} s · ${Number.isFinite(r.spentUsd)?`video $${r.spentUsd.toFixed(2)}, checks extra`:`${esc(r.spent??'–')} credits`}</p>${renderReelScore(r,{open:fbOpen===r.id,judge})}</details></div></article>`).join('')}</div><details class="ready-details"><summary>Posting tips and real results</summary><p class="hint">On Instagram, choose the cover and turn on “Label as made with AI” for realistic AI video.</p>${renderResultsCard(results,{busy})}</details>${next('make','Make another reel')}`;
}

// Page helpers (they take DOM nodes or media elements, so tests can hand them stand-ins).
// Swaps only what changed between the page and the new HTML (parsed into `next`): an unchanged element is kept as it is,
// so a playing video goes on playing, focus stays and entrance animations do not replay when one copy tile changes
// (audit 2026-09-29). Tiles and originals are matched by their key, never one into another.
const keyOf=n=>n.nodeType===1?n.getAttribute('data-tile')??n.getAttribute('data-orig')??n.getAttribute('data-copy-pick')??n.getAttribute('id'):null;
export function morph(a,b){
 if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName||keyOf(a)!==keyOf(b)){a.replaceWith(b);return;}
 if(a.nodeType!==1){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;return;}
 if(a.isEqualNode(b))return;
 for(const {name} of [...a.attributes])if(!b.hasAttribute(name))a.removeAttribute(name);
 for(const {name,value} of [...b.attributes])if(a.getAttribute(name)!==value)a.setAttribute(name,value);
 if(a.nodeName==='INPUT')a.checked=b.hasAttribute('checked');
 morphChildren(a,b);
}
export function morphChildren(a,b){
 const old=[...a.childNodes],next=[...b.childNodes];
 next.forEach((n,i)=>old[i]?morph(old[i],n):a.appendChild(n));
 for(const n of old.slice(next.length))n.remove();
}
// "Play both together": the copy and its original from the start, the copy's sound only. Pausing or ending either stops
// both, gives the original its sound back and unlinks them; they stayed muted and linked before (audit 2026-09-29).
export function syncPlay(orig,copy){
 const was=[orig.muted,copy.muted];
 const unlink=()=>{orig.onpause=copy.onpause=orig.onended=copy.onended=null;orig.pause();copy.pause();[orig.muted,copy.muted]=was;};
 for(const v of [orig,copy]){v.pause();v.currentTime=0;}orig.muted=true;copy.muted=false;
 orig.onpause=copy.onpause=orig.onended=copy.onended=unlink;
 return {unlink,started:Promise.all([orig.play(),copy.play()])};
}
// What a screen reader hears about the copy studio: only a new stage or a quarter more done, never every second's ETA
// (the whole page was a live region, audit 2026-09-29).
export function copyAnnouncement(copy){
 if(copy?.picking?.state==='working'&&!copy.batch)return 'Picking the winners to copy.';
 const b=copy?.batch;if(!b)return '';
 const n=b.items.length,done=b.items.filter(i=>i.state==='done').length,failed=b.items.filter(i=>['failed','stopped'].includes(i.state)).length;
 if(b.items.some(i=>['working','waiting'].includes(i.state)))return `Making ${n} copies: ${done} made, about ${Math.floor((b.pct||0)/25)*25}% done.`;
 return `${done} of ${n} copies made.${failed?` ${failed} stopped.`:''}`;
}

// The renderers emit button markup with escaped text (no nested buttons). Move the chosen
// button unchanged, including all data hooks, into the shared bar before keyed DOM morphing.
const selectors={
 scan:[['step','winners'],['act','scan-resume'],['act','reload'],['act','new-analysis']],
 winners:[['step','kit']],
 secret:[['step','kit'],['act','secret-build']],
 kit:[['step','make'],['act','kit-approve'],['act','kit-choose'],['act','kit-build']],
 make:[['act','copy-start'],['step','ready'],['act','copy-pick'],['act','make'],['act','ideas'],['act','copy-new']],
 ready:[['step','make']],
};
const labels={scan:'01 · Scan',winners:'02 · Winners',secret:'02 · Why they win',kit:'03 · Your look',make:'04 · Copy',ready:'05 · Ready to post'};
const waiting={scan:'Collecting reels…',winners:'Listening to the winners…',kit:'Building your look…',make:'Making your copies…',ready:'Make a reel',secret:'Finding the pattern…'};
const disable=button=>/^<button[^>]*\sdisabled(?:\s|>)/.test(button)?button:button.replace('<button','<button disabled');
export function dockActions(html,{step,open,busy=false}){
 const buttons=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m=>m[0]);
 let primary;for(const [kind,value] of selectors[step]){primary=buttons.find(b=>b.includes(`data-${kind}="${value}"`));if(primary)break;}
 if(primary){html=html.replace(primary,'');if(!/class="[^"]*btn-primary/.test(primary))primary=primary.replace(/class="/, 'class="btn-primary ');}
 else primary=`<button type="button" class="btn btn-primary" disabled>${step==='scan'&&html.includes('Not enough reels')?'No winners yet':waiting[step]}</button>`;
 const target=primary.match(/data-step="([^"]+)"/)?.[1];
 if(busy||target&&open[target]===false)primary=disable(primary);
 if(step==='kit'&&target==='make')primary=primary.replace(/>[^<]*<\/button>$/, '>Copy these →</button>');
 if(target==='ready')primary=primary.replace(/>[^<]*<\/button>$/, '>Ready to post →</button>');
 const secondary=step==='winners'?buttons.find(b=>b.includes('data-step="secret"'))||'':'';
 if(secondary)html=html.replace(secondary,'');
 html=html.replace(/class="([^"]*)"/g,(_,classes)=>`class="${classes.split(/\s+/).filter(c=>c!=='btn-primary').join(' ')}"`);
 return {html,bar:`<div class="action-inner"><span class="action-label">${labels[step]}</span><div class="action-buttons">${secondary}${primary}</div></div>`};
}

// One local ZIP avoids the browser dropping the second of two automatic downloads.
// Stored entries need no compression dependency; media is already compressed.
export function reelDownloadBundle(files){
 const encoder=new TextEncoder(),table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 const local=[],central=[];let offset=0;
 const header=(length,signature)=>{const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);view.setUint32(0,signature,true);return {bytes,view};};
 for(const file of files){
  const name=encoder.encode(file.name),data=file.bytes;let crc=0xffffffff;for(const byte of data)crc=(crc>>>8)^table[(crc^byte)&255];crc=(crc^0xffffffff)>>>0;
  if(data.length>0xffffffff||offset+30+name.length+data.length>0xffffffff)throw new Error('This reel is too large to bundle. Download it from Details.');
  const l=header(30,0x04034b50);l.view.setUint16(4,20,true);l.view.setUint16(6,0x800,true);l.view.setUint32(14,crc,true);l.view.setUint32(18,data.length,true);l.view.setUint32(22,data.length,true);l.view.setUint16(26,name.length,true);local.push(l.bytes,name,data);
  const c=header(46,0x02014b50);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint32(16,crc,true);c.view.setUint32(20,data.length,true);c.view.setUint32(24,data.length,true);c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);central.push(c.bytes,name);offset+=30+name.length+data.length;
 }
 const end=header(22,0x06054b50);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,central.reduce((n,b)=>n+b.length,0),true);end.view.setUint32(16,offset,true);
 return new Blob([...local,...central,end.bytes],{type:'application/zip'});
}

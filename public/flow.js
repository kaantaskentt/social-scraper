// Social Scraper, the five-step app: state, data loading and clicks. Rendering lives in flow-views.mjs.
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderKit,renderMake,renderReady,renderConfirmLook,esc,scanState,syncRuns,topWinners,readyReels,morphChildren,syncPlay,copyAnnouncement} from './flow-views.mjs';
import {parseHandles} from './handles.mjs';
import {mountScanMap,reach} from './scan-map.mjs';
import {renderCopyStudio,copyLive,copyShape} from './copy-view.mjs';

const $=s=>document.querySelector(s);
const S={pricing:false,runs:[],runId:null,job:null,results:null,saved:new Set(),secret:null,kit:null,plan:null,make:null,balance:null,step:'scan',mode:'fast',busy:false,error:'',feedback:null,timer:null};
let token='';
const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}},del:k=>{try{localStorage.removeItem(k);}catch{}}};
async function api(path,data){
 const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});
 const text=await r.text();let v;try{v=JSON.parse(text);}catch{throw new Error(r.ok?'The app sent an unreadable answer. Refresh the page.':`Request failed (${r.status})`);}
 if(!r.ok)throw new Error(v.error||'Request failed');return v;
}
// One small polite status for screen readers, said only when its text changes (the whole page was a live region).
function announce(text){const el=$('#live');if(el&&text&&el.textContent!==text)el.textContent=text;}
function toast(text){const t=$('#toast');t.textContent=text;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true;},4000);}

// What is done for this account, and so which steps can be opened.
const scanned=()=>['complete','partial'].includes(S.job?.status);
const scanning=()=>['running','scraping'].includes(S.job?.status);
const scored=()=>Object.values(S.results||{}).some(r=>r.quadrant&&r.quadrant!=='insufficient');
const flags=()=>({scanned:scanned(),scored:scored(),secret:S.secret?.state==='done',reels:readyReels(S.make?.reels).length});
const doneSteps=()=>{const f=flags();return {scan:f.scanned,winners:f.scanned&&f.scored,secret:f.secret,kit:Boolean(S.kit?.saved?.approved),make:f.reels>0,ready:false};};
const post=id=>S.job?.posts.find(p=>p.id===id);
const imageFor=id=>`/media/${encodeURIComponent(S.runId)}/${encodeURIComponent(id)}`;
const videoFor=id=>S.saved.has(id)?`/videos/${encodeURIComponent(S.runId)}/${encodeURIComponent(id)}`:post(id)?.videoUrl||'';
const hasVideo=p=>S.saved.has(p.id)||Boolean(p.videoUrl);

const scanProgress=()=>scanState(S.job);
function winners(){
 if(!S.job||!S.results)return {winners:[],weakest:[]};
 const w=topWinners(S.job.posts,S.results,{hasVideo,limit:6}).map(x=>({...x,image:imageFor(x.id)}));
 const weak=S.job.posts.map(p=>({p,r:S.results[p.id]})).filter(({p,r})=>r&&r.quadrant!=='insufficient'&&Number.isFinite(r.xNormal)&&hasVideo(p)).sort((a,b)=>a.r.xNormal-b.r.xNormal).slice(0,4).map(({p,r})=>({id:p.id,xNormal:r.xNormal,reach:r.reach,image:imageFor(p.id)}));
 return {winners:w,weakest:weak};
}

function render(){
 // A channel still loading shows a quiet placeholder, never the empty "Pick an account" page for a moment.
 if(S.runId&&!S.job){$('#view').innerHTML='<div class="card writing rise"><span class="cmp-label">Opening your channel</span><div class="shimmer" aria-hidden="true"></div></div>';S.lastHtml=null;return;}
 const open=reachable(flags());if(!open[S.step])S.step='scan';
 $('#stepper').innerHTML=renderStepper(S.step,open,doneSteps());
 $('#acct-now').textContent=S.job?`@${S.job.creator}`:'';
 const account=S.job?.creator||'';let html='';
 if(S.step==='scan')html=renderScan({runs:S.runs,run:S.job?{id:S.runId,creator:S.job.creator,count:S.job.posts.length}:null,progress:scanProgress(),error:S.error,scored:scored(),scoreError:S.moneyError});
 if(S.step==='winners')html=renderWinners({account,...winners()});
 if(S.step==='secret')html=renderSecret({account,status:S.secret,imageFor,feedback:S.feedback,dna:S.dna});
 if(S.step==='kit')html=renderKit({account,status:S.kit,busy:S.busy,error:S.error,pick:S.kitPick,reels:(S.make?.reels||[]).filter(r=>r.mode==='kit'&&r.kitAt===S.kit?.saved?.createdAt)});
 // Make: the copy studio first (copy their proven winners, Kaan 2026-09-29); new ideas one tap away.
 if(S.step==='make'&&S.makeView!=='ideas'&&S.kit?.saved?.approved){
  const shape=`copy:${S.runId}:${copyShape(S.copy)}:${S.copyCompare}:${[...(S.copyUnpicked||[])].join()}:${S.busy}:${S.error}`;
  announce(copyAnnouncement(S.copy));
  // Only the numbers move while copies are made, so a playing video is never reset by the once-a-second refresh.
  if(shape===S.viewKey&&$('#view .copy-grid')){patchCopy(copyLive(S.copy));return;}
  // The intro card already says what copying is, so the header says it only once the intro is gone (audit 2026-09-29).
  const intro=!S.copy?.batch&&(!S.copy?.picks||S.copy?.picking?.state==='working');
  const page=`<header class="step-head"><h1>Copy @${esc(account)}'s winners</h1><p>${intro?'':'Same shots, words and sounds as their proven reels, with your hosts. '}<button type="button" class="link-btn" data-act="make-ideas">Or make a new idea instead</button></p></header><p class="err"${S.error?'':' hidden'}>${esc(S.error)}</p>${renderCopyStudio({copy:S.copy,kit:S.kit?.saved,busy:S.busy,unpicked:S.copyUnpicked||new Set(),compareOpen:S.copyCompare})}`;
  // A new shape on the same page (a tile done, a pick ticked, picking moving on) swaps only the parts that changed, so a
  // playing video is not reset and nothing re-animates (audit 2026-09-29); a page from another step is replaced.
  if(S.viewKey?.startsWith(`copy:${S.runId}:`)){const t=document.createElement('template');t.innerHTML=page;morphChildren($('#view'),t.content);}else $('#view').innerHTML=page;
  S.viewKey=shape;S.lastHtml=null;return;
 }
 if(S.step==='make')html=`${S.kit?.saved?.approved?'<p class="hint back-row"><button type="button" class="link-btn" data-act="make-copy">← Back to copying their winners</button></p>':''}${renderMake({account,plan:S.plan,make:S.make,balance:S.balance,mode:S.mode,busy:S.busy,error:S.error,pricing:S.pricing,kit:S.kit?.saved,fbOpen:S.fbOpen,showAll:S.showAllIdeas})}`;
 if(S.step==='ready')html=renderReady({reels:readyReels(S.make?.reels),fbOpen:S.fbOpen,judge:S.make?.judge,results:S.results2,busy:S.busy});
 // The scan map keeps its tiles between refreshes (so they fly from the wall to the map); the rest redraws.
 const key=S.step==='scan'?`scan:${S.runId}:${scanProgress()?.state}:${S.error}:${S.runs.map(r=>`${r.id}.${r.count}.${r.status}`).join()}`:null;
 // Other steps redraw only when the page really changed: open "Why" panels stay open and nothing re-animates.
 if(!(key&&key===S.viewKey&&$('#view .scan-stage'))&&(key||html!==S.lastHtml))$('#view').innerHTML=html;S.viewKey=key;S.lastHtml=key?null:html;
 if(S.step==='scan'&&S.job){if(!S.scanSel)S.scanSel=[...S.job.posts].filter(p=>reach(p)).sort((a,b)=>reach(b)-reach(a))[0]?.id||null;
  mountScanMap($('#view'),{posts:S.job.posts,imageFor,videoFor,selected:S.scanSel,onSelect:id=>{S.scanSel=id;render();}});}
}
addEventListener('resize',()=>{if(S.step==='scan')render();});
// The live numbers of the copy studio, written into the page in place.
function patchCopy(live){
 if(!live)return;const set=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};
 for(const i of live.items){const t=$(`#view [data-tile="${CSS.escape(i.postId)}"]`);if(!t)continue;t.style.setProperty('--p',i.pct);set(t.querySelector('[data-live="pct"]'),`${i.pct}%`);set(t.querySelector('[data-live="stage"]'),i.stage);set(t.querySelector('[data-live="eta"]'),i.eta);}
 const bar=$('#view [data-live="batch-bar"]');if(bar)bar.style.width=`${live.pct}%`;set($('#view [data-live="batch-eta"]'),live.eta);
}

// Loads everything for one account; later refreshes only fetch what is still running.
async function loadRun(id,{keepStep=false}={}){
 // Choices made on one account never carry over to another (a host picked on A was drawn for B, audit 2026-09-29).
 const switching=S.runId!==id;S.runId=id;store.set('flow.run',id);S.error='';S.scanSel=null;
 if(switching){S.job=null;S.sync?.unlink();Object.assign(S,{kitPick:null,makeView:null,copyCompare:false,showAllIdeas:false,fbOpen:null,sync:null});render();}
 const base=`/api/runs/${encodeURIComponent(id)}`;
 let loaded;try{loaded=await Promise.all([api(base),api(`${base}/videos`).catch(()=>({saved:[]})),api(`${base}/secret`).catch(e=>({state:'none',error:e.message})),api(`${base}/kit`).catch(e=>({state:'none',error:e.message})),api(`${base}/reel-plan`).catch(()=>({state:'none'})),api(`${base}/reel-make`).catch(()=>({state:'none',reels:[]})),api(`${base}/money`).catch(e=>({results:{},error:e.message})),api(`${base}/dna`).catch(e=>({state:'none',error:e.message})),api(`${base}/results`).catch(()=>null),api(`${base}/copy`).catch(()=>null)]);}
 // A channel that cannot load goes back to the account list with the reason, never a spinner forever.
 // It is not remembered either, so a reload does not open it again (audit 2026-09-29).
 catch(e){if(S.runId===id){S.runId=null;S.step='scan';S.error=e.message;store.del('flow.run');render();}throw e;}
 const [job,videos,secret,kit,plan,make,money,dna,results2,copy]=loaded;

 if(S.runId!==id)return;
 Object.assign(S,{job,dna,results2,copy,copyUnpicked:new Set(),saved:new Set(videos.saved||[]),secret,kit,plan,make,results:money.results||{},moneyError:money.error||'',feedback:secret?.saved?.feedback||null,runs:syncRuns(S.runs,job)});
 if(!keepStep){const d=doneSteps(),remembered=store.get(`flow.step.${id}`);S.step=remembered&&reachable(flags())[remembered]?remembered:d.kit?'make':d.secret?'kit':d.winners?'winners':'scan';}
 render();poll();if(S.step==='make')prepareMake();
}
function poll(){
 clearTimeout(S.timer);
 const copying=S.copy?.picking?.state==='working'||S.copy?.batch?.items.some(i=>['working','waiting'].includes(i.state));
 const live=copying||scanning()||S.secret?.state==='building'||S.kit?.state==='working'||S.dna?.state==='working'||S.plan?.state==='working'||S.make?.state==='working';
 // The copy studio refreshes every second: its rings and bar show real progress.
 if(live)S.timer=setTimeout(refresh,copying?1000:3000);
}
async function refresh(){
 const id=S.runId,base=`/api/runs/${encodeURIComponent(id)}`;
 try{
  if(scanning()){S.job=await api(base);S.runs=syncRuns(S.runs,S.job);if(scanned()){await loadRun(id,{keepStep:true});return;}}
  if(S.secret?.state==='building')S.secret=await api(`${base}/secret`);
  if(S.kit?.state==='working')S.kit=await api(`${base}/kit`);
  if(S.dna?.state==='working')S.dna=await api(`${base}/dna`);
  // When the script is ready the answer is at the top of the page: bring it into view.
  if(S.plan?.state==='working'){S.plan=await api(`${base}/reel-plan`);if(S.plan.state!=='working')scrollTo({top:0,behavior:'smooth'});}
  if(S.make?.state==='working'){S.make=await api(`${base}/reel-make`);if(S.make.state!=='working')S.balance=null;}
  if(S.copy?.picking?.state==='working'||S.copy?.batch?.items.some(i=>['working','waiting'].includes(i.state))){const was=S.copy;S.copy=await api(`${base}/copy`);if(was?.picking?.state==='working'&&S.copy.picking?.state==='done')S.copyUnpicked=new Set();if(S.copy.batch&&!S.copy.batch.items.some(i=>['working','waiting'].includes(i.state)))S.make=await api(`${base}/reel-make`);}
 }catch(e){S.error=e.message;}
 if(S.runId===id){render();poll();}
}
async function act(fn){if(S.busy)return;S.busy=true;S.error='';render();try{await fn();}catch(e){S.error=e.message;toast(e.message);}finally{S.busy=false;render();poll();}}
// The Make step needs a current price and the balance; both are free to check.
async function prepareMake(){
 // With a look in use, reels are made on the Gemini key: no Higgsfield balance, and an old hands-only plan is not re-priced.
 const p=S.plan?.plan;if(p?.mode==='kit'||S.kit?.saved?.approved){if(p?.mode==='kit'&&p.script&&!Number.isFinite(p.price?.usd)&&!S.pricing)await reprice();return;}
 if(S.balance===null)loadBalance();
 if(!p?.script||(p.price&&p.price.kit!==undefined)||S.pricing)return;await reprice();
}
async function reprice(){
 S.pricing=true;render();try{S.plan=await api(`/api/runs/${encodeURIComponent(S.runId)}/reel-plan/price`,{confirm:true});}catch(e){S.error=e.message;}finally{S.pricing=false;render();}
}
async function loadBalance(){try{S.balance=(await api('/api/higgsfield/balance')).credits;}catch(e){S.balance=null;S.error=e.message;}render();}

document.addEventListener('click',async e=>{
 const t=e.target.closest('[data-copy-pick],[data-step],[data-run],[data-play],[data-act],[data-idea],[data-mode],[data-feedback],[data-copy],[data-close],[data-kit-format],[data-kit-cast],[data-kit-place],[data-voice],[data-fb],[data-fb-reason],[data-voice-mode]');if(!t||t.disabled)return;
 const base=`/api/runs/${encodeURIComponent(S.runId)}`;
 // An error belongs to the step it happened on (audit 2026-09-29).
 if(t.dataset.step){S.error='';S.step=t.dataset.step;store.set(`flow.step.${S.runId}`,S.step);render();scrollTo({top:0,behavior:'smooth'});if(S.step==='make')prepareMake();return;}
 if(t.dataset.run){loadRun(t.dataset.run).catch(err=>toast(err.message));return;}
 if(t.dataset.close!==undefined){t.closest('dialog').close();return;}
 if(t.dataset.play){const src=videoFor(t.dataset.play);if(!src){toast('No video saved for this reel.');return;}const v=$('#player video');v.src=src;$('#player').showModal();v.play().catch(()=>{});return;}
 if(t.dataset.copy){const text=document.getElementById(t.dataset.copy)?.textContent||'';try{await navigator.clipboard.writeText(text);toast('Caption copied');}catch{toast('Could not copy. Select the caption and copy it.');}return;}
 if(t.dataset.mode){S.mode=t.dataset.mode;render();return;}
 if(t.dataset.feedback){act(async()=>{await api(`${base}/secret-feedback`,{answer:t.dataset.feedback});S.feedback=t.dataset.feedback;});return;}
 if(t.dataset.idea!==undefined){scrollTo({top:0,behavior:'smooth'});act(async()=>{S.plan=await api(`${base}/reel-plan/script`,{confirm:true,index:Number(t.dataset.idea)});});return;}
 // The kit: build, new host, redraw flagged pictures, switch format (each shows its price on the button), use it.
 const kitGo=body=>act(async()=>{await api(`${base}/kit`,{confirm:true,...body});S.kit=await api(`${base}/kit`);});
 // A new look replaces the one in use: ask first, with the price (one tap did it silently, audit 2026-09-29).
 const replaceLook=(what,body)=>{if(!S.kit?.saved?.approved){kitGo(body);return;}
  ask('Replace the look in use?',`${what} draws a new look for about $${Number(t.dataset.usd).toFixed(2)} on your Gemini key. The look in use is put aside: copying and new reels wait until you pick and use the new one.`,()=>kitGo(body),{ok:'Replace it'});};
 if(t.dataset.kitFormat){replaceLook(`Switching to ${t.textContent.split(' · ')[0]}`,{redo:'format',format:t.dataset.kitFormat});return;}
 // Picking an option only marks it (no cost); "Draw my look" draws the chosen host and place.
 if(t.dataset.kitCast!==undefined||t.dataset.kitPlace!==undefined){const o=S.kit?.saved?.options;S.kitPick={cast:S.kitPick?.cast??o?.pick?.cast?.index??0,place:S.kitPick?.place??o?.pick?.place?.index??0,...(t.dataset.kitCast!==undefined?{cast:Number(t.dataset.kitCast)}:{place:Number(t.dataset.kitPlace)})};render();return;}
 // The feedback loop: 👍 saves at once; 👎 opens the reasons, and each tapped reason is saved.
 if(t.dataset.fb||t.dataset.fbReason){const id=t.dataset.reel,r=(S.make?.reels||[]).find(x=>x.id===id);if(!r)return;
  let verdict=t.dataset.fb||'down',reasons=r.feedback?.verdict==='down'?[...r.feedback.reasons]:[];
  if(t.dataset.fbReason){const k=t.dataset.fbReason;reasons=reasons.includes(k)?reasons.filter(x=>x!==k):[...reasons,k];}
  if(verdict==='up')reasons=[];S.fbOpen=verdict==='down'?id:null;
  act(async()=>{const saved=await api(`${base}/reel-feedback`,{reelId:id,verdict,reasons});S.make.reels=S.make.reels.map(x=>x.id===id?saved:x);});return;}
 if(t.dataset.voice){const a=(S.audio??=new Audio());a.src=t.dataset.voice;a.play().catch(()=>toast('Could not play the voice.'));return;}
 if(t.dataset.act==='kit-voices'){act(async()=>{await api(`${base}/kit/voices`,{confirm:true});S.kit=await api(`${base}/kit`);});return;}
 if(t.dataset.act==='kit-choose'){act(async()=>{await api(`${base}/kit/choose`,{confirm:true,...(S.kitPick||{})});S.kitPick=null;S.kit=await api(`${base}/kit`);});return;}
 if(t.dataset.voiceMode){act(async()=>{S.plan=await api(`${base}/reel-plan/voice`,{confirm:true,mode:t.dataset.voiceMode});});return;}
 if(t.dataset.act==='make-cover'){const id=t.dataset.reel;act(async()=>{const saved=await api(`${base}/reel-cover`,{reelId:id});S.make.reels=S.make.reels.map(x=>x.id===id?saved:x);});return;}
 if(t.dataset.act==='dna-build'){act(async()=>{S.dna=await api(`${base}/dna`,{confirm:true});});return;}
 if(t.dataset.act==='results-check'){act(async()=>{S.results2={...S.results2,state:'working'};render();try{S.results2={...(await api(`${base}/results/check`,{confirm:true})),state:'done'};}catch(e){S.results2={...S.results2,state:'failed',error:e.message};throw e;}});return;}
 // The copy studio.
 if(t.dataset.act==='make-ideas'||t.dataset.act==='make-copy'){S.makeView=t.dataset.act==='make-ideas'?'ideas':'copy';S.viewKey=null;S.error='';render();if(S.makeView==='ideas')prepareMake();scrollTo({top:0,behavior:'smooth'});return;}
 if(t.dataset.copyPick){const u=S.copyUnpicked||(S.copyUnpicked=new Set());u.has(t.dataset.copyPick)?u.delete(t.dataset.copyPick):u.add(t.dataset.copyPick);render();return;}
 if(t.dataset.act==='copy-pick'){act(async()=>{S.copy=await api(`${base}/copy/pick`,{confirm:true});S.copyUnpicked=new Set();S.copyCompare=false;});return;}
 if(t.dataset.act==='copy-compare'){S.copyCompare=!S.copyCompare;render();if(S.copyCompare)setTimeout(()=>$('#view .cmp-grid')?.scrollIntoView({behavior:'smooth',block:'start'}),50);return;}
 if(t.dataset.act==='copy-new'){act(async()=>{S.copy=await api(`${base}/copy/pick`,{confirm:true});S.copyUnpicked=new Set();S.copyCompare=false;});return;}
 if(t.dataset.act==='copy-sync'){const id=t.dataset.post,a=$(`#view [data-orig="${CSS.escape(id)}"]`),b=$(`#view [data-tile="${CSS.escape(id)}"] video`);if(!a||!b)return;
  // Both in view when they fit; on a small screen the copy, whose sound plays, is the one brought into view.
  const r=[a,b].map(v=>v.getBoundingClientRect()),top=Math.min(...r.map(x=>x.top)),bottom=Math.max(...r.map(x=>x.bottom));
  if(bottom-top<=innerHeight-24)scrollBy({top:(top+bottom)/2-innerHeight/2,behavior:'smooth'});else b.scrollIntoView({block:'center',behavior:'smooth'});
  S.sync?.unlink();S.sync=syncPlay(a,b);const pair=S.sync;pair.started.catch(()=>{pair.unlink();toast('Press play on each video once, then try again.');});return;}
 if(t.dataset.act==='copy-retry'){const usd=Number(t.dataset.usd),ids=[t.dataset.post];
  ask('Try this copy again?',usd?`Parts already made are kept. The parts still to film cost about $${usd.toFixed(2)} (up to twice that with a retry).`:'Every part is already made: this only edits and compares it (a few cents).',()=>act(async()=>{S.copy=await api(`${base}/copy/retry`,{ids,confirmUsd:usd});}));return;}
 if(t.dataset.act==='copy-start'){const usd=Number(t.dataset.usd),ids=t.dataset.ids.split(',').filter(Boolean);
  ask(ids.length>1?`Make these ${ids.length} copies?`:'Make this copy?',`This makes ${ids.length} cop${ids.length>1?'ies':'y'} at once for about $${usd.toFixed(2)} on your Gemini key (up to twice that if parts need their one retry). Copies are word for word from their originals: internal tests, check claims before posting.`,
   ()=>act(async()=>{S.copy=await api(`${base}/copy/start`,{ids,confirmUsd:usd});S.copyCompare=false;}),{look:renderConfirmLook(S.kit?.saved)});return;}
 if(t.dataset.act==='scan-resume'){act(async()=>{await api(`${base}/run`,{});S.job=await api(base);S.runs=syncRuns(S.runs,S.job);});return;}
 if(t.dataset.act==='ideas-all'){S.showAllIdeas=true;render();return;}
 const a=t.dataset.act;
 if(a==='kit-build')kitGo({});if(a==='kit-character')replaceLook('New hosts',{redo:'character'});if(a==='kit-pictures')kitGo({redo:'pictures'});
 if(a==='kit-approve')act(async()=>{await api(`${base}/kit/approve`,{confirm:true});S.kit=await api(`${base}/kit`);});
 if(a==='secret-build')act(async()=>{S.secret={...(await api(`${base}/secret`,{confirm:true})),plan:S.secret?.plan};});
 if(a==='ideas'){scrollTo({top:0,behavior:'smooth'});S.showAllIdeas=false;}
 if(a==='ideas')act(async()=>{S.plan=await api(`${base}/reel-plan/ideas`,{confirm:true});});
 if(a==='make'){
  const usd=t.dataset.usd!==undefined,credits=Number(usd?t.dataset.usd:t.dataset.credits),max=Number(t.dataset.max);
  ask('Make this reel?',usd?`The video costs about $${credits.toFixed(2)} on your Gemini key (up to $${max.toFixed(2)} if a part needs its one retry), plus a little for the checks and voices. Each part is checked before the next one is paid for.`:`This spends ${credits} Higgsfield credits (up to ${max} if shots need their one retry). You have ${S.balance??'?'} credits. Each shot is checked before the next one is paid for.`,
   ()=>act(async()=>{S.make={...(await api(`${base}/reel-make`,{confirm:true,mode:S.mode,confirmCredits:credits})),reels:S.make?.reels||[]};}),{look:usd?renderConfirmLook(S.kit?.saved):''});
 }
});
document.addEventListener('submit',e=>{
 if(e.target.dataset.form==='track'){e.preventDefault();const handle=new FormData(e.target).get('handle');act(async()=>{S.results2=await api(`/api/runs/${encodeURIComponent(S.runId)}/results/handle`,{handle});toast(`Tracking @${S.results2.handle}`);});return;}
 if(e.target.dataset.form!=='scan')return;e.preventDefault();
 const {handles,error}=parseHandles(new FormData(e.target).get('handle'));
 if(error||handles.length!==1){S.error=error||'Enter one account';render();return;}
 act(async()=>{const job=await api('/api/runs',{creator:handles[0],limit:100,concurrency:4,budget:1});await api(`/api/runs/${job.id}/run`,{});S.runs=[{id:job.id,creator:job.creator,count:0,status:'running'},...S.runs];await loadRun(job.id);});
});
// The confirm pop-up: a title, a sentence, and what its button does. `look` is the kit's pictures, when they matter.
function ask(title,text,ok,{look='',ok:label='Make it'}={}){
 $('#confirm-title').textContent=title;$('#confirm-look').innerHTML=look;$('#confirm-text').textContent=text;$('#confirm-ok').textContent=label;$('#confirm').returnValue='';$('#confirm').showModal();
 $('#confirm').addEventListener('close',()=>{if($('#confirm').returnValue==='ok')ok();},{once:true});
}
$('#player').addEventListener('close',()=>{const v=$('#player video');v.pause();v.removeAttribute('src');v.load();});

(async()=>{
 try{const boot=await api('/api/bootstrap');token=boot.token;S.runs=boot.runs.filter(r=>r.id!=='demo');
  const remembered=store.get('flow.run'),first=S.runs.find(r=>r.id===remembered)||S.runs.find(r=>['complete','partial'].includes(r.status));
  // A remembered channel that fails to load leaves the account list and its reason on screen (audit 2026-09-29).
  if(first)await loadRun(first.id).catch(()=>{});else render();}
 catch(e){$('#view').innerHTML=`<p class="err">Could not load the app: ${esc(e.message)}</p>`;}
})();

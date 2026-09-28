// Social Scraper, the five-step app: state, data loading and clicks. Rendering lives in flow-views.mjs.
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderKit,renderMake,renderReady,renderConfirmLook,esc} from './flow-views.mjs';
import {pickWinners} from './studio-view.mjs';
import {parseHandles} from './handles.mjs';
import {mountScanMap,reach} from './scan-map.mjs';

const $=s=>document.querySelector(s);
const S={pricing:false,runs:[],runId:null,job:null,results:null,saved:new Set(),secret:null,kit:null,plan:null,make:null,balance:null,step:'scan',mode:'fast',busy:false,error:'',feedback:null,timer:null};
let token='';
const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
async function api(path,data){
 const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});
 const text=await r.text();let v;try{v=JSON.parse(text);}catch{throw new Error(r.ok?'The app sent an unreadable answer. Refresh the page.':`Request failed (${r.status})`);}
 if(!r.ok)throw new Error(v.error||'Request failed');return v;
}
function toast(text){const t=$('#toast');t.textContent=text;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true;},4000);}

// What is done for this account, and so which steps can be opened.
const scanned=()=>['complete','partial'].includes(S.job?.status);
const scanning=()=>['running','scraping'].includes(S.job?.status);
const scored=()=>Object.values(S.results||{}).some(r=>r.quadrant&&r.quadrant!=='insufficient');
const flags=()=>({scanned:scanned(),scored:scored(),secret:S.secret?.state==='done',reels:S.make?.reels?.length||0});
const doneSteps=()=>{const f=flags();return {scan:f.scanned,winners:f.scanned&&f.scored,secret:f.secret,kit:Boolean(S.kit?.saved?.approved),make:f.reels>0,ready:false};};
const post=id=>S.job?.posts.find(p=>p.id===id);
const imageFor=id=>`/media/${encodeURIComponent(S.runId)}/${encodeURIComponent(id)}`;
const videoFor=id=>S.saved.has(id)?`/videos/${encodeURIComponent(S.runId)}/${encodeURIComponent(id)}`:post(id)?.videoUrl||'';
const hasVideo=p=>S.saved.has(p.id)||Boolean(p.videoUrl);

function scanProgress(){
 if(!S.job)return null;if(scanned())return {state:'done'};
 const total=S.job.posts.length||S.job.limit||100,done=S.job.posts.filter(p=>p.analysis||p.excludedReason).length;
 return {state:'running',done,total,label:S.job.posts.length?`Listening to and labelling reel ${done} of ${total}`:'Collecting the reels from Instagram'};
}
function winners(){
 if(!S.job||!S.results)return {winners:[],weakest:[]};
 const w=pickWinners(S.job.posts,S.results,{hasVideo,limit:6}).map(x=>({...x,image:imageFor(x.id)}));
 const weak=S.job.posts.map(p=>({p,r:S.results[p.id]})).filter(({p,r})=>r&&r.quadrant!=='insufficient'&&Number.isFinite(r.xNormal)&&hasVideo(p)).sort((a,b)=>a.r.xNormal-b.r.xNormal).slice(0,4).map(({p,r})=>({id:p.id,xNormal:r.xNormal,reach:r.reach,image:imageFor(p.id)}));
 return {winners:w,weakest:weak};
}

function render(){
 const open=reachable(flags());if(!open[S.step])S.step='scan';
 $('#stepper').innerHTML=renderStepper(S.step,open,doneSteps());
 $('#acct-now').textContent=S.job?`@${S.job.creator}`:'';
 const account=S.job?.creator||'';let html='';
 if(S.step==='scan')html=renderScan({runs:S.runs,run:S.job?{id:S.runId,creator:S.job.creator,count:S.job.posts.length}:null,progress:scanProgress(),error:S.error});
 if(S.step==='winners')html=renderWinners({account,...winners()});
 if(S.step==='secret')html=renderSecret({account,status:S.secret,imageFor,feedback:S.feedback});
 if(S.step==='kit')html=renderKit({account,status:S.kit,busy:S.busy,error:S.error,pick:S.kitPick,reels:(S.make?.reels||[]).filter(r=>r.mode==='kit'&&r.kitAt===S.kit?.saved?.createdAt)});
 if(S.step==='make')html=renderMake({account,plan:S.plan,make:S.make,balance:S.balance,mode:S.mode,busy:S.busy,error:S.error,pricing:S.pricing,kit:S.kit?.saved,fbOpen:S.fbOpen,showAll:S.showAllIdeas});
 if(S.step==='ready')html=renderReady({reels:S.make?.reels||[],fbOpen:S.fbOpen});
 // The scan map keeps its tiles between refreshes (so they fly from the wall to the map); the rest redraws.
 const key=S.step==='scan'?`scan:${S.runId}:${scanProgress()?.state}:${S.error}:${S.runs.length}`:null;
 if(!(key&&key===S.viewKey&&$('#view .scan-stage')))$('#view').innerHTML=html;S.viewKey=key;
 if(S.step==='scan'&&S.job){if(!S.scanSel)S.scanSel=[...S.job.posts].filter(p=>reach(p)).sort((a,b)=>reach(b)-reach(a))[0]?.id||null;
  mountScanMap($('#view'),{posts:S.job.posts,imageFor,videoFor,selected:S.scanSel,onSelect:id=>{S.scanSel=id;render();}});}
}
addEventListener('resize',()=>{if(S.step==='scan')render();});

// Loads everything for one account; later refreshes only fetch what is still running.
async function loadRun(id,{keepStep=false}={}){
 S.runId=id;store.set('flow.run',id);S.error='';S.scanSel=null;
 const base=`/api/runs/${encodeURIComponent(id)}`;
 const [job,videos,secret,kit,plan,make,money]=await Promise.all([api(base),api(`${base}/videos`).catch(()=>({saved:[]})),api(`${base}/secret`).catch(e=>({state:'none',error:e.message})),api(`${base}/kit`).catch(e=>({state:'none',error:e.message})),api(`${base}/reel-plan`).catch(()=>({state:'none'})),api(`${base}/reel-make`).catch(()=>({state:'none',reels:[]})),api(`${base}/money`).catch(()=>({results:{}}))]);
 if(S.runId!==id)return;
 Object.assign(S,{job,saved:new Set(videos.saved||[]),secret,kit,plan,make,results:money.results||{},feedback:secret?.saved?.feedback||null});
 if(!keepStep){const d=doneSteps(),remembered=store.get(`flow.step.${id}`);S.step=remembered&&reachable(flags())[remembered]?remembered:d.kit?'make':d.secret?'kit':d.winners?'winners':'scan';}
 render();poll();if(S.step==='make')prepareMake();
}
function poll(){
 clearTimeout(S.timer);
 const live=scanning()||S.secret?.state==='building'||S.kit?.state==='working'||S.plan?.state==='working'||S.make?.state==='working';
 if(live)S.timer=setTimeout(refresh,3000);
}
async function refresh(){
 const id=S.runId,base=`/api/runs/${encodeURIComponent(id)}`;
 try{
  if(scanning()){S.job=await api(base);if(scanned()){await loadRun(id,{keepStep:true});return;}}
  if(S.secret?.state==='building')S.secret=await api(`${base}/secret`);
  if(S.kit?.state==='working')S.kit=await api(`${base}/kit`);
  if(S.plan?.state==='working')S.plan=await api(`${base}/reel-plan`);
  if(S.make?.state==='working'){S.make=await api(`${base}/reel-make`);if(S.make.state!=='working')S.balance=null;}
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
 const t=e.target.closest('[data-step],[data-run],[data-play],[data-act],[data-idea],[data-mode],[data-feedback],[data-copy],[data-close],[data-kit-format],[data-kit-cast],[data-kit-place],[data-voice],[data-fb],[data-fb-reason]');if(!t||t.disabled)return;
 const base=`/api/runs/${encodeURIComponent(S.runId)}`;
 if(t.dataset.step){S.step=t.dataset.step;store.set(`flow.step.${S.runId}`,S.step);render();scrollTo({top:0,behavior:'smooth'});if(S.step==='make')prepareMake();return;}
 if(t.dataset.run){loadRun(t.dataset.run).catch(err=>toast(err.message));return;}
 if(t.dataset.close!==undefined){t.closest('dialog').close();return;}
 if(t.dataset.play){const src=videoFor(t.dataset.play);if(!src){toast('No video saved for this reel.');return;}const v=$('#player video');v.src=src;$('#player').showModal();v.play().catch(()=>{});return;}
 if(t.dataset.copy){const text=document.getElementById(t.dataset.copy)?.textContent||'';try{await navigator.clipboard.writeText(text);toast('Caption copied');}catch{toast('Could not copy. Select the caption and copy it.');}return;}
 if(t.dataset.mode){S.mode=t.dataset.mode;render();return;}
 if(t.dataset.feedback){act(async()=>{await api(`${base}/secret-feedback`,{answer:t.dataset.feedback});S.feedback=t.dataset.feedback;});return;}
 if(t.dataset.idea!==undefined){act(async()=>{S.plan=await api(`${base}/reel-plan/script`,{confirm:true,index:Number(t.dataset.idea)});});return;}
 // The kit: build, new host, redraw flagged pictures, switch format (each shows its price on the button), use it.
 const kitGo=body=>act(async()=>{await api(`${base}/kit`,{confirm:true,...body});S.kit=await api(`${base}/kit`);});
 if(t.dataset.kitFormat){kitGo({redo:'format',format:t.dataset.kitFormat});return;}
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
 if(t.dataset.act==='ideas-all'){S.showAllIdeas=true;render();return;}
 const a=t.dataset.act;
 if(a==='kit-build')kitGo({});if(a==='kit-character')kitGo({redo:'character'});if(a==='kit-pictures')kitGo({redo:'pictures'});
 if(a==='kit-approve')act(async()=>{await api(`${base}/kit/approve`,{confirm:true});S.kit=await api(`${base}/kit`);});
 if(a==='secret-build')act(async()=>{S.secret={...(await api(`${base}/secret`,{confirm:true})),plan:S.secret?.plan};});
 if(a==='ideas')act(async()=>{S.plan=await api(`${base}/reel-plan/ideas`,{confirm:true});});
 if(a==='make'){
  const usd=t.dataset.usd!==undefined,credits=Number(usd?t.dataset.usd:t.dataset.credits),max=Number(t.dataset.max);
  $('#confirm-look').innerHTML=usd?renderConfirmLook(S.kit?.saved):'';
  $('#confirm-text').textContent=usd?`This spends about $${credits.toFixed(2)} on your Gemini key (up to $${max.toFixed(2)} if a part needs its one retry). Each part is checked before the next one is paid for.`:`This spends ${credits} Higgsfield credits (up to ${max} if shots need their one retry). You have ${S.balance??'?'} credits. Each shot is checked before the next one is paid for.`;
  $('#confirm').returnValue='';$('#confirm').showModal();
  $('#confirm').addEventListener('close',()=>{if($('#confirm').returnValue!=='ok')return;act(async()=>{S.make={...(await api(`${base}/reel-make`,{confirm:true,mode:S.mode,confirmCredits:credits})),reels:S.make?.reels||[]};});},{once:true});
 }
});
document.addEventListener('submit',e=>{
 if(e.target.dataset.form!=='scan')return;e.preventDefault();
 const {handles,error}=parseHandles(new FormData(e.target).get('handle'));
 if(error||handles.length!==1){S.error=error||'Enter one account';render();return;}
 act(async()=>{const job=await api('/api/runs',{creator:handles[0],limit:100,concurrency:4,budget:1});await api(`/api/runs/${job.id}/run`,{});S.runs=[{id:job.id,creator:job.creator,count:0,status:'running'},...S.runs];await loadRun(job.id);});
});
$('#player').addEventListener('close',()=>{const v=$('#player video');v.pause();v.removeAttribute('src');v.load();});

(async()=>{
 try{const boot=await api('/api/bootstrap');token=boot.token;S.runs=boot.runs.filter(r=>r.id!=='demo');
  const remembered=store.get('flow.run'),first=S.runs.find(r=>r.id===remembered)||S.runs.find(r=>['complete','partial'].includes(r.status));
  if(first)await loadRun(first.id);else render();}
 catch(e){$('#view').innerHTML=`<p class="err">Could not load the app: ${esc(e.message)}</p>`;}
})();

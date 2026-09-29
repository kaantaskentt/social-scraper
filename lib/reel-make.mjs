// Makes the pilot reel from an approved plan (faceless hands + voiceover). Every paid step goes through PaidJobs
// (saved before paying, never resubmitted after a lost reply). The confirmed price must match a fresh free price
// check; spending stops at a ceiling (the price with at most one retry per shot). Each shot is watched by Gemini and
// checked by Jev against its brief; a failed shot gets one retry, and a second failure stops the reel.
import {mkdir,readFile,writeFile,rename,copyFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PaidJobs} from './higgsfield-jobs.mjs';
import {priceShots,voiceArgs,kitArgs,VIDEO_MODEL,DEFAULT_VOICE} from './reel-plan.mjs';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {renderReel,renderCover,mediaSeconds} from './render-reel.mjs';
import {VideoJobs} from './gemini-jobs.mjs';
import {designVoice,speak,voiceDescription,lineTimes,mixVoices,saveLine,trimSilence,fitTempo} from './voices.mjs';
import {craftBrief} from './craft.mjs';
import {SCORE_SCHEMA,SCORE_PROMPT,PARTS as SCORE_PARTS,total as scoreTotal,verdictRequest} from './reel-score.mjs';
import {scoreSummary,validFeedback} from './feedback.mjs';
import {dnaVoice} from './dna.mjs';
import {videoPath} from './videos.mjs';
import {linesHeard,spokenPromise} from './captions.mjs';
import {frames as reelFrames,claudeCheck,checkVerdict,jevCost,CLAUDE_MODEL} from './claude-check.mjs';
import {typicalReels,rankAgainstTypical,pairwiseRecord,rankSentence,settlePaid} from './rank.mjs';
import {DnaBuilder,recordSpend} from './dna-run.mjs';
import {existsSync} from 'node:fs';
import {PARTS,PART_SECONDS,partUsd,VIDEO_MODEL as OMNI,kitPrice,referencesFor,partPrompt,spokenText,discloseCaption,PART_QA_SCHEMA,partQaPrompt,partVerdict,veoPrompt} from './kit-reel.mjs';
import {VeoJobs,VEO,veoPrice} from './veo.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(execFile);

const ID=/^[\w-]{1,90}$/;
export const slug=t=>String(t||'reel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'reel';
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

// The reference image sets the hands and the place for every shot; the place comes from the channel's own Secret.
export function kitPrompt(plan){const place=plan.pattern?.setting||'a bright, clean, simple room with natural daylight';
 return `Photorealistic phone photo, 9:16, looking down at a work surface in this place: ${place}. A pair of relaxed hands with short clean nails and light grey knit sleeves rests on the surface. No face, no text, no logos, no brand names.${plan.pattern?.format?` Style of the channel: ${plan.pattern.format}`:''}`;}
export function shotPrompt(shot){return `${shot.visual} Camera: ${shot.camera}. Only hands and objects, never a face. The same hands, grey sleeves and place as in the reference image. Real phone footage, natural daylight, steady, no text, no logos, no music.`;}
export const shotArgs=(shot,kitFile,mode)=>['generate','create',VIDEO_MODEL,'--prompt',shotPrompt(shot),'--image-references',kitFile,'--duration',String(shot.seconds),'--aspect_ratio','9:16','--resolution','720p','--generate_audio','false','--mode',mode];

// The quality gate for one shot. Gemini watches the clip WITH the brief (a text-only comparison of a loose description
// wrongly failed a good shot on 2026-09-27); Jev decides whether anything missing matters to a viewer.
export const QA_SCHEMA={type:'object',required:['shows','match','missing','face_visible','text_visible','hands_look_wrong'],properties:{
 shows:{type:'string',description:'What happens in the clip, in one or two plain sentences.'},
 match:{type:'integer',minimum:0,maximum:3,description:'How well the clip shows the brief: 0 = something unrelated, 1 = the right objects but the wrong action, 2 = mostly the brief with small differences, 3 = exactly the brief'},
 missing:{type:'string',description:'What from the brief is missing or different, or "nothing".'},
 face_visible:{type:'boolean'},text_visible:{type:'boolean',description:'Any readable or garbled text, letters or logos'},hands_look_wrong:{type:'boolean',description:'Extra or missing fingers, melting or broken hands'}}};
// Judged against what the viewer hears at that moment (the voiceover line), with the brief as context: a good shot
// whose last half-second is cut short still works if it fits the line (learned 2026-09-27).
export const qaPrompt=(shot,line='')=>`Quality check for one shot of a reel. The brief for the shot was: "${shot.visual}" (camera: ${shot.camera}). While it plays the viewer hears: "${line||'(no voiceover)'}" (this line may describe the whole reel, not only this shot). Watch the clip and score how well it shows the brief. Small differences in wording or order, or an action cut short in the last second, still count as "mostly the brief".`;
export function qaRequest(shot,seen,line=''){return {model:'jev-latest',state:{brief:shot.visual,voiceover_line:line,clip_shows:seen.shows,missing:seen.missing},questions:{matters:{type:'noul',instructions:'The clip for `brief` is missing or changes: `missing`. The viewer hears `voiceover_line` meanwhile. Would that stop a viewer from understanding this step of the reel?',criteria:{true:'Yes, the step would not make sense',false:'No, the step still makes sense'}}}};}
export function qaVerdict(seen,raw){
 const problems=[];if(seen.face_visible)problems.push('a face is visible');if(seen.text_visible)problems.push('text or letters are visible');if(seen.hands_look_wrong)problems.push('the hands look wrong');
 if(!(seen.match>=2))problems.push(seen.match===1?'the right objects but the wrong action':'it shows something else');
 else if(!/^\s*nothing\b/i.test(seen.missing||'nothing')&&raw?.answers?.matters?.noul>=0.5)problems.push(`it misses what matters: ${seen.missing}`);
 return {pass:!problems.length,problems};
}

// The check for one filmed part, one function for the maker and the QA exam (the exam ran its own copy with no face
// pictures and no Jev step, so its pass did not mean the maker's pass; audit, 2026-09-29). Gemini watches the part twice
// with the hosts' face pictures: the result question caught the silver reel's black spoon 2 times in 3 (2026-09-28), so
// the part fails when either watch says the result is not what the script says. The clip bytes are read once by the
// caller, so the first watch is always the main answer (reading inside each watch let the order depend on which read
// finished first, a flaky test on 2026-09-28). Code decides; Jev decides whether something small missing matters.
// Every paid call goes into the ledger, also when the other watch fails.
export async function checkPart({bytes,faces=[],script,index,talking=true,gemini,jev,keys,ledger=async()=>{},name=`part-${index+1}`}){
 const watch=()=>gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},...faces.map(f=>({image:f})),{text:partQaPrompt(script,index,faces.length>0)}],schema:PART_QA_SCHEMA});
 let seen,again;try{[seen,again]=await settlePaid([watch(),watch()]);}catch(e){if(e.costUsd)await ledger({step:`check ${name}`,usd:e.costUsd,failed:e.message});throw e;}
 if(again.json?.result_as_written==='no')seen.json.result_as_written='no';
 await ledger({step:`check ${name}`,usd:(seen.costUsd||0)+(again.costUsd||0)});
 // Something small missing: Jev decides whether a viewer would notice (same rule as the hands-only shots).
 const brief=script.parts[index].beats.map(b=>`${b.does}${b.says?` "${b.says}"`:''}`).join(' '),needJev=seen.json.match>=2&&!/^\s*nothing\b/i.test(seen.json.missing||'nothing');
 let matters=null;if(needJev){const raw=await jev(qaRequest({visual:brief},seen.json,spokenText({parts:[script.parts[index]]})),keys.jev);await ledger({step:`check ${name} jev`,usd:jevCost(raw)});matters=raw?.answers?.matters?.noul;}
 const verdict=partVerdict(seen.json,{talking});if(verdict.pass&&matters>=0.5)Object.assign(verdict,{pass:false,problems:[`it misses what matters: ${seen.json.missing}`]});
 return {...verdict,shows:seen.json.shows,missing:seen.json.missing};
}
// A second opinion that did not run is shown on the reel card as a weakness, never left looking like a pass (a crashed
// check was saved as {error} and the card showed nothing, as for a clean reel; audit, 2026-09-29).
const notRun=why=>({level:'unchecked',weaknesses:[`it did not run: ${why}`]});
const notRanked=why=>`Not compared with their typical reels: ${why}`;

export class ReelMaker{
 constructor(root,keys,{run,download,veoFetch,gemini=generate,jev=jevAsk,render=renderReel,price=priceShots,pollMs,maxWaitMs,videoFetch,cut=cutEnd,seconds=mediaSeconds,cover=renderCover,claude=claudeCheck,frames=reelFrames,voices={design:designVoice,speak,mix:mixVoices,trim:trimSilence}}={}){Object.assign(this,{root,keys,veoFetch,gemini,jev,render,price,cut,seconds,videoFetch,coverRender:cover,claude,frames,voices,jobOpts:{run,download,pollMs,maxWaitMs}});this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 // Every reel for this account (newest first) and the one being made now, with its progress.
 async status(job){
  const live0=this.state.get(job.id),live=live0?{...live0,progress:live0.progress&&{...live0.progress}}:null,base=join(this.dir(job.id),'reels');let names=[];try{names=await readdir(base);}catch{}
  const reels=(await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))))).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(r=>({...r,caption:discloseCaption(r.caption,r.format)}));
  // How well the judge picked this channel's winners on its own past reels (scripts/judge-test.mjs), for the reel cards.
  const jt=await readJson(join(this.dir(job.id),'judge-test.json')),judge=jt?.winners?{verdict:jt.verdict,reels:jt.reels,auc:jt.winners.auc,at:jt.createdAt}:null;
  return {state:live?.state||'none',stage:live?.stage||null,error:live?.error||null,progress:live?.progress||null,reelId:live?.reelId||null,reels,judge};
 }
 // mode: 'std' or 'fast'; confirmCredits: the total the person saw and confirmed for that mode.
 async start(job,opts){
  // A second click while the first is still reading files must not start a second paid reel.
  this.starting??=new Set();if(this.state.get(job.id)?.state==='working'||this.starting.has(job.id))throw new Error('This reel is already being made');
  this.starting.add(job.id);try{return await this.begin(job,opts);}finally{this.starting.delete(job.id);}
 }
 async begin(job,{mode,confirmCredits}){
  if(!Number.isFinite(confirmCredits))throw new Error('Confirm the price first');
  const keys=this.keys();for(const [k,n] of [['gemini','Gemini'],['jev','Jev'],['groq','Groq']])if(!keys[k])throw new Error(`Connect ${n} first`);
  const plan=await readJson(join(this.dir(job.id),'plan.json'));if(!plan?.script)throw new Error('Write and check the script first');if(!plan.check?.pass)throw new Error('The script has open problems from Jev\'s check');
  if(plan.mode==='kit')return this.startKit(job,plan,{confirmUsd:confirmCredits,keys});
  if(!['std','fast'].includes(mode))throw new Error('Choose standard or fast');
  const voiceText=plan.script.voiceover.map(v=>v.line).join(' '),price=await this.price(plan.script.shots,{voiceText});
  const total=mode==='fast'?price.fastTotal:price.total,ceiling=mode==='fast'?price.fastWithOneRetryEach:price.withOneRetryEach;
  if(Math.abs(total-confirmCredits)>1e-6)throw new Error(`The price changed to ${total} credits. Check it again.`);
  const reelId=`${plan.chosen}-${slug(plan.picked[plan.chosen]?.idea?.title)}`;
  const live={state:'working',stage:'Starting',error:null,reelId,progress:{done:0,total:plan.script.shots.length+3}};this.state.set(job.id,live);
  this.make(job,plan,{mode,price,ceiling,voiceText,keys},live).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: making the reel for ${job.id} stopped: ${e.message}`);});
  return {...live,total,ceiling};
 }
 async make(job,plan,{mode,price,ceiling,voiceText,keys},live){
  const reelId=live.reelId,dir=join(this.dir(job.id),'reels',reelId);await mkdir(dir,{recursive:true});const step=()=>{live.progress.done++;};const jobs=new PaidJobs(dir,this.jobOpts),file=join(dir,'reel.json');
  const reel=await readJson(file)||{version:1,id:reelId,runId:job.id,title:plan.picked[plan.chosen]?.idea?.title,mode,ceiling,spent:0,shots:{},createdAt:new Date().toISOString()};
  const save=()=>writeJson(file,reel);
  const pay=async(name,args,credits,opts={})=>{const prev=await jobs.record(name);if(prev?.status==='done'&&!opts.retry)return prev; // already paid for
   if(reel.spent+credits>ceiling+1e-6)throw new Error(`Stopped: the next step would pass the confirmed ceiling of ${ceiling} credits`);const r=await jobs.run(name,args,{credits,...opts});if(r.attempt&&!reel.paid?.[`${name}#${r.attempt}`]){reel.paid={...reel.paid,[`${name}#${r.attempt}`]:credits};reel.spent=Math.round((reel.spent+credits)*100)/100;await save();}return r;};
  live.stage='Making the reference image';const kit=await pay('kit',kitArgs('create',kitPrompt(plan)),price.kit,{ext:'.png'});step();
  live.stage='Recording the voiceover';const voice=await pay('voice',voiceArgs('create',voiceText,DEFAULT_VOICE),price.voice,{ext:'.mp3'});step();
  const clips=[];
  for(const [i,shot] of plan.script.shots.entries()){
   const cost=(mode==='fast'?price.shots[i].fastCredits:price.shots[i].credits);let attempt=0;
   for(;;){
    live.stage=`Shot ${i+1} of ${plan.script.shots.length}${attempt?' (retry)':''}`;
    const r=await pay(`shot-${shot.id}`,shotArgs(shot,kit.file,mode),cost,{ext:'.mp4',retry:attempt>0});
    live.stage=`Checking shot ${i+1}`;const verdict=await this.check(shot,r.file,keys,plan.script.voiceover.filter(v=>v.shot===shot.id).map(v=>v.line).join(' '));
    const kept=join(dir,`shot-${shot.id}-a${r.attempt}.mp4`);if(r.file!==kept){await copyFile(r.file,kept);}
    reel.shots[shot.id]={file:kept,attempt:r.attempt,...verdict};await save();
    if(verdict.pass){clips.push(kept);step();break;}
    if(++attempt>1)throw new Error(`Shot ${i+1} failed its check twice (${verdict.problems.join(', ')}). Stopped before spending more.`);
    await jobs.save({...(await jobs.record(`shot-${shot.id}`)),status:'failed',error:`Quality check: ${verdict.problems.join(', ')}`});
   }
  }
  live.stage='Editing the reel';
  const out=join(dir,'reel.mp4');const r=await this.render({clips,voice:voice.file,groqKey:keys.groq,script:{voiceover:plan.script.voiceover,shots:plan.script.shots},hook:{text:plan.script.hook_title,until:2.2},endCard:{title:`Comment ${plan.script.keyword}`,subtitle:'for the full guide'},out});
  step();Object.assign(reel,{video:out,url:`/channels/${job.id}/${reelId}/reel.mp4`,keyword:plan.script.keyword,hook:plan.script.hook_title,seconds:r.seconds,caption:plan.script.caption,finishedAt:new Date().toISOString(),approved:null});await save();
  await writeFile(join(dir,'caption.txt'),plan.script.caption+'\n');
 }
 // Gemini watches the clip; Jev and plain facts decide. The check itself costs a fraction of a cent.
 async check(shot,file,keys,line=''){
  const seen=(await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:await readFile(file)},{text:qaPrompt(shot,line)}],schema:QA_SCHEMA})).json;
  const needJev=seen.match>=2&&!/^\s*nothing\b/i.test(seen.missing||'nothing');
  return {...qaVerdict(seen,needJev?await this.jev(qaRequest(shot,seen,line),keys.jev):null),seen:seen.shows,missing:seen.missing};
 }
 // A reel from the kit with Omni: part 1 from the kit's reference pictures, part 2 extends it (same faces and voices).
 // confirmUsd is the price the person saw; every part is checked before the next is paid for; one retry per part.
 async startKit(job,plan,{confirmUsd,keys}){
  const kit=await readJson(join(this.dir(job.id),'kit','kit.json'));if(!kit?.approved||kit.createdAt!==plan.kitAt)throw new Error('Your look changed since this script. Get new ideas first.');
  // The engine decides the price: Omni by 10-second parts, Veo by the seconds of each segment.
  const parts=plan.script.parts.length,veo=/^veo/.test(plan.engine||''),tier=plan.engine==='veo-standard'?'standard':'fast';
  const price=veo?(u=>({usd:u,maxUsd:Math.round(u*2*100)/100,parts}))(veoPrice(plan.script.parts.map(p=>p.seconds),tier)):kitPrice(parts);if(Math.abs(price.usd-confirmUsd)>1e-6)throw new Error(`The price changed to $${price.usd.toFixed(2)}. Check it again.`);
  // The id carries the script, not only the ideas: a new script for the same idea resumed the old reel and kept parts
  // filmed from the old script (audit, 2026-09-29). A reel begun under the old id after this script was written (no
  // scriptAt saved) still resumes under it, so nothing is filmed or paid twice.
  const base=`${plan.chosen}-${slug(plan.picked[plan.chosen]?.idea?.title)}-`,h=v=>createHash('sha256').update(String(v)).digest('hex').slice(0,6),old=`${base}${h(plan.createdAt)}`;
  const legacy=plan.scriptAt?await readJson(join(this.dir(job.id),'reels',old,'reel.json')):null;
  const reelId=!plan.scriptAt||(legacy&&!legacy.scriptAt&&String(legacy.createdAt)>=plan.scriptAt)?old:`${base}${h(`${plan.createdAt}|${plan.scriptAt}`)}`;
  const live={state:'working',stage:'Starting',error:null,reelId,progress:{done:0,total:parts+1}};this.state.set(job.id,live);
  (veo?this.makeVeo(job,plan,kit,{price,keys},live):this.makeKit(job,plan,kit,{price,keys},live)).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: making the reel for ${job.id} stopped: ${e.message}`);});
  return {...live,total:price.usd,ceiling:price.maxUsd};
 }
 // Veo 3.1 (Fast by default): an 8-second first clip with our hosts' and place's pictures, then 7-second extensions that
 // send the video so far back to Veo. Each segment is checked against its beats (the copy's original shots) before the
 // next is paid for, with one retry; a refused prompt is softened once; the finish is the same as Omni's.
 async makeVeo(job,plan,kitSaved,{price,keys},live){
  const dir=join(this.dir(job.id),'reels',live.reelId),kitDir=join(this.dir(job.id),'kit'),file=join(dir,'reel.json');await mkdir(dir,{recursive:true});
  const tier=plan.engine==='veo-standard'?'standard':'fast',jobs=new VeoJobs(dir,{key:keys.gemini,tier,fetchImpl:this.veoFetch,...(this.jobOpts.pollMs!==undefined?{pollMs:this.jobOpts.pollMs,sleep:async()=>{}}:{})});
  const reel=await readJson(file)||{version:1,id:live.reelId,runId:job.id,mode:'kit',engine:`veo-${tier}`,format:kitSaved.format,title:plan.picked[plan.chosen]?.idea?.title,idea:plan.chosen,planAt:plan.createdAt,kitAt:kitSaved.createdAt,ceilingUsd:price.maxUsd,spentUsd:0,paid:{},parts:[],voiceMode:'native',createdAt:new Date().toISOString()};
  const save=()=>writeJson(file,reel),ledger=entry=>this.spendLedger(job.id,entry);
  // Veo takes 3 reference pictures: the hosts' faces first, then the place.
  const refsFor=kitSaved.pictures?referencesFor(kitSaved):[],faceRefs=refsFor.filter(r=>r.role.startsWith('face')),placeRef=refsFor.find(r=>r.role==='place')||refsFor.find(r=>r.role==='hands');
  const faces=await Promise.all(faceRefs.map(r=>readFile(join(kitDir,r.file)))),refs=[...faces.slice(0,2),...(placeRef?[await readFile(join(kitDir,placeRef.file))]:[])].slice(0,3);
  const segs=plan.script.parts.map(p=>p.seconds),starts=segs.map((_,i)=>segs.slice(0,i).reduce((a,b)=>a+b,0)),perSec=VEO[tier].usdPerSecond,talking=true;
  for(let i=0;i<segs.length;i++){
   if(reel.parts[i]?.check?.pass){live.progress.done=i+1;continue;}
   const name=`part-${i+1}`,sent=await jobs.record(name),failedAt=reel.parts[i]?.attempt||0;
   for(let attempt=Math.max(1,failedAt+1,sent&&sent.status!=='failed'?sent.attempt:0);;attempt++){
    live.stage=`Filming part ${i+1} of ${segs.length}${attempt>1?' (retry)':''}`;const key=`${name}#${attempt}`,cost=segs[i]*perSec;
    if(!reel.paid[key]&&reel.spentUsd+cost>price.maxUsd+1e-9)throw new Error(`Stopped: the next part would pass the confirmed limit of $${price.maxUsd.toFixed(2)}`);
    const previous=i?await readFile(reel.parts[i-1].file):null;let r;
    for(let softened=false;;){
     try{r=await jobs.run(name,{attempt,prompt:veoPrompt(plan.script,i,kitSaved),refs:i?[]:refs,previous,seconds:segs[i]});break;}
     catch(e){if(plan.source==='copy'&&!softened&&/prohibited content|celebrity|filtered|sensitive/i.test(e.message)){softened=true;live.stage=`Softening part ${i+1} for Google`;await this.soften(plan,i,keys,ledger);reel.softened=[...(reel.softened||[]),i+1];await save();continue;}throw e;}
    }
    if(!reel.paid[key]){reel.paid[key]=r.costUsd;reel.spentUsd=Math.round((reel.spentUsd+r.costUsd)*1e4)/1e4;await ledger({step:`reel ${name} (veo ${tier})`,usd:r.costUsd});await save();}
    live.stage=`Checking part ${i+1}`;
    // An extension may come back as the whole video so far or as the new seconds only: measured, joined when needed.
    const expectEnd=starts[i]+segs[i],got=await this.seconds(r.file);
    const full=i&&got<expectEnd-2?await joinVideos(reel.parts[i-1].file,r.file,join(dir,`${name}-a${attempt}-full.mp4`)):r.file;
    const clip=i?await this.cut(full,join(dir,`${name}-a${attempt}-new.mp4`),starts[i]):full;
    const verdict=await checkPart({bytes:await readFile(clip),faces,script:plan.script,index:i,talking,gemini:this.gemini,jev:this.jev,keys,ledger,name});
    reel.parts[i]={id:r.id,file:full,attempt,check:verdict};await save();
    if(verdict.pass){live.progress.done=i+1;break;}
    if(attempt>=2&&attempt>=failedAt+1)throw new Error(`Part ${i+1} failed its check twice (${verdict.problems.join(', ')}). Stopped before spending more.`);
   }
  }
  await this.finishKit({job,plan,kitSaved,reel,final:reel.parts.at(-1).file,expected:segs.reduce((a,b)=>a+b,0),parts:segs.length,dir,keys,ledger,live,save,craft:null});
 }
 async makeKit(job,plan,kitSaved,{price,keys},live){
  const dir=join(this.dir(job.id),'reels',live.reelId),kitDir=join(this.dir(job.id),'kit'),file=join(dir,'reel.json');await mkdir(dir,{recursive:true});
  const jobs=new VideoJobs(dir,{key:keys.gemini,model:OMNI,fetchImpl:this.videoFetch,...(this.jobOpts.pollMs!==undefined?{pollMs:this.jobOpts.pollMs,sleep:async()=>{}}:{})});
  const reel=await readJson(file)||{version:1,id:live.reelId,runId:job.id,mode:'kit',format:kitSaved.format,title:plan.picked[plan.chosen]?.idea?.title,idea:plan.chosen,planAt:plan.createdAt,scriptAt:plan.scriptAt,kitAt:kitSaved.createdAt,ceilingUsd:price.maxUsd,spentUsd:0,paid:{},parts:[],voiceMode:plan.voiceMode||'native',createdAt:new Date().toISOString()};
  const save=()=>writeJson(file,reel),ledger=entry=>this.spendLedger(job.id,entry);
  const refs=referencesFor(kitSaved),images=await Promise.all(refs.map(async r=>({type:'image',mime_type:'image/jpeg',data:(await readFile(join(kitDir,r.file))).toString('base64')})));
  const faces=await Promise.all(refs.filter(r=>r.role.startsWith('face')).map(r=>readFile(join(kitDir,r.file))));
  const parts=plan.script.parts.length,craft=await readJson(join(this.dir(job.id),'craft.json')),voiceStyle=dnaVoice(await readJson(join(this.dir(job.id),'dna.json')));
  for(let i=0;i<parts;i++){
   if(reel.parts[i]?.check?.pass){live.progress.done=i+1;continue;}
   // Resume where this part stopped: a job already sent (or done) keeps its attempt; a filmed part that failed its
   // check moves on to the next attempt. Starting again at 1 paid for parts twice (audit, 2026-09-29).
   const sent=await jobs.record(`part-${i+1}`),failedAt=reel.parts[i]?.attempt||0;
   for(let attempt=Math.max(1,failedAt+1,sent&&sent.status!=='failed'?sent.attempt:0);;attempt++){
    live.stage=`Filming part ${i+1} of ${parts}${attempt>1?' (retry)':''}`;const name=`part-${i+1}`,key=`${name}#${attempt}`;
    if(!reel.paid[key]&&reel.spentUsd+partUsd(i)>price.maxUsd+1e-9)throw new Error(`Stopped: the next part would pass the confirmed limit of $${price.maxUsd.toFixed(2)}`);
    let r;for(let softened=false;;){
     const text=partPrompt(plan.script,i,kitSaved,craft,{silent:reel.voiceMode==='designed',voiceStyle}),input=i===0?[...images,{type:'text',text}]:[{type:'text',text}];
     try{r=await jobs.run(name,{attempt,input,previousId:i?reel.parts[i-1].id:undefined,responseFormat:{type:'video',aspect_ratio:'9:16',delivery:'uri'}});break;}
     catch(e){if(e.costUsd){reel.spentUsd=Math.round((reel.spentUsd+e.costUsd)*1e4)/1e4;await ledger({step:`reel ${name}`,usd:e.costUsd,failed:e.message});await save();}
      // A copy keeps the original's words, but Google refuses some (an "anti-detox, anti-aging routine" line was
      // blocked on 2026-09-29). A refusal costs nothing: this part's words are softened just enough, once, and sent again.
      if(plan.source==='copy'&&!softened&&/prohibited content/i.test(e.message)){softened=true;live.stage=`Softening part ${i+1} for Google`;await this.soften(plan,i,keys,ledger);reel.softened=[...(reel.softened||[]),i+1];await save();continue;}
      throw e;}
    }
    if(!reel.paid[key]){reel.paid[key]=r.costUsd;reel.spentUsd=Math.round((reel.spentUsd+r.costUsd)*1e4)/1e4;await ledger({step:`reel ${name}`,usd:r.costUsd});await save();}
    live.stage=`Checking part ${i+1}`;
    // Part 2 comes back as the whole reel so far; only its new seconds are checked.
    const clip=i?await this.cut(r.file,join(dir,`${name}-a${attempt}-new.mp4`),i*PART_SECONDS):r.file;
    const check=await checkPart({bytes:await readFile(clip),faces,script:plan.script,index:i,talking:reel.voiceMode!=='designed',gemini:this.gemini,jev:this.jev,keys,ledger,name});
    reel.parts[i]={id:r.id,file:r.file,attempt,check};await save();
    if(check.pass){live.progress.done=i+1;break;}
    if(attempt>=2&&attempt>=failedAt+1)throw new Error(`Part ${i+1} failed its check twice (${check.problems.join(', ')}). Stopped before spending more.`);
   }
  }
  const final=reel.parts[parts-1].file;await this.finishKit({job,plan,kitSaved,reel,final,expected:parts*PART_SECONDS,parts,dir,keys,ledger,live,save,craft});
 }
 // The end of every kit reel, whatever made the video (Omni parts or Veo segments): voices if designed, the edit with
 // captions, the "every line heard" check, the cover, the scores (not for copies), then the reel is saved.
 async finishKit({job,plan,kitSaved,reel,final,expected,parts,dir,keys,ledger,live,save,craft}){
  const seconds=await this.seconds(final);if(seconds<expected-1)throw new Error(`The finished video is ${seconds.toFixed(1)} s, expected about ${expected} s`);
  let voiceTrack=final;
  if(reel.voiceMode==='designed'){live.stage='Recording the voices';voiceTrack=await this.voiceOver(job,plan.script,kitSaved,craft,final,dir,keys,ledger);}
  live.stage='Editing the reel';const out=join(dir,'reel.mp4'),s=plan.script;
  const r=await this.render({clips:[final],voice:voiceTrack,groqKey:keys.groq,sayText:spokenText(s),hook:{text:s.hook_title,until:2.2},endCard:{title:kitSaved.kit.name,subtitle:'Follow for the next one'},out});
  // Every spoken line must be heard in the finished reel (code, from the transcript); a cut line is shown on the reel.
  reel.heard=r.words?linesHeard(s.parts.flatMap(p=>p.beats.map(b=>b.says)).filter(Boolean),r.words):null;
  // A copy is an internal test, word for word with its claims untouched (Kaan, 2026-09-29): marked, never blocked.
  const copy=plan.source==='copy';reel.said=(r.spoken||[]).map(w=>w.text).join(' ');
  if(copy)Object.assign(reel,{copyOf:plan.copyOf,internal:true});
  const promise=copy?null:spokenPromise(r.spoken);if(promise)reel.review={postable:false,why:`The host promises something we do not have: "${promise}"`,source:'code, from what was really said'};
  live.progress.done=parts+1;const caption=discloseCaption(s.caption,kitSaved.format);
  // The cover picture for Instagram (free): a frame of the raw video with the hook as a title.
  live.stage='Making the cover';await this.coverRender({video:final,at:1,title:s.hook_title,out:join(dir,'cover.jpg')});reel.cover=`/channels/${job.id}/${live.reelId}/cover.jpg`;
  // The studio score against this account's winners (the feedback loop's automatic half). A failed score is shown
  // on the reel, never hidden, and never stops a finished reel.
  // A copy is judged by how close it is to its original (the copy studio's comparison), not by the creative scores.
  if(!copy){
  live.stage='Scoring the reel';try{reel.score=await this.scoreReel(job,out,keys,ledger);}catch(e){reel.scoreError=e.message;}
  // The gate's last step: Claude, a different model family, lists defects; code decides broken, weak or good.
  live.stage='Final check';reel.check=await this.finalCheck(job,out,s,r.words,reel.heard,keys,ledger).catch(e=>({error:e.message,...notRun(e.message)}));
  // The rank: does it beat 5 of the channel's typical reels side by side? Shown with the channel's own test result.
  live.stage='Comparing with their typical reels';reel.rank=await this.rankReel(job,out,keys,ledger).catch(e=>({error:e.message,sentence:notRanked(e.message)}));
  }
  Object.assign(reel,{video:out,url:`/channels/${job.id}/${live.reelId}/reel.mp4`,hook:s.hook_title,seconds:r.seconds,caption,finishedAt:new Date().toISOString(),approved:null});await save();
  await writeFile(join(dir,'caption.txt'),caption+'\n');
 }
 // The channel's designed voices (made once per host and saved in the kit), then every line spoken and mixed over the
 // video's own sounds at its beat.
 async channelVoices(runId,kitSaved,keys,ledger){
  const file=join(this.dir(runId),'kit','kit.json'),kit=await readJson(file)||kitSaved,voices={...kit.voices};
  const people=(kit.kit.cast||[]).length?kit.kit.cast:[{name:'narrator',look:'',voice:kit.kit.sound?.voice||'clear and friendly'}];
  for(const h of people){if(voices[h.name]?.id)continue;let {description,gender,simple}=voiceDescription(h),v;
   // One simpler retry if Google's voice service fails on the description; the description used is kept.
   try{v=await this.voices.design({key:keys.gemini,name:`${kit.kit.name} ${h.name}`,description,gender});}
   catch(e){if(!/HTTP 5\d\d/.test(e.message))throw e;description=simple;v=await this.voices.design({key:keys.gemini,name:`${kit.kit.name} ${h.name}`,description,gender});}await ledger({step:`voice ${h.name}`,usd:v.costUsd});
   const sample=v.sample?`voice-${slug(h.name)}.wav`:null;if(sample)await writeFile(join(this.dir(runId),'kit',sample),v.sample);
   voices[h.name]={id:v.id,description,expires:v.expires,sample:sample?`/channels/${runId}/kit/${sample}`:null};
   await writeJson(file,{...kit,voices});}
  return {voices,people};
 }
 async voiceOver(job,script,kitSaved,craft,video,dir,keys,ledger){
  // A brisk reel pace on top of the channel's voice direction (a calm note gave about 1.3 words a second).
  // The channel's own data wins over our default: Ken's DNA hinted a calm voice beats an energetic one (2026-09-28).
  const dnaStyle=dnaVoice(await readJson(join(this.dir(job.id),'dna.json')));
  const {voices,people}=await this.channelVoices(job.id,kitSaved,keys,ledger),style=dnaStyle?`${dnaStyle}, at a natural pace with no long pauses`:`${craftBrief(craft)?.voice?.split(/[.;]/)[0]||'confident and conversational'}, at a brisk, energetic social-media pace`;
  const lines=[];let n=0;
  for(const [i,p] of script.parts.entries())for(const b of p.beats){if(!b.says)continue;
   const who=voices[b.who]?b.who:people[0].name,r=await this.voices.speak({key:keys.gemini,voice:voices[who].id,text:b.says,style});await ledger({step:'voice line',usd:r.costUsd});
   const raw=await saveLine(dir,n,r.wav),file=await this.voices.trim(raw,join(dir,`line-${n++}-trim.wav`));lines.push({at:i*PART_SECONDS+b.from,file,seconds:await this.seconds(file),who});}
  const total=script.parts.length*PART_SECONDS,tempo=fitTempo(lines,total),timed=lineTimes(lines.map(l=>({...l,seconds:l.seconds/tempo})));
  return this.voices.mix({video,lines:timed,tempo,out:join(dir,'voices.wav')});
 }
 // The judge is noisy (a winner scored 6.3 to 7.6 across runs), so each reel is scored 3 times and averaged.
 async judge(file,keys,ledger){const one=async()=>{const r=await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:await readFile(file)},{text:SCORE_PROMPT}],schema:SCORE_SCHEMA});await ledger({step:'score',usd:r.costUsd||0});return r.json;};
  const r=await Promise.all([one(),one(),one()]);return {...r[0],...Object.fromEntries(SCORE_PARTS.map(k=>[k,Math.round(r.reduce((a,x)=>a+x[k],0)/3*10)/10]))};}
 // The judge's notes on a finished reel. It is not compared with the winners any more: on 209 past reels of three
 // channels the judge picked winners 43 to 53% of the time (a coin flip; scripts/judge-test.mjs, 2026-09-28).
 async scoreReel(job,file,keys,ledger){
  const ours=await this.judge(file,keys,ledger);
  return {...scoreSummary(ours),at:new Date().toISOString()};
 }
 // The smallest change to one part's words and actions so Google's video safety accepts it: claims about health,
 // detox, ageing or the body go; everything else, the length and the order stay.
 async soften(plan,i,keys,ledger){
  const beats=plan.script.parts[i].beats;
  const r=await this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:`A video prompt for this 10-second part was refused by a video model's safety filter. Rewrite each beat with the SMALLEST change that removes health, medical, detox, anti-ageing, body-change or graphic body claims and images, keeping everything else word for word: the same number of beats, the same order, about the same number of words, the same actions and objects.\n${JSON.stringify(beats.map(b=>({does:b.does,says:b.says})))}`}],schema:{type:'object',required:['beats'],properties:{beats:{type:'array',items:{type:'object',required:['does','says'],properties:{does:{type:'string'},says:{type:'string'}}}}}},thinking:'low'});
  await ledger({step:'copy soften',usd:r.costUsd||0});
  if(r.json.beats.length!==beats.length)throw new Error(`Softening part ${i+1} returned ${r.json.beats.length} beats for ${beats.length}`);
  plan.script.parts[i].beats=beats.map((b,j)=>({...b,does:r.json.beats[j].does,says:r.json.beats[j].says}));
 }
 async finalCheck(job,file,script,words,heard,keys,ledger){
  if(!keys.anthropic)return {skipped:'Add ANTHROPIC_API_KEY for the final check',...notRun('add ANTHROPIC_API_KEY for the final check')};
  const transcript=(words||[]).filter(w=>w.heard!==false).map(w=>[Math.round(w.start*10)/10,w.text]);
  const {report,usage}=await this.claude({key:keys.anthropic,images:await this.frames(file),script,transcript,measures:{lines_not_heard:heard?.missing||[]}});
  const usd=((usage?.input_tokens||0)*2+(usage?.output_tokens||0)*10)/1e6;await ledger({step:'final check',usd}); // Sonnet 5: $2 in, $10 out per million
  return {...checkVerdict(report),model:CLAUDE_MODEL,swipe:report.swipe_second,at:new Date().toISOString()};
 }
 async rankReel(job,file,keys,ledger){
  // A failure to read the channel's reels is its own error, not "fewer than 3" (an empty catch said that; audit, 2026-09-29).
  const reels=new DnaBuilder(this.root,()=>({})).usable(job).map(r=>({id:r.post.id,xNormal:r.xNormal,file:videoPath(this.root,job.id,r.post.id)}));
  const opponents=typicalReels(reels,5);if(opponents.length<3){const why='Fewer than 3 typical reels with a saved video';return {skipped:why,sentence:notRanked(why.toLowerCase())};}
  let r;try{r=await rankAgainstTypical({ours:file,opponents,gemini:this.gemini,key:keys.gemini,model:MODELS.watch});}catch(e){if(e.costUsd)await ledger({step:'rank',usd:e.costUsd,failed:e.message});throw e;}
  await ledger({step:'rank',usd:r.costUsd});
  const record=await pairwiseRecord(this.root,job.id);return {...r,record,sentence:rankSentence(r,record),at:new Date().toISOString()};
 }
 // A cover for a reel made before covers existed (free).
 async makeCover(job,reelId){
  if(!/^[\w-]{1,120}$/.test(String(reelId)))throw new Error('Pick a reel');const dir=join(this.dir(job.id),'reels',reelId),file=join(dir,'reel.json'),reel=await readJson(file);if(!reel?.video)throw new Error('This reel is not finished');
  const raw=reel.parts?.at(-1)?.file||reel.video;await this.coverRender({video:raw,at:1,title:reel.hook||reel.title||'',out:join(dir,'cover.jpg')});
  reel.cover=`/channels/${job.id}/${reelId}/cover.jpg`;await writeJson(file,reel);return reel;
 }
 // Kaan's one tap on a finished reel: 👍 or 👎 with reasons.
 async feedback(job,reelId,body){
  if(!/^[\w-]{1,120}$/.test(String(reelId)))throw new Error('Pick a reel');const file=join(this.dir(job.id),'reels',reelId,'reel.json'),reel=await readJson(file);if(!reel)throw new Error('Pick a reel');
  reel.feedback=validFeedback(body||{});await writeJson(file,reel);return reel;
 }
 // The one shared queue per spend.json (lib/dna-run.mjs): the planner can log ideas while a reel is filming.
 spendLedger(runId,entry){return recordSpend(join(this.dir(runId),'spend.json'),entry);}
}
// The last seconds of a video (the new part of an extended clip), for its check. Free (local ffmpeg).
export async function cutEnd(input,out,from){await run('ffmpeg',['-v','error','-y','-ss',String(from),'-i',input,'-c:v','libx264','-preset','veryfast','-c:a','aac',out],{timeout:120000});return out;}

// Two videos one after the other (a Veo extension that came back as its new seconds only). Free (local ffmpeg).
export async function joinVideos(a,b,out){await run('ffmpeg',['-v','error','-y','-i',a,'-i',b,'-filter_complex','[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]','-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-c:a','aac',out],{timeout:180000});return out;}

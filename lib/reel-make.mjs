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
import {renderReel} from './render-reel.mjs';

const ID=/^[\w-]{1,90}$/;
export const slug=t=>String(t||'reel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'reel';
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

export function kitPrompt(plan){return `Photorealistic phone photo, 9:16, top-down over a bright, clean white kitchen counter in a modern kitchen with natural daylight. A pair of relaxed hands with short clean nails and light grey knit sleeves rests on the counter next to a wooden cutting board. No face, no text, no logos, no brand names.${plan.pattern?.format?` Style of the channel: ${plan.pattern.format}`:''}`;}
export function shotPrompt(shot){return `${shot.visual} Camera: ${shot.camera}. Only hands and objects, never a face. The same hands, grey sleeves and white kitchen as in the reference image. Real phone footage, natural daylight, steady, no text, no logos, no music.`;}
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

export class ReelMaker{
 constructor(root,keys,{run,download,gemini=generate,jev=jevAsk,render=renderReel,price=priceShots,pollMs,maxWaitMs}={}){Object.assign(this,{root,keys,gemini,jev,render,price,jobOpts:{run,download,pollMs,maxWaitMs}});this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 // Every reel for this account (newest first) and the one being made now, with its progress.
 async status(job){
  const live=this.state.get(job.id),base=join(this.dir(job.id),'reels');let names=[];try{names=await readdir(base);}catch{}
  const reels=(await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))))).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return {state:live?.state||'none',stage:live?.stage||null,error:live?.error||null,progress:live?.progress||null,reelId:live?.reelId||null,reels};
 }
 // mode: 'std' or 'fast'; confirmCredits: the total the person saw and confirmed for that mode.
 async start(job,{mode,confirmCredits}){
  if(this.state.get(job.id)?.state==='working')throw new Error('This reel is already being made');
  if(!['std','fast'].includes(mode))throw new Error('Choose standard or fast');if(!Number.isFinite(confirmCredits))throw new Error('Confirm the price first');
  const keys=this.keys();for(const [k,n] of [['gemini','Gemini'],['jev','Jev'],['groq','Groq']])if(!keys[k])throw new Error(`Connect ${n} first`);
  const plan=await readJson(join(this.dir(job.id),'plan.json'));if(!plan?.script)throw new Error('Write and check the script first');if(!plan.check?.pass)throw new Error('The script has open problems from Jev\'s check');
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
}

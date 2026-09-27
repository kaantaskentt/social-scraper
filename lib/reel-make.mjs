// Makes the pilot reel from an approved plan (faceless hands + voiceover). Every paid step goes through PaidJobs
// (saved before paying, never resubmitted after a lost reply). The confirmed price must match a fresh free price
// check; spending stops at a ceiling (the price with at most one retry per shot). Each shot is watched by Gemini and
// checked by Jev against its brief; a failed shot gets one retry, and a second failure stops the reel.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PaidJobs} from './higgsfield-jobs.mjs';
import {priceShots,voiceArgs,kitArgs,VIDEO_MODEL,DEFAULT_VOICE} from './reel-plan.mjs';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {renderReel} from './render-reel.mjs';

const ID=/^[\w-]{1,90}$/;
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

export function kitPrompt(plan){return `Photorealistic phone photo, 9:16, top-down over a bright, clean white kitchen counter in a modern kitchen with natural daylight. A pair of relaxed hands with short clean nails and light grey knit sleeves rests on the counter next to a wooden cutting board. No face, no text, no logos, no brand names.${plan.pattern?.format?` Style of the channel: ${plan.pattern.format}`:''}`;}
export function shotPrompt(shot){return `${shot.visual} Camera: ${shot.camera}. Only hands and objects, never a face. The same hands, grey sleeves and white kitchen as in the reference image. Real phone footage, natural daylight, steady, no text, no logos, no music.`;}
export const shotArgs=(shot,kitFile,mode)=>['generate','create',VIDEO_MODEL,'--prompt',shotPrompt(shot),'--image-references',kitFile,'--duration',String(shot.seconds),'--aspect_ratio','9:16','--resolution','720p','--generate_audio','false','--mode',mode];

// The quality gate for one shot: Gemini says what the clip shows, Jev decides whether it matches the brief.
export const QA_SCHEMA={type:'object',required:['shows','face_visible','text_visible','hands_look_wrong'],properties:{shows:{type:'string',description:'What happens in the clip, in one or two plain sentences.'},face_visible:{type:'boolean'},text_visible:{type:'boolean',description:'Any readable or garbled text, letters or logos'},hands_look_wrong:{type:'boolean',description:'Extra or missing fingers, melting or broken hands'}}};
export function qaRequest(shot,seen){return {model:'jev-latest',state:{brief:shot.visual,clip:seen},questions:{matches:{type:'noul',instructions:'Does `clip` show what `brief` asks for, closely enough to use in the reel?',criteria:{true:'Yes, it shows the brief',false:'No, it shows something else or misses the key action'}}}};}
export function qaVerdict(seen,raw){
 const problems=[];if(seen.face_visible)problems.push('a face is visible');if(seen.text_visible)problems.push('text or letters are visible');if(seen.hands_look_wrong)problems.push('the hands look wrong');
 if(!(raw?.answers?.matches?.noul>=0.5))problems.push('it does not show the brief');return {pass:!problems.length,problems};
}

export class ReelMaker{
 constructor(root,keys,{run,download,gemini=generate,jev=jevAsk,render=renderReel,price=priceShots,pollMs,maxWaitMs}={}){Object.assign(this,{root,keys,gemini,jev,render,price,jobOpts:{run,download,pollMs,maxWaitMs}});this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 async status(job){const live=this.state.get(job.id);return {state:live?.state||'none',stage:live?.stage||null,error:live?.error||null,reel:await readJson(join(this.dir(job.id),'reel','reel.json'))};}
 // mode: 'std' or 'fast'; confirmCredits: the total the person saw and confirmed for that mode.
 async start(job,{mode,confirmCredits}){
  if(this.state.get(job.id)?.state==='working')throw new Error('This reel is already being made');
  if(!['std','fast'].includes(mode))throw new Error('Choose standard or fast');if(!Number.isFinite(confirmCredits))throw new Error('Confirm the price first');
  const keys=this.keys();for(const [k,n] of [['gemini','Gemini'],['jev','Jev'],['groq','Groq']])if(!keys[k])throw new Error(`Connect ${n} first`);
  const plan=await readJson(join(this.dir(job.id),'plan.json'));if(!plan?.script)throw new Error('Write and check the script first');if(!plan.check?.pass)throw new Error('The script has open problems from Jev\'s check');
  const voiceText=plan.script.voiceover.map(v=>v.line).join(' '),price=await this.price(plan.script.shots,{voiceText});
  const total=mode==='fast'?price.fastTotal:price.total,ceiling=mode==='fast'?price.fastWithOneRetryEach:price.withOneRetryEach;
  if(Math.abs(total-confirmCredits)>1e-6)throw new Error(`The price changed to ${total} credits. Check it again.`);
  const live={state:'working',stage:'Starting',error:null};this.state.set(job.id,live);
  this.make(job,plan,{mode,price,ceiling,voiceText,keys},live).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: making the reel for ${job.id} stopped: ${e.message}`);});
  return {...live,total,ceiling};
 }
 async make(job,plan,{mode,price,ceiling,voiceText,keys},live){
  const dir=join(this.dir(job.id),'reel');await mkdir(dir,{recursive:true});const jobs=new PaidJobs(dir,this.jobOpts),file=join(dir,'reel.json');
  const reel=await readJson(file)||{version:1,runId:job.id,title:plan.picked[plan.chosen]?.idea?.title,mode,ceiling,spent:0,shots:{},createdAt:new Date().toISOString()};
  const save=()=>writeJson(file,reel);
  const pay=async(name,args,credits,opts={})=>{const prev=await jobs.record(name);if(prev?.status==='done'&&!opts.retry)return prev; // already paid for
   if(reel.spent+credits>ceiling+1e-6)throw new Error(`Stopped: the next step would pass the confirmed ceiling of ${ceiling} credits`);const r=await jobs.run(name,args,{credits,...opts});if(r.attempt&&!reel.paid?.[`${name}#${r.attempt}`]){reel.paid={...reel.paid,[`${name}#${r.attempt}`]:credits};reel.spent=Math.round((reel.spent+credits)*100)/100;await save();}return r;};
  live.stage='Making the reference image';const kit=await pay('kit',kitArgs('create',kitPrompt(plan)),price.kit,{ext:'.png'});
  live.stage='Recording the voiceover';const voice=await pay('voice',voiceArgs('create',voiceText,DEFAULT_VOICE),price.voice,{ext:'.mp3'});
  const clips=[];
  for(const [i,shot] of plan.script.shots.entries()){
   const cost=(mode==='fast'?price.shots[i].fastCredits:price.shots[i].credits);let attempt=0;
   for(;;){
    live.stage=`Shot ${i+1} of ${plan.script.shots.length}${attempt?' (retry)':''}`;
    const r=await pay(`shot-${shot.id}`,shotArgs(shot,kit.file,mode),cost,{ext:'.mp4',retry:attempt>0});
    live.stage=`Checking shot ${i+1}`;const verdict=await this.check(shot,r.file,keys);
    reel.shots[shot.id]={file:r.file,attempt:r.attempt,...verdict};await save();
    if(verdict.pass){clips.push(r.file);break;}
    if(++attempt>1)throw new Error(`Shot ${i+1} failed its check twice (${verdict.problems.join(', ')}). Stopped before spending more.`);
    await jobs.save({...(await jobs.record(`shot-${shot.id}`)),status:'failed',error:`Quality check: ${verdict.problems.join(', ')}`});
   }
  }
  live.stage='Editing the reel';
  const out=join(dir,'reel.mp4');const r=await this.render({clips,voice:voice.file,groqKey:keys.groq,hook:{text:plan.script.hook_title,until:2.2},endCard:{title:`Comment ${plan.script.keyword}`,subtitle:'for the full guide'},out});
  Object.assign(reel,{video:out,seconds:r.seconds,caption:plan.script.caption,finishedAt:new Date().toISOString(),approved:null});await save();
  await writeFile(join(dir,'caption.txt'),plan.script.caption+'\n');
 }
 // Gemini watches the clip; Jev and plain facts decide. The check itself costs a fraction of a cent.
 async check(shot,file,keys){
  const seen=(await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:await readFile(file)},{text:'Describe this short clip for a quality check.'}],schema:QA_SCHEMA})).json;
  return {...qaVerdict(seen,await this.jev(qaRequest(shot,seen),keys.jev)),seen:seen.shows};
 }
}

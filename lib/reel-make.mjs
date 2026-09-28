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
import {renderReel,mediaSeconds} from './render-reel.mjs';
import {VideoJobs} from './gemini-jobs.mjs';
import {designVoice,speak,voiceDescription,lineTimes,mixVoices,saveLine,trimSilence,fitTempo} from './voices.mjs';
import {craftBrief} from './craft.mjs';
import {SCORE_SCHEMA,SCORE_PROMPT,PARTS as SCORE_PARTS,total as scoreTotal,verdictRequest} from './reel-score.mjs';
import {scoreSummary,validFeedback} from './feedback.mjs';
import {videoPath} from './videos.mjs';
import {existsSync} from 'node:fs';
import {PARTS,PART_SECONDS,partUsd,VIDEO_MODEL as OMNI,kitPrice,referencesFor,partPrompt,spokenText,discloseCaption,PART_QA_SCHEMA,partQaPrompt,partVerdict} from './kit-reel.mjs';
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

export class ReelMaker{
 constructor(root,keys,{run,download,gemini=generate,jev=jevAsk,render=renderReel,price=priceShots,pollMs,maxWaitMs,videoFetch,cut=cutEnd,seconds=mediaSeconds,voices={design:designVoice,speak,mix:mixVoices,trim:trimSilence}}={}){Object.assign(this,{root,keys,gemini,jev,render,price,cut,seconds,videoFetch,voices,jobOpts:{run,download,pollMs,maxWaitMs}});this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 // Every reel for this account (newest first) and the one being made now, with its progress.
 async status(job){
  const live0=this.state.get(job.id),live=live0?{...live0,progress:live0.progress&&{...live0.progress}}:null,base=join(this.dir(job.id),'reels');let names=[];try{names=await readdir(base);}catch{}
  const reels=(await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))))).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return {state:live?.state||'none',stage:live?.stage||null,error:live?.error||null,progress:live?.progress||null,reelId:live?.reelId||null,reels};
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
  const parts=plan.script.parts.length,price=kitPrice(parts);if(Math.abs(price.usd-confirmUsd)>1e-6)throw new Error(`The price changed to $${price.usd.toFixed(2)}. Check it again.`);
  const reelId=`${plan.chosen}-${slug(plan.picked[plan.chosen]?.idea?.title)}-${createHash('sha256').update(String(plan.createdAt)).digest('hex').slice(0,6)}`;
  const live={state:'working',stage:'Starting',error:null,reelId,progress:{done:0,total:parts+1}};this.state.set(job.id,live);
  this.makeKit(job,plan,kit,{price,keys},live).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: making the reel for ${job.id} stopped: ${e.message}`);});
  return {...live,total:price.usd,ceiling:price.maxUsd};
 }
 async makeKit(job,plan,kitSaved,{price,keys},live){
  const dir=join(this.dir(job.id),'reels',live.reelId),kitDir=join(this.dir(job.id),'kit'),file=join(dir,'reel.json');await mkdir(dir,{recursive:true});
  const jobs=new VideoJobs(dir,{key:keys.gemini,model:OMNI,fetchImpl:this.videoFetch,...(this.jobOpts.pollMs!==undefined?{pollMs:this.jobOpts.pollMs,sleep:async()=>{}}:{})});
  const reel=await readJson(file)||{version:1,id:live.reelId,runId:job.id,mode:'kit',format:kitSaved.format,title:plan.picked[plan.chosen]?.idea?.title,idea:plan.chosen,planAt:plan.createdAt,kitAt:kitSaved.createdAt,ceilingUsd:price.maxUsd,spentUsd:0,paid:{},parts:[],voiceMode:plan.voiceMode||'native',createdAt:new Date().toISOString()};
  const save=()=>writeJson(file,reel),ledger=entry=>this.spendLedger(job.id,entry);
  const refs=referencesFor(kitSaved),images=await Promise.all(refs.map(async r=>({type:'image',mime_type:'image/jpeg',data:(await readFile(join(kitDir,r.file))).toString('base64')})));
  const faces=await Promise.all(refs.filter(r=>r.role.startsWith('face')).map(r=>readFile(join(kitDir,r.file))));
  const parts=plan.script.parts.length,craft=await readJson(join(this.dir(job.id),'craft.json'));
  for(let i=0;i<parts;i++){
   if(reel.parts[i]?.check?.pass){live.progress.done=i+1;continue;}
   for(let attempt=1;;attempt++){
    live.stage=`Filming part ${i+1} of ${parts}${attempt>1?' (retry)':''}`;const name=`part-${i+1}`,key=`${name}#${attempt}`;
    if(!reel.paid[key]&&reel.spentUsd+partUsd(i)>price.maxUsd+1e-9)throw new Error(`Stopped: the next part would pass the confirmed limit of $${price.maxUsd.toFixed(2)}`);
    const text=partPrompt(plan.script,i,kitSaved,craft,{silent:reel.voiceMode==='designed'}),input=i===0?[...images,{type:'text',text}]:[{type:'text',text}];
    let r;try{r=await jobs.run(name,{attempt,input,previousId:i?reel.parts[i-1].id:undefined,responseFormat:{type:'video',aspect_ratio:'9:16',delivery:'uri'}});}
    catch(e){if(e.costUsd){reel.spentUsd=Math.round((reel.spentUsd+e.costUsd)*1e4)/1e4;await ledger({step:`reel ${name}`,usd:e.costUsd,failed:e.message});await save();}throw e;}
    if(!reel.paid[key]){reel.paid[key]=r.costUsd;reel.spentUsd=Math.round((reel.spentUsd+r.costUsd)*1e4)/1e4;await ledger({step:`reel ${name}`,usd:r.costUsd});await save();}
    live.stage=`Checking part ${i+1}`;
    // Part 2 comes back as the whole reel so far; only its new seconds are checked.
    const clip=i?await this.cut(r.file,join(dir,`${name}-a${attempt}-new.mp4`),i*PART_SECONDS):r.file;
    const seen=await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:await readFile(clip)},...faces.map(f=>({image:f})),{text:partQaPrompt(plan.script,i,faces.length>0)}],schema:PART_QA_SCHEMA});
    await ledger({step:`check ${name}`,usd:seen.costUsd||0});
    // Something small missing: Jev decides whether a viewer would notice (same rule as the hands-only shots).
    const brief=plan.script.parts[i].beats.map(b=>`${b.does}${b.says?` "${b.says}"`:''}`).join(' '),needJev=seen.json.match>=2&&!/^\s*nothing\b/i.test(seen.json.missing||'nothing');
    const matters=needJev?(await this.jev(qaRequest({visual:brief},seen.json,spokenText({parts:[plan.script.parts[i]]})),keys.jev))?.answers?.matters?.noul:null;
    const verdict=partVerdict(seen.json);if(verdict.pass&&matters>=0.5)Object.assign(verdict,{pass:false,problems:[`it misses what matters: ${seen.json.missing}`]});
    reel.parts[i]={id:r.id,file:r.file,attempt,check:{...verdict,shows:seen.json.shows,missing:seen.json.missing}};await save();
    if(verdict.pass){live.progress.done=i+1;break;}
    if(attempt>=2)throw new Error(`Part ${i+1} failed its check twice (${verdict.problems.join(', ')}). Stopped before spending more.`);
   }
  }
  const final=reel.parts[parts-1].file,seconds=await this.seconds(final);
  if(seconds<parts*PART_SECONDS-1)throw new Error(`The finished video is ${seconds.toFixed(1)} s, expected about ${parts*PART_SECONDS} s`);
  let voiceTrack=final;
  if(reel.voiceMode==='designed'){live.stage='Recording the voices';voiceTrack=await this.voiceOver(job,plan.script,kitSaved,craft,final,dir,keys,ledger);}
  live.stage='Editing the reel';const out=join(dir,'reel.mp4'),s=plan.script;
  const r=await this.render({clips:[final],voice:voiceTrack,groqKey:keys.groq,sayText:spokenText(s),hook:{text:s.hook_title,until:2.2},endCard:{title:kitSaved.kit.name,subtitle:'Follow for the next one'},out});
  live.progress.done=parts+1;const caption=discloseCaption(s.caption,kitSaved.format);
  // The studio score against this account's winners (the feedback loop's automatic half). A failed score is shown
  // on the reel, never hidden, and never stops a finished reel.
  live.stage='Scoring the reel';try{reel.score=await this.scoreReel(job,out,keys,ledger);}catch(e){reel.scoreError=e.message;}
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
  const {voices,people}=await this.channelVoices(job.id,kitSaved,keys,ledger),style=`${craftBrief(craft)?.voice?.split(/[.;]/)[0]||'confident and conversational'}, at a brisk, energetic social-media pace`;
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
 async scoreReel(job,file,keys,ledger){
  const cacheFile=join(this.dir(job.id),'winner-scores.json'),saved=await readJson(join(this.root,'secret',job.id,'secret.json'));
  const ids=(saved?.picked||[]).filter(p=>p.group==='winner'&&existsSync(videoPath(this.root,job.id,p.id))).sort((a,b)=>b.xNormal-a.xNormal).slice(0,2).map(p=>p.id);
  let cache=await readJson(cacheFile);
  if(!cache||cache.ids.join()!==ids.join()){cache={ids,scores:await Promise.all(ids.map(id=>this.judge(videoPath(this.root,job.id,id),keys,ledger)))};await writeJson(cacheFile,cache);}
  const ours=await this.judge(file,keys,ledger),v=await this.jev(verdictRequest(ours,cache.scores),keys.jev);
  return {...scoreSummary(ours,cache.scores.map(scoreTotal)),jev:v?.answers?.as_gripping?.score??null,gap:v?.answers?.main_gap?.choice??null,at:new Date().toISOString()};
 }
 // Kaan's one tap on a finished reel: 👍 or 👎 with reasons.
 async feedback(job,reelId,body){
  if(!/^[\w-]{1,120}$/.test(String(reelId)))throw new Error('Pick a reel');const file=join(this.dir(job.id),'reels',reelId,'reel.json'),reel=await readJson(file);if(!reel)throw new Error('Pick a reel');
  reel.feedback=validFeedback(body||{});await writeJson(file,reel);return reel;
 }
 async spendLedger(runId,entry){const f=join(this.dir(runId),'spend.json');this.ledger=(this.ledger||Promise.resolve()).catch(()=>{}).then(async()=>{const list=await readJson(f)||[];list.push({at:new Date().toISOString(),...entry});await writeJson(f,list);});return this.ledger;}
}
// The last seconds of a video (the new part of an extended clip), for its check. Free (local ffmpeg).
export async function cutEnd(input,out,from){await run('ffmpeg',['-v','error','-y','-ss',String(from),'-i',input,'-c:v','libx264','-preset','veryfast','-c:a','aac',out],{timeout:120000});return out;}

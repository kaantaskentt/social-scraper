// Builds the channel kit for one scan: study 3 winners, let Jev pick the format, write the kit, draw and check every
// reference picture. Studying is cached; pictures are cached by prompt and references, so "new character" only pays
// for the pictures that change. Every paid call goes into data/channels/<run>/spend.json, with a hard ceiling per build.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generate} from './gemini.mjs';
import {makeImage,IMAGE_MODEL} from './gemini-media.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {scrubPeople} from './secret.mjs';
import {videoPath} from './videos.mjs';
import {FORMATS,STUDY_SCHEMA,STUDY_PROMPT,winnerCounts,formatRequest,formatWhy,expertLook,castSize,KIT_SCHEMA,kitPrompt,checkKit,picturePlan,CHECK_SCHEMA,checkPrompt,checkVerdict,estimateKit} from './kit.mjs';
const exec=promisify(execFile);

const VERSION=1,ID=/^[\w-]{1,90}$/;
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex').slice(0,12);
const cents=n=>Math.round(n*10000)/10000;
// One still from a reel, to check our hosts do not look like the real creators. Free (local ffmpeg).
export async function grabFrame(video,out,at=1.5){await exec('ffmpeg',['-v','error','-ss',String(at),'-i',video,'-frames:v','1','-q:v','3','-y',out],{timeout:60000});return readFile(out);}

export class KitBuilder{
 constructor(root,keys,{gemini=generate,image=makeImage,jev=jevAsk,frame=grabFrame}={}){Object.assign(this,{root,keys,gemini,image,jev,frame});this.state=new Map();this.ledgers=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId,'kit');}
 spend(runId,entry){const file=join(this.root,'channels',runId,'spend.json');const next=(this.ledgers.get(runId)||Promise.resolve()).catch(()=>{}).then(async()=>{const list=await readJson(file)||[];list.push({at:new Date().toISOString(),...entry});await writeJson(file,list);});this.ledgers.set(runId,next);return next;}
 async status(job){
  const live=this.state.get(job.id),saved=await readJson(join(this.dir(job.id),'kit.json'));
  const worst=estimateKit('ai_host',2);
  return {state:live?.state==='working'?'working':saved?'done':live?.state||'none',stage:live?.stage||null,progress:live?.progress||null,error:live?.error||null,saved,formats:FORMATS,estimate:saved?estimateKit(saved.format,saved.cast):worst};
 }
 async approve(job){const file=join(this.dir(job.id),'kit.json'),saved=await readJson(file);if(!saved)throw new Error('Build the kit first');saved.approved=true;saved.approvedAt=new Date().toISOString();await writeJson(file,saved);return saved;}
 // redo: undefined (build), 'character' (new hosts, same format), 'format' (with `format`), 'pictures' (same kit,
 // only the flagged pictures are drawn again).
 async start(job,{redo,format}={}){
  if(this.state.get(job.id)?.state==='working')throw new Error('The kit is already being made');
  if(redo==='format'&&!FORMATS[format])throw new Error('Choose a format');if(redo&&!['character','format','pictures'].includes(redo))throw new Error('Unknown change');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');if(!keys.jev)throw new Error('Connect Jev first');
  const saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved)throw new Error('Find the Secret first');
  const previous=await readJson(join(this.dir(job.id),'kit.json'));if(redo&&!previous)throw new Error('Build the kit first');
  const live={state:'working',stage:'Starting',error:null,progress:{done:0,total:1}};this.state.set(job.id,live);
  this.run(job,saved,previous,keys,live,{redo,format}).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: the kit for ${job.id} stopped: ${e.message}`);});
  return {...live};
 }
 async run(job,saved,previous,keys,live,{redo,format:chosen}){
  const dir=this.dir(job.id);await mkdir(dir,{recursive:true});const tally={usd:0};let ceiling=Infinity;
  const paid=async(step,call)=>{try{const r=await call();tally.usd+=r.costUsd||0;await this.spend(job.id,{step,usd:r.costUsd||0});return r;}catch(e){if(e.costUsd){tally.usd+=e.costUsd;await this.spend(job.id,{step,usd:e.costUsd,failed:e.message});}throw e;}};
  const guard=next=>{if(tally.usd+next>ceiling+1e-9)throw new Error(`Stopped: the next picture would pass this build's limit of $${ceiling.toFixed(2)}`);};
  // 1 Study the three best reels that have a saved video (cached).
  const winners=saved.picked.filter(p=>p.group==='winner'&&existsSync(videoPath(this.root,job.id,p.id))).sort((a,b)=>b.xNormal-a.xNormal).slice(0,3);
  if(!winners.length)throw new Error('None of the best reels has a saved video to study');
  const studyFile=join(dir,'study.json');let study=await readJson(studyFile);
  if(study?.version!==VERSION||study.model!==MODELS.watch||study.ids.join()!==winners.map(w=>w.id).join()){
   const notes=[];for(const [i,w] of winners.entries()){live.stage=`Studying their best reel ${i+1} of ${winners.length}`;
    const bytes=await readFile(videoPath(this.root,job.id,w.id));const r=await paid('kit study',()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},{text:STUDY_PROMPT}],schema:STUDY_SCHEMA}));notes.push(scrubPeople(r.json));}
   study={version:VERSION,model:MODELS.watch,ids:winners.map(w=>w.id),notes};await writeJson(studyFile,study);
  }
  // 2 Decide the format: Kaan's switch wins; otherwise Jev (the same question is not asked twice).
  const counts=winnerCounts(saved);let format=chosen||(['character','pictures'].includes(redo)?previous.format:null),byJev=redo==='pictures'?previous.byJev:false;
  if(!format){live.stage='Choosing the format';const req=formatRequest(counts,study.notes,saved),key=hash(req),cache=await readJson(join(dir,'decision.json'));
   if(cache?.key===key)format=cache.format;else{const raw=await this.jev(req,keys.jev);format=raw?.answers?.format?.choice;if(!FORMATS[format])throw new Error(`Jev gave no usable format (${format})`);await writeJson(join(dir,'decision.json'),{key,format,at:new Date().toISOString()});}
   byJev=true;}
  const cast=castSize(format,counts),expert=expertLook(counts),{ceiling:limit}=estimateKit(format,cast);ceiling=limit;
  // 3 Write the kit; one rewrite if it does not fit the format.
  live.stage='Writing the kit';
  const avoid=redo==='character'?previous.kit.cast.map(p=>`${p.name}: ${p.look}; ${p.outfit}`).join(' | '):null;
  let prompt=kitPrompt({account:job.creator,format,cast,expert,study:study.notes,saved,avoid}),kit=redo==='pictures'?previous.kit:null;
  if(!kit)for(let attempt=0;;attempt++){kit=scrubPeople((await paid('kit write',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:prompt}],schema:KIT_SCHEMA}))).json);
   const problems=checkKit(kit,format,cast);if(!problems.length)break;if(attempt)throw new Error(`The kit did not fit the format twice: ${problems.join(', ')}`);prompt+=`\nYour last answer had problems, fix them: ${problems.join('; ')}.`;}
  // 4 Draw and check every picture in order. A picture with the same prompt and references is reused.
  const plan=picturePlan(kit,format),made={},pictures=[];live.progress={done:0,total:plan.length};
  let original=null;if(kit.cast?.length){try{original=await this.frame(videoPath(this.root,job.id,winners[0].id),join(dir,'original.jpg'));}catch(e){throw new Error(`Could not take a frame from their best reel: ${e.message}`);}}
  for(const item of plan){
   const refs=item.refs.map(r=>made[r]).filter(Boolean),key=hash([item.prompt,IMAGE_MODEL,...refs.map(r=>hash(r.data))]),file=`${item.role}-${key}.jpg`,record=join(dir,`${item.role}-${key}.json`);
   let done=await readJson(record);
   if(done?.check?.pass&&existsSync(join(dir,file))){made[item.role]={data:await readFile(join(dir,file)),mime:'image/jpeg'};}
   else{let extra='';done={attempts:0};
    for(;;){live.stage=`Drawing ${item.label}${done.attempts?' again':''}`;guard(0.07);
     const pic=await paid(`kit ${item.role}`,()=>this.image({key:keys.gemini,prompt:item.prompt+extra,refs,aspect:item.aspect}));done.attempts++;
     const faceRef=item.faceRef?made[item.faceRef]:null,orig=original&&(item.role.startsWith('face')||item.role==='scene')?original:null;
     const parts=[{image:pic.data},...(faceRef?[{image:faceRef.data}]:[]),...(orig?[{image:orig}]:[]),{text:checkPrompt({...item,prompt:item.prompt+extra},{hasFace:!!faceRef,hasOriginal:!!orig})}];
     live.stage=`Checking ${item.label}`;const seen=(await paid(`kit check ${item.role}`,()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts,schema:CHECK_SCHEMA}))).json;
     const verdict=checkVerdict(seen,item,{hasFace:!!faceRef,hasOriginal:!!orig});await writeFile(join(dir,file),pic.data);made[item.role]={data:pic.data,mime:'image/jpeg'};
     done={...done,check:{...verdict,shows:seen.shows}};
     if(verdict.pass||done.attempts>=2)break;extra=` Important: the last try had these problems, avoid them: ${verdict.problems.join('; ')}.`;}
    await writeJson(record,done);}
   pictures.push({role:item.role,label:item.label,file,url:`/channels/${job.id}/kit/${file}`,attempts:done.attempts,check:done.check});live.progress.done++;
  }
  // 5 Save. An earlier kit stays on disk under its own time, so nothing Kaan approved is lost.
  if(previous)await writeJson(join(dir,`kit-${String(previous.createdAt).replace(/[:.]/g,'-')}.json`),previous);
  const result={version:VERSION,runId:job.id,account:job.creator,createdAt:new Date().toISOString(),format,byJev,formatWhy:formatWhy(format,counts),cast,expert,kit,pictures,
   studied:winners.map(w=>w.id),costUsd:cents(tally.usd),approved:false};
  await writeJson(join(dir,'kit.json'),result);return result;
 }
}

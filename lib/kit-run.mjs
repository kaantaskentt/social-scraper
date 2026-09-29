// Builds the channel kit for one scan: study 3 winners, let Jev pick the format, write the kit, draw and check every
// reference picture. Studying is cached; pictures are cached by prompt and references, so "new character" only pays
// for the pictures that change. Every paid call goes into data/channels/<run>/spend.json, with a hard ceiling per build.
import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generate} from './gemini.mjs';
import {makeImage,IMAGE_MODEL} from './gemini-media.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {scrubPeople} from './secret.mjs';
import {recordSpend} from './dna-run.mjs';
import {videoPath} from './videos.mjs';
import {FORMATS,STUDY_SCHEMA,STUDY_PROMPT,winnerCounts,formatRequest,formatWhy,expertLook,castSize,KIT_SCHEMA,kitPrompt,checkKit,picturePlan,CHECK_SCHEMA,checkPrompt,checkVerdict,estimateKit,kitOptions,optionsRequest,pickBest} from './kit.mjs';
const exec=promisify(execFile);

const VERSION=1,ID=/^[\w-]{1,90}$/;
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex').slice(0,12);
const cents=n=>Math.round(n*10000)/10000;
// One still from a reel, to check our hosts do not look like the real creators. Free (local ffmpeg).
export async function grabFrame(video,out,at=1.5){await exec('ffmpeg',['-v','error','-ss',String(at),'-i',video,'-frames:v','1','-q:v','3','-y',out],{timeout:60000});return readFile(out);}

export class KitBuilder{
 constructor(root,keys,{gemini=generate,image=makeImage,jev=jevAsk,frame=grabFrame,ensureSecret=null}={}){Object.assign(this,{root,keys,ensureSecret,gemini,image,jev,frame});this.state=new Map();this.ledgers=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId,'kit');}
 // One queue per spend.json for every writer (kit, maker, planner, DNA), so parallel writes never lose entries (audit, 2026-09-29).
 spend(runId,entry){return recordSpend(join(this.root,'channels',runId,'spend.json'),entry);}
 async status(job){
  // The running state is read BEFORE the file: a build finishing in between could otherwise report "done" with the
  // old file (a flaky test caught it, 2026-09-28). The file is written before the state turns done.
  const live=this.state.get(job.id),now=live?{...live}:null,saved=await readJson(join(this.dir(job.id),'kit.json'));
  const worst=estimateKit('ai_host',2);
  // A failed build is shown as failed even when an earlier look is saved (it read "done" once, 2026-09-28).
  return {state:now?.state==='working'?'working':now?.state==='failed'?'failed':saved?'done':now?.state||'none',stage:now?.stage||null,progress:now?.progress||null,error:now?.error||null,saved,formats:FORMATS,estimate:saved?estimateKit(saved.format,saved.cast):worst};
 }
 async approve(job){const file=join(this.dir(job.id),'kit.json'),saved=await readJson(file);if(!saved)throw new Error('Build the kit first');if(saved.stage==='choose')throw new Error('Choose your host and place first');saved.approved=true;saved.approvedAt=new Date().toISOString();await writeJson(file,saved);return saved;}
 // redo: undefined (build), 'character' (new hosts, same format), 'format' (with `format`), 'pictures' (same kit,
 // only the flagged pictures are drawn again).
 async start(job,{redo,format}={}){
  if(this.state.get(job.id)?.state==='working')throw new Error('The kit is already being made');
  if(redo==='format'&&!FORMATS[format])throw new Error('Choose a format');if(redo&&!['character','format','pictures'].includes(redo))throw new Error('Unknown change');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');if(!keys.jev)throw new Error('Connect Jev first');
  // The look is designed from the Secret (who and where the winners are). Without one, it is built first as part of
  // this step, so the page goes straight from Winners to Look (Kaan, 2026-09-29).
  let saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved&&!this.ensureSecret)throw new Error('Find the Secret first');
  const previous=await readJson(join(this.dir(job.id),'kit.json'));if(redo&&!previous)throw new Error('Build the kit first');
  if(redo==='pictures'&&previous.stage==='choose')throw new Error('Choose your host and place first');
  const live={state:'working',stage:'Starting',error:null,progress:{done:0,total:1}};this.state.set(job.id,live);
  (async()=>{if(!saved){live.stage='Studying their winners';saved=await this.ensureSecret(job);}return this.run(job,saved,previous,keys,live,{redo,format});})().then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: the kit for ${job.id} stopped: ${e.message}`);});
  return {...live};
 }
 // choose: Kaan's (or Jev's) host and place option; then the full sheet is drawn for them.
 async choose(job,{cast=null,place=null}={}){
  if(this.state.get(job.id)?.state==='working')throw new Error('The kit is already being made');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');
  const kitSaved=await readJson(join(this.dir(job.id),'kit.json'));if(kitSaved?.stage!=='choose')throw new Error('There are no options to choose from');
  const o=kitSaved.options,c=cast??o.pick.cast?.index??0,p=place??o.pick.place?.index??0;
  if(o.casts.length&&!o.casts[c])throw new Error('Choose one of the host options');if(!o.places[p])throw new Error('Choose one of the places');
  const saved=await readJson(join(this.root,'secret',job.id,'secret.json'));
  const live={state:'working',stage:'Drawing your look',error:null,progress:{done:0,total:1}};this.state.set(job.id,live);
  const kit={...kitSaved.kit,cast:o.casts.length?o.casts[c].hosts.map(({picture,...h})=>h):[],place:o.places[p].text};
  this.finish(job,saved,kitSaved,kit,keys,live,{chose:{cast:o.casts.length?c:null,place:p}}).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: the kit for ${job.id} stopped: ${e.message}`);});
  return {...live};
 }
 ledger(job,tally){return async(step,call)=>{try{const r=await call();tally.usd+=r.costUsd||0;await this.spend(job.id,{step,usd:r.costUsd||0});return r;}catch(e){if(e.costUsd){tally.usd+=e.costUsd;await this.spend(job.id,{step,usd:e.costUsd,failed:e.message});}throw e;}};}
 // Draw and check pictures, up to three at once: a picture starts as soon as the pictures it builds on (its references
 // and its face) are made (drawn one after another, the six host and place options took most of the Look's time,
 // 2026-09-29). A picture with the same prompt and references is reused, whatever it was called before (an option face
 // becomes the chosen face without paying again). Pictures in flight count against the spending limit before they are
 // paid, so drawing side by side never passes it.
 async draw(job,items,{keys,live,paid,guard,original,made={},concurrency=3}){
  const dir=this.dir(job.id),pictures=new Array(items.length),have=new Map(),roles=new Set(items.map(i=>i.role)),started=new Map();
  for(const f of await readdir(dir).catch(()=>[])){const m=f.match(/^(.+)-([0-9a-f]{12})\.json$/);if(m)have.set(m[2],m[1]);}
  let slots=concurrency,inFlight=0;const waiting=[];
  const slot=async()=>{if(slots>0){slots--;return;}await new Promise(r=>waiting.push(r));};
  const free=()=>{const next=waiting.shift();if(next)next();else slots++;};
  const payOne=async(label,fn)=>{guard(0.07*(inFlight+1));inFlight++;try{return await fn();}finally{inFlight--;}};
  const one=async(item,index)=>{
   await null; // every picture is registered before any looks up what it builds on
   await Promise.all([...item.refs,item.faceRef].filter(r=>r&&r!==item.role&&roles.has(r)).map(r=>started.get(r)));
   await slot();try{
   const refs=item.refs.map(r=>made[r]).filter(Boolean),key=hash([item.prompt,IMAGE_MODEL,...refs.map(r=>hash(r.data))]),file=`${item.role}-${key}.jpg`,record=join(dir,`${item.role}-${key}.json`);
   let done=await readJson(record);
   if(!done&&have.has(key)){const old=have.get(key);const prev=await readJson(join(dir,`${old}-${key}.json`));if(prev?.check?.pass&&existsSync(join(dir,`${old}-${key}.jpg`))){await copyFile(join(dir,`${old}-${key}.jpg`),join(dir,file));await writeJson(record,prev);done=prev;}}
   if(done?.check?.pass&&existsSync(join(dir,file))){made[item.role]={data:await readFile(join(dir,file)),mime:'image/jpeg'};}
   else{let extra='';done={attempts:0};
    for(;;){live.stage=`Drawing ${item.label}${done.attempts?' again':''}`;
     // Google's image filter sometimes refuses a harmless prompt: one softer retry, then the gap is kept and flagged
     // instead of sinking the whole look (a porch scene was refused on 2026-09-28).
     let pic;try{pic=await payOne(item.label,()=>paid(`kit ${item.role}`,()=>this.image({key:keys.gemini,prompt:item.prompt+extra,refs,aspect:item.aspect})));}
     catch(e){if(!/blocked|safety|prohibited/i.test(e.message))throw e;done.attempts++;done.check={pass:false,problems:['the image filter refused it'],shows:''};
      if(done.attempts>=2){done.blocked=true;break;}extra=' Keep it simple, calm and family-friendly: an ordinary everyday moment.';continue;}
     done.attempts++;
     const faceRef=item.faceRef?made[item.faceRef]:null,orig=original&&(/face/.test(item.role)||item.role==='scene')?original:null;
     const parts=[{image:pic.data},...(faceRef?[{image:faceRef.data}]:[]),...(orig?[{image:orig}]:[]),{text:checkPrompt({...item,prompt:item.prompt+extra},{hasFace:!!faceRef,hasOriginal:!!orig})}];
     live.stage=`Checking ${item.label}`;const seen=(await paid(`kit check ${item.role}`,()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts,schema:CHECK_SCHEMA}))).json;
     const verdict=checkVerdict(seen,item,{hasFace:!!faceRef,hasOriginal:!!orig});await writeFile(join(dir,file),pic.data);made[item.role]={data:pic.data,mime:'image/jpeg'};
     done={...done,check:{...verdict,shows:seen.shows}};
     if(verdict.pass||done.attempts>=2)break;extra=` Important: the last try had these problems, avoid them: ${verdict.problems.join('; ')}.`;}
    if(!done.blocked)await writeJson(record,done);}
   pictures[index]={role:item.role,label:item.label,file:done.blocked?null:file,url:done.blocked?null:`/channels/${job.id}/kit/${file}`,attempts:done.attempts,check:done.check};live.progress.done++;
   }finally{free();}
  };
  items.forEach((item,index)=>started.set(item.role,one(item,index)));
  await Promise.all(started.values());
  return {pictures,made};
 }
 async originalFrame(job,saved){const w=saved.picked.filter(p=>p.group==='winner'&&existsSync(videoPath(this.root,job.id,p.id))).sort((a,b)=>b.xNormal-a.xNormal)[0];
  try{return await this.frame(videoPath(this.root,job.id,w.id),join(this.dir(job.id),'original.jpg'));}catch(e){throw new Error(`Could not take a frame from their best reel: ${e.message}`);}}
 // The three best reels with a saved video, each watched once (cached by their ids). The prep calls this right after
 // a scan; the Look's run finds it done.
 async study(job,saved,keys,{paid=this.ledger(job,{usd:0}),live={}}={}){
  const dir=this.dir(job.id);await mkdir(dir,{recursive:true});
  const winners=saved.picked.filter(p=>p.group==='winner'&&existsSync(videoPath(this.root,job.id,p.id))).sort((a,b)=>b.xNormal-a.xNormal).slice(0,3);
  if(!winners.length)throw new Error('None of the best reels has a saved video to study');
  const studyFile=join(dir,'study.json');let study=await readJson(studyFile);
  if(study?.version!==VERSION||study.model!==MODELS.watch||study.ids.join()!==winners.map(w=>w.id).join()){
   const notes=await Promise.all(winners.map(async(w,i)=>{live.stage=`Studying their best reels`;
    const bytes=await readFile(videoPath(this.root,job.id,w.id));const r=await paid('kit study',()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},{text:STUDY_PROMPT}],schema:STUDY_SCHEMA}));return scrubPeople(r.json);}));
   study={version:VERSION,model:MODELS.watch,ids:winners.map(w=>w.id),notes};await writeJson(studyFile,study);
  }
  return study;
 }
 async run(job,saved,previous,keys,live,{redo,format:chosen}){
  const dir=this.dir(job.id);await mkdir(dir,{recursive:true});const tally={usd:0},paid=this.ledger(job,tally);
  // "Draw the flagged again": same kit text, same choice, only failed pictures are paid again.
  if(redo==='pictures')return this.finish(job,saved,previous,previous.kit,keys,live,{chose:previous.chose,tally});
  // 1 Study the three best reels that have a saved video (cached; usually done ahead by the prep after the scan).
  const study=await this.study(job,saved,keys,{paid,live});
  // 2 Decide the format: Kaan's switch wins; otherwise Jev (the same question is not asked twice).
  const counts=winnerCounts(saved);let format=chosen||(redo==='character'?previous.format:null),byJev=false;
  if(!format){live.stage='Choosing the format';const req=formatRequest(counts,study.notes,saved),key=hash(req),cache=await readJson(join(dir,'decision.json'));
   if(cache?.key===key)format=cache.format;else{const raw=await this.jev(req,keys.jev);format=raw?.answers?.format?.choice;if(!FORMATS[format])throw new Error(`Jev gave no usable format (${format})`);await writeJson(join(dir,'decision.json'),{key,format,at:new Date().toISOString()});}
   byJev=true;}
  const cast=castSize(format,counts),expert=expertLook(counts),{ceiling}=estimateKit(format,cast);
  const guard=next=>{if(tally.usd+next>ceiling+1e-9)throw new Error(`Stopped: the next picture would pass this build's limit of $${ceiling.toFixed(2)}`);};
  // 3 Write the kit with its options; one rewrite if it does not fit the format.
  live.stage='Writing the look';
  const avoid=redo==='character'?(previous.options?.casts||[{hosts:previous.kit.cast}]).flatMap(c=>c.hosts||[]).map(p=>`${p.name}: ${p.look}; ${p.outfit}`).join(' | '):null;
  let prompt=kitPrompt({account:job.creator,format,cast,expert,study:study.notes,saved,avoid}),kit;
  for(let attempt=0;;attempt++){kit=scrubPeople((await paid('kit write',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:prompt}],schema:KIT_SCHEMA}))).json);
   // Only the main hosts must pass; an alternative host option that does not is set aside (with 3 options of 2 hosts, one
   // vague outfit among six failed the whole look twice, @liangsvitality 2026-09-29).
   kit.alt_casts=(kit.alt_casts||[]).filter(c=>!checkKit({...kit,cast:c},format,cast).length);
   const problems=checkKit(kit,format,cast);if(!problems.length)break;if(attempt)throw new Error(`The kit did not fit the format twice: ${problems.join(', ')}`);prompt+=`\nYour last answer had problems, fix them: ${problems.join('; ')}.`;}
  // 4 Options: a face for every host option and a picture of every place option, each checked; Jev scores them.
  const {casts,places}=kitOptions(kit,format,cast),items=[];
  casts.forEach((c,i)=>picturePlan({...kit,cast:c},format).filter(it=>/^face/.test(it.role)).forEach(it=>items.push({...it,role:`opt${i}-${it.role}`,label:`option ${i+1}: ${it.label}`})));
  places.forEach((pl,i)=>{const it=picturePlan({...kit,cast:[],place:pl},format).find(x=>x.role==='place');items.push({...it,role:`opt${i}-place`,label:`place option ${i+1}`});});
  live.progress={done:0,total:items.length};
  const original=casts.length?await this.originalFrame(job,saved):null;
  const {pictures}=await this.draw(job,items,{keys,live,paid,guard,original});const pic=role=>pictures.find(p=>p.role===role);
  const castOpts=casts.map((c,i)=>({hosts:c.map((h,k)=>({...h,picture:pic(`opt${i}-face${k}`)})),}));
  const placeOpts=places.map((t,i)=>({text:t,picture:pic(`opt${i}-place`)}));
  live.stage='Jev is comparing the options';
  const brief={name:kit.name,promise:kit.promise,winners_person:saved.secret?.person?.text,winners_place:saved.secret?.setting?.text,headline:saved.secret?.headline};
  const raw=await this.jev(optionsRequest(kit,brief,castOpts.map(c=>c.hosts.map(h=>({...h,picture:h.picture?.check?.shows}))),placeOpts.map(p=>({text:p.text,picture:p.picture?.check?.shows}))),keys.jev),a=raw?.answers||{};
  castOpts.forEach((c,i)=>{c.score=a[`cast_${i}`]?.score??null;});placeOpts.forEach((p,i)=>{p.score=a[`place_${i}`]?.score??null;});
  const pick={cast:castOpts.length?pickBest(castOpts.map(c=>c.score),castOpts.map(c=>c.hosts.every(h=>h.picture?.check?.pass))):null,place:pickBest(placeOpts.map(p=>p.score),placeOpts.map(p=>p.picture?.check?.pass))};
  if(previous)await writeJson(join(dir,`kit-${String(previous.createdAt).replace(/[:.]/g,'-')}.json`),previous);
  const result={version:VERSION,stage:'choose',runId:job.id,account:job.creator,createdAt:new Date().toISOString(),format,byJev,formatWhy:formatWhy(format,counts),cast,expert,kit,
   options:{casts:castOpts,places:placeOpts,pick},pictures:[],studied:study.ids,costUsd:cents(tally.usd),approved:false};
  await writeJson(join(dir,'kit.json'),result);return result;
 }
 // 5 The full sheet for the chosen host and place (the option pictures are reused), then saved as ready to use.
 async finish(job,saved,kitSaved,kit,keys,live,{chose,tally={usd:0}}){
  const paid=this.ledger(job,tally),{ceiling}=estimateKit(kitSaved.format,kitSaved.cast);
  const guard=next=>{if(tally.usd+next>ceiling+1e-9)throw new Error(`Stopped: the next picture would pass this build's limit of $${ceiling.toFixed(2)}`);};
  const plan=picturePlan(kit,kitSaved.format);live.progress={done:0,total:plan.length};
  const original=kit.cast?.length?await this.originalFrame(job,saved):null;
  const {pictures}=await this.draw(job,plan,{keys,live,paid,guard,original});
  const result={...kitSaved,stage:'ready',kit,chose,pictures,costUsd:cents((kitSaved.costUsd||0)+tally.usd),approved:false,readyAt:new Date().toISOString()};
  await writeJson(join(this.dir(job.id),'kit.json'),result);return result;
 }
}

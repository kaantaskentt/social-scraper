// Runs the Channel Secret for one scan: watch, label, compare, write. Every paid step is cached on disk
// (data/secret/<run>/), so a stop halfway never pays for the same reel twice, and every cent spent is written to a
// ledger (spend.json), including answers that came back unusable. Spec: docs/superpowers/specs/2026-09-27-channel-secret.md
// Known limit: if the app stops while a reel is being watched, that one reel (about a cent) is watched again next time.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {scrubPeople,pickReels,WATCH_PROMPT,WATCH_SCHEMA,labelRequest,readLabels,compare,WRITE_SCHEMA,writePrompt,checkEvidence,estimate} from './secret.mjs';
import {generate} from './gemini.mjs';
import {request,auth} from './providers.mjs';
import {videoPath} from './videos.mjs';
import {shotsFor} from './shotlist.mjs';
import {dimensions} from './schema.mjs';
import {LABELS} from '../public/secret-labels.mjs';

// What was SAID comes free from the scan's own labels (Jev read every transcript); song-only and silent reels are "unclear".
const SAID=['mechanism','opening','structure','evidence','emotion','specificity','cta'];
const saidLabels=post=>Object.fromEntries(SAID.map(k=>[`said_${k}`,post.analysis&&!post.excludedReason?post.analysis.labels?.[k]?.value||'unclear':'unclear']));
// Plain names for every label, sent with the stats so the page never guesses what a value means.
export function labelNames(){
 const names=Object.fromEntries(Object.entries(LABELS).map(([k,[q,c]])=>[k,{title:q,values:c}]));
 for(const k of SAID)names[`said_${k}`]={title:`What they say · ${dimensions[k].title}`,values:dimensions[k].question.criteria};
 return names;
}

export const MODELS={watch:'gemini-3.8-flash',label:'jev-latest',write:'gemini-3.1-pro-preview'};
const VERSION=1, ID=/^[\w-]{1,90}$/;
async function jevAsk(req,key){return (await request('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{...auth(key),'Content-Type':'application/json'},body:JSON.stringify(req)},{service:'Jev'})).json();}
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const firstWords=(t,n=30)=>String(t||'').trim().split(/\s+/).slice(0,n).join(' ');
const cents=n=>Math.round(n*10000)/10000;

export class SecretBuilder{
 constructor(root,keys,{gemini=generate,jev=jevAsk,shots=shotsFor,concurrency=3}={}){this.root=root;this.keys=keys;this.gemini=gemini;this.jev=jev;this.shots=shots;this.concurrency=concurrency;this.state=new Map();this.ledgers=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'secret',runId);}
 picked(job,results){return pickReels(job.posts,results,{hasVideo:p=>existsSync(videoPath(this.root,job.id,p.id))});}
 // Spend ledger: one line per paid call, written in order.
 spend(runId,entry){const file=join(this.dir(runId),'spend.json');const next=(this.ledgers.get(runId)||Promise.resolve()).catch(()=>{}).then(async()=>{const list=await readJson(file)||[];list.push({at:new Date().toISOString(),...entry});await writeJson(file,list);return list;});this.ledgers.set(runId,next);return next;}
 async spentAllTime(runId){await this.ledgers.get(runId)?.catch(()=>{});return cents((await readJson(join(this.dir(runId),'spend.json'))||[]).reduce((s,x)=>s+(x.usd||0),0));}
 // What the page shows before anything is paid: the saved secret, the build in progress, or an estimate.
 async status(job,results){
  const live=this.state.get(job.id);if(live?.state==='building')return {...live};
  const saved=await readJson(join(this.dir(job.id),'secret.json'));
  let plan=null;try{const {winners,flops}=this.picked(job,results);plan={...estimate([...winners,...flops]),winners:winners.length,flops:flops.length};}catch(e){plan={error:e.message};}
  return {state:saved?'done':live?.state||'none',error:live?.error||null,saved,plan};
 }
 // A new build picks the reels; "write it again" reuses exactly the saved reels, so only the write-up is paid.
 async start(job,results,{rewrite=false}={}){
  if(this.state.get(job.id)?.state==='building')throw new Error('The Secret is already being built for this run');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');if(!keys.jev)throw new Error('Connect Jev first');
  let reels;
  if(rewrite){const saved=await readJson(join(this.dir(job.id),'secret.json'));if(!saved)throw new Error('Nothing to write again yet: build the Secret first');
   reels=saved.picked.map(p=>({id:p.id,group:p.group,xNormal:p.xNormal,seconds:job.posts.find(x=>x.id===p.id)?.duration??null}));}
  else{const {winners,flops}=this.picked(job,results);reels=[...winners,...flops];}
  if(this.state.get(job.id)?.state==='building')throw new Error('The Secret is already being built for this run');
  const live={state:'building',stage:rewrite?'Writing the page':'Checking your Gemini key',done:0,total:reels.length,error:null};this.state.set(job.id,live);
  this.run(job,reels,keys,live,{rewrite}).catch(e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: Secret for ${job.id} failed: ${e.message}`);});
  return {...live};
 }
 // Every paid call goes through here, so its cost reaches the ledger even when the answer is unusable.
 async paid(runId,step,id,call,tally){
  try{const r=await call();const usd=r.costUsd||0;tally.usd+=usd;await this.spend(runId,{step,id,usd});return r;}
  catch(e){if(e.costUsd){tally.usd+=e.costUsd;await this.spend(runId,{step,id,usd:e.costUsd,failed:e.message});}throw e;}
 }
 async run(job,reels,keys,live,{rewrite=false}={}){
  const began=Date.now(),dir=this.dir(job.id);await mkdir(join(dir,'reels'),{recursive:true});const tally={usd:0};let cursor=0;const items=[];
  // A tiny call to the writing model first: a key without billing fails here, before any video is sent.
  if(!rewrite){await this.paid(job.id,'key check',null,()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:'Reply with {"ok":true}.'}],schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}}),tally);live.stage='Watching reels';}
  const one=async pick=>{
   const post=job.posts.find(p=>p.id===pick.id),file=join(dir,'reels',`${pick.id}.json`),video=videoPath(this.root,job.id,pick.id);
   const info=await stat(video),videoKey=`${info.size}-${Math.round(info.mtimeMs)}`;let item=await readJson(file);
   if(item?.version!==VERSION||item.watchModel!==MODELS.watch||item.videoKey!==videoKey){
    const bytes=await readFile(video);
    const seen=await this.paid(job.id,'watch',pick.id,()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},{text:`${WATCH_PROMPT} Length: ${Math.round(pick.seconds||0)} seconds.`}],schema:WATCH_SCHEMA}),tally);
    item={version:VERSION,id:pick.id,watchModel:MODELS.watch,videoKey,description:seen.json};await writeJson(file,item);
   }
   const spoken=post.status==='music'?'(song lyrics only)':post.excludedReason?'(no speech)':firstWords(post.transcript?.text);
   const words=post.status==='music'||post.excludedReason?'':firstWords(post.transcript?.text,150);
   const req=labelRequest(item.description,spoken,words),key=hash(req);
   if(item.labelKey!==key){const l=await this.paid(job.id,'label',pick.id,async()=>readLabels(await this.jev(req,keys.jev),req),tally);Object.assign(item,{labels:l.labels,labelKey:key});await writeJson(file,item);}
   let secondsPerShot=null;try{const s=await this.shots(this.root,job,pick.id);secondsPerShot=s.duration/Math.max(1,s.shots.length);}catch{}
   items.push({...pick,spoken,description:item.description,labels:{...item.labels,...saidLabels(post)},secondsPerShot,likesPer1k:Number.isFinite(post.likes)&&post.likes>=0&&(post.plays||post.views)>0?post.likes/(post.plays||post.views)*1000:null});live.done++;
  };
  // On the first error no new reel starts, and the run only reports "failed" once the reels already being watched
  // have finished, so a quick retry can never pay for the same reel twice.
  let failure=null;const worker=async()=>{while(!failure&&cursor<reels.length){try{await one(reels[cursor++]);}catch(e){failure??=e;}}};
  await Promise.all(Array.from({length:Math.min(this.concurrency,reels.length)},worker));if(failure)throw failure;
  live.stage='Comparing winners and weakest';const order=new Map(reels.map((r,i)=>[r.id,i]));items.sort((a,b)=>order.get(a.id)-order.get(b.id));
  const stats={...compare(items),names:labelNames()};
  live.stage='Writing the page';
  const compact=items.map(i=>({id:i.id,group:i.group,xNormal:Math.round(i.xNormal*10)/10,seconds:i.seconds&&Math.round(i.seconds),secondsPerShot:i.secondsPerShot&&Math.round(i.secondsPerShot*10)/10,labels:i.labels,spoken_opening:i.spoken,seen:scrubPeople(i.description)}));
  const written=await this.paid(job.id,'write',null,()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:writePrompt({account:job.creator,stats,reels:compact})}],schema:WRITE_SCHEMA,thinking:'low'}),tally);
  const {secret,dropped,droppedWhy}=checkEvidence(written.json,new Set(items.map(i=>i.id)),stats);
  const result={version:VERSION,runId:job.id,account:job.creator,createdAt:new Date().toISOString(),models:MODELS,
   picked:items.map(i=>({id:i.id,group:i.group,xNormal:i.xNormal,labels:i.labels})),stats,secret,dropped,droppedWhy,written:written.json,costUsd:cents(tally.usd),spentAllTime:await this.spentAllTime(job.id),elapsedMs:Date.now()-began};
  await writeJson(join(dir,'secret.json'),result);Object.assign(live,{state:'done',stage:'Done'});return result;
 }
}

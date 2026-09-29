// Builds a channel's Winner DNA: Gemini describes every scored reel with a saved video (cached per reel), then code
// tests each detail against the reel's times-its-normal and runs the hold-out test. Saved in
// data/channels/<run>/dna.json; every paid call goes into data/channels/<run>/spend.json.
import {mkdir,readFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {generate} from './gemini.mjs';
import {MODELS} from './secret-run.mjs';
import {videoPath} from './videos.mjs';
import {score,LATEST} from '../public/money/index.mjs';
import {DNA_VERSION,DNA_SCHEMA,dnaPrompt,analyse,validate,lengthBand,dnaDetails} from './dna.mjs';

const ID=/^[\w-]{1,90}$/,PER_REEL=0.006; // measured: $0.38 for 79 reels on 2026-09-28
// One queue per spend.json for the whole process: the maker, the planner and this builder each kept their own queue,
// so two of them could read the same list and the second save dropped the first one's paid entry (audit, 2026-09-29).
const spendQueues=new Map();
export function recordSpend(path,entry){const file=resolve(path),next=(spendQueues.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{const list=await readJson(file)||[];list.push({at:new Date().toISOString(),...entry});await writeJson(file,list);});spendQueues.set(file,next);return next;}

export class DnaBuilder{
 constructor(root,keys,{gemini=generate,concurrency=4,stats={analyse,validate},scoreRun=job=>score(job,LATEST).results}={}){Object.assign(this,{root,keys,gemini,concurrency,stats,scoreRun});this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 spend(runId,entry){return recordSpend(join(this.dir(runId),'spend.json'),entry);}
 // Reels that can be used: scored against the creator's normal (not "insufficient") and with a saved video.
 usable(job){const results=this.scoreRun(job);return job.posts.filter(p=>{const r=results[p.id];return r&&r.quadrant!=='insufficient'&&Number.isFinite(r.xNormal)&&r.xNormal>0&&existsSync(videoPath(this.root,job.id,p.id));}).map(p=>({post:p,xNormal:results[p.id].xNormal}));}
 async status(job){
  const live=this.state.get(job.id),now=live?{...live}:null,saved=await readJson(join(this.dir(job.id),'dna.json'));let reels=0;try{reels=this.usable(job).length;}catch{}
  // For the page: the details worth showing (mirror halves dropped) and those with no effect either way. A detail has no
  // effect only when none of its values has evidence: "voice style" was listed as no effect next to a proven calm voice
  // (audit, 2026-09-29).
  const hit=new Set(saved?.details.filter(d=>d.evidence!=='none').map(d=>d.detail));
  const view=saved?{shown:dnaDetails(saved),noEffect:[...new Set(saved.details.map(d=>d.detail))].filter(k=>!hit.has(k))}:null;
  return {state:now?.state==='working'?'working':now?.state==='failed'?'failed':saved?'done':'none',stage:now?.stage||null,done:now?.done||0,total:now?.total||0,error:now?.error||null,saved,view,estimate:{reels,usd:Math.round(reels*PER_REEL*100)/100}};
 }
 async start(job){
  if(this.state.get(job.id)?.state==='working')throw new Error('The Winner DNA is already being found');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');
  const reels=this.usable(job);if(reels.length<30)throw new Error(`Only ${reels.length} reels have a score and a saved video; the Winner DNA needs at least 30`);
  const live={state:'working',stage:'Watching the reels',done:0,total:reels.length,error:null};this.state.set(job.id,live);
  this.run(job,reels,keys,live).then(()=>Object.assign(live,{state:'done',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: Winner DNA for ${job.id} stopped: ${e.message}`);});
  return {...live};
 }
 async run(job,reels,keys,live){
  const dir=join(this.dir(job.id),'dna');await mkdir(dir,{recursive:true});let usd=0,cursor=0,failure=null;const items=[];
  const one=async({post,xNormal})=>{
   const file=join(dir,`${post.id}.json`);let item=await readJson(file);
   if(item?.version!==DNA_VERSION||item.model!==MODELS.watch){
    const bytes=await readFile(videoPath(this.root,job.id,post.id)),spoken=post.status==='music'||post.excludedReason?'':post.transcript?.text;
    let r;try{r=await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},{text:dnaPrompt(spoken)}],schema:DNA_SCHEMA});}
    catch(e){if(e.costUsd){usd+=e.costUsd;await this.spend(job.id,{step:'dna watch',usd:e.costUsd,failed:e.message});}throw e;}
    usd+=r.costUsd||0;await this.spend(job.id,{step:'dna watch',usd:r.costUsd||0});
    item={version:DNA_VERSION,model:MODELS.watch,id:post.id,labels:r.json};await writeJson(file,item);
   }
   items.push({id:post.id,xNormal,labels:{...item.labels,length:lengthBand(post.duration)}});live.done++;
  };
  // On the first error no new reel starts; reels already being watched finish, so nothing is paid twice on a retry.
  const worker=async()=>{while(!failure&&cursor<reels.length){try{await one(reels[cursor++]);}catch(e){failure??=e;}}};
  await Promise.all(Array.from({length:Math.min(this.concurrency,reels.length)},worker));if(failure)throw failure;
  live.stage='Testing every detail against their normal';const order=new Map(reels.map((r,i)=>[r.post.id,i]));items.sort((a,b)=>order.get(a.id)-order.get(b.id));
  const details=this.stats.analyse(items),validation=this.stats.validate(items);
  const result={version:DNA_VERSION,runId:job.id,account:job.creator,createdAt:new Date().toISOString(),reels:items.length,details,validation,
   labels:items.map(i=>({id:i.id,xNormal:Math.round(i.xNormal*100)/100,labels:i.labels})),costUsd:Math.round(usd*10000)/10000};
  await writeJson(join(this.dir(job.id),'dna.json'),result);return result;
 }
}

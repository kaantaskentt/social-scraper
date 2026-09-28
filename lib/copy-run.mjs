// The copy studio: pick a channel's five most copyable winners (code + Jev), write each copy from the original's own
// timed words (code), make all five at once with our hosts (the maker, each part checked against the original's shots
// and filmed again once if off), then compare each copy with its original side by side (Gemini watches, code decides).
// Saved in data/channels/<run>/copies/; stage times learned in data/experiments/stage-times.json.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {DnaBuilder} from './dna-run.mjs';
import {videoPath} from './videos.mjs';
import {voiceModeOf} from './decide.mjs';
import {discloseCaption,partUsd} from './kit-reel.mjs';
import {copyCandidates,copyableRequest,pickCopies,copyScript,wordsKept,copyPrice,plainError,COPY_MAX_PARTS,stageKey,plannedStages,progressOf,learnStage,FIDELITY_SCHEMA,fidelityPrompt,fidelityScore,fidelityVerdict} from './copy.mjs';
import {PART_SECONDS} from './kit-reel.mjs';

const ID=/^[\w-]{1,90}$/,END_CARD=2.5;
async function readJson(f){try{return JSON.parse(await readFile(f,'utf8'));}catch{return null;}}
async function writeJson(f,v){const t=`${f}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v,null,1));await rename(t,f);}
export const partsFor=seconds=>Math.min(COPY_MAX_PARTS,Math.max(1,Math.ceil((Math.min(seconds,COPY_MAX_PARTS*PART_SECONDS)-0.5)/PART_SECONDS)));
// Who plays whom: for every beat of the original, which of our hosts acts or speaks, and the action with our names.
export const CAST_SCHEMA={type:'object',required:['beats'],properties:{beats:{type:'array',items:{type:'object',required:['who','does'],properties:{who:{type:'string'},does:{type:'string'}}}}}};
export const castPrompt=(beats,kit)=>`We are copying a reel shot for shot with our own hosts in our own place. Our hosts: ${JSON.stringify((kit.cast||[]).map(h=>({name:h.name,look:h.look,role:h.role})))}. Our place: ${kit.place}.
For EACH beat of the original below, in the same order, give: "who" = the name of our host who plays the person acting or speaking in that beat (match the original's man or woman to our host who fits), or "voice" when nobody is on camera; "does" = the original's action rewritten with our host's name and our place, changing NOTHING else (same action, same objects, same food, same result, same framing).
The original's beats:\n${beats.map((b,i)=>`${i+1}. ${b.shot}; ${b.happens}`).join('\n')}`;

export class CopyStudio{
 constructor(root,keys,{planner,maker,gemini=generate,jev=jevAsk,concurrency=5,tick=500}={}){Object.assign(this,{root,keys,planner,maker,gemini,jev,concurrency,tick});this.picking=new Map();this.batches=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId,'copies');}
 learnedFile(){return join(this.root,'experiments','stage-times.json');}
 ledger(runId,step,usd){return this.maker.spendLedger(runId,{step,usd:usd||0});}
 // The channel's reels with a score and a saved video, as the picker needs them.
 reels(job){return new DnaBuilder(this.root,()=>({})).usable(job).map(r=>({id:r.post.id,xNormal:r.xNormal,seconds:r.post.duration||0,plays:r.post.plays??r.post.views??null,text:r.post.status==='music'?'':r.post.transcript?.text||''}));}

 // Step 1 (a few cents): the candidates' shot-by-shot breakdowns (cached) and Jev's "can we copy this?", then five.
 async pickStart(job){
  if(this.picking.get(job.id)?.state==='working')throw new Error('Already picking');
  const keys=this.keys();if(!keys.gemini||!keys.jev)throw new Error('Connect Gemini and Jev first');
  const kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
  const live={state:'working',stage:'Finding the winners worth copying',error:null};this.picking.set(job.id,live);
  (async()=>{
   const cands=copyCandidates(this.reels(job));if(!cands.length)throw new Error('No winner short enough to copy (50 seconds at most) with speech');
   live.stage=`Studying ${cands.length} winners shot by shot`;const breakdowns=await Promise.all(cands.map(c=>this.planner.breakdown(job,c.id,keys)));
   live.stage='Jev is judging which ones copy well';const judgments=await Promise.all(breakdowns.map(b=>this.jev(copyableRequest(b.breakdown,kit.kit),keys.jev)));
   const picks=pickCopies(cands,judgments).map(p=>({id:p.id,xNormal:p.xNormal,seconds:p.seconds,plays:p.plays,repeats:p.repeats,copyable:p.copyable,why:p.why,opening:p.text.split(/\s+/).slice(0,12).join(' '),parts:partsFor(p.seconds),usd:copyPrice(partsFor(p.seconds))}));
   await mkdir(this.dir(job.id),{recursive:true});await writeJson(join(this.dir(job.id),'picks.json'),{createdAt:new Date().toISOString(),kitAt:kit.createdAt,picks,skipped:cands.length-picks.length});
   Object.assign(live,{state:'done',stage:null});
  })().catch(e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: picking copies for ${job.id} failed: ${e.message}`);});
  return {...live};
 }

 // Step 2: make the chosen copies, all at once. confirmUsd is the total the person saw and confirmed.
 async start(job,{ids,confirmUsd}){
  if(this.batches.get(job.id)?.items.some(i=>i.state==='working'))throw new Error('Copies are already being made');
  const keys=this.keys();for(const [k,n] of [['gemini','Gemini'],['jev','Jev'],['groq','Groq']])if(!keys[k])throw new Error(`Connect ${n} first`);
  const kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
  const saved=await readJson(join(this.dir(job.id),'picks.json'));if(!saved?.picks?.length)throw new Error('Pick the winners to copy first');
  const chosen=(ids||[]).map(id=>saved.picks.find(p=>p.id===id));if(!chosen.length||chosen.some(p=>!p)||chosen.length>5)throw new Error('Choose 1 to 5 of the picked winners');
  const usd=Math.round(chosen.reduce((a,p)=>a+p.usd,0)*100)/100;if(!Number.isFinite(confirmUsd)||Math.abs(confirmUsd-usd)>0.01)throw new Error(`Confirm the price first ($${usd.toFixed(2)})`);
  const voice=await this.planner.voiceDecision(job.id,kit),voiceMode=voiceModeOf(voice),learned=await readJson(this.learnedFile())||{};
  const batch={id:randomUUID(),createdAt:new Date().toISOString(),kitAt:kit.createdAt,voiceMode,usd,items:chosen.map(p=>({postId:p.id,parts:p.parts,usd:p.usd,reelId:`copy-${p.id}-${createHash('sha1').update(randomUUID()).digest('hex').slice(0,6)}`,state:'waiting',stage:'Waiting',stageAt:Date.now(),pointer:0,error:null}))};
  batch.items.forEach(i=>{i.planned=plannedStages(i.parts,voiceMode,learned);});this.batches.set(job.id,batch);await this.saveBatch(job.id,batch);
  // Designed voices are made once before the five run side by side, so five copies never design them five times.
  if(voiceMode==='designed')await this.maker.channelVoices(job.id,kit,keys,e=>this.maker.spendLedger(job.id,e));
  let cursor=0;const worker=async()=>{while(cursor<batch.items.length){const item=batch.items[cursor++];await this.runItem(job,batch,item,kit,keys,voice,voiceMode).catch(e=>{Object.assign(item,{state:'failed',error:e.message,finishedAt:new Date().toISOString()});console.error(`Social Scraper: copy of ${item.postId} stopped: ${e.message}`);});await this.saveBatch(job.id,batch);}};
  Promise.all(Array.from({length:Math.min(this.concurrency,batch.items.length)},worker)).then(()=>this.saveBatch(job.id,batch));
  return this.status(job);
 }
 // Try failed copies again inside the same batch. Parts already filmed and checked are kept (the maker skips them),
 // so only the parts still to film are paid; confirmUsd is that total.
 async retry(job,{ids,confirmUsd}){
  const batch=this.batches.get(job.id)||await readJson(join(this.dir(job.id),'batch.json'));if(!batch)throw new Error('Nothing to try again');
  if(batch.items.some(i=>i.state==='working'))throw new Error('Copies are still being made');
  const items=(ids||[]).map(id=>batch.items.find(i=>i.postId===id&&['failed','stopped'].includes(i.state)));if(!items.length||items.some(i=>!i))throw new Error('Choose copies that failed');
  const keys=this.keys(),kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
  for(const it of items){it.parts=Math.min(it.parts,COPY_MAX_PARTS);it.usd=await this.remainingUsd(job.id,it);}
  const usd=Math.round(items.reduce((a,i)=>a+i.usd,0)*100)/100;if(!Number.isFinite(confirmUsd)||Math.abs(confirmUsd-usd)>0.01)throw new Error(`Confirm the price first ($${usd.toFixed(2)})`);
  const voice=await this.planner.voiceDecision(job.id,kit),learned=await readJson(this.learnedFile())||{};
  for(const it of items)Object.assign(it,{state:'waiting',stage:'Waiting',stageAt:Date.now(),pointer:0,error:null,planned:plannedStages(it.parts,batch.voiceMode,learned)});
  this.batches.set(job.id,batch);await this.saveBatch(job.id,batch);
  Promise.all(items.map(it=>this.runItem(job,batch,it,kit,keys,voice,batch.voiceMode).catch(e=>{Object.assign(it,{state:'failed',error:e.message,finishedAt:new Date().toISOString()});}).then(()=>this.saveBatch(job.id,batch))));
  return this.status(job);
 }
 // The price of the parts a copy still has to film.
 async remainingUsd(runId,item){
  const reel=await readJson(join(this.maker.dir(runId),'reels',item.reelId,'reel.json'));
  return Math.round(Array.from({length:item.parts},(_,i)=>reel?.parts?.[i]?.check?.pass?0:partUsd(i)).reduce((a,b)=>a+b,0)*100)/100;
 }
 // A stage change moves the item's pointer through its planned stages (a retry stays put) and teaches the ETA.
 async setStage(item,stage){
  if(!stage||stage===item.stage)return;const now=Date.now(),prev=stageKey(item.stage);
  if(prev&&item.state==='working'){const learned=await readJson(this.learnedFile())||{};await mkdir(join(this.root,'experiments'),{recursive:true});await writeJson(this.learnedFile(),learnStage(learned,prev,(now-item.stageAt)/1000));}
  const key=stageKey(stage),part=Number(String(stage).match(/part (\d+)/)?.[1])||undefined;
  const j=item.planned.findIndex((s,i)=>i>=item.pointer&&s.key===key&&(s.part===undefined||s.part===part));if(j>=0)item.pointer=j;
  Object.assign(item,{stage,stageAt:now});
 }
 async runItem(job,batch,item,kit,keys,voice,voiceMode){
  item.state='working';item.startedAt=new Date().toISOString();const post=job.posts.find(p=>p.id===item.postId);
  await this.setStage(item,'Studying the reel');const {breakdown}=await this.planner.breakdown(job,item.postId,keys);
  await this.setStage(item,'Writing the copy');
  const cast=await this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:castPrompt(breakdown.beats,kit.kit)}],schema:CAST_SCHEMA,thinking:'low'});await this.ledger(job.id,'copy cast',cast.costUsd);
  const names=new Set([...(kit.kit.cast||[]).map(h=>h.name),'voice']),first=(kit.kit.cast||[])[0]?.name||'voice';
  if(cast.json.beats.length!==breakdown.beats.length)throw new Error(`Casting returned ${cast.json.beats.length} beats for ${breakdown.beats.length}`);
  const roles=cast.json.beats.map(b=>({who:names.has(b.who)?b.who:first,does:b.does}));
  const script=copyScript({breakdown,segments:post.transcript?.segments||[],seconds:post.duration,cast:roles,hook:String(breakdown.hook_words||'').split(/\s+/).slice(0,5).join(' ').toUpperCase(),caption:discloseCaption(post.caption||'',kit.format)});
  const kept=wordsKept(post.transcript?.text||'',script.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' '));
  if(kept<0.95)throw new Error(`The copy script kept only ${Math.round(kept*100)}% of the original's words`);
  const plan={mode:'kit',source:'copy',copyOf:item.postId,kitAt:kit.createdAt,createdAt:batch.createdAt,chosen:0,picked:[{idea:{title:`Copy · ${post.transcript.text.split(/\s+/).slice(0,6).join(' ')}`}}],script,check:{pass:true},voice,voiceMode,price:{usd:item.usd,maxUsd:Math.round(item.usd*2*100)/100}};
  await mkdir(this.dir(job.id),{recursive:true});await writeJson(join(this.dir(job.id),`${item.postId}.plan.json`),plan);
  const live={state:'working',stage:'',progress:{done:0,total:item.parts+1},reelId:item.reelId};
  const follow=setInterval(()=>{this.setStage(item,live.stage).catch(()=>{});},this.tick);
  try{await this.maker.makeKit(job,plan,kit,{price:plan.price,keys},live);}finally{clearInterval(follow);}
  await this.setStage(item,'Comparing with the original');item.fidelity=await this.compare(job,item,breakdown,post,keys);
  const f=join(this.maker.dir(job.id),'reels',item.reelId,'reel.json'),reel=await readJson(f);if(reel){reel.fidelity=item.fidelity;await writeJson(f,reel);}
  Object.assign(item,{state:'done',stage:'Done',finishedAt:new Date().toISOString()});
 }
 // The side-by-side watch (Gemini) plus code's words kept and length; code's verdict.
 async compare(job,item,breakdown,post,keys){
  const reel=await readJson(join(this.maker.dir(job.id),'reels',item.reelId,'reel.json'));if(!reel?.video)throw new Error('The copy has no video to compare');
  const g=await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{text:'Reel A (the original):'},{video:await readFile(videoPath(this.root,job.id,item.postId))},{text:'Reel B (our copy):'},{video:await readFile(reel.video)},{text:fidelityPrompt(breakdown.beats)}],schema:FIDELITY_SCHEMA});
  await this.ledger(job.id,'copy compare',g.costUsd);
  const words=wordsKept(post.transcript?.text||'',reel.said||''),lengthRatio=Math.round((reel.seconds-END_CARD)/post.duration*100)/100;
  const f=fidelityScore({wordsKept:words,lengthRatio,beats:g.json.beats});
  return {...f,...fidelityVerdict(f.score,g.json,breakdown.beats),feel:g.json.same_feel,gap:g.json.biggest_gap,beats:g.json.beats.map(x=>({...x,...(breakdown.beats[x.beat-1]?{from:breakdown.beats[x.beat-1].from,to:breakdown.beats[x.beat-1].to,happens:breakdown.beats[x.beat-1].happens}:{})})),at:new Date().toISOString()};
 }
 async saveBatch(runId,batch){await mkdir(this.dir(runId),{recursive:true});await writeJson(join(this.dir(runId),'batch.json'),batch);}
 // Everything the page shows: the picks, and for each copy its stage, percent and seconds left; the batch's totals.
 async status(job){
  const picks=await readJson(join(this.dir(job.id),'picks.json')),pick=this.picking.get(job.id);
  let batch=this.batches.get(job.id);
  if(!batch){batch=await readJson(join(this.dir(job.id),'batch.json'));if(batch)batch.items.forEach(i=>{if(['working','waiting'].includes(i.state))Object.assign(i,{state:'stopped',error:'The app restarted while this copy was being made. Paid parts are kept; start it again to finish.'});});}
  const now=Date.now(),reelsDir=join(this.maker.dir(job.id),'reels');
  const items=batch?await Promise.all(batch.items.map(async i=>{
   const total=i.planned.reduce((a,s)=>a+s.seconds,0),p=i.state==='done'?{pct:100,left:0}:i.state==='working'?progressOf(i.planned,i.pointer,(now-i.stageAt)/1000):{pct:0,left:total};
   const reel=existsSync(join(reelsDir,i.reelId,'reel.json'))?await readJson(join(reelsDir,i.reelId,'reel.json')):null;
   return {postId:i.postId,reelId:i.reelId,parts:i.parts,usd:i.usd,state:i.state,stage:i.stage,pct:p.pct,left:p.left,total,
    original:`/videos/${encodeURIComponent(job.id)}/${encodeURIComponent(i.postId)}`,originalImage:`/media/${encodeURIComponent(job.id)}/${encodeURIComponent(i.postId)}`,
    error:i.error?plainError(i.error):null,retryUsd:['failed','stopped'].includes(i.state)?await this.remainingUsd(job.id,{...i,parts:Math.min(i.parts,COPY_MAX_PARTS)}):null,
    reel:reel?.url?{url:reel.url,cover:reel.cover||null,seconds:reel.seconds,spentUsd:reel.spentUsd,heard:reel.heard?.all??null,missing:reel.heard?.missing||[]}:null,fidelity:i.fidelity||reel?.fidelity||null};
  })):[];
  const total=items.reduce((a,i)=>a+i.total,0),doneSec=items.reduce((a,i)=>a+i.total*i.pct/100,0),left=Math.max(0,...items.map(i=>i.left),0);
  return {runId:job.id,picking:pick?{state:pick.state,stage:pick.stage,error:pick.error}:null,picks,batch:batch?{id:batch.id,createdAt:batch.createdAt,usd:batch.usd,voiceMode:batch.voiceMode,pct:total?Math.round(doneSec/total*100):0,left,items}:null};
 }
}

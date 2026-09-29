// The copy studio: pick a channel's five most copyable winners (code + Jev), write each copy from the original's own
// timed words (code), make all five at once with our hosts (the maker, each part checked against the original's shots
// and filmed again once if off), then compare each copy with its original side by side (Gemini watches, code decides).
// Saved in data/channels/<run>/copies/; stage times learned in data/experiments/stage-times.json.
import {mkdir,readFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {existsSync} from 'node:fs';
import {join,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {DnaBuilder} from './dna-run.mjs';
import {videoPath} from './videos.mjs';
import {voiceModeOf} from './decide.mjs';
import {veoSegments,veoPrice,VEO} from './veo.mjs';
import {discloseCaption,partUsd} from './kit-reel.mjs';
import {engineKey,copyCandidates,copyMode,visualScript,copyableRequest,pickCopies,copyScript,hasTimedWords,wordsKept,copyPrice,plainError,COPY_MAX_PARTS,stageKey,plannedStages,progressOf,learnStage,FIDELITY_SCHEMA,fidelityPrompt,fidelityScore,fidelityVerdict} from './copy.mjs';
import {PART_SECONDS} from './kit-reel.mjs';

// The video models a copy can use.
// Omni stops at 40 s (Google extends only videos up to 30 s); Veo extends to 148 s.
export const ENGINES={omni:{label:'Gemini Omni',tier:null},'veo-fast':{label:'Veo 3.1 Fast',tier:'fast'}};
const ID=/^[\w-]{1,90}$/,END_CARD=2.5,STOPPED='The app restarted while this copy was being made. Parts already made are kept: press Try again to pay only for the rest.';
// 10-second Omni parts covering the whole reel (no cap: every 4 parts a fresh chain starts).
// Likes and comments per 1,000 plays (null without plays).
export const engagementOf=p=>{const plays=p.plays??p.views;return plays>0?((p.likes||0)+(p.comments||0))/plays*1000:null;};
export const partsFor=seconds=>Math.max(1,Math.ceil((seconds-1)/PART_SECONDS)); // the last second's words join the end
// Who plays whom: for every beat of the original, which of our hosts acts or speaks, and the action with our names.
export const CAST_SCHEMA={type:'object',required:['beats'],properties:{beats:{type:'array',items:{type:'object',required:['who','does'],properties:{who:{type:'string'},does:{type:'string'}}}}}};
export const castPrompt=(beats,kit)=>`We are copying a reel shot for shot with our own hosts in our own place. Our hosts: ${JSON.stringify((kit.cast||[]).map(h=>({name:h.name,look:h.look,role:h.role})))}. Our place: ${kit.place}.
For EACH beat of the original below, in the same order, give: "who" = the name of our host who plays the person acting or speaking in that beat (match the original's man or woman to our host who fits), or "voice" when nobody is on camera; "does" = the original's action rewritten with our host's name and our place, changing NOTHING else (same action, same objects, same food, same result, same framing).
The original's beats:\n${beats.map((b,i)=>`${i+1}. ${b.shot}; ${b.happens}`).join('\n')}`;

export class CopyStudio{
 constructor(root,keys,{planner,maker,gemini=generate,jev=jevAsk,concurrency=5,tick=500}={}){Object.assign(this,{root,keys,planner,maker,gemini,jev,concurrency,tick});this.picking=new Map();this.batches=new Map();
  // starting: a start or retry being set up (two requests close together both paid for every copy; audit, 2026-09-29).
  // saving/learning: one write at a time per file, so a late write never replaces a newer one. running: each batch's work.
  this.starting=new Set();this.saving=new Map();this.learning=Promise.resolve();this.running=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId,'copies');}
 learnedFile(){return join(this.root,'experiments','stage-times.json');}
 ledger(runId,step,usd){return this.maker.spendLedger(runId,{step,usd:usd||0});}
 // The channel's reels with a score and a saved video, as the picker needs them.
 reels(job){return new DnaBuilder(this.root,()=>({})).usable(job).map(r=>({id:r.post.id,xNormal:r.xNormal,seconds:r.post.duration||0,plays:r.post.plays??r.post.views??null,engagement:engagementOf(r.post),text:r.post.status==='music'?'':r.post.transcript?.text||'',silent:['music','no_speech','no_audio'].includes(r.post.status)||Boolean(r.post.excludedReason),timed:hasTimedWords(r.post.transcript?.segments)}));}

 // Prep ahead: the candidates' breakdowns, made and cached right after a scan (no look needed), so picking only asks
 // Jev. A reel that cannot be broken down is skipped here; picking tries it again.
 async prepare(job){
  const keys=this.keys(),cands=copyCandidates(this.reels(job));
  const done=await Promise.all(cands.map(c=>this.planner.breakdown(job,c.id,keys).then(()=>true,()=>false)));
  return {candidates:cands.length,ready:done.filter(Boolean).length};
 }
 // Step 1 (a few cents): the candidates' shot-by-shot breakdowns (cached) and Jev's "can we copy this?", then five.
 async pickStart(job){
  if(this.picking.get(job.id)?.state==='working')throw new Error('Already picking');
  const keys=this.keys();if(!keys.gemini||!keys.jev)throw new Error('Connect Gemini and Jev first');
  const kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
  const live={state:'working',stage:'Finding the winners worth copying',error:null,at:new Date().toISOString()};this.picking.set(job.id,live);
  (async()=>{
   const cands=copyCandidates(this.reels(job));if(!cands.length)throw new Error('No winner with speech to copy: every reel at least 3x their usual views is silent, an ad for their own product, or has unusually low engagement');
   live.stage=`Studying ${cands.length} winners shot by shot`;const breakdowns=await Promise.all(cands.map(c=>this.planner.breakdown(job,c.id,keys)));
   live.stage='Jev is judging which ones copy well';const judgments=await Promise.all(breakdowns.map(b=>this.jev(copyableRequest(b.breakdown,kit.kit),keys.jev)));
   const picks=pickCopies(cands,judgments).map(p=>({id:p.id,xNormal:p.xNormal,seconds:p.seconds,plays:p.plays,engagement:p.engagement==null?null:Math.round(p.engagement*10)/10,repeats:p.repeats,copyable:p.copyable,why:p.why,opening:p.text.split(/\s+/).slice(0,12).join(' '),parts:partsFor(p.seconds),usd:copyPrice(partsFor(p.seconds)),veo:{parts:veoSegments(p.seconds).length,usd:veoPrice(veoSegments(p.seconds))}}));
   await mkdir(this.dir(job.id),{recursive:true});await writeJson(join(this.dir(job.id),'picks.json'),{createdAt:new Date().toISOString(),kitAt:kit.createdAt,picks,skipped:cands.length-picks.length});
   Object.assign(live,{state:'done',stage:null});
  })().catch(e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: picking copies for ${job.id} failed: ${e.message}`);});
  return {...live};
 }

 // Step 2: make the chosen copies, all at once. confirmUsd is the total the person saw and confirmed.
 // engines: 'omni', 'veo-fast', or both (the same winner copied by each, side by side; Kaan, 2026-09-29).
 async start(job,{ids,confirmUsd,engines=['omni']}){
  if(this.starting.has(job.id)||this.busy(job.id))throw new Error('Copies are already being made');
  this.starting.add(job.id);
  try{
   const keys=this.keys();for(const [k,n] of [['gemini','Gemini'],['jev','Jev'],['groq','Groq']])if(!keys[k])throw new Error(`Connect ${n} first`);
   const kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
   const saved=await readJson(join(this.dir(job.id),'picks.json'));if(!saved?.picks?.length)throw new Error('Pick the winners to copy first');
   const chosen=(ids||[]).map(id=>saved.picks.find(p=>p.id===id));if(!chosen.length||chosen.some(p=>!p)||chosen.length>5)throw new Error('Choose 1 to 5 of the picked winners');
   const eng=[...new Set(engines)].filter(e=>ENGINES[e]);if(!eng.length)throw new Error('Choose a video model');
   const plan=chosen.flatMap(p=>eng.map(e=>({p,e,parts:e==='omni'?p.parts:veoSegments(p.seconds).length,usd:e==='omni'?p.usd:veoPrice(veoSegments(p.seconds),ENGINES[e].tier)})));
   const usd=Math.round(plan.reduce((a,x)=>a+x.usd,0)*100)/100;if(!Number.isFinite(confirmUsd)||Math.abs(confirmUsd-usd)>0.01)throw new Error(`Confirm the price first ($${usd.toFixed(2)})`);
   const voice=await this.planner.voiceDecision(job.id,kit),voiceMode=voiceModeOf(voice),learned=await readJson(this.learnedFile())||{};
   // Designed voices are made once before the five run side by side, so five copies never design them five times.
   // Made before the batch exists: a failure here left every copy on "Waiting" forever (audit, 2026-09-29).
   if(voiceMode==='designed')await this.maker.channelVoices(job.id,kit,keys,e=>this.maker.spendLedger(job.id,e));
   const batch={id:randomUUID(),createdAt:new Date().toISOString(),kitAt:kit.createdAt,voiceMode,usd,items:plan.map(({p,e,parts,usd})=>({key:`${p.id}:${e}`,postId:p.id,engine:e,parts,usd,reelId:`copy-${p.id}-${e==='omni'?'':`${e}-`}${createHash('sha1').update(randomUUID()).digest('hex').slice(0,6)}`,state:'waiting',stage:'Waiting',stageAt:Date.now(),pointer:0,error:null}))};
   batch.items.forEach(i=>{i.planned=plannedStages(i.parts,i.engine==='omni'?voiceMode:'native',learned,i.engine);});this.batches.set(job.id,batch);await this.saveBatch(job.id,batch);
   this.run(job,batch,batch.items,it=>this.runItem(job,batch,it,kit,keys,voice,voiceMode));
   return this.status(job);
  }finally{this.starting.delete(job.id);}
 }
 busy(runId){return !!this.batches.get(runId)?.items.some(i=>['working','waiting'].includes(i.state));}
 // Runs items side by side (at most `concurrency`), saving the batch after each. A failed save is logged, never left
 // as an unhandled rejection: that exits Node and killed every copy mid-film (audit, 2026-09-29).
 run(job,batch,items,make){
  let cursor=0;const worker=async()=>{while(cursor<items.length){const item=items[cursor++];
   await make(item).catch(e=>{Object.assign(item,{state:'failed',error:e.message,finishedAt:new Date().toISOString()});console.error(`Social Scraper: copy of ${item.postId} stopped: ${e.message}`);});
   await this.saveBatch(job.id,batch).catch(e=>console.error(`Social Scraper: saving the copies of ${job.id} failed: ${e.message}`));}};
  const all=Promise.all(Array.from({length:Math.min(this.concurrency,items.length)},worker)).then(()=>this.saveBatch(job.id,batch)).catch(e=>console.error(`Social Scraper: saving the copies of ${job.id} failed: ${e.message}`));
  this.running.set(job.id,all);return all;
 }
 // Resolves when this run's copies are all made and saved (tests wait on it before cleaning up).
 finished(runId){return this.running.get(runId)||Promise.resolve();}
 // The batch in memory, or the saved one after a restart, with copies that were being made marked stopped.
 async loadBatch(runId){
  if(this.batches.has(runId))return this.batches.get(runId);
  const batch=await readJson(join(this.dir(runId),'batch.json'));if(!batch)return null;
  if(this.batches.has(runId))return this.batches.get(runId);
  // A copy that was only being compared when the app stopped is already made and paid: it stays done, with a comparison
  // to run again, instead of a "stopped" tile whose Try again would film it again (audit review, 2026-09-29).
  for(const i of batch.items){if(!['working','waiting'].includes(i.state))continue;
   const reel=await readJson(join(this.maker.dir(runId),'reels',i.reelId,'reel.json'));
   Object.assign(i,reel?.video?{state:'done',stage:'Done',fidelity:{error:STOPPED}}:{state:'stopped',error:STOPPED});}
  this.batches.set(runId,batch);return batch;
 }
 // Try failed or stopped copies again inside the same batch. Parts already filmed and checked are kept (the maker skips
 // them, in the same reel folder), so only the parts still to film are paid; confirmUsd is that total. A finished copy
 // whose comparison failed is only compared again: nothing is filmed.
 async retry(job,{ids,confirmUsd}){
  if(this.starting.has(job.id)||this.busy(job.id))throw new Error('Copies are still being made');
  this.starting.add(job.id);
  try{
   const batch=await this.loadBatch(job.id);if(!batch)throw new Error('Nothing to try again');
   const items=(ids||[]).map(id=>batch.items.find(i=>(i.key===id||i.postId===id)&&(['failed','stopped'].includes(i.state)||i.state==='done'&&i.fidelity?.error)));if(!items.length||items.some(i=>!i))throw new Error('Choose copies that failed');
   const keys=this.keys(),kit=await this.planner.approvedKit(job.id);if(!kit)throw new Error('Make your look first (Kit step)');
   const film=items.filter(i=>i.state!=='done'),compareOnly=items.filter(i=>i.state==='done'),price=new Map();
   for(const it of film)price.set(it,await this.remainingUsd(job.id,it));
   const usd=Math.round(film.reduce((a,i)=>a+price.get(i),0)*100)/100;if(!Number.isFinite(confirmUsd)||Math.abs(confirmUsd-usd)>0.01)throw new Error(`Confirm the price first ($${usd.toFixed(2)})`);
   const voice=await this.planner.voiceDecision(job.id,kit),learned=await readJson(this.learnedFile())||{};
   for(const it of film){
    // The maker's limit covers the whole reel: what it already spent plus the rest with one retry each. The rest
    // alone (twice) stopped a retry at its first unfilmed part whenever parts were already paid for.
    const spent=(await readJson(join(this.maker.dir(job.id),'reels',it.reelId,'reel.json')))?.spentUsd||0;
    Object.assign(it,{usd:price.get(it),ceilingUsd:Math.ceil((spent+2*price.get(it))*100-1e-6)/100,state:'waiting',stage:'Waiting',stageAt:Date.now(),pointer:0,error:null,planned:plannedStages(it.parts,/^veo/.test(it.engine||'')?'native':batch.voiceMode,learned,it.engine)});
   }
   for(const it of compareOnly)this.toCompare(it);
   await this.saveBatch(job.id,batch);
   this.run(job,batch,items,it=>compareOnly.includes(it)?this.compareOnly(job,it,keys):this.runItem(job,batch,it,kit,keys,voice,batch.voiceMode));
   return this.status(job);
  }finally{this.starting.delete(job.id);}
 }
 // Compare a finished copy with its original again (one Gemini watch, cents), without filming anything.
 async compareAgain(job,{postId}){
  if(this.starting.has(job.id)||this.busy(job.id))throw new Error('Copies are still being made');
  this.starting.add(job.id);let batch,item;try{batch=await this.loadBatch(job.id);item=batch?.items.find(i=>(i.key===postId||i.postId===postId)&&i.state==='done');}finally{this.starting.delete(job.id);}if(!item)throw new Error('Choose a finished copy');
  const keys=this.keys();if(!keys.gemini)throw new Error('Connect Gemini first');
  this.starting.add(job.id);try{this.toCompare(item);await this.saveBatch(job.id,batch);}finally{this.starting.delete(job.id);}
  this.run(job,batch,[item],it=>this.compareOnly(job,it,keys));
  return this.status(job);
 }
 toCompare(item){const j=item.planned.findIndex(s=>s.key==='compare');Object.assign(item,{state:'working',stage:'Comparing with the original',stageAt:Date.now(),pointer:j>=0?j:item.pointer,error:null});}
 async compareOnly(job,item,keys){
  const post=job.posts.find(p=>p.id===item.postId),{breakdown}=await this.planner.breakdown(job,item.postId,keys);
  await this.finish(job,item,breakdown,post,keys);
 }
 // The price of the parts a copy still has to film.
 async remainingUsd(runId,item){
  const reel=await readJson(join(this.maker.dir(runId),'reels',item.reelId,'reel.json'));
  // Omni: 10-second parts at their price, a fresh chain every 4 parts; Veo: 8 s then 7 s at its price per second, a
  // fresh 8 s chain every 21 segments (148 s).
  const cost=i=>/^veo/.test(item.engine||'')?(i%21?7:8)*VEO[ENGINES[item.engine]?.tier||'fast'].usdPerSecond:partUsd(i%COPY_MAX_PARTS);
  return Math.round(Array.from({length:item.parts},(_,i)=>reel?.parts?.[i]?.check?.pass?0:cost(i)).reduce((a,b)=>a+b,0)*100)/100;
 }
 // A stage change moves the item's pointer through its planned stages (a retry stays put) and teaches the ETA.
 // The item moves on before the file is touched, so a tick that fires meanwhile cannot learn the same stage twice.
 async setStage(item,stage){
  if(!stage||stage===item.stage)return;const now=Date.now(),prev=engineKey(stageKey(item.stage),item.engine),seconds=(now-item.stageAt)/1000,learn=prev&&item.state==='working';
  const key=engineKey(stageKey(stage),item.engine),part=Number(String(stage).match(/part (\d+)/)?.[1])||undefined;
  const j=item.planned.findIndex((s,i)=>i>=item.pointer&&s.key===key&&(s.part===undefined||s.part===part));if(j>=0)item.pointer=j;
  Object.assign(item,{stage,stageAt:now});
  if(learn)await this.learn(prev,seconds);
 }
 // One learned-file write at a time: five copies reading and writing it at once lost each other's samples (audit, 2026-09-29).
 learn(key,seconds){
  const next=this.learning.then(async()=>{const learned=await readJson(this.learnedFile())||{};await mkdir(join(this.root,'experiments'),{recursive:true});await writeJson(this.learnedFile(),learnStage(learned,key,seconds));});
  this.learning=next.catch(()=>{});return next;
 }
 async runItem(job,batch,item,kit,keys,voice,voiceMode){
  item.state='working';item.startedAt=new Date().toISOString();const post=job.posts.find(p=>p.id===item.postId);
  await this.setStage(item,'Studying the reel');const {breakdown}=await this.planner.breakdown(job,item.postId,keys);
  await this.setStage(item,'Writing the copy');
  // The words do not depend on who plays whom, so they are checked before the cast call is paid for (a transcript
  // without word times failed every copy only after that call; audit, 2026-09-29).
  // A song or no speech: a visual copy (shots and printed line, nothing spoken; the song is added on Instagram).
  const visual=copyMode({post,breakdown})==='visual';item.mode=visual?'visual':'spoken';
  const segments=visual?[]:post.transcript?.segments||[],said=s=>s.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ');
  if(!visual&&!hasTimedWords(segments))throw new Error('This reel\'s transcript has no word times to copy from');
  const kept=visual?1:wordsKept(post.transcript?.text||'',said(copyScript({breakdown,segments,seconds:post.duration,cast:breakdown.beats.map(()=>({who:'voice',does:''})),hook:'',caption:''})));
  if(kept<0.95)throw new Error(`The copy script kept only ${Math.round(kept*100)}% of the original's words`);
  const cast=await this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:castPrompt(breakdown.beats,kit.kit)}],schema:CAST_SCHEMA,thinking:'low'});await this.ledger(job.id,'copy cast',cast.costUsd);
  const names=new Set([...(kit.kit.cast||[]).map(h=>h.name),'voice']),first=(kit.kit.cast||[])[0]?.name||'voice';
  if(cast.json.beats.length!==breakdown.beats.length)throw new Error(`Casting returned ${cast.json.beats.length} beats for ${breakdown.beats.length}`);
  const roles=cast.json.beats.map(b=>({who:names.has(b.who)?b.who:first,does:b.does}));
  const veo=/^veo/.test(item.engine||''),lengths=veo?veoSegments(post.duration):null;
  const caption=discloseCaption(post.caption||'',kit.format);
  const script=visual?visualScript({breakdown,seconds:post.duration,lengths,cast:roles,caption}):copyScript({breakdown,segments,seconds:post.duration,lengths,cast:roles,hook:String(breakdown.hook_words||'').split(/\s+/).slice(0,5).join(' ').toUpperCase(),caption});
  const title=visual?(script.print||breakdown.first_second||'Visual copy'):post.transcript.text;
  const plan={mode:'kit',source:'copy',engine:item.engine||'omni',copyOf:item.postId,kitAt:kit.createdAt,createdAt:batch.createdAt,chosen:0,picked:[{idea:{title:`Copy · ${title.split(/\s+/).slice(0,6).join(' ')}`}}],...(visual?{sound:`Add a sound on Instagram: the original plays ${String(breakdown.voice?.delivery||'a song').replace(/\.$/,'').toLowerCase()}.`}:{}),script,check:{pass:true},voice,voiceMode:veo?'native':voiceMode,price:{usd:item.usd,maxUsd:item.ceilingUsd??Math.round(item.usd*2*100)/100}};
  await mkdir(this.dir(job.id),{recursive:true});await writeJson(join(this.dir(job.id),`${item.postId}${item.engine&&item.engine!=='omni'?`.${item.engine}`:''}.plan.json`),plan);
  const live={state:'working',stage:'',progress:{done:0,total:item.parts+1},reelId:item.reelId};
  const follow=setInterval(()=>{this.setStage(item,live.stage).catch(()=>{});},this.tick);
  try{await (veo?this.maker.makeVeo(job,plan,kit,{price:plan.price,keys},live):this.maker.makeKit(job,plan,kit,{price:plan.price,keys},live));}finally{clearInterval(follow);}
  await this.setStage(item,'Comparing with the original');await this.finish(job,item,breakdown,post,keys);
 }
 // The comparison, then done. A failed comparison never fails a copy that is already made and paid for: the error is
 // kept and the copy can be compared again for cents (the only way back was to film it all again; audit, 2026-09-29).
 async finish(job,item,breakdown,post,keys){
  item.fidelity=await this.compare(job,item,breakdown,post,keys).catch(e=>({error:e.message,at:new Date().toISOString()}));
  const f=join(this.maker.dir(job.id),'reels',item.reelId,'reel.json'),reel=await readJson(f);if(reel){reel.fidelity=item.fidelity;await writeJson(f,reel);}
  // Teaches how long comparing takes, only from a real comparison; a failed write never fails a copy already paid for.
  if(!item.fidelity?.error)await this.setStage(item,'Done').catch(e=>console.error(`Social Scraper: stage time not saved: ${e.message}`));
  Object.assign(item,{state:'done',stage:'Done',finishedAt:new Date().toISOString()});
 }
 // The side-by-side watch (Gemini) plus code's words kept and length; code's verdict.
 async compare(job,item,breakdown,post,keys){
  const reel=await readJson(join(this.maker.dir(job.id),'reels',item.reelId,'reel.json'));if(!reel?.video)throw new Error('The copy has no video to compare');
  const g=await this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{text:'Reel A (the original):'},{video:await readFile(videoPath(this.root,job.id,item.postId))},{text:'Reel B (our copy):'},{video:await readFile(reel.video)},{text:fidelityPrompt(breakdown.beats,{visual:item.mode==='visual'})}],schema:FIDELITY_SCHEMA});
  await this.ledger(job.id,'copy compare',g.costUsd);
  // A visual copy has no words to keep: its score is the shots and the length.
  const words=item.mode==='visual'?null:wordsKept(post.transcript?.text||'',reel.said||''),lengthRatio=Math.round((reel.seconds-(reel.endCard===false?0:END_CARD))/post.duration*100)/100; // copies made before 2026-09-29 carry a 2.5 s end card
  const f=fidelityScore({wordsKept:words,lengthRatio,beats:g.json.beats,count:breakdown.beats.length});
  return {...f,...fidelityVerdict(f.score,g.json,breakdown.beats),feel:g.json.same_feel,gap:g.json.biggest_gap,beats:breakdown.beats.map((b,k)=>{const x=(g.json.beats||[]).find(y=>y.beat===k+1);return {beat:k+1,match:x?.match??0,differs:x?x.differs:'not judged: counted as missing',from:b.from,to:b.to,happens:b.happens};}),at:new Date().toISOString()};
 }
 // One batch write at a time per run, each writing the batch as it is then, so the last write is the newest.
 saveBatch(runId,batch){
  const next=(this.saving.get(runId)||Promise.resolve()).then(async()=>{await mkdir(this.dir(runId),{recursive:true});await writeJson(join(this.dir(runId),'batch.json'),batch);});
  this.saving.set(runId,next.catch(()=>{}));return next;
 }
 // Everything the page shows: the picks, and for each copy its stage, percent and seconds left; the batch's totals.
 async status(job){
  const picks=await readJson(join(this.dir(job.id),'picks.json')),pick=this.picking.get(job.id);
  const batch=await this.loadBatch(job.id);
  const now=Date.now(),reelsDir=join(this.maker.dir(job.id),'reels');
  const items=batch?await Promise.all(batch.items.map(async live=>{
   // One snapshot of the item: its state and progress are read together, before any await (the copy can finish
   // during the reel.json read below; it was reported "done" at 90%).
   const i={...live},total=i.planned.reduce((a,s)=>a+s.seconds,0),p=i.state==='done'?{pct:100,left:0}:i.state==='working'?progressOf(i.planned,i.pointer,(now-i.stageAt)/1000):{pct:0,left:total};
   const reel=existsSync(join(reelsDir,i.reelId,'reel.json'))?await readJson(join(reelsDir,i.reelId,'reel.json')):null,fid=i.fidelity||reel?.fidelity||null;
   // Try again: the unfilmed parts' price for a failed or stopped copy; $0 for a made copy whose comparison failed.
   const retryUsd=['failed','stopped'].includes(i.state)?await this.remainingUsd(job.id,i):i.state==='done'&&fid?.error?0:null;
   return {key:i.key||i.postId,engine:i.engine||'omni',postId:i.postId,reelId:i.reelId,parts:i.parts,usd:i.usd,state:i.state,stage:i.stage,pct:p.pct,left:p.left,total,
    original:`/videos/${encodeURIComponent(job.id)}/${encodeURIComponent(i.postId)}`,originalImage:`/media/${encodeURIComponent(job.id)}/${encodeURIComponent(i.postId)}`,
    error:i.error?plainError(i.error):null,retryUsd,
    // The latest part that passed its check (the chain so far), shown in the tile while the copy is made.
    preview:i.state!=='done'&&reel?.parts?.some(x=>x?.check?.pass&&x.file)?(()=>{const ok=reel.parts.filter(x=>x?.check?.pass&&x.file),f=basename(ok.at(-1).file);return {url:`/channels/${encodeURIComponent(job.id)}/${encodeURIComponent(i.reelId)}/${encodeURIComponent(f)}`,parts:ok.length,of:i.parts};})():null,
    reel:reel?.url?{url:reel.url,cover:reel.cover||null,seconds:reel.seconds,spentUsd:reel.spentUsd,heard:reel.heard?.all??null,missing:reel.heard?.missing||[]}:null,fidelity:fid?.error?{...fid,error:plainError(fid.error)}:fid};
  })):[];
  // A failed or stopped copy is out of the batch's totals: it held the bar below 100 and the time left at its whole plan.
  const active=items.filter(i=>!['failed','stopped'].includes(i.state)),total=active.reduce((a,i)=>a+i.total,0),doneSec=active.reduce((a,i)=>a+i.total*i.pct/100,0),left=Math.max(0,...active.map(i=>i.left));
  return {runId:job.id,picking:pick?{state:pick.state,stage:pick.stage,error:pick.error,at:pick.at}:null,picks,batch:batch?{id:batch.id,createdAt:batch.createdAt,usd:batch.usd,voiceMode:batch.voiceMode,pct:total?Math.round(doneSec/total*100):0,left,items}:null};
 }
}

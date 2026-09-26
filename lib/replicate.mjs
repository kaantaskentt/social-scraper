// Replicate a winning reel with our own product: Seedance 2.5 omni_reference on Higgsfield, driven through the official
// `higgsfield` CLI (signed in to Kaan's account). The original reel steers camera, pacing, cuts, place and light; the
// reference images are the only product design; the people and any on-screen text are new.
// Spending rules: the cost is always checked first and must be confirmed; a submit is never retried automatically,
// because a lost response can still mean a charged job (seen on 2026-09-26).
import {mkdir,readdir,readFile,rename,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomic} from './pipeline.mjs';
const exec=promisify(execFile);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DONE=new Set(['completed']), FAILED=new Set(['failed','nsfw','canceled','cancelled','error']);

export function buildReplicatePrompt({images=1,shots=[],overlayText=''}={}){
 const refs=images<=1?'@Image 1':images===2?'@Image 1 and @Image 2':`@Image 1 to @Image ${images}`;
 const lines=[
  '[Motion and Scene]',
  '@Video 1 is the master for camera, framing, movement, pacing, cut timing, location and lighting. Do not use the faces, identities or clothing of the people in @Video 1. Do not copy any on-screen text, captions, logos or watermarks from @Video 1.',
  '','[Product]',
  `The clothing or product corresponds to ${refs}. Use only its design, exactly as shown: same colours, prints, text and placement. Do not invent other logos or text.`,
  '','[Cast]',
  `A new cast of people in their twenties, different from the people in @Video 1. They wear or use the product from ${refs} naturally, and it is clearly visible, including any back print when someone turns.`,
 ];
 if(shots.length){lines.push('','[Shots]','Follow the same shots at the same times as @Video 1:');shots.forEach((s,i)=>lines.push(`Shot ${i+1}: ${s.start.toFixed(1)}-${s.end.toFixed(1)}s`));}
 if(overlayText?.trim())lines.push('',`Show this text on screen at the start: 【${overlayText.trim()}】`);
 lines.push('','[Visual Style]','Real phone footage, natural light and skin, no cinematic grading.');
 return lines.join('\n');
}

export function higgsfieldArgs(mode,{prompt,videoPath,imagePaths,duration,keepSound}){
 if(!imagePaths?.length)throw new Error('Add at least one reference image');
 const seconds=Math.min(30,Math.max(4,Math.round(duration)));
 const args=['generate',mode==='cost'?'cost':'create','seedance_2_5','--prompt',prompt,'--mode','omni_reference','--video-references',videoPath,
  ...imagePaths.flatMap(p=>['--image-references',p]),'--duration',String(seconds),'--aspect_ratio','9:16','--resolution','720p',
  '--generate_audio',keepSound?'false':'true'];
 return mode==='cost'?args:[...args,'--json'];
}

export function parseCredits(text){
 const m=/([\d.]+)\s*credits?/i.exec(String(text));if(!m)throw new Error(`No credit estimate in Higgsfield's answer: ${String(text).slice(0,120)}`);return Number(m[1]);
}
const firstJob=text=>{const v=JSON.parse(text);return Array.isArray(v)?v[0]:v;};

async function defaultRun(args){
 try{const {stdout}=await exec('higgsfield',args,{timeout:180000,maxBuffer:16*1024*1024});return stdout;}
 catch(e){throw new Error((e.stderr||e.message||'higgsfield failed').toString().trim().split('\n').slice(-1)[0]);}
}
async function defaultDownload(url,file){const r=await fetch(url);if(!r.ok)throw new Error(`Download failed (${r.status})`);await writeFile(file,Buffer.from(await r.arrayBuffer()));}
// Our video with the original reel's sound track (exact copy); stops at the shorter of the two.
async function defaultMux(video,sound,out){await exec('ffmpeg',['-v','error','-y','-i',video,'-i',sound,'-map','0:v','-map','1:a?','-c:v','copy','-c:a','aac','-shortest',out],{timeout:120000});}
async function defaultProbe(file){const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file]);const d=Number(stdout.trim());if(!Number.isFinite(d))throw new Error('Could not read the reel length');return d;}

export class Replicator{
 constructor(root,{run=defaultRun,download=defaultDownload,mux=defaultMux,probeDuration=defaultProbe,prepareSource,pollMs=10000,maxPollFailures=60}={}){
  this.dir=join(root,'replicas');this.run=run;this.download=download;this.mux=mux;this.probeDuration=probeDuration;this.pollMs=pollMs;this.maxPollFailures=maxPollFailures;
  this.prepareSource=prepareSource||(async path=>{const d=await probeDuration(path);if(d<=30)return path;const cut=join(this.dir,`src-${randomUUID()}.mp4`);await exec('ffmpeg',['-v','error','-y','-i',path,'-t','30','-c','copy',cut]);return cut;});
  this.items=new Map();
 }
 async init(){
  await mkdir(this.dir,{recursive:true});
  for(const name of (await readdir(this.dir)).filter(n=>n.endsWith('.json'))){
   const rep=JSON.parse(await readFile(join(this.dir,name),'utf8'));this.items.set(rep.id,rep);
   if(rep.status==='submitting'){rep.status='uncertain';rep.error='The app stopped while submitting; the job may exist on Higgsfield. Check there before trying again.';await this.save(rep);}
   if(['generating','finishing'].includes(rep.status))void this.poll(rep);
  }
  return this;
 }
 // Writes for one replicate go through one chain and snapshot at write time, so an older write never lands last.
 save(rep){this.items.set(rep.id,rep);this.writes??=new Map();const prev=this.writes.get(rep.id)||Promise.resolve();const next=prev.catch(()=>{}).then(()=>atomic(join(this.dir,rep.id+'.json'),structuredClone(rep)));this.writes.set(rep.id,next);return next;}
 // Resolves once every write already queued for this replicate is on disk.
 saved(id){return this.writes?.get(id)||Promise.resolve();}
 get(id){const r=this.items.get(id);return r&&structuredClone(r);}
 list({runId,postId}={}){return [...this.items.values()].filter(r=>(!runId||r.runId===runId)&&(!postId||r.postId===postId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>structuredClone(r));}

 async estimate({sourcePath,imagePaths,shots=[],overlayText='',keepSound=true}){
  const videoPath=await this.prepareSource(sourcePath), duration=await this.probeDuration(videoPath);
  const prompt=buildReplicatePrompt({images:imagePaths.length,shots:shots.filter(s=>s.start<30),overlayText});
  const credits=parseCredits(await this.run(higgsfieldArgs('cost',{prompt,videoPath,imagePaths,duration,keepSound})));
  return {prompt,credits,duration,videoPath};
 }

 async start(input){
  if(!Number.isFinite(input.confirmCredits))throw new Error('Confirm the cost before starting');
  const est=await this.estimate(input);
  if(Math.abs(est.credits-input.confirmCredits)>1e-6)throw new Error(`The cost changed to ${est.credits} credits. Check it again.`);
  const rep={id:randomUUID(),runId:input.runId,postId:input.postId,status:'submitting',credits:est.credits,prompt:est.prompt,overlayText:input.overlayText||'',keepSound:Boolean(input.keepSound),
   sourcePath:input.sourcePath,imagePaths:input.imagePaths,jobId:null,error:null,createdAt:new Date().toISOString()};
  await this.save(rep); // durable before the paid call
  try{
   const job=firstJob(await this.run(higgsfieldArgs('create',{prompt:est.prompt,videoPath:est.videoPath,imagePaths:input.imagePaths,duration:est.duration,keepSound:rep.keepSound})));
   if(!job?.id)throw new Error('Higgsfield did not return a job id');
   Object.assign(rep,{status:'generating',jobId:job.id});await this.save(rep);void this.poll(rep);
  }catch(e){Object.assign(rep,{status:'uncertain',error:`The submission may have gone through (${e.message}). Check Higgsfield before trying again.`});await this.save(rep);}
  return structuredClone(rep);
 }

 async poll(rep){
  let failures=0;
  while(['generating','finishing'].includes(rep.status)){
   await sleep(this.pollMs);
   let job;try{job=firstJob(await this.run(['generate','get',rep.jobId,'--json']));failures=0;}
   catch(e){if(++failures>=this.maxPollFailures){Object.assign(rep,{status:'failed',error:`Lost contact with Higgsfield: ${e.message}`});await this.save(rep);}continue;}
   if(FAILED.has(job.status)){Object.assign(rep,{status:'failed',error:`Higgsfield job failed (${job.status}${job.error?`: ${job.error}`:''})`});await this.save(rep);return;}
   if(!DONE.has(job.status)||!job.result_url)continue;
   try{
    rep.status='finishing';await this.save(rep);
    const raw=join(this.dir,rep.id+'.raw.mp4'), out=join(this.dir,rep.id+'.mp4');
    await this.download(job.result_url,raw);
    if(rep.keepSound)await this.mux(raw,rep.sourcePath,out);else await rename(raw,out);
    Object.assign(rep,{status:'done',resultUrl:job.result_url,finishedAt:new Date().toISOString()});await this.save(rep);
   }catch(e){Object.assign(rep,{status:'failed',error:`Generated, but saving failed: ${e.message}. Result: ${job.result_url}`});await this.save(rep);}
   return;
  }
 }
}

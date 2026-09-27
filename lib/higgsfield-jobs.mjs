// Paid Higgsfield jobs (images, voice, video) with the same guarantees as Replicate: the record is saved before the paid
// call; a lost reply is never resubmitted (the job becomes "uncertain" and blocks until someone checks Higgsfield); a
// finished job is never paid again; polling stops at a deadline. A deliberate retry after a failure is a new attempt.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {jobIdFrom} from './replicate.mjs';
const exec=promisify(execFile);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DONE=new Set(['completed']),FAILED=new Set(['failed','nsfw','canceled','cancelled','error']);
async function defaultRun(args){try{const {stdout}=await exec('higgsfield',args,{timeout:180000,maxBuffer:16*1024*1024});return stdout;}catch(e){if(e.killed||e.signal)throw new Error('Higgsfield did not answer within 3 minutes');throw new Error(String(e.stderr||'').trim().split('\n').slice(-1)[0]||`higgsfield exited with code ${e.code}`);}}
async function defaultDownload(url,file){const r=await fetch(url,{signal:AbortSignal.timeout(10*60000)});if(!r.ok)throw new Error(`Download failed (${r.status})`);await writeFile(file,Buffer.from(await r.arrayBuffer()));}
const ID=/^[\w-]{1,80}$/;

export class PaidJobs{
 constructor(dir,{run=defaultRun,download=defaultDownload,pollMs=10000,maxWaitMs=30*60000}={}){this.dir=dir;this.runCli=run;this.download=download;this.pollMs=pollMs;this.maxWaitMs=maxWaitMs;}
 async record(name){try{return JSON.parse(await readFile(join(this.dir,`${name}.json`),'utf8'));}catch{return null;}}
 async save(rec){await mkdir(this.dir,{recursive:true});const file=join(this.dir,`${rec.name}.json`),temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(rec,null,1));await rename(temp,file);}
 // name: a stable id for this piece (e.g. "shot-s1"); args: the `generate create` arguments; opts.credits: the confirmed price.
 async run(name,args,{ext,credits,retry=false}){
  if(!ID.test(name))throw new Error('Invalid job name');
  const prev=await this.record(name);
  if(prev?.status==='done')return prev;
  if(prev?.status==='uncertain')throw new Error(`Job ${name} is uncertain${prev.jobId?` (Higgsfield job ${prev.jobId})`:''}. Check Higgsfield before trying again.`);
  if(prev&&['submitting','generating'].includes(prev.status))throw new Error(`Job ${name} is still running`);
  if(prev?.status==='failed'&&!retry)throw new Error(`Job ${name} failed before: ${prev.error}`);
  const rec={name,attempt:(prev?.attempt||0)+1,status:'submitting',credits,args,jobId:null,error:null,file:null,createdAt:new Date().toISOString()};
  await this.save(rec); // durable before the paid call
  try{const out=await this.runCli([...args,'--json']);rec.jobId=jobIdFrom(JSON.parse(out));if(!rec.jobId)throw new Error(`no job id in: ${String(out).slice(0,100)}`);}
  catch(e){Object.assign(rec,{status:'uncertain',error:`The submission may have gone through (${e.message}). Check Higgsfield before trying again.`});await this.save(rec);throw new Error(rec.error);}
  rec.status='generating';await this.save(rec);
  const deadline=Date.now()+this.maxWaitMs;let failures=0;
  for(;;){
   if(Date.now()>deadline){Object.assign(rec,{status:'uncertain',error:`Not finished in time. Higgsfield job ${rec.jobId} may still finish.`});await this.save(rec);throw new Error(rec.error);}
   await sleep(this.pollMs);let job;
   try{const v=JSON.parse(await this.runCli(['generate','get',rec.jobId,'--json']));job=Array.isArray(v)?v[0]:v;if(typeof job?.status!=='string')throw new Error('unreadable status');failures=0;}
   catch(e){if(++failures>=30){Object.assign(rec,{status:'uncertain',error:`Lost contact with Higgsfield (${e.message}). Job ${rec.jobId} may still finish.`});await this.save(rec);throw new Error(rec.error);}continue;}
   if(FAILED.has(job.status)){Object.assign(rec,{status:'failed',error:`Higgsfield job failed (${job.status}${job.error?`: ${job.error}`:''})`});await this.save(rec);throw new Error(rec.error);}
   if(!DONE.has(job.status))continue;
   if(!job.result_url){Object.assign(rec,{status:'uncertain',error:`Finished without a result link. Job ${rec.jobId}.`});await this.save(rec);throw new Error(rec.error);}
   const file=join(this.dir,`${name}${ext}`);await this.download(job.result_url,file);
   Object.assign(rec,{status:'done',file,resultUrl:job.result_url,finishedAt:new Date().toISOString()});await this.save(rec);return rec;
  }
 }
}

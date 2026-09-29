// Paid Gemini video jobs, one record per job in <dir>/jobs/<name>.json, written BEFORE waiting. A finished job is never
// paid for twice; a job whose id was saved is picked up again after a restart; a job that was being sent when the app
// stopped is "uncertain" and is not sent again without a person checking (it may have been paid). A failed job is sent
// again only when the maker asks (its money limit decides).
import {mkdir,writeFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {join} from 'node:path';
import {startInteraction,getInteraction,mediaBytes,mediaCost} from './gemini-media.mjs';

const NAME=/^[\w-]{1,60}$/;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const promptText=input=>(Array.isArray(input)?input:[input]).filter(x=>x&&(typeof x==='string'||x.type==='text')).map(x=>typeof x==='string'?x:x.text).join('\n');
const RATE_RETRIES=6,RATE_WAIT_MS=10000,GAP_MS=8000; // 8 a minute at most: one submission every 8 seconds across all jobs
let nextSend=0;
async function pace(sleep){const now=Date.now(),at=Math.max(now,nextSend);nextSend=at+GAP_MS;if(at>now)await sleep(at-now);}
export class VideoJobs{
 constructor(dir,{key,model,fetchImpl,sleep=wait,pollMs=5000,maxWaitMs=15*60000}={}){Object.assign(this,{dir,key,model,fetchImpl,sleep,pollMs,maxWaitMs});}
 file(name){if(!NAME.test(name))throw new Error('Invalid job name');return join(this.dir,'jobs',`${name}.json`);}
 record(name){return readJson(this.file(name));}
 save(rec){return writeJson(this.file(rec.name),rec);}
 // attempt: 1 for the first try, 2 for the one retry. input/previousId as for startInteraction.
 async run(name,{attempt=1,input,previousId,responseFormat}){
  await mkdir(join(this.dir,'jobs'),{recursive:true});let rec=await this.record(name);
  // A later attempt already exists: sending an earlier one again would pay for it twice (audit, 2026-09-29).
  if(rec&&rec.attempt>attempt)throw new Error(`Part "${name}" is already on attempt ${rec.attempt}; resume from there`);
  if(rec?.attempt===attempt){
   if(rec.status==='done')return rec;
   if(rec.status==='submitting')throw new Error(`Part "${name}" was being sent when the app stopped, so it may already be paid. Check your Gemini usage before trying again.`);
  }
  if(!rec||rec.attempt!==attempt||rec.status!=='submitted'){
   rec={name,attempt,model:this.model,status:'submitting',previousId:previousId||null,at:new Date().toISOString()};await this.save(rec);
   // Too many requests (429) is Google saying "not now": nothing was accepted, so wait and send again (five copies at
   // once hit the video model's 8 requests a minute on 2026-09-29). Submissions from every job share one pace.
   const send=async()=>{for(let n=0;;n++){await pace(this.sleep);try{return await startInteraction({key:this.key,model:this.model,input,previousId,responseFormat,fetchImpl:this.fetchImpl});}catch(e){if(e.status!==429||n>=RATE_RETRIES)throw e;await this.sleep(RATE_WAIT_MS*(n+1));}}};
   try{rec.id=await send();}
   // A refused prompt keeps its words (not the pictures), so the refusal can be diagnosed (a fitness prompt was
   // refused on 2026-09-28 and its text was lost).
   // Only Google's own refusal (4xx) is final. A lost reply (no status) or a 5xx may have been accepted and paid, so the
   // record stays 'submitting' and the next try stops with "may already be paid" instead of sending again.
   catch(e){if(e.status>=400&&e.status<500)await this.save({...rec,status:'failed',error:e.message,prompt:promptText(input)});throw e;}
   rec.status='submitted';await this.save(rec);
  }
  const began=Date.now();let data;
  for(;;){
   // A refusal (4xx) is final: the job is marked failed with Google's reason, so a retry sends a new job instead of
   // polling a refused one forever (seen 2026-09-28). Network and 5xx errors keep the job to pick up again.
   try{data=await getInteraction({key:this.key,id:rec.id,fetchImpl:this.fetchImpl});}
   catch(e){if(e.status===429||e.status===408){await this.sleep(RATE_WAIT_MS);continue;} // busy or slow, not refused: ask again later
    if(e.status>=400&&e.status<500){await this.save({...rec,status:'failed',error:e.message,prompt:promptText(input)});}throw e;}
   if(data.status!=='in_progress')break;
   if(Date.now()-began>this.maxWaitMs)throw new Error(`Part "${name}" is still being made after ${Math.round(this.maxWaitMs/60000)} minutes; it stays saved and is picked up on the next try`);await this.sleep(this.pollMs);}
  const costUsd=mediaCost(this.model,data.usage);
  const video=(data.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).find(c=>c.type==='video');
  if(data.status!=='completed'||!video){const error=`Gemini ${data.status==='completed'?'returned no video':`stopped (${data.status})`}`;await this.save({...rec,status:'failed',error,costUsd});throw Object.assign(new Error(`Part "${name}": ${error}`),{costUsd});}
  const file=join(this.dir,`${name}-a${attempt}.mp4`);await writeFile(file,await mediaBytes(video,{key:this.key,fetchImpl:this.fetchImpl}));
  rec={...rec,status:'done',file,costUsd,doneAt:new Date().toISOString()};await this.save(rec);return {...rec,fresh:true};
 }
}

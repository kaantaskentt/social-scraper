// Paid Gemini video jobs, one record per job in <dir>/jobs/<name>.json, written BEFORE waiting. A finished job is never
// paid for twice; a job whose id was saved is picked up again after a restart; a job that was being sent when the app
// stopped is "uncertain" and is not sent again without a person checking (it may have been paid). A failed job is sent
// again only when the maker asks (its money limit decides).
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startInteraction,getInteraction,mediaBytes,mediaCost} from './gemini-media.mjs';

const NAME=/^[\w-]{1,60}$/;
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class VideoJobs{
 constructor(dir,{key,model,fetchImpl,sleep=wait,pollMs=5000,maxWaitMs=15*60000}={}){Object.assign(this,{dir,key,model,fetchImpl,sleep,pollMs,maxWaitMs});}
 file(name){if(!NAME.test(name))throw new Error('Invalid job name');return join(this.dir,'jobs',`${name}.json`);}
 record(name){return readJson(this.file(name));}
 save(rec){return writeJson(this.file(rec.name),rec);}
 // attempt: 1 for the first try, 2 for the one retry. input/previousId as for startInteraction.
 async run(name,{attempt=1,input,previousId,responseFormat}){
  await mkdir(join(this.dir,'jobs'),{recursive:true});let rec=await this.record(name);
  if(rec?.attempt===attempt){
   if(rec.status==='done')return rec;
   if(rec.status==='submitting')throw new Error(`Part "${name}" was being sent when the app stopped, so it may already be paid. Check your Gemini usage before trying again.`);
  }
  if(!rec||rec.attempt!==attempt||rec.status!=='submitted'){
   rec={name,attempt,model:this.model,status:'submitting',previousId:previousId||null,at:new Date().toISOString()};await this.save(rec);
   try{rec.id=await startInteraction({key:this.key,model:this.model,input,previousId,responseFormat,fetchImpl:this.fetchImpl});}
   catch(e){await this.save({...rec,status:'failed',error:e.message});throw e;}
   rec.status='submitted';await this.save(rec);
  }
  const began=Date.now();let data;
  for(;;){data=await getInteraction({key:this.key,id:rec.id,fetchImpl:this.fetchImpl});if(data.status!=='in_progress')break;
   if(Date.now()-began>this.maxWaitMs)throw new Error(`Part "${name}" is still being made after ${Math.round(this.maxWaitMs/60000)} minutes; it stays saved and is picked up on the next try`);await this.sleep(this.pollMs);}
  const costUsd=mediaCost(this.model,data.usage);
  const video=(data.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).find(c=>c.type==='video');
  if(data.status!=='completed'||!video){const error=`Gemini ${data.status==='completed'?'returned no video':`stopped (${data.status})`}`;await this.save({...rec,status:'failed',error,costUsd});throw Object.assign(new Error(`Part "${name}": ${error}`),{costUsd});}
  const file=join(this.dir,`${name}-a${attempt}.mp4`);await writeFile(file,await mediaBytes(video,{key:this.key,fetchImpl:this.fetchImpl}));
  rec={...rec,status:'done',file,costUsd,doneAt:new Date().toISOString()};await this.save(rec);return {...rec,fresh:true};
 }
}

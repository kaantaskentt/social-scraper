// Veo 3.1 video jobs (Gemini API predictLongRunning), the second engine for copies (Kaan, 2026-09-29: "lets try google
// fast"). From Google's Veo docs (read 2026-09-29): clips are 8 s when reference images are used (up to 3, referenceType
// "asset", personGeneration "allow_adult"); an extension sends the previous Veo video back as bytes and adds 7 s, up to
// 148 s, 720p only, not on Lite; prompts are at most 1,024 tokens; videos stay on Google's servers for 2 days.
// Prices from Google's pricing page (read 2026-09-29): Veo 3.1 Fast $0.10 and Veo 3.1 $0.40 per second, with audio.
// Same money rules as the Omni jobs: the record is saved before waiting, a lost reply stays "uncertain" and is never
// resent, 429 means wait, and one submission every 8 seconds across all jobs.
import {mkdir,writeFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {join} from 'node:path';
import {call,mediaBytes} from './gemini-media.mjs';

export const VEO={fast:{model:'veo-3.1-fast-generate-preview',usdPerSecond:0.10,label:'Veo 3.1 Fast'},standard:{model:'veo-3.1-generate-preview',usdPerSecond:0.40,label:'Veo 3.1'}};
export const VEO_FIRST=8,VEO_EXTEND=7,VEO_MAX=148;
const BASE='https://generativelanguage.googleapis.com/v1beta';
const NAME=/^[\w-]{1,60}$/,RATE_RETRIES=6,RATE_WAIT_MS=10000,GAP_MS=8000;
let nextSend=0;const pace=async sleep=>{const now=Date.now(),at=Math.max(now,nextSend);nextSend=at+GAP_MS;if(at>now)await sleep(at-now);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Segment lengths for a copy of `seconds`: 8, then 7 at a time, until the original's length is covered. No length cap
// (Kaan, 2026-09-29): one video extends up to 148 s, so a longer reel starts a fresh 8 s clip, a new chain, and the
// chains are joined at the end.
export function veoSegments(seconds){const out=[];let total=0,chain=0;while(!out.length||total<seconds-0.5){const s=chain===0?VEO_FIRST:chain+VEO_EXTEND>VEO_MAX?VEO_FIRST:VEO_EXTEND;if(s===VEO_FIRST&&chain)chain=0;out.push(s);chain+=s;total+=s;}return out;}
// Which segments start a new chain (a fresh clip with the reference pictures, not an extension): the first, and any
// segment that would take its chain past `limit` seconds. Veo: 148 s. Gemini Omni: 40 s (4 parts of 10 s).
export const chainStarts=(segs,limit)=>{let chain=0;return segs.map((s,i)=>{const fresh=i===0||chain+s>limit;chain=fresh?s:chain+s;return fresh;});};
export const veoPrice=(segments,tier='fast')=>Math.round(segments.reduce((a,b)=>a+b,0)*VEO[tier].usdPerSecond*100)/100;
// The docs page shows inlineData, but the API refuses it for Veo ("`inlineData` isn't supported by this model", HTTP
// 400 on 2026-09-29); it takes base64 bytes with a mime type.
const image=(bytes,mime='image/jpeg')=>({bytesBase64Encoded:Buffer.from(bytes).toString('base64'),mimeType:mime});
// One request body: the first clip carries up to 3 reference pictures; an extension carries the previous video.
// `first`: a starting frame (image to video). A visual copy's printed line is drawn into it, because Veo garbles text it
// has to write itself ("LASTIA IULRD WEGS" for "DON'T TALK TO ME", 2026-09-29); no reference pictures then.
export function veoRequest({prompt,refs=[],previous=null,image:first=null}){
 const instance={prompt,...(previous?{video:{bytesBase64Encoded:Buffer.from(previous).toString('base64'),mimeType:'video/mp4'}}:{}),...(first&&!previous?{image:image(first)}:{}),...(!previous&&!first&&refs.length?{referenceImages:refs.slice(0,3).map(b=>({image:image(b),referenceType:'asset'}))}:{})};
 const parameters={aspectRatio:'9:16',resolution:'720p',personGeneration:!previous&&(refs.length||first)?'allow_adult':'allow_all',...(previous?{}:{durationSeconds:VEO_FIRST})}; // a number: the API refused the docs' "8" string (2026-09-29)
 return {instances:[instance],parameters};
}
export class VeoJobs{
 constructor(dir,{key,tier='fast',fetchImpl=fetch,sleep=wait,pollMs=8000,maxWaitMs=15*60000}={}){Object.assign(this,{dir,key,tier,fetchImpl,sleep,pollMs,maxWaitMs});}
 file(name){if(!NAME.test(name))throw new Error('Invalid job name');return join(this.dir,'jobs',`${name}.json`);}
 record(name){return readJson(this.file(name));}
 save(rec){return writeJson(this.file(rec.name),rec);}
 // seconds: what this request adds (8 first, 7 per extension), for its price.
 async run(name,{attempt=1,prompt,refs=[],previous=null,image=null,seconds}){
  await mkdir(join(this.dir,'jobs'),{recursive:true});let rec=await this.record(name);
  if(rec&&rec.attempt>attempt)throw new Error(`Part "${name}" is already on attempt ${rec.attempt}; resume from there`);
  if(rec?.attempt===attempt){if(rec.status==='done')return rec;if(rec.status==='submitting')throw new Error(`Part "${name}" was being sent when the app stopped, so it may already be paid. Check your Gemini usage before trying again.`);}
  const model=VEO[this.tier].model;
  if(!rec||rec.attempt!==attempt||rec.status!=='submitted'){
   rec={name,attempt,engine:`veo-${this.tier}`,model,status:'submitting',at:new Date().toISOString()};await this.save(rec);
   const send=async()=>{for(let n=0;;n++){await pace(this.sleep);try{return await call(`${BASE}/models/${model}:predictLongRunning`,{key:this.key,fetchImpl:this.fetchImpl,method:'POST',body:veoRequest({prompt,refs,previous,image}),timeoutMs:120000});}catch(e){if(e.status!==429||n>=RATE_RETRIES)throw e;await this.sleep(RATE_WAIT_MS*(n+1));}}};
   let data;try{data=await send();}catch(e){if(e.status>=400&&e.status<500)await this.save({...rec,status:'failed',error:e.message,prompt});throw e;}
   if(!data?.name){await this.save({...rec,error:'Google answered without an operation name'});throw new Error('Veo did not return a job id');}
   rec={...rec,id:data.name,status:'submitted'};await this.save(rec);
  }
  const began=Date.now();let op;
  for(;;){
   try{op=await call(`${BASE}/${rec.id}`,{key:this.key,fetchImpl:this.fetchImpl});}
   catch(e){if(e.status===429||e.status===408){await this.sleep(RATE_WAIT_MS);continue;}if(e.status>=400&&e.status<500)await this.save({...rec,status:'failed',error:e.message,prompt});throw e;}
   if(op?.done)break;
   if(Date.now()-began>this.maxWaitMs)throw new Error(`Part "${name}" is still being made after ${Math.round(this.maxWaitMs/60000)} minutes; it stays saved and is picked up on the next try`);
   await this.sleep(this.pollMs);
  }
  // Only a finished video is billed (Google's docs); a refused or empty result costs nothing.
  const sample=op.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
  if(op.error||!sample?.uri){const why=op.error?.message||op.response?.generateVideoResponse?.raiMediaFilteredReasons?.join('; ')||'no video';await this.save({...rec,status:'failed',error:why,prompt});throw Object.assign(new Error(`Veo stopped: ${why}`),{status:op.error?.code||400});}
  const bytes=await mediaBytes({uri:sample.uri},{key:this.key,fetchImpl:this.fetchImpl}),file=join(this.dir,`${name}-a${attempt}.mp4`);await writeFile(file,bytes);
  const costUsd=Math.round((seconds||VEO_FIRST)*VEO[this.tier].usdPerSecond*1e4)/1e4;
  rec={...rec,status:'done',file,costUsd,uri:sample.uri,doneAt:new Date().toISOString()};await this.save(rec);return {...rec,fresh:true};
 }
}

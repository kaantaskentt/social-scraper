import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {Pipeline} from './lib/pipeline.mjs';
import {dimensions,roles,VERSION} from './lib/schema.mjs';
import {metrics} from './lib/data.mjs';
import {checkProvider,download} from './lib/providers.mjs';
import {demo,artwork} from './lib/demo.mjs';
import {moneyReport} from './lib/money-report.mjs';
import {saveVideos,deleteVideos,videoInfo,videoPath,parseRange,streamFile} from './lib/videos.mjs';
import {Replicator} from './lib/replicate.mjs';
import {handleReplicate} from './lib/replicate-http.mjs';
import {handleShotlist} from './lib/shotlist.mjs';
import {SecretBuilder} from './lib/secret-run.mjs';
import {ReelPlanner} from './lib/reel-plan-run.mjs';
import {ReelMaker} from './lib/reel-make.mjs';
import {KitBuilder} from './lib/kit-run.mjs';
import {DnaBuilder} from './lib/dna-run.mjs';
import {ResultsTracker} from './lib/results.mjs';
import {higgsfieldBalance} from './lib/higgsfield-balance.mjs';
import {score,LATEST} from './public/money/index.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||5190),HOST='127.0.0.1';
const CSRF=randomBytes(32).toString('hex');
let localEnv={};try{localEnv=parseEnv(await readFile(join(ROOT,'.env'),'utf8'));}catch{}
const transcriptionProvider=localEnv.TRANSCRIPTION_PROVIDER||process.env.TRANSCRIPTION_PROVIDER||'fireworks';
const sessionKeys={};const verified={};
const keys=()=>({fireworks:sessionKeys.fireworks||localEnv.FIREWORKS_API_KEY||process.env.FIREWORKS_API_KEY,apify:sessionKeys.apify||localEnv.APIFY_TOKEN||process.env.APIFY_TOKEN||process.env.APIFY_API_TOKEN,groq:sessionKeys.groq||localEnv.GROQ_API_KEY||process.env.GROQ_API_KEY,jev:sessionKeys.jev||localEnv.TYPESAFE_API_KEY||process.env.TYPESAFE_API_KEY||process.env.JEV_API_KEY,gemini:sessionKeys.gemini||localEnv.GEMINI_API_KEY||process.env.GEMINI_API_KEY});
const pipeline=await new Pipeline(process.env.LAB_DATA_DIR||join(ROOT,'data'),keys,{transcriptionProvider,fireworksRpm:Number(localEnv.FIREWORKS_REQUESTS_PER_MINUTE||process.env.FIREWORKS_REQUESTS_PER_MINUTE||60),groqRpm:Number(localEnv.GROQ_REQUESTS_PER_MINUTE||process.env.GROQ_REQUESTS_PER_MINUTE||20)}).init();
let mediaActive=0;const mediaWaiters=[],mediaPending=new Map();async function mediaTask(fn){if(mediaActive>=8)await new Promise(resolve=>mediaWaiters.push(resolve));else mediaActive++;try{return await fn();}finally{if(mediaWaiters.length)mediaWaiters.shift()();else mediaActive--;}}
// Videos are saved locally when a run finishes (and at startup for finished runs), before Instagram links expire.
const videoJobs=new Map();
function startVideoSave(job){const existing=videoJobs.get(job.id);if(existing?.running)return existing;const state={running:true,progress:null,result:null,error:null};state.done=saveVideos(pipeline.root,job,{onProgress:p=>{state.progress=p;}}).then(r=>{state.result=r;}).catch(e=>{state.error=e.message;console.error(`Social Scraper: saving videos for ${job.id} failed: ${e.message}`);}).finally(()=>{state.running=false;});videoJobs.set(job.id,state);return state;}
const finished=j=>['complete','partial'].includes(j.status);
for(const j of pipeline.jobs.values())if(finished(j))startVideoSave(j);
pipeline.listeners.add(id=>{const j=pipeline.jobs.get(id);if(j&&finished(j)&&!videoJobs.get(id)?.running&&!videoJobs.get(id)?.result)startVideoSave(j);});
const replicator=await new Replicator(pipeline.root).init();
const secrets=new SecretBuilder(pipeline.root,keys);
const planner=new ReelPlanner(pipeline.root,keys);
const maker=new ReelMaker(pipeline.root,keys);
const kits=new KitBuilder(pipeline.root,keys);
const dnas=new DnaBuilder(pipeline.root,keys);
const results=new ResultsTracker(pipeline.root,keys);
const clients=new Set();pipeline.listeners.add(id=>{for(const res of clients)res.write(`data: ${JSON.stringify({id})}\n\n`);});
const publicJob=j=>{const copy=structuredClone(j);for(const p of copy.posts){if(p.transcript)delete p.transcript.raw;if(p.analysis)delete p.analysis.raw;}return copy;};
const summary=j=>({id:j.id,creator:j.creator,status:j.status,createdAt:j.createdAt,count:j.posts.length,completed:j.posts.filter(p=>p.analysis).length});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>20*1024*1024)throw new Error('Request exceeds 20 MB');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
const streams=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');},20000);streams.unref();
const server=http.createServer(async(req,res)=>{
 try{
  if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(req.headers.host)){json(res,403,{error:'Local requests only'});return;}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,`http://${HOST}:${PORT}`);const path=url.pathname;
  if(req.method!=='GET'&&(req.headers['x-lab-token']!==CSRF||req.headers.origin&&![`http://${HOST}:${PORT}`,`http://localhost:${PORT}`].includes(req.headers.origin))){json(res,403,{error:'Refresh the local app before changing data'});return;}
  if(path==='/api/bootstrap'){json(res,200,{token:CSRF,transcriptionProvider,dimensions:Object.fromEntries(Object.entries(dimensions).map(([k,v])=>[k,{title:v.title,criteria:v.question.criteria}])),roles,version:VERSION,connections:Object.fromEntries(Object.entries(keys()).map(([k,v])=>[k,{configured:Boolean(v),verified:verified[k]||false}])),runs:[...pipeline.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(summary)});return;}
  if(path==='/api/connections'&&req.method==='POST'){const data=await body(req);for(const name of ['apify','groq','fireworks','jev','gemini'])if(typeof data[name]==='string'&&data[name].trim()){sessionKeys[name]=data[name].trim();verified[name]=false;}json(res,200,{saved:true});return;}
  if(path==='/api/connections/check'&&req.method==='POST'){const results=Object.fromEntries(await Promise.all(Object.entries(keys()).map(async([name,key])=>[name,await checkProvider(name,key)])));for(const [name,r]of Object.entries(results))verified[name]=r.verified;json(res,200,results);return;}
  if(path==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
  if(path==='/api/higgsfield/balance'){json(res,200,await higgsfieldBalance());return;}
  if(path==='/api/demo'){json(res,200,demo());return;}
  if(path==='/api/runs'&&req.method==='POST'){const data=await body(req);const job=await pipeline.create(data,data.rows);json(res,201,publicJob(job));return;}
  if(await handleReplicate({req,res,path,url,root:pipeline.root,jobs:pipeline.jobs,replicator,json,body}))return;
  if(await handleShotlist({req,res,path,root:pipeline.root,jobs:pipeline.jobs,json,body,streamFile}))return;
  // Make one original reel: GET the plan; POST ideas or a script (Gemini and Jev, a few cents; no video is made here).
  const plan=path.match(/^\/api\/runs\/([\w-]+)\/reel-plan(?:\/(ideas|script|price|remake|voice))?$/);
  if(plan){const job=pipeline.jobs.get(plan[1]);if(!job){json(res,404,{error:'Run not found'});return;}
   if(req.method==='GET'&&!plan[2]){json(res,200,await planner.status(job));return;}
   if(req.method==='POST'&&plan[2]){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm first');
    json(res,plan[2]==='price'?200:202,plan[2]==='ideas'?await planner.startIdeas(job):plan[2]==='price'?await planner.reprice(job):plan[2]==='remake'?await planner.startRemake(job,String(data.postId||'')):plan[2]==='voice'?await planner.setVoice(job,String(data.mode||'')):await planner.startScript(job,Number(data.index)));return;}
   json(res,405,{error:'Method not allowed'});return;}
  // Make the pilot reel (spends Higgsfield credits): POST needs {confirm:true, mode, confirmCredits} matching a fresh price.
  const make=path.match(/^\/api\/runs\/([\w-]+)\/reel-make$/);
  if(make){const job=pipeline.jobs.get(make[1]);if(!job){json(res,404,{error:'Run not found'});return;}
   if(req.method==='GET'){json(res,200,await maker.status(job));return;}
   if(req.method==='POST'){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm the price first');json(res,202,await maker.start(job,{mode:data.mode,confirmCredits:Number(data.confirmCredits)}));return;}
   json(res,405,{error:'Method not allowed'});return;}
  // The channel kit (costs a few cents per picture): POST {confirm:true, redo?, format?} builds it; /approve marks it used.
  const kitRoute=path.match(/^\/api\/runs\/([\w-]+)\/kit(?:\/(approve|choose|voices))?$/);
  if(kitRoute){const job=pipeline.jobs.get(kitRoute[1]);if(!job){json(res,404,{error:'Run not found'});return;}
   if(req.method==='GET'&&!kitRoute[2]){json(res,200,await kits.status(job));return;}
   if(req.method==='POST'){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm the price first');
    if(kitRoute[2]==='approve'){json(res,200,await kits.approve(job));return;}
    // The hosts' designed voices (a few cents), for the preview; reels reuse them.
    if(kitRoute[2]==='voices'){const k=await readFile(join(kits.dir(job.id),'kit.json'),'utf8').then(JSON.parse).catch(()=>null);if(!k?.pictures?.length)throw new Error('Draw your look first');const keys2=keys();if(!keys2.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');
     await maker.channelVoices(job.id,k,keys2,entry=>kits.spend(job.id,entry));json(res,200,{done:true});return;}
    if(kitRoute[2]==='choose'){json(res,202,await kits.choose(job,{cast:Number.isInteger(data.cast)?data.cast:null,place:Number.isInteger(data.place)?data.place:null}));return;}json(res,202,await kits.start(job,{redo:data.redo,format:data.format}));return;}
   json(res,405,{error:'Method not allowed'});return;}
  const kitFile=path.match(/^\/channels\/([\w-]+)\/kit\/((?:opt\d-)?(?:face|turn|body)\d-[0-9a-f]{12}\.jpg|(?:opt\d-)?(?:hands|place|scene)-[0-9a-f]{12}\.jpg|voice-[a-z0-9-]{1,40}\.wav)$/);
  if(kitFile){const file=join(kits.dir(kitFile[1]),kitFile[2]);let bytes;try{bytes=await readFile(file);}catch{res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':kitFile[2].endsWith('.wav')?'audio/wav':'image/jpeg','Cache-Control':kitFile[2].endsWith('.wav')?'no-cache':'public, max-age=31536000, immutable'});res.end(bytes);return;}
  // Winner DNA (about half a cent a reel): every detail of every scored reel tested against the creator's own normal.
  // Real results: Kaan's handle, then a check scans his account (public, about 3 cents) and matches our reels.
  const resRoute=path.match(/^\/api\/runs\/([\w-]+)\/results(?:\/(handle|check))?$/);
  if(resRoute){const job=pipeline.jobs.get(resRoute[1]);if(!job){json(res,404,{error:'Run not found'});return;}
   if(req.method==='GET'&&!resRoute[2]){json(res,200,await results.status(job.id));return;}
   if(req.method==='POST'&&resRoute[2]==='handle'){const data=await body(req);json(res,200,await results.setHandle(job.id,data.handle));return;}
   if(req.method==='POST'&&resRoute[2]==='check'){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm the check first');json(res,200,await results.check(job.id,(await maker.status(job)).reels));return;}
  }
  const dnaRoute=path.match(/^\/api\/runs\/([\w-]+)\/dna$/);
  if(dnaRoute){const job=pipeline.jobs.get(dnaRoute[1]);if(!job){json(res,404,{error:'Run not found'});return;}
   if(req.method==='GET'){json(res,200,await dnas.status(job));return;}
   if(req.method==='POST'){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm the price first');json(res,202,await dnas.start(job));return;}
   json(res,405,{error:'Method not allowed'});return;}
  // The feedback loop: one tap on a finished reel (👍 or 👎 with reasons).
  const cov=path.match(/^\/api\/runs\/([\w-]+)\/reel-cover$/);
  if(cov&&req.method==='POST'){const job=pipeline.jobs.get(cov[1]);if(!job){json(res,404,{error:'Run not found'});return;}const data=await body(req);json(res,200,await maker.makeCover(job,String(data.reelId||'')));return;}
  const fb=path.match(/^\/api\/runs\/([\w-]+)\/reel-feedback$/);
  if(fb){const job=pipeline.jobs.get(fb[1]);if(!job){json(res,404,{error:'Run not found'});return;}if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return;}
   const data=await body(req);json(res,200,await maker.feedback(job,String(data.reelId||''),{verdict:data.verdict,reasons:Array.isArray(data.reasons)?data.reasons.map(String):[]}));return;}
  const made=path.match(/^\/channels\/([\w-]+)\/([\w-]+)\/(reel\.mp4|cover\.jpg|kit\.png|shot-[\w-]+\.mp4)$/);
  if(made){const file=join(pipeline.root,'channels',made[1],'reels',made[2],made[3]);let info;try{info=await stat(file);}catch{res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':made[3].endsWith('.png')?'image/png':made[3].endsWith('.jpg')?'image/jpeg':'video/mp4','Content-Length':info.size,'Accept-Ranges':'bytes','Cache-Control':'no-cache'});streamFile(res,file);return;}
  const vids=path.match(/^\/api\/runs\/([\w-]+)\/videos(?:\/(save|delete))?$/);
  if(vids){const job=pipeline.jobs.get(vids[1]);if(!job){json(res,404,{error:'Run not found'});return;}const state=videoJobs.get(job.id);
   if(vids[2]==='save'&&req.method==='POST')startVideoSave(job);
   else if(vids[2]==='delete'&&req.method==='POST'){if(state?.running){json(res,409,{error:'Videos are still being saved. Try again when saving finishes.'});return;}videoJobs.delete(job.id);json(res,200,await deleteVideos(pipeline.root,job));return;}
   else if(vids[2]){json(res,405,{error:'Method not allowed'});return;}
   const now=videoJobs.get(job.id);json(res,200,{...await videoInfo(pipeline.root,job),saving:Boolean(now?.running),progress:now?.progress||null,lastResult:now?.result||null,error:now?.error||null});return;}
  const match=path.match(/^\/api\/runs\/([\w-]+)(?:\/(run|pause|export|metrics|attach|money|secret|secret-feedback))?$/);
  if(match){const [,id,action]=match;const job=pipeline.jobs.get(id);if(!job){json(res,404,{error:'Run not found'});return;}
   if(action==='run'&&req.method==='POST'){const settings=await body(req);if(settings.concurrency!==undefined){const n=Number(settings.concurrency);if(!Number.isInteger(n)||n<1||n>12)throw new Error('Concurrency must be 1 to 12');job.concurrency=n;}await pipeline.run(id);json(res,200,publicJob(job));return;}
   if(action==='pause'&&req.method==='POST'){await pipeline.pause(id);json(res,200,{paused:true});return;}
   if(action==='attach'&&req.method==='POST'){await pipeline.attachScrape(id,(await body(req)).runId);json(res,200,{attached:true});return;}
   if(action==='metrics'){json(res,200,metrics(job.posts,{dimension:url.searchParams.get('dimension')||'mechanism',metric:url.searchParams.get('metric')||'views',minAgeDays:Number(url.searchParams.get('minAgeDays')??7)}));return;}
   if(action==='money'){json(res,200,await moneyReport(job,url.searchParams.get('version'),pipeline.root));return;}
   // Channel Secret: GET shows the saved page, the build in progress, or the estimate; POST starts a paid build.
   if(action==='secret-feedback'&&req.method==='POST'){const {answer}=await body(req);json(res,200,await secrets.feedback(job,answer));return;}
   if(action==='secret'){const {results}=score(job,LATEST);
    if(req.method==='POST'){const data=await body(req);if(data.confirm!==true)throw new Error('Confirm the cost first');json(res,202,await secrets.start(job,results,{rewrite:data.rewrite===true}));return;}
    json(res,200,await secrets.status(job,results));return;}
   if(action==='export'){res.setHeader('Content-Disposition',`attachment; filename="${job.creator}-${id}.json"`);json(res,200,publicJob(job));return;}
   json(res,200,publicJob(job));return;
  }
  const video=path.match(/^\/videos\/([\w-]+)\/([\w-]+)$/);
  if(video){let file,info;try{file=videoPath(pipeline.root,video[1],video[2]);info=await stat(file);}catch{res.writeHead(404);res.end();return;}
   const range=req.headers.range;if(range){const r=parseRange(range,info.size);if(!r){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${r.start}-${r.end}/${info.size}`,'Content-Length':r.end-r.start+1,'Cache-Control':'no-cache'});streamFile(res,file,{start:r.start,end:r.end});return;}
   res.writeHead(200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':info.size,'Cache-Control':'no-cache'});streamFile(res,file);return;}
  const art=path.match(/^\/demo-art\/(\d+)\.svg$/);if(art){res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'});res.end(artwork(Number(art[1])));return;}
  const thumb=path.match(/^\/media\/([\w-]+)\/([\w-]+)$/);if(thumb){const job=pipeline.jobs.get(thumb[1]),post=job?.posts.find(p=>p.id===thumb[2]);if(!post?.thumbnailUrl){res.writeHead(404);res.end();return;}const file=join(pipeline.root,'media',post.id+'.img');let bytes;try{bytes=await readFile(file);}catch{if(!mediaPending.has(file))mediaPending.set(file,mediaTask(async()=>{const result=await download(post.thumbnailUrl,8*1024*1024);if(!/^image\/(jpeg|png|webp)/.test(result.type))throw new Error('Unsupported thumbnail format');await writeFile(file,result.bytes);return result.bytes;}).finally(()=>mediaPending.delete(file)));bytes=await mediaPending.get(file);}const type=bytes[0]===0x89?'image/png':bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'image/jpeg';res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=86400'});res.end(bytes);return;}
  const files={'/record':'record.html','/record.js':'record.js','/record.css':'record.css','/':'flow.html','/lab':'index.html','/flow.js':'flow.js','/flow.css':'flow.css','/flow-views.mjs':'flow-views.mjs','/scan-map.mjs':'scan-map.mjs','/app.js':'app.js','/research.mjs':'research.mjs','/money-view.mjs':'money-view.mjs','/anatomy-view.mjs':'anatomy-view.mjs','/replicate-view.mjs':'replicate-view.mjs','/studio-view.mjs':'studio-view.mjs','/reel-plan-view.mjs':'reel-plan-view.mjs','/shotlist-text.mjs':'shotlist-text.mjs','/shot-lines.mjs':'shot-lines.mjs','/secret-view.mjs':'secret-view.mjs','/secret-labels.mjs':'secret-labels.mjs','/secret-mechanisms.mjs':'secret-mechanisms.mjs','/handles.mjs':'handles.mjs','/styles.css':'styles.css','/theme.css':'theme.css','/money/index.mjs':'money/index.mjs','/money/1.0.mjs':'money/1.0.mjs'};
  if(files[path]){const file=join(ROOT,'public',files[path]);const content=await readFile(file);res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':'text/html','Cache-Control':'no-cache'});res.end(content);return;}
  json(res,404,{error:'Not found'});
 }catch(e){json(res,400,{error:e.message||'Request failed'});}
});
server.listen(PORT,HOST,()=>console.log(`Social Scraper ready at http://${HOST}:${PORT}`));

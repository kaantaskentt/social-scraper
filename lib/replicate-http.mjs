// HTTP routes for Replicate: reference image uploads, cost check, start, list, and streaming the finished video.
import {mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {videoPath,parseRange} from './videos.mjs';
import {detectShots} from './blueprint.mjs';
import {download} from './providers.mjs';

const IMAGE_TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const REF_ID=/^[0-9a-f-]{36}$/;

export async function saveReference(root,{dataUrl}){
 const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');
 if(!m)throw new Error('Upload a PNG, JPG or WebP image');
 const bytes=Buffer.from(m[2],'base64');if(bytes.length>10*1024*1024)throw new Error('Images must be 10 MB or smaller');
 const id=randomUUID(),ext=IMAGE_TYPES[m[1]];await mkdir(join(root,'references'),{recursive:true});
 await writeFile(join(root,'references',`${id}.${ext}`),bytes,{mode:0o600});
 return {id,url:`/references/${id}`};
}
async function referencePath(root,id){
 if(!REF_ID.test(id))throw new Error('Unknown reference image');
 const name=(await readdir(join(root,'references')).catch(()=>[])).find(n=>n.startsWith(id+'.'));
 if(!name)throw new Error('Unknown reference image');return join(root,'references',name);
}
// The reel's own video: the saved local copy, or a fresh download while the Instagram link still works.
async function sourceFor(root,job,postId){
 const saved=videoPath(root,job.id,postId);if(existsSync(saved))return saved;
 const post=job.posts.find(p=>p.id===postId);if(!post?.videoUrl)throw new Error('This reel has no video to copy');
 const file=join(root,'replicas',`src-${job.id}-${postId}.mp4`);if(existsSync(file))return file;
 await mkdir(join(root,'replicas'),{recursive:true});const {bytes}=await download(post.videoUrl);await writeFile(file,bytes);return file;
}
async function inputFor(root,job,data){
 if(!job.posts.some(p=>p.id===data.postId))throw new Error('Reel not found in this run');
 const refs=Array.isArray(data.referenceIds)?data.referenceIds.slice(0,4):[];if(!refs.length)throw new Error('Add at least one reference image');
 const sourcePath=await sourceFor(root,job,data.postId);
 const {shots}=await detectShots(sourcePath);
 return {runId:job.id,postId:data.postId,sourcePath,imagePaths:await Promise.all(refs.map(id=>referencePath(root,id))),shots,
  overlayText:String(data.overlayText||'').slice(0,80),keepSound:data.keepSound!==false};
}
const publicRep=r=>({id:r.id,runId:r.runId,postId:r.postId,status:r.status,credits:r.credits,error:r.error,createdAt:r.createdAt,overlayText:r.overlayText,keepSound:r.keepSound,video:r.status==='done'?`/replicas/${r.id}.mp4`:null});

// Returns true when the request was one of ours.
export async function handleReplicate({req,res,path,url,root,jobs,replicator,json,body}){
 if(path==='/api/references'&&req.method==='POST'){json(res,200,await saveReference(root,await body(req)));return true;}
 const ref=path.match(/^\/references\/([0-9a-f-]{36})$/);
 if(ref){let file;try{file=await referencePath(root,ref[1]);}catch{res.writeHead(404);res.end();return true;}const ext=file.split('.').pop();res.writeHead(200,{'Content-Type':ext==='jpg'?'image/jpeg':`image/${ext}`,'Cache-Control':'no-cache'});createReadStream(file).pipe(res);return true;}
 const rep=path.match(/^\/api\/runs\/([\w-]+)\/replicate(\/estimate)?$/);
 if(rep&&req.method==='POST'){const job=jobs.get(rep[1]);if(!job){json(res,404,{error:'Run not found'});return true;}const data=await body(req);const input=await inputFor(root,job,data);
  if(rep[2]){const est=await replicator.estimate(input);json(res,200,{credits:est.credits,prompt:est.prompt,seconds:Math.round(est.duration)});return true;}
  json(res,200,publicRep(await replicator.start({...input,confirmCredits:Number(data.confirmCredits)})));return true;}
 if(path==='/api/replicas'){json(res,200,replicator.list({runId:url.searchParams.get('runId'),postId:url.searchParams.get('postId')}).map(publicRep));return true;}
 const vid=path.match(/^\/replicas\/([0-9a-f-]{36})\.mp4$/);
 if(vid){const file=join(root,'replicas',`${vid[1]}.mp4`);let info;try{info=await stat(file);}catch{res.writeHead(404);res.end();return true;}
  const range=req.headers.range;if(range){const r=parseRange(range,info.size);if(!r){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return true;}
   res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${r.start}-${r.end}/${info.size}`,'Content-Length':r.end-r.start+1});createReadStream(file,{start:r.start,end:r.end}).pipe(res);return true;}
  res.writeHead(200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':info.size});createReadStream(file).pipe(res);return true;}
 return false;
}

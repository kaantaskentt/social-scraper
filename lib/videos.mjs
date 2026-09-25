// Local copies of reel videos, so playback and "jump to this part" keep working after Instagram links expire
// (about a day after a scrape). One folder per run (data/videos/<runId>/<postId>.mp4): deleting one run's videos
// never touches another run, and never touches run data (scores, transcripts and labels stay).
import {mkdir,readdir,stat,rm,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {download} from './providers.mjs';

const ID=/^[\w-]{1,90}$/;
export function videoDir(root,runId){if(!ID.test(runId))throw new Error('Invalid run id');return join(root,'videos',runId);}
export function videoPath(root,runId,postId){if(!ID.test(postId))throw new Error('Invalid reel id');return join(videoDir(root,runId),postId+'.mp4');}

// Instagram CDN links carry their expiry as hex seconds in `oe`. No `oe` means unknown: try it.
export function linkExpired(url,now=Date.now()){
 try{const oe=new URL(url).searchParams.get('oe');return oe!==null&&/^[0-9a-f]+$/i.test(oe)&&parseInt(oe,16)*1000<=now;}catch{return false;}
}

export async function videoInfo(root,job){
 const dir=videoDir(root,job.id),ids=new Set(job.posts.map(p=>p.id));let files=[];
 try{files=await readdir(dir);}catch(e){if(e.code!=='ENOENT')throw e;}
 const saved=[];let bytes=0;
 for(const f of files){if(!f.endsWith('.mp4'))continue;const id=f.slice(0,-4);if(!ids.has(id))continue;saved.push(id);bytes+=(await stat(join(dir,f))).size;}
 return {saved:saved.sort(),bytes,total:job.posts.filter(p=>p.videoUrl).length};
}

export async function saveVideos(root,job,{concurrency=3,downloader=download,onProgress=()=>{}}={}){
 await mkdir(videoDir(root,job.id),{recursive:true});
 const have=new Set((await videoInfo(root,job)).saved);
 const candidates=job.posts.filter(p=>p.videoUrl&&ID.test(p.id)&&!have.has(p.id));
 const expired=candidates.filter(p=>linkExpired(p.videoUrl)).map(p=>p.id), todo=candidates.filter(p=>!linkExpired(p.videoUrl));
 const failed=[];let saved=0,cursor=0;
 const worker=async()=>{while(cursor<todo.length){const p=todo[cursor++];
  try{const {bytes,type}=await downloader(p.videoUrl);if(!/^video\//.test(type||''))throw new Error(`not a video (${type||'unknown type'})`);
   const file=videoPath(root,job.id,p.id),tmp=`${file}.${randomUUID()}.tmp`;await writeFile(tmp,bytes,{mode:0o600});await rename(tmp,file);saved++;}
  catch(e){failed.push({id:p.id,error:e.message});}
  onProgress({saved,failed:failed.length,total:todo.length});}};
 await Promise.all(Array.from({length:Math.min(concurrency,todo.length)},worker));
 return {saved,failed,expired,skipped:have.size};
}

export async function deleteVideos(root,job){
 const info=await videoInfo(root,job);await rm(videoDir(root,job.id),{recursive:true,force:true});
 return {deleted:info.saved.length,bytes:info.bytes};
}

// One byte range ("bytes=a-b", "bytes=a-", "bytes=-n") for video seeking; null when unsatisfiable or multi-range.
export function parseRange(header,size){
 const m=/^bytes=(\d*)-(\d*)$/.exec(header||'');if(!m||(m[1]===''&&m[2]===''))return null;
 let start,end;
 if(m[1]===''){const n=Number(m[2]);if(n<=0)return null;start=Math.max(0,size-n);end=size-1;}
 else{start=Number(m[1]);end=m[2]===''?size-1:Math.min(Number(m[2]),size-1);}
 return start<=end&&start<size?{start,end}:null;
}

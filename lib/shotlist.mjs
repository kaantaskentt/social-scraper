// Shot list: turn a winning reel into a plan Kaan can film himself on a phone (free, no AI video).
// A "part" is one stretch of the script with one role (hook, problem, advice, call to action...), with the camera
// shots it covers, so each part shows what was said, how it was filmed (one frame per shot) and a line to write.
import {mkdir,readFile,stat} from 'node:fs/promises';
import {writeJson} from './json.mjs';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {detectShots,extractKeyframes,CUTS_VERSION} from './blueprint.mjs';
import {sourceFor} from './replicate-http.mjs';
import {TIPS} from '../public/shotlist-text.mjs';
export {TIPS,shotListText} from '../public/shotlist-text.mjs';

const ID=/^[\w-]{1,90}$/, MAX_VISUAL_PARTS=8, MAX_SPOKEN_PARTS=7, MAX_LINE=500;

const round1=n=>Math.round(n*10)/10;
const overlaps=(s,a,b)=>Math.min(s.end,b)-Math.max(s.start,a)>0;

export function buildParts(anatomy,shots){
 const timed=(anatomy||[]).filter(a=>Number.isFinite(a.start)&&Number.isFinite(a.end)&&a.end>a.start);
 if(!timed.length){ // no speech: the camera shots are the plan, grouped evenly into at most 8 parts
  const k=Math.min(MAX_VISUAL_PARTS,shots.length),cut=i=>Math.round(i*shots.length/k);
  return Array.from({length:k},(_,i)=>{const g=shots.slice(cut(i),cut(i+1));return {role:'visual',start:g[0].start,end:g.at(-1).end,said:'',shots:g.map(s=>s.index)};});
 }
 const parts=[];
 for(const a of timed){const last=parts.at(-1);
  if(last&&last.role===(a.value||'other')){last.end=a.end;last.said+=' '+a.text.trim();}
  else parts.push({role:a.value||'other',start:a.start,end:a.end,said:a.text.trim()});}
 // Jev labels every sentence, so roles can flip back and forth; for filming, merge the shortest middle part into its
 // shorter neighbour until at most 7 remain. The opening hook and a closing call to action always stay on their own.
 const fixed=i=>(i===0&&parts[0].role==='hook')||(i===parts.length-1&&parts[i].role==='cta');
 const len=p=>p.end-p.start;
 while(parts.length>MAX_SPOKEN_PARTS){
  let pick=-1;for(let i=0;i<parts.length;i++)if(!fixed(i)&&(pick<0||len(parts[i])<len(parts[pick])))pick=i;
  const left=pick-1,right=pick+1,canLeft=left>=0&&!fixed(left),canRight=right<parts.length&&!fixed(right);
  const into=canLeft&&(!canRight||len(parts[left])<=len(parts[right]))?left:canRight?right:left>=0?left:right;
  const [a,b]=into<pick?[parts[into],parts[pick]]:[parts[pick],parts[into]];
  const merged={role:len(a)>=len(b)?a.role:b.role,start:a.start,end:b.end,said:`${a.said} ${b.said}`};
  if(fixed(into))merged.role=parts[into].role;
  parts.splice(Math.min(pick,into),2,merged);
 }
 return parts.map(p=>({...p,shots:shots.filter(s=>overlaps(s,p.start,p.end)).map(s=>s.index)}));
}

export function pace(shots,duration){return {shots:shots.length,cuts:Math.max(0,shots.length-1),secondsPerShot:round1(duration/Math.max(1,shots.length))};}


const dirFor=(root,runId,postId)=>{if(!ID.test(runId)||!ID.test(postId))throw new Error('Invalid reel');return join(root,'shotlists',runId,postId);};
// Your lines are stored by the start time of the part they belong to, so a re-analysed script never moves a line onto
// another part; lines whose part is gone are returned as "unplaced" instead of being dropped.
const slot=part=>part.start.toFixed(2);
async function readSaved(dir){try{return JSON.parse(await readFile(join(dir,'lines.json'),'utf8'));}catch{return {};}}
function placeLines(saved,parts){
 const byStart=Array.isArray(saved)?Object.fromEntries(saved.map((t,i)=>[parts[i]?slot(parts[i]):`old-${i}`,t])):saved.byStart||{};
 const used=new Set(parts.map(slot));
 return {lines:parts.map(p=>typeof byStart[slot(p)]==='string'?byStart[slot(p)]:''),unplaced:Object.entries(byStart).filter(([k,t])=>!used.has(k)&&typeof t==='string'&&t.trim()).map(([,t])=>t),byStart};
}

// Cuts and frames are computed once per video and kept on disk (rebuilt if the video file changes); simultaneous
// requests share one computation.
const building=new Map();
export async function shotsFor(root,job,postId){
 const dir=dirFor(root,job.id,postId),meta=join(dir,'meta.json');
 const video=await sourceFor(root,job,postId),info=await stat(video),fingerprint=`${info.size}-${Math.round(info.mtimeMs)}-cuts${CUTS_VERSION}`;
 if(existsSync(meta)){const cached=JSON.parse(await readFile(meta,'utf8'));if(cached.fingerprint===fingerprint)return cached;}
 const key=`${dir}#${fingerprint}`;
 if(!building.has(key))building.set(key,(async()=>{
  const {duration,shots}=await detectShots(video);await mkdir(dir,{recursive:true});await extractKeyframes(video,shots,dir);
  const value={duration,shots,fingerprint};await writeJson(meta,value);return value;
 })().finally(()=>building.delete(key)));
 return building.get(key);
}
async function partsFor(root,job,postId){
 const post=job.posts.find(p=>p.id===postId);if(!post)throw new Error('Reel not found in this run');
 const {duration,shots}=await shotsFor(root,job,postId);
 return {duration,shots,parts:buildParts(post.excludedReason?[]:post.analysis?.anatomy,shots),post};
}

export async function buildShotList(root,job,postId){
 const {duration,shots,parts:raw,post}=await partsFor(root,job,postId);
 // The first seconds decide if people stay, whatever label the first part got, so part 1 always gets the hook tip.
 const parts=raw.map((p,i)=>({...p,tip:i===0&&p.role!=='visual'?TIPS.hook:TIPS[p.role]||TIPS.other}));
 const {lines,unplaced}=placeLines(await readSaved(dirFor(root,job.id,postId)),parts);
 return {runId:job.id,postId,account:job.creator,url:post.url||'',duration,pace:pace(shots,duration),parts,
  frames:shots.map(s=>`/shotlists/${job.id}/${postId}/shot-${s.index}.jpg`),lines,unplaced};
}

// Saves for one reel are written one after another, in the order they arrived, so an older save never lands last.
const writing=new Map();
export async function saveLines(root,job,postId,lines){
 if(!Array.isArray(lines)||lines.length>50||lines.some(l=>typeof l!=='string'))throw new Error('Lines must be a list of text');
 const dir=dirFor(root,job.id,postId);
 const next=(writing.get(dir)||Promise.resolve()).catch(()=>{}).then(async()=>{
  const {parts}=await partsFor(root,job,postId);await mkdir(dir,{recursive:true});
  const {byStart}=placeLines(await readSaved(dir),parts);
  parts.forEach((p,i)=>{if(i<lines.length)byStart[slot(p)]=lines[i].slice(0,MAX_LINE);});
  await writeJson(join(dir,'lines.json'),{version:2,byStart});return {saved:Math.min(lines.length,parts.length)};
 });
 writing.set(dir,next);return next;
}

export function framePath(root,runId,postId,index){if(!/^\d{1,4}$/.test(index))throw new Error('Invalid frame');return join(dirFor(root,runId,postId),`shot-${index}.jpg`);}

// HTTP: the list (built on first open), your lines, and the frames. Returns true when the request was one of ours.
export async function handleShotlist({req,res,path,root,jobs,json,body,streamFile}){
 const m=path.match(/^\/api\/runs\/([\w-]+)\/shotlist\/([\w-]+)(\/lines)?$/);
 if(m){const job=jobs.get(m[1]);if(!job){json(res,404,{error:'Run not found'});return true;}
  if(m[3]&&req.method==='POST'){json(res,200,await saveLines(root,job,m[2],(await body(req)).lines));return true;}
  if(!m[3]&&req.method==='GET'){json(res,200,await buildShotList(root,job,m[2]));return true;}
  json(res,405,{error:'Method not allowed'});return true;}
 const f=path.match(/^\/shotlists\/([\w-]+)\/([\w-]+)\/shot-(\d{1,4})\.jpg$/);
 if(f){let file;try{file=framePath(root,f[1],f[2],f[3]);}catch{res.writeHead(404);res.end();return true;}
  if(!existsSync(file)){res.writeHead(404);res.end();return true;}
  res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'});streamFile(res,file);return true;}
 return false;
}

// Reel blueprint, layer 1 (free, local): where the cuts are, one keyframe per shot, and which spoken parts fall in each shot.
// The visual description of each shot (layer 1b) and the recreation (layer 2) build on this.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
const exec=promisify(execFile);
const MIN_SHOT=0.4;
// Cuts are spikes, not a fixed threshold (the adaptive idea from PySceneDetect). A frame is a cut when its change score is
// at least 0.12 and at least 4 times the average of the 8 frames before and after it. Checked by eye on Ken's reels
// (2026-09-27): a fixed 0.25 missed jump cuts in the same kitchen; a fixed 0.15 found them but turned an animated zoom
// into 88 "cuts". Bump CUTS_VERSION when this changes, so cached shot lists are rebuilt.
export const CUTS_VERSION=2;
const CUT_FLOOR=0.12, CUT_RATIO=4, CUT_WINDOW=8;
const round=n=>Math.round(n*1000)/1000;

async function probeDuration(file){
 const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{timeout:15000});
 const d=Number(stdout.trim());if(!Number.isFinite(d)||d<=0)throw new Error('Could not read the video length');return d;
}
// rows: [seconds, change score] per frame. Returns the cut times.
// A spike closer than minGap to the start (or the previous cut) is skipped, so it can never hide the next real cut;
// missing scores are ignored.
export function pickCuts(rows,{floor=CUT_FLOOR,ratio=CUT_RATIO,win=CUT_WINDOW,minGap=MIN_SHOT}={}){
 const cuts=[];let last=0;
 for(let i=1;i<rows.length;i++){const [t,s]=rows[i];if(!Number.isFinite(s)||s<floor)continue;
  const around=rows.slice(Math.max(0,i-win),i).concat(rows.slice(i+1,i+1+win)).map(r=>r[1]).filter(Number.isFinite);const avg=around.reduce((a,b)=>a+b,0)/Math.max(1,around.length);
  if(s>=ratio*avg&&t-last>=minGap){cuts.push(t);last=t;}}
 return cuts;
}
async function sceneCuts(file){
 // ffmpeg scores how different each frame is from the previous one (0 to 1), for every frame.
 const {stderr}=await exec('ffmpeg',['-hide_banner','-i',file,'-vf',"select='gte(scene,0)',metadata=print:key=lavfi.scene_score",'-an','-f','null','-'],{timeout:180000,maxBuffer:64*1024*1024});
 const times=[...stderr.matchAll(/pts_time:([\d.]+)/g)].map(m=>Number(m[1])),scores=[...stderr.matchAll(/lavfi\.scene_score=([\d.]+)/g)].map(m=>Number(m[1]));
 if(times.length!==scores.length)throw new Error('Could not read the scene scores from ffmpeg');
 return pickCuts(times.map((t,i)=>[t,scores[i]]));
}

// Shots cover the whole video; shots shorter than 0.4 s are merged into their neighbour. `cuts`/`duration` can be passed for tests.
export async function detectShots(file,{cuts,duration}={}){
 const total=duration??await probeDuration(file), raw=(cuts??await sceneCuts(file)).sort((a,b)=>a-b);
 const kept=[0];for(const c of raw)if(c-kept.at(-1)>=MIN_SHOT&&total-c>=MIN_SHOT)kept.push(c);
 const bounds=[...kept,total];
 return {duration:round(total),shots:bounds.slice(0,-1).map((start,i)=>({index:i,start:round(start),end:round(bounds[i+1])}))};
}

export async function extractKeyframes(file,shots,dir){
 const out=[];
 for(const s of shots){const path=join(dir,`shot-${s.index}.jpg`);await exec('ffmpeg',['-v','error','-y','-ss',String((s.start+s.end)/2),'-i',file,'-frames:v','1','-q:v','3',path],{timeout:30000});out.push(path);}
 return out;
}

// Each spoken part goes to the shot it overlaps most; words and script roles (hook, setup...) are listed per shot.
export function alignShots(shots,anatomy=[]){
 const out=shots.map(s=>({...s,duration:round(s.end-s.start),words:[],roles:[]}));
 for(const part of anatomy){
  if(part.start==null||part.end==null)continue;
  let best=-1,overlap=0;out.forEach((s,i)=>{const o=Math.min(s.end,part.end)-Math.max(s.start,part.start);if(o>overlap){overlap=o;best=i;}});
  if(best<0)continue;out[best].words.push(part.text);if(!out[best].roles.includes(part.value))out[best].roles.push(part.value);
 }
 return out;
}

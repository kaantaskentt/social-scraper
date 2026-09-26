// Reel blueprint, layer 1 (free, local): where the cuts are, one keyframe per shot, and which spoken parts fall in each shot.
// The visual description of each shot (layer 1b) and the recreation (layer 2) build on this.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
const exec=promisify(execFile);
const MIN_SHOT=0.4, SCENE_THRESHOLD=0.25; // 0.25 matched the cuts seen by eye on a real reel; 0.3 missed two, 0.2 counted a hand move
const round=n=>Math.round(n*1000)/1000;

async function probeDuration(file){
 const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{timeout:15000});
 const d=Number(stdout.trim());if(!Number.isFinite(d)||d<=0)throw new Error('Could not read the video length');return d;
}
async function sceneCuts(file){
 // ffmpeg scores how different each frame is from the previous one; above the threshold is a cut.
 const {stderr}=await exec('ffmpeg',['-hide_banner','-i',file,'-vf',`select='gt(scene,${SCENE_THRESHOLD})',showinfo`,'-an','-f','null','-'],{timeout:120000,maxBuffer:32*1024*1024});
 return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
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

// Turns clips + a voiceover into a finished 9:16 reel with the Remotion project in render/.
// Voice is normalised to -16 LUFS (a common level for phone playback), captions are timed from the final audio.
import {mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {chunkCaptions,transcribeWords} from './captions.mjs';
const exec=promisify(execFile);
const RENDER_DIR=join(dirname(fileURLToPath(import.meta.url)),'..','render');

export async function mediaSeconds(file){const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file]);const d=Number(stdout.trim());if(!Number.isFinite(d)||d<=0)throw new Error(`Could not read the length of ${file}`);return d;}
export async function normaliseVoice(input,output){await exec('ffmpeg',['-v','error','-y','-i',input,'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000','-ac','1',output],{timeout:120000});return output;}

// Where each clip sits on the timeline; the reel lasts as long as the voice plus the end card, and the last clip is
// held (its video loops) if the clips are shorter.
export function timeline(clipSeconds,voiceSeconds,endCardSeconds=2.5){
 const total=Math.max(voiceSeconds+endCardSeconds,clipSeconds.reduce((a,b)=>a+b,0));let at=0;
 const clips=clipSeconds.map((d,i)=>{const start=at;at+=d;return {start,duration:i===clipSeconds.length-1?Math.max(d,total-start):d};});
 return {clips,total:Math.round(total*100)/100,endCardStart:Math.round(voiceSeconds*100)/100};
}

// clips: local mp4 paths; voice: local audio path; out: mp4 path. Captions are timed on the final normalised voice
// (Groq word timestamps, needs groqKey) unless word timings are passed in.
export async function renderReel({clips,voice,words=null,groqKey,hook=null,endCard=null,music=null,out}){
 const job=`jobs/${randomUUID()}`,dir=join(RENDER_DIR,'public',job);await mkdir(dir,{recursive:true});
 try{
  const clipFiles=[];for(const [i,c] of clips.entries()){const name=`clip-${i}${extname(c)||'.mp4'}`;await copyFile(c,join(dir,name));clipFiles.push(`${job}/${name}`);}
  await normaliseVoice(voice,join(dir,'voice.wav'));const voiceSeconds=await mediaSeconds(join(dir,'voice.wav'));
  words??=await transcribeWords(join(dir,'voice.wav'),groqKey);
  if(music)await copyFile(music.file,join(dir,'music'+extname(music.file)));
  const t=timeline(await Promise.all(clips.map(mediaSeconds)),voiceSeconds,endCard?2.5:0.5);
  const props={clips:t.clips.map((c,i)=>({src:clipFiles[i],...c})),voice:{src:`${job}/voice.wav`},music:music?{src:`${job}/music${extname(music.file)}`,volume:music.volume??0.12}:null,
   captions:chunkCaptions(words),hook,endCard:endCard?{...endCard,start:t.endCardStart,duration:t.total-t.endCardStart}:null,totalSeconds:t.total};
  const propsFile=join(dir,'props.json');await writeFile(propsFile,JSON.stringify(props));await mkdir(dirname(out),{recursive:true});
  await exec(join(RENDER_DIR,'node_modules','.bin','remotion'),['render','src/index.jsx','Reel',out,`--props=${propsFile}`,'--log=error'],{cwd:RENDER_DIR,timeout:15*60000,maxBuffer:64*1024*1024});
  return {out,seconds:t.total,captions:props.captions.length,words};
 }finally{await rm(dir,{recursive:true,force:true});}
}

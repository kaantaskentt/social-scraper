// Turns clips + a voiceover into a finished 9:16 reel with the Remotion project in render/.
// Voice is normalised to -16 LUFS (a common level for phone playback), captions are timed from the final audio.
import {mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {chunkCaptions,transcribeWords,alignScript,shotTimeline} from './captions.mjs';
const exec=promisify(execFile);
const RENDER_DIR=join(dirname(fileURLToPath(import.meta.url)),'..','render');

export async function mediaSeconds(file){const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file]);const d=Number(stdout.trim());if(!Number.isFinite(d)||d<=0)throw new Error(`Could not read the length of ${file}`);return d;}
// A finished reel must have no black frames, a sound track, and about the planned length; anything else fails loudly.
export async function checkRender(file,expectedSeconds){
 const {stderr}=await exec('ffmpeg',['-v','info','-i',file,'-vf','blackdetect=d=0:pic_th=0.9:pix_th=0.12','-f','null','-'],{timeout:300000,maxBuffer:64*1024*1024});
 const black=(stderr.match(/black_start:/g)||[]).length;
 const {stdout}=await exec('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',file]);const audio=stdout.includes('audio');
 const seconds=await mediaSeconds(file);const problems=[];
 if(black)problems.push(`${black} black frame stretch${black>1?'es':''}`);if(!audio)problems.push('no sound');if(Math.abs(seconds-expectedSeconds)>1)problems.push(`length ${seconds.toFixed(1)} s instead of ${expectedSeconds} s`);
 if(problems.length)throw new Error(`The rendered reel failed its check: ${problems.join(', ')}`);return {black,audio,seconds};
}
export async function normaliseVoice(input,output){await exec('ffmpeg',['-v','error','-y','-i',input,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000','-ac','1',output],{timeout:120000});return output;}

// Where each clip sits on the timeline; the reel lasts as long as the voice plus the end card, and the last clip is
// held (its video loops) if the clips are shorter.
export function timeline(clipSeconds,voiceSeconds,endCardSeconds=2.5){
 const total=Math.max(voiceSeconds+endCardSeconds,clipSeconds.reduce((a,b)=>a+b,0));let at=0;
 const clips=clipSeconds.map((d,i)=>{const start=at;at+=d;return {start,duration:i===clipSeconds.length-1?Math.max(d,total-start):d};});
 return {clips,total:Math.round(total*100)/100,endCardStart:Math.round(voiceSeconds*100)/100};
}

// clips: local mp4 paths; voice: local audio path; out: mp4 path. Captions are timed on the final normalised voice
// (Groq word timestamps, needs groqKey) unless word timings are passed in. With `script` ({voiceover:[{line,shot}],
// shots:[{id,seconds}]}) the captions use the script's spelling and each shot lines up with its voiceover line.
// sayText: what is spoken (a kit reel's own sound track); captions show these words, timed from the real audio.
export async function renderReel({clips,voice,words=null,groqKey,script=null,sayText=null,hook=null,endCard=null,music=null,out}){
 // Remotion runs inside render/, so every path is made absolute first (a relative output once landed in render/data).
 clips=clips.map(c=>resolve(c));voice=resolve(voice);out=resolve(out);if(music)music={...music,file:resolve(music.file)};
 const job=`jobs/${randomUUID()}`,dir=join(RENDER_DIR,'public',job);await mkdir(dir,{recursive:true});
 try{
  const clipFiles=[];for(const [i,c] of clips.entries()){const name=`clip-${i}${extname(c)||'.mp4'}`;await copyFile(c,join(dir,name));clipFiles.push(`${job}/${name}`);}
  await normaliseVoice(voice,join(dir,'voice.wav'));const voiceSeconds=await mediaSeconds(join(dir,'voice.wav'));
  words??=await transcribeWords(join(dir,'voice.wav'),groqKey);
  if(music)await copyFile(music.file,join(dir,'music'+extname(music.file)));
  const clipSeconds=await Promise.all(clips.map(mediaSeconds));let t;
  if(script){
   words=alignScript(script.voiceover.map(v=>v.line).join(' '),words);let k=0;
   const lines=script.voiceover.map(v=>{const n=v.line.trim().split(/\s+/).length,ws=words.slice(k,k+n);k+=n;return {shot:v.shot,start:ws[0]?.start??0,end:ws.at(-1)?.end??0};});
   t=shotTimeline(script.shots.map((s,i)=>({id:s.id,seconds:clipSeconds[i]})),lines,{endCard:endCard?2.5:0.5});
  }else{if(sayText)words=alignScript(sayText,words);t=timeline(clipSeconds,voiceSeconds,endCard?2.5:0.5);}
  const props={clips:t.clips.map((c,i)=>({src:clipFiles[i],clipSeconds:clipSeconds[i],playbackRate:1,...c})),voice:{src:`${job}/voice.wav`},music:music?{src:`${job}/music${extname(music.file)}`,volume:music.volume??0.12}:null,
   captions:chunkCaptions(words),hook,endCard:endCard?{...endCard,start:t.endCardStart,duration:t.total-t.endCardStart}:null,totalSeconds:t.total};
  const propsFile=join(dir,'props.json');await writeFile(propsFile,JSON.stringify(props));await mkdir(dirname(out),{recursive:true});
  await exec(join(RENDER_DIR,'node_modules','.bin','remotion'),['render','src/index.jsx','Reel',out,`--props=${propsFile}`,'--log=error'],{cwd:RENDER_DIR,timeout:15*60000,maxBuffer:64*1024*1024});
  const checked=await checkRender(out,t.total);
  return {out,seconds:t.total,captions:props.captions.length,words,checked};
 }finally{await rm(dir,{recursive:true,force:true});}
}

// The cover picture: a frame of the video (by our script rule the first seconds hold the most striking moment) with the
// hook as a big title, rendered by the same editor as the reel. Free (local ffmpeg and Remotion).
export async function renderCover({video,at=1,title,out}){
 video=resolve(video);out=resolve(out);const job=`jobs/${randomUUID()}`,dir=join(RENDER_DIR,'public',job);await mkdir(dir,{recursive:true});
 try{
  await exec('ffmpeg',['-v','error','-y','-ss',String(at),'-i',video,'-frames:v','1','-q:v','2',join(dir,'frame.jpg')],{timeout:60000});
  const propsFile=join(dir,'props.json');await writeFile(propsFile,JSON.stringify({image:`${job}/frame.jpg`,title:String(title||'')}));await mkdir(dirname(out),{recursive:true});
  await exec(join(RENDER_DIR,'node_modules','.bin','remotion'),['still','src/index.jsx','Cover',out,`--props=${propsFile}`,'--image-format=jpeg','--log=error'],{cwd:RENDER_DIR,timeout:5*60000,maxBuffer:32*1024*1024});
  return out;
 }finally{await rm(dir,{recursive:true,force:true});}
}

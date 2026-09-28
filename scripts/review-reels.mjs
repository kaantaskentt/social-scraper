// Reviews every reel we made, as a scroller would: node scripts/review-reels.mjs
// Code measures (free): silent stretches, speech still running when the video cuts, when the first word comes.
// Gemini watches as a scroller (about half a cent a reel): when it would swipe away, a cut-off sentence, the ending.
// Result: data/review.json and a table. Numbers come from code or from the saved answers, never typed by hand.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS} from '../lib/secret-run.mjs';
import {transcribeWords} from '../lib/captions.mjs';
import {mediaSeconds} from '../lib/render-reel.mjs';

const exec=promisify(execFile);
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...process.env};
const ROOT=new URL('../data/channels/',import.meta.url).pathname,END_CARD=2.5;
const readJson=f=>readFile(f,'utf8').then(JSON.parse).catch(()=>null);

// Silent stretches of at least `min` seconds inside [0, until).
async function silences(file,until,min=0.8){
 const {stderr}=await exec('ffmpeg',['-hide_banner','-i',file,'-af',`silencedetect=noise=-38dB:d=${min}`,'-f','null','-'],{maxBuffer:1<<24});
 const out=[];let start=null;for(const l of stderr.split('\n')){const s=l.match(/silence_start: ([\d.]+)/),e=l.match(/silence_end: ([\d.]+)/);if(s)start=Number(s[1]);if(e&&start!==null){out.push([start,Number(e[1])]);start=null;}}
 if(start!==null)out.push([start,until]);return out.filter(([a])=>a<until).map(([a,b])=>[Math.round(a*10)/10,Math.round(Math.min(b,until)*10)/10]).filter(([a,b])=>b-a>=min);
}
export const SCROLL_SCHEMA={type:'object',required:['swipe_second','swipe_reason','cut_off','cut_off_words','ending','worth_it','fix'],properties:{
 swipe_second:{type:'integer',minimum:-1,maximum:60,description:'The second at which a typical scroller would swipe away; -1 if they would watch to the end'},
 swipe_reason:{type:'string',description:'Why they would swipe there, or why they stay'},
 cut_off:{type:'boolean',description:'Is any spoken sentence cut off before it finishes (the sound or the video ends mid-sentence)?'},
 cut_off_words:{type:'string',description:'The words where it is cut off, or "none"'},
 ending:{type:'integer',minimum:0,maximum:10,description:'How well the last seconds land: 0 = it just stops, 10 = a satisfying finish'},
 worth_it:{type:'string',enum:['yes','barely','no'],description:'Was the reel worth the seconds it took?'},
 fix:{type:'string',description:'The one change that would most stop people swiping'}}};
const PROMPT='You are a typical Instagram scroller. Watch this reel with its sound, exactly as it plays. Be honest and strict: most reels get swiped in the first 3 seconds. Report only what you see and hear.';

const reels=[];
for(const ch of await readdir(ROOT)){const base=join(ROOT,ch,'reels');if(!existsSync(base))continue;
 for(const id of await readdir(base)){const f=join(base,id,'reel.mp4'),r=await readJson(join(base,id,'reel.json'));if(existsSync(f)&&r)reels.push({ch,id,file:f,reel:r});}}
let usd=0;
const rows=await Promise.all(reels.map(async({ch,id,file,reel})=>{
 const seconds=await mediaSeconds(file),content=seconds-END_CARD;
 // Groq takes audio only (a whole video is too large): a small mono copy of the sound.
 const audio=join(tmpdir(),`review-${ch}-${id}.mp3`);await exec('ffmpeg',['-v','error','-y','-i',file,'-vn','-ac','1','-ar','16000','-b:a','48k',audio]);
 const words=await transcribeWords(audio,env.GROQ_API_KEY);
 const spoken=words.filter(w=>w.start<content),last=spoken.at(-1);
 const gaps=await silences(file,content);
 const g=await generate({key:env.GEMINI_API_KEY,model:MODELS.watch,parts:[{video:await readFile(file)},{text:PROMPT}],schema:SCROLL_SCHEMA});usd+=g.costUsd||0;
 return {ch,id,title:reel.title,seconds:Math.round(seconds*10)/10,
  code:{firstWord:words[0]?Math.round(words[0].start*10)/10:null,speechAtCut:Boolean(last&&last.end>=content-0.15),lastWords:spoken.slice(-4).map(w=>w.text).join(' '),silences:gaps},
  scroller:g.json};
}));
await writeFile(new URL('../data/review.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),model:MODELS.watch,rows},null,1));
for(const r of rows)console.log(`${r.ch.slice(0,14).padEnd(14)} ${String(r.title).slice(0,28).padEnd(28)} swipe@${String(r.scroller.swipe_second).padStart(2)} worth:${r.scroller.worth_it.padEnd(6)} ending:${r.scroller.ending} cut(G):${r.scroller.cut_off?'YES':'no '} speechAtCut(code):${r.code.speechAtCut?'YES':'no '} firstWord:${r.code.firstWord}s silences:${JSON.stringify(r.code.silences)} | last: "${r.code.lastWords}"`);
console.log(`Gemini $${usd.toFixed(3)}`);

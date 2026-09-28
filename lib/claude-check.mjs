// The second opinion: Claude, a different model family from the Gemini checks, so their blind spots differ. It is
// advice, not a gate: across 3 runs of its exam it changed its verdict on 5 of 10 reels (silver's cut advice came out
// broken, good, weak), and temperature cannot be set on this model (2026-09-28). It sees
// one frame per second, the timed transcript, the script and code's measurements, and lists every defect with its
// second. Code turns the defects into the verdict (Kaan, 2026-09-28: "empower another checker agent").
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const exec=promisify(execFile);
export const CLAUDE_MODEL='claude-sonnet-5';
export const DEFECTS={
 cut_line:'A spoken sentence is cut off or never finishes',
 missing_result:'The result the voice or script promises is not visible',
 voice_mismatch:'The voice says something the picture does not show',
 glitch:'Warped faces or hands, objects morphing, popping in or out',
 static:'People stand still and stare, or nothing moves, for over a second',
 dead_time:'Silence or nothing new happening for over 1.5 seconds',
 weak_start:'The first second shows nothing striking',
 text_logo:'Garbled text, brand logos or labels on screen',
 false_claim:'A claim or method that is wrong',
 promise:'Promises a guide, link or freebie we do not have',
};
// Broken means never post; weak means post only if nothing better is ready (the first exam, 2026-09-28: the checker
// rightly found the egg reel never shows a floating egg, a weakness, not a lie).
const BROKEN=new Set(['cut_line','promise','false_claim','glitch']);
export const CHECK_TOOL={name:'report',description:'Report every defect in the reel and how a scroller would react.',input_schema:{type:'object',required:['defects','swipe_second','swipe_reason','strongest_moment'],properties:{
 defects:{type:'array',items:{type:'object',required:['second','kind','what','severe','contradicts'],properties:{second:{type:'number'},kind:{type:'string',enum:Object.keys(DEFECTS)},what:{type:'string'},severe:{type:'boolean',description:'Would this make a viewer distrust or leave the reel?'},contradicts:{type:'boolean',description:'True only when the picture clearly shows the OPPOSITE of what the voice says happened on screen (the voice says the spoon came out shiny, the spoon is plainly still black). A result that is simply not shown, or a pause, is false here.'},claim:{type:'string',description:'For false_claim only: the exact claim, quoted'}}}},
 swipe_second:{type:'number',description:'When a typical scroller would swipe away; -1 if they would watch to the end'},
 swipe_reason:{type:'string'},strongest_moment:{type:'string'}}}};
export const checkPrompt=({script,transcript,measures})=>`You are the final quality checker for a short-form video studio. Before a reel is posted, decide what a typical viewer would notice and mind. Most good reels have small imperfections: report only real problems, and mark severe only what would make a viewer distrust the reel or leave it.
The bar, from reels we checked by eye: a common simplification that popular science videos use is not a false claim ("sinking means fresh" is fine); a pause inside a sentence is not a cut line (cut_line means a sentence never finishes or a scripted line is never said); a result that is simply not shown is missing_result with contradicts=false; contradicts=true only when the picture clearly shows the opposite of what the voice says happened (the voice says the spoon came out shiny, the spoon is plainly still black). Differences from the script that a viewer cannot know about (a different camera angle, one shot fewer) are not defects.
Judge only what the frames and transcript show.
The images are one frame per second, in order, from second 0. The last frames may be an end card with the channel name.
${script?`The script (what should happen and be said):\n${JSON.stringify(script)}\n`:''}What is actually said, with timings in seconds: ${JSON.stringify(transcript)}
Measured by code: ${JSON.stringify(measures)}
Defect kinds: ${Object.entries(DEFECTS).map(([k,v])=>`${k} = ${v}`).join('; ')}.
Compare the script with the frames and the transcript line by line: is every promised result visible, is every line said in full, does the picture match what is said? Report with the tool.`;
// One frame per second, small (360 px wide), as JPEG bytes.
export async function frames(file,{fps=1,width=360}={}){
 const dir=await mkdtemp(join(tmpdir(),'frames-'));
 try{await exec('ffmpeg',['-v','error','-i',file,'-vf',`fps=${fps},scale=${width}:-2`,'-q:v','5',join(dir,'f-%03d.jpg')]);
  const names=(await readdir(dir)).sort();return Promise.all(names.map(n=>readFile(join(dir,n))));}
 finally{await rm(dir,{recursive:true,force:true});}
}
export async function claudeCheck({key,images,script=null,transcript,measures={},model=CLAUDE_MODEL,fetchImpl=fetch}){
 const content=[...images.map(b=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:Buffer.from(b).toString('base64')}})),{type:'text',text:checkPrompt({script,transcript,measures})}];
 const r=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
  body:JSON.stringify({model,max_tokens:2000,tools:[CHECK_TOOL],tool_choice:{type:'tool',name:'report'},messages:[{role:'user',content}]})});
 const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(`Claude check failed (${r.status}): ${body?.error?.message||'no detail'}`);
 const use=body.content?.find(c=>c.type==='tool_use');if(!use)throw new Error('Claude check returned no report');
 return {report:use.input,usage:body.usage};
}
// What a Jev answer cost (its input tokens), for the spend ledger.
export const jevCost=raw=>Number.isFinite(raw?.usage?.input_tokens)?raw.usage.input_tokens*0.042/1e6:0;
// Jev double-checks every claim the checker calls false (it called two true claims false in its first exam). An answer
// with no number keeps the flag: dropping it let a reel come out "good" on a missing answer (audit, 2026-09-29).
// Every Jev call goes into the ledger.
export async function confirmClaims(report,{jev,key,ledger=async()=>{}}){
 const defects=[];
 for(const d of report.defects||[]){
  if(d.kind!=='false_claim'){defects.push(d);continue;}
  const r=await jev({model:'jev-latest',state:{claim:d.claim||d.what},questions:{wrong:{type:'noul',instructions:'Would a professional fact-checker rate `claim` as false? A simplification that is broadly true, or a specific tip such as a soaking time, is not false.',criteria:{true:'Yes, a fact-checker would rate it false',false:'No, it is broadly true or a reasonable tip'}}}},key);
  await ledger({step:'final check claim',usd:jevCost(r)});
  const wrong=r?.answers?.wrong?.noul;if(!Number.isFinite(wrong)||wrong>=0.5)defects.push({...d,jev:Number.isFinite(wrong)?wrong:null});
 }
 return {...report,defects};
}
// Code decides the level from the defects.
export function checkVerdict(report){
 const severe=(report.defects||[]).filter(d=>d.severe),say=d=>`${d.second}s ${d.kind}: ${d.what}`;
 const broken=severe.filter(d=>BROKEN.has(d.kind)||(d.contradicts&&['missing_result','voice_mismatch'].includes(d.kind)));
 const weak=severe.filter(d=>!broken.includes(d));
 const early=Number.isFinite(report.swipe_second)&&report.swipe_second>=0&&report.swipe_second<2;
 const level=broken.length?'broken':weak.length||early?'weak':'good';
 return {level,pass:level!=='broken',problems:broken.map(say),weaknesses:[...weak.map(say),...(early?[`a scroller swipes at ${report.swipe_second}s: ${report.swipe_reason}`]:[])]};
}

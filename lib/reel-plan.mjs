// "Make one original reel" from a channel's Secret: faceless hands + voiceover (Kaan's pilot choice, 2026-09-27).
// Gemini writes the ideas and the script; Jev makes the judgment calls (fit to the winners' pattern, AI-readiness,
// hook, health claims, true demo, script checks, risky shots); code does the ranking maths and the prices.
// Plan: docs/superpowers/specs/2026-09-27-replicate-channel-plan.md
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {SHORT,LABELS} from '../public/secret-labels.mjs';
const exec=promisify(execFile);

const name=(q,v)=>SHORT[q]?.[v]||LABELS[q]?.[1]?.[v]||v;
// The winners' pattern in plain words, from the Secret's own counts.
export function patternFrom(saved){
 const st=saved.stats||{},d=st.differences||[];
 return {channel:saved.account,headline:saved.secret?.headline||'',format:saved.secret?.format?.text||'',script:saved.secret?.script?.text||'',
  setting:saved.secret?.setting?.text||'',person:saved.secret?.person?.text||'',
  do_more:d.filter(x=>x.winners>x.flops).map(x=>`${name(x.question,x.value)} (${x.winners} of ${x.perSide} best, ${x.flops} of ${x.perSide} weakest)`),
  do_less:d.filter(x=>x.flops>x.winners).map(x=>`${name(x.question,x.value)} (${x.flops} of ${x.perSide} weakest, ${x.winners} of ${x.perSide} best)`),
  keep:(st.house||[]).map(h=>`${name(h.question,h.value)} (${h.count} of ${h.total} reels)`)};
}

const text=d=>({type:'string',description:d});
export const IDEA_SCHEMA={type:'object',required:['ideas'],properties:{ideas:{type:'array',items:{type:'object',required:['title','hook_line','demo','why_true','steps','keyword'],properties:{
 why_true:text('The real, well-known reason this works, in one plain sentence (if you cannot name one, drop the idea)'),
 title:text('Short working title'),hook_line:text('The first spoken line, said while the action is already happening'),demo:text('What the hands show on camera, start to finish'),
 steps:{type:'array',items:{type:'string'}},keyword:text('One word viewers comment to get the full guide, in capitals')}}}}};
export function ideaPrompt(pattern,saved){
 return `You plan reels for a NEW, original faceless channel inspired by @${saved.account}. Only hands and objects are on camera, never a face; a calm voiceover explains.
Write 6 reel ideas that follow the winners' pattern below. Rules:
- Stay in the channel's own topic and setting (see pattern.headline, pattern.format and pattern.setting), shown with hands and objects only.
- Every idea shows something TRUE that really happens and can be shown with hands, non-medical: no health claims, no cures, no toxins, nothing about what is good or bad for your body.
- Start mid-action (the hook line is spoken while the action is already happening), then short steps, then ask viewers to comment one keyword.
- One clear feeling per reel (curiosity or satisfaction), one clear thing the viewer can do.
- Original ideas only: do not copy any specific reel.
pattern: ${JSON.stringify(pattern)}`;
}

// Jev's questions for one idea. fit, ai_ready and hook are scores (0-3); health_claim and true_demo are yes/no.
export function judgeIdeaRequest(idea,pattern){
 return {model:'jev-latest',state:{idea,pattern},questions:{
  fit:{type:'score',instructions:'How closely does `idea` follow `pattern` (what this channel\'s best reels do more, and avoid what the weakest do)?',criteria:['Does not follow it','Follows a little','Follows most of it','Follows it closely']},
  ai_ready:{type:'score',instructions:'How reliably can current AI video show `idea` with only hands and objects: no faces, no readable text, no tricky physics?',criteria:['Will likely fail: needs faces, readable text or tricky physics','Some risky moments','Mostly hands and simple objects','Only hands and simple objects, easy for AI video']},
  hook:{type:'score',instructions:'How strong is the opening of `idea` for stopping the scroll in the first 3 seconds?',criteria:['No real hook','Weak hook','Clear hook','Starts mid-action with a strong hook']},
  health_claim:{type:'noul',instructions:'Does `idea` state or imply a health, medical or body claim (cures, toxins, disease, what is good or bad for your body)?',criteria:{true:'Yes, it makes or implies a health claim',false:'No health claim'}},
  true_demo:{type:'noul',instructions:'Does the demo in `idea` show something that really happens (a known, true effect), not a trick or a false test?',criteria:{true:'It really happens',false:'It is a trick, a myth or not true'}}}};
}
// Code does the maths: health claims and doubtful demos are out; the rest are ranked by fit, AI-readiness and hook.
export function rankIdeas(ideas,judgments){
 const picked=[],rejected=[];
 ideas.forEach((idea,i)=>{const a=judgments[i]?.answers||{};const scores={fit:a.fit?.score,ai_ready:a.ai_ready?.score,hook:a.hook?.score,health_claim:a.health_claim?.noul,true_demo:a.true_demo?.noul};
  if(!(scores.health_claim<0.5))return rejected.push({idea,scores,reason:'health or medical claim'});
  if(!(scores.true_demo>=0.5))return rejected.push({idea,scores,reason:'the demo may not be true'});
  const total=Math.round(((scores.fit/3)*0.4+(scores.ai_ready/3)*0.35+(scores.hook/3)*0.25)*100)/100;picked.push({idea,scores,total});});
 picked.sort((a,b)=>b.total-a.total);return {picked,rejected};
}

export const SCRIPT_SCHEMA={type:'object',required:['hook_title','voiceover','shots','keyword','caption'],properties:{
 hook_title:text('3 to 6 words shown on screen in the first 2 seconds'),
 voiceover:{type:'array',items:{type:'object',required:['line','shot'],properties:{line:{type:'string'},shot:{type:'string'}}}},
 shots:{type:'array',items:{type:'object',required:['id','seconds','visual','camera'],properties:{id:text('s1, s2, ...'),seconds:{type:'integer',minimum:4,maximum:8},visual:text('What the hands and objects do, in one precise sentence for a video model. Hands only, never a face, no readable text.'),camera:text('Framing and movement, e.g. top-down close-up, static')}}},
 keyword:text('The comment keyword, in capitals'),caption:text('The Instagram caption, 1-2 short lines plus 3-5 hashtags')}};
export function scriptPrompt(idea,pattern){
 return `Write the script and shot list for one faceless reel (hands and objects only, calm voiceover) about: ${JSON.stringify(idea)}.
Follow the winners' pattern: ${JSON.stringify(pattern)}.
Rules: 4 or 5 shots, each 4 to 8 seconds, 20 to 32 seconds in total. Each shot shows ONE simple action that fits easily in its seconds (never two actions in one shot). Shot 1 starts mid-action. Voiceover lines are short, spoken, and each belongs to one shot; the last line asks viewers to comment the keyword. No health claims, no faces, no readable text on objects. Everything shown must really happen.`;
}

// Jev's checks on a script: the Secret's rules, and whether each shot is safe for AI video.
export function checkScriptRequest(script){
 const questions={
  starts_mid_action:{type:'noul',instructions:'Does the first shot of `script` start in the middle of an action (not a greeting or intro)?',criteria:{true:'Starts mid-action',false:'Does not'}},
  clear_action:{type:'noul',instructions:'Does `script` give the viewer one clear thing they can do?',criteria:{true:'Yes',false:'No'}},
  health_fact:{type:'noul',instructions:'Does `script` state a health, medical or body claim as fact?',criteria:{true:'Yes',false:'No'}},
  emotion:{type:'choice',instructions:'What is the main feeling of `script`?',criteria:{curiosity:'Curiosity',satisfaction:'Satisfaction',surprise:'Surprise',fear:'Fear or worry',mixed:'Several at once',none:'None'}}};
 script.shots.forEach((s,i)=>{questions[`shot_${s.id}_risky`]={type:'noul',instructions:`Is \`script.shots[${i}]\` risky for AI video: does it need a face, readable text, many objects interacting, or precise physics?`,criteria:{true:'Risky',false:'Safe: hands and simple objects'}};});
 return {model:'jev-latest',state:{script},questions};
}
export function readScriptCheck(raw,script){
 const a=raw?.answers||{},problems=[];
 if(!(a.starts_mid_action?.noul>=0.5))problems.push('Does not start mid-action');
 if(!(a.clear_action?.noul>=0.5))problems.push('No clear action for the viewer');
 if(!(a.health_fact?.noul<0.5))problems.push('States a health claim as fact');
 if(['fear','mixed','none'].includes(a.emotion?.choice))problems.push(`Feeling is ${a.emotion.choice}, not one clear feeling`);
 const riskyShots=script.shots.filter(s=>a[`shot_${s.id}_risky`]?.noul>=0.5).map(s=>s.id);
 for(const id of riskyShots)problems.push(`Shot ${id} is risky for AI video`);
 return {pass:!problems.length,problems,riskyShots,emotion:a.emotion?.choice||null};
}

// Exact prices from Higgsfield's free cost check: Seedance 2.0 at 720p for each shot, plus the voice.
const higgsfield=async args=>{const {stdout}=await exec('higgsfield',args,{timeout:60000});return stdout;};
const credits=out=>{const v=JSON.parse(out)?.credits;if(!Number.isFinite(v))throw new Error(`No price in Higgsfield's answer: ${String(out).slice(0,80)}`);return v;};
export const VIDEO_MODEL='seedance_2_0';
// Shots are silent (the voiceover is ours); "fast" mode costs about half, probably at lower quality.
const shotArgs=(s,mode)=>['generate','cost',VIDEO_MODEL,'--prompt','x','--duration',String(s.seconds),'--aspect_ratio','9:16','--resolution','720p','--generate_audio','false','--mode',mode,'--json'];
// The voiceover is priced on its real text (Seed Audio scales with length); the kit is one reference image of the
// hands and set (GPT Image 2 at 1k) that every shot uses, so the hands and the place stay the same across shots.
export const DEFAULT_VOICE={id:'e2a2d2e6-9ed2-59cd-82af-feaa27f8a678',name:'Grady',type:'preset'};
export const voiceArgs=(mode,text,voice=DEFAULT_VOICE)=>['generate',mode,'seed_audio','--prompt',text,'--voice_type',voice.type,'--voice_id',voice.id,'--format','mp3'];
export const kitArgs=(mode,prompt)=>['generate',mode,'gpt_image_2','--prompt',prompt,'--aspect_ratio','9:16','--resolution','1k'];
export async function priceShots(shots,{run=higgsfield,voiceText='x',voice=DEFAULT_VOICE}={}){
 const priced=[];for(const s of shots)priced.push({id:s.id,seconds:s.seconds,credits:credits(await run(shotArgs(s,'std'))),fastCredits:credits(await run(shotArgs(s,'fast')))});
 const voiceCredits=credits(await run([...voiceArgs('cost',voiceText,voice),'--json'])),kit=credits(await run([...kitArgs('cost','x'),'--json']));
 const round=n=>Math.round(n*100)/100,video=priced.reduce((a,s)=>a+s.credits,0),fast=priced.reduce((a,s)=>a+s.fastCredits,0),fixed=voiceCredits+kit;
 return {shots:priced,voice:voiceCredits,kit,voiceName:voice.name,total:round(video+fixed),withOneRetryEach:round(video*2+fixed),fastTotal:round(fast+fixed),fastWithOneRetryEach:round(fast*2+fixed)};
}

// The copy comparison's exam: node scripts/fidelity-eval.mjs [--k=3]   (about 30 cents of Gemini at k=3; it prints the total)
// Pairs with a known answer, scored against production's own verdict (faithful or not, the only two things the copy
// page shows): an original against itself (faithful), against the same format with another object (not faithful: the
// page must not say "A faithful copy" for a different object), against another reel (not), and our drifted remake (not).
// The old "close" class counted a faithful verdict on the salmon pair as right (audit, 2026-09-29). Each pair is
// watched k times (3 by default) and the majority counts; the score is printed next to always-faithful and never-faithful.
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS} from '../lib/secret-run.mjs';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {mediaSeconds} from '../lib/render-reel.mjs';
import {FIDELITY_SCHEMA,fidelityPrompt,fidelityVerdict,fidelityScore,wordsKept} from '../lib/copy.mjs';
import {repeats,tally,byGroup,baselines,flips,lastRun,flipLine,freeze,freezeData} from '../evals/kit.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname,RUN='a444f915-b549-4b73-bbde-664c3aea9216',FROZEN=join(ROOT,'evals-frozen','fidelity');
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')},keys={gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY};
const planner=new ReelPlanner(ROOT,()=>keys),LOG=join(ROOT,'experiments','fidelity-eval.jsonl'),k=repeats();
// Inputs are frozen into data/evals-frozen/fidelity on the first run: a rescan rewrites the run file, a re-edit
// overwrites our reel.mp4, and a new watch model rewrites the cached breakdown, each under an unchanged label (audit, 2026-09-29).
// LABELED: the last logged run on the drifted egg reel; a reel.mp4 changed after that is refused, not frozen.
const LABELED='2026-09-28T23:09:00Z';
const orig=id=>({src:videoPath(ROOT,RUN,id),as:`${id}.mp4`}),ours=id=>({src:join(ROOT,'channels',RUN,'reels',id,'reel.mp4'),as:`ours-${id}.mp4`,labeledAt:LABELED});
const CASES=[
 {name:'chicken vs itself',orig:'DdFcvvDpmIy',copy:orig('DdFcvvDpmIy'),copyId:'DdFcvvDpmIy',want:true},
 {name:'sweet potato vs itself',orig:'DdRgLdABwbq',copy:orig('DdRgLdABwbq'),copyId:'DdRgLdABwbq',want:true},
 {name:'chicken vs salmon (same format, other object)',orig:'DdFcvvDpmIy',copy:orig('Dc4QBNbB54H'),copyId:'Dc4QBNbB54H',want:false},
 {name:'salmon vs chicken (same format, other object, turned around)',orig:'Dc4QBNbB54H',copy:orig('DdFcvvDpmIy'),copyId:'DdFcvvDpmIy',want:false},
 {name:'chicken vs lime on blueberries (another reel)',orig:'DdFcvvDpmIy',copy:orig('DdZzWC1BYL7'),copyId:'DdZzWC1BYL7',want:false},
 {name:'sweet potato vs chicken (another reel)',orig:'DdRgLdABwbq',copy:orig('DdFcvvDpmIy'),copyId:'DdFcvvDpmIy',want:false},
 {name:'sweet potato vs our drifted egg reel',orig:'DdRgLdABwbq',copy:ours('0-sink-or-float-egg-test-3a6ced'),copyId:null,want:false},
];
const ids=[...new Set(CASES.flatMap(c=>[c.orig,c.copyId]).filter(Boolean))];
// The transcripts once, from the run file; after that from the frozen copy. A breakdown the run has not cached yet is
// one paid watch, the first time only (the salmon one, 2026-09-29).
let job=null;const loadJob=async()=>job||=JSON.parse(await readFile(join(ROOT,'runs',`${RUN}.json`),'utf8'));
const texts=await freezeData(join(FROZEN,'transcripts.json'),async()=>{const j=await loadJob();return Object.fromEntries(ids.map(id=>[id,j.posts.find(p=>p.id===id)?.transcript?.text??null]));});
const beatsOf=id=>freezeData(join(FROZEN,`breakdown-${id}.json`),async()=>(await planner.breakdown(await loadJob(),id,keys)).breakdown).then(b=>b.beats);
const video=({src,as,labeledAt})=>freeze(src,join(FROZEN,as),{labeledAt});
const rows=[];let usd=0;
for(const c of CASES){
 const beats=await beatsOf(c.orig),a=await video(orig(c.orig)),b=await video(c.copy),[bytesA,bytesB]=[await readFile(a.file),await readFile(b.file)];
 const [la,lb]=[await mediaSeconds(a.file),await mediaSeconds(b.file)];
 const copyText=c.copyId?texts[c.copyId]:null,measures={words_kept:copyText&&texts[c.orig]?wordsKept(texts[c.orig],copyText):null,length_ratio:Math.round(lb/la*100)/100};
 const watch=async()=>{
  const g=await generate({key:keys.gemini,model:MODELS.watch,parts:[{text:'Reel A (the original):'},{video:bytesA},{text:'Reel B (our copy):'},{video:bytesB},{text:fidelityPrompt(beats)}],schema:FIDELITY_SCHEMA});usd+=g.costUsd||0;
  const f=fidelityScore({wordsKept:measures.words_kept??undefined,lengthRatio:measures.length_ratio,beats:g.json.beats}),v=fidelityVerdict(f.score,g.json,beats);
  return {faithful:v.faithful,redo:v.redo,score:f.score,shots:f.shots,feel:g.json.same_feel,gap:g.json.biggest_gap};
 };
 const runs=await Promise.all(Array.from({length:k},watch)),t=tally(runs.map(r=>r.faithful),c.want);
 rows.push({name:c.name,want:c.want,class:c.want?'faithful':'not faithful',...t,sha256:[a.sha256,b.sha256],runs});
}
const say=v=>v===true?'faithful':v===false?'not faithful':'tie';
for(const r of rows)console.log(`${r.right?'✓':'✗'} ${r.name}: ${say(r.majority)} (want ${say(r.want)}) · agreement ${r.agreement} · scores ${r.runs.map(x=>x.score).join(', ')} · feel ${r.runs.map(x=>x.feel).join(', ')} · gap: ${String(r.runs[0].gap).slice(0,120)}`);
const right=rows.filter(r=>r.right).length,cls=byGroup(rows,'class'),bl=baselines(rows.map(r=>r.want),[true,false]),f=flips(await lastRun(LOG),rows);
console.log(`${right} of ${rows.length} pairs right by majority of ${k} (always faithful would get ${bl.true}, never faithful ${bl.false}) · faithful ${cls.faithful?.right??0} of ${cls.faithful?.of??0} · not faithful ${cls['not faithful']?.right??0} of ${cls['not faithful']?.of??0}`);
console.log(`${flipLine(f)} · Gemini $${usd.toFixed(3)}`);
await mkdir(join(ROOT,'experiments'),{recursive:true});await appendFile(LOG,JSON.stringify({at:new Date().toISOString(),k,right,of:rows.length,classes:cls,baselines:bl,regressions:f?.worse??null,rows,usd})+'\n');

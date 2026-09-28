// The copy comparison's exam: node scripts/fidelity-eval.mjs   (about 5 cents)
// Pairs with a known answer: an original against itself (faithful), against the same format with another object
// (close shots), against another reel (not faithful), and our drifted remake (not faithful).
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS} from '../lib/secret-run.mjs';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {mediaSeconds} from '../lib/render-reel.mjs';
import {FIDELITY_SCHEMA,fidelityPrompt,fidelityVerdict,fidelityScore,wordsKept} from '../lib/copy.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname,RUN='a444f915-b549-4b73-bbde-664c3aea9216';
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')},keys={gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY};
const job=JSON.parse(await readFile(join(ROOT,'runs',`${RUN}.json`),'utf8')),post=id=>job.posts.find(p=>p.id===id);
const planner=new ReelPlanner(ROOT,()=>keys),ours=id=>join(ROOT,'channels',RUN,'reels',id,'reel.mp4');
const CASES=[
 {name:'chicken vs itself',orig:'DdFcvvDpmIy',copy:videoPath(ROOT,RUN,'DdFcvvDpmIy'),copyText:post('DdFcvvDpmIy').transcript.text,want:'faithful'},
 {name:'chicken vs salmon (same format, other object)',orig:'DdFcvvDpmIy',copy:videoPath(ROOT,RUN,'Dc4QBNbB54H'),copyText:post('Dc4QBNbB54H').transcript.text,want:'close'},
 {name:'chicken vs lime on blueberries (another reel)',orig:'DdFcvvDpmIy',copy:videoPath(ROOT,RUN,'DdZzWC1BYL7'),copyText:post('DdZzWC1BYL7').transcript.text,want:'not'},
 {name:'sweet potato vs our drifted egg reel',orig:'DdRgLdABwbq',copy:ours('0-sink-or-float-egg-test-3a6ced'),copyText:null,want:'not'},
];
const rows=[];let usd=0;
for(const c of CASES){
 const b=(await planner.breakdown(job,c.orig,keys)).breakdown,beats=b.beats;
 const g=await generate({key:keys.gemini,model:MODELS.watch,parts:[{text:'Reel A (the original):'},{video:await readFile(videoPath(ROOT,RUN,c.orig))},{text:'Reel B (our copy):'},{video:await readFile(c.copy)},{text:fidelityPrompt(beats)}],schema:FIDELITY_SCHEMA});usd+=g.costUsd||0;
 const [la,lb]=[await mediaSeconds(videoPath(ROOT,RUN,c.orig)),await mediaSeconds(c.copy)];
 const measures={words_kept:c.copyText?wordsKept(post(c.orig).transcript.text,c.copyText):null,length_ratio:Math.round(lb/la*100)/100};
 const f=fidelityScore({wordsKept:measures.words_kept??undefined,lengthRatio:measures.length_ratio,beats:g.json.beats});
 const v=fidelityVerdict(f.score,g.json,beats);
 const got=v.faithful?'faithful':f.shots>=60?'close':'not',right=c.want===got||(c.want==='close'&&got==='faithful');
 rows.push({name:c.name,want:c.want,got,right,...f,redo:v.redo,feel:g.json.same_feel,gap:g.json.biggest_gap});
}
for(const r of rows)console.log(`${r.right?'✓':'✗'} ${r.name}: ${r.got} (want ${r.want}) · score ${r.score} shots ${r.shots} words ${r.words} length ${r.length} · feel ${r.feel}/3 · redo ${r.redo} · gap: ${String(r.gap).slice(0,120)}`);
console.log(`${rows.filter(r=>r.right).length} of ${rows.length} right · Gemini $${usd.toFixed(3)}`);
await mkdir(join(ROOT,'experiments'),{recursive:true});await appendFile(join(ROOT,'experiments','fidelity-eval.jsonl'),JSON.stringify({at:new Date().toISOString(),rows,usd})+'\n');

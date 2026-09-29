// The quality checks' exam: node scripts/qa-eval.mjs [--k=3]   (about 6 cents of Gemini at k=3, plus Jev; it prints the Gemini total)
// Real clips and scripts whose right answer we know from looking at the frames (2026-09-28). Run it after any change
// to the part check or the script check. Every case runs k times (3 by default) and the majority counts; a regression
// is a case whose majority was right in the last exam of 3 or more runs in data/qa-eval.jsonl and is wrong now, not a
// lower total (one silver miss moved the total about 1 run in 9 with no code change; audit, 2026-09-29).
import {readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS,jevAsk} from '../lib/secret-run.mjs';
import {checkKitScriptRequest,referencesFor} from '../lib/kit-reel.mjs';
import {checkPart} from '../lib/reel-make.mjs';
import {repeats,tally,byGroup,flips,lastRun,flipLine,freeze} from '../evals/kit.mjs';

const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
// Scripts are frozen in evals/qa (a live plan.json changes with every new script). Clips are copied from data/channels
// into data/evals-frozen/qa on the first run and graded from there after, so a changed clip cannot change an exam item.
const CH=new URL('../data/channels/',import.meta.url).pathname,FROZEN=new URL('../data/evals-frozen/qa/',import.meta.url).pathname;
const frozen=async n=>JSON.parse(await readFile(new URL(`../evals/qa/${n}.json`,import.meta.url),'utf8'));
const LOG=new URL('../data/qa-eval.jsonl',import.meta.url),k=repeats();
// Part cases: the clip, which part of which script, and whether the part should pass (the maker watches twice).
// set 'in-rule': the lip rule (talking:false skips lips) was written for this very clip, so it cannot fail on lips.
const PARTS=[
 {name:'silver: the spoon stays black (result missing)',set:'in-rule',script:'silver',ch:'cd88abf1-e0ac-4497-bc38-d32756318418',clip:'reels/1-tarnished-silver-polish-5bcebe/part-2-a2-new.mp4',part:1,talking:false,pass:false},
 {name:'fizz 99%: good voice-over part (no lips to judge)',set:'in-rule',script:'fizz-final',ch:'lab-fizzfinal',clip:'reels/0-baking-powder-fizz-test-3472d4/part-2-a1-new.mp4',part:1,talking:false,pass:true},
 {name:'baking soda talking: good part 1',set:'parts',script:'ken-baking-soda',ch:'a444f915-b549-4b73-bbde-664c3aea9216',clip:'reels/0-testing-baking-soda-activity-419945/part-1-a1.mp4',part:0,talking:true,pass:true},
];
// The script cases for Jev's method question were retired on 2026-09-29: claims and methods are no longer checked
// (Kaan). Their frozen scripts stay in evals/qa for the record.
const rows=[];let usd=0;
// The channel's host pictures, as the maker sends them (its face references).
const facesOf=async ch=>{const kit=JSON.parse(await readFile(join(CH,ch,'kit','kit.json'),'utf8').catch(()=>'null'));return kit?Promise.all(referencesFor(kit).filter(r=>r.role.startsWith('face')).map(r=>readFile(join(CH,ch,'kit',r.file)))):[];};
for(const c of PARTS){
 const script=await frozen(c.script),{file,sha256}=await freeze(join(CH,c.ch,c.clip),join(FROZEN,c.ch,c.clip)),bytes=await readFile(file),faces=await facesOf(c.ch);
 // One run = the maker's own part check (lib/reel-make.mjs checkPart): both watches, the host pictures, Jev's "does it
 // matter" step. The exam used to run its own copy without faces or Jev (audit, 2026-09-29).
 const gemini=async a=>{const r=await generate(a);usd+=r.costUsd||0;return r;};
 const run=()=>checkPart({bytes,faces,script,index:c.part,talking:c.talking,gemini,jev:jevAsk,keys:{gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY}});
 const runs=await Promise.all(Array.from({length:k},run)),t=tally(runs.map(v=>v.pass),c.pass);
 rows.push({name:c.name,set:c.set,want:c.pass,...t,sha256,got:runs.map(v=>v.pass?'pass':`fail: ${v.problems.join(', ')}`)});
}
const groups=byGroup(rows,'set'),score=rows.filter(r=>r.right).length,prev=await lastRun(LOG),f=flips(prev,rows);
for(const r of rows)console.log(`${r.right?'✓':'✗'} [${r.set}] ${r.name}: ${r.rightRuns} of ${r.k} runs right, agreement ${r.agreement}${r.confirmed===false?' (answer not yet confirmed by a person)':''} · ${r.got.join(' | ')}`);
const line=g=>groups[g]?`${groups[g].right} of ${groups[g].of}`:'none';
console.log(`Parts ${line('parts')} · in-rule ${line('in-rule')}`);
console.log(`${flipLine(f)} · majority of ${k} runs · Gemini $${usd.toFixed(3)}`);
await appendFile(LOG,JSON.stringify({at:new Date().toISOString(),k,score,of:rows.length,groups,regressions:f?.worse??null,rows})+'\n');

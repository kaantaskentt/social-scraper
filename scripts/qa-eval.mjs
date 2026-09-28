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
import {PART_QA_SCHEMA,partQaPrompt,partVerdict,checkKitScriptRequest} from '../lib/kit-reel.mjs';
import {repeats,tally,byGroup,baselines,flips,lastRun,flipLine,freeze} from '../evals/kit.mjs';

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
 {name:'silver: the spoon stays black (result missing)',set:'parts',script:'silver',ch:'cd88abf1-e0ac-4497-bc38-d32756318418',clip:'reels/1-tarnished-silver-polish-5bcebe/part-2-a2-new.mp4',part:1,talking:false,pass:false},
 {name:'fizz 99%: good voice-over part (no lips to judge)',set:'in-rule',script:'fizz-final',ch:'lab-fizzfinal',clip:'reels/0-baking-powder-fizz-test-3472d4/part-2-a1-new.mp4',part:1,talking:false,pass:true},
 {name:'baking soda talking: good part 1',set:'parts',script:'ken-baking-soda',ch:'a444f915-b549-4b73-bbde-664c3aea9216',clip:'reels/0-testing-baking-soda-activity-419945/part-1-a1.mp4',part:0,talking:true,pass:true},
];
// Script cases for Jev's method question. 'in-prompt': the method question's own instructions (lib/kit-reel.mjs
// method_correct) spell out the answer (vinegar vs hot water, a glowing muscle is an illustration), so these only show
// Jev can apply an example it was just given. 'hold-out': facts the instructions never mention, with more wrong cases
// than right ones; they are the real score. confirmed:false = the expected answer was written by Claude from general
// knowledge on 2026-09-29 and still needs a person to confirm it (set true once checked).
const ken=await frozen('ken-baking-soda'),hold=async n=>frozen(`holdout/${n}`);
const SCRIPTS=[
 {name:'drzen pull-up form cue (animated highlight is an illustration)',set:'in-prompt',script:await frozen('drzen-pull-up'),ok:true,confirmed:true},
 {name:'Ken baking soda with vinegar',set:'in-prompt',script:ken,ok:true,confirmed:true},
 {name:'Ken baking soda in hot water (wrong method)',set:'in-prompt',script:JSON.parse(JSON.stringify(ken).replace(/white vinegar/gi,'steaming hot water').replace(/vinegar/gi,'hot water')),ok:false,confirmed:true},
 {name:'egg test: a fresh egg sinks flat, an old one floats',set:'hold-out',script:await hold('egg-float-fresh-sinks'),ok:true,confirmed:false},
 {name:'egg test turned around: a fresh egg floats (wrong)',set:'hold-out',script:await hold('egg-float-fresh-floats'),ok:false,confirmed:false},
 {name:'red cabbage water: lemon turns it pink, baking soda green',set:'hold-out',script:await hold('red-cabbage-right-colours'),ok:true,confirmed:false},
 {name:'red cabbage water with the colours swapped (wrong)',set:'hold-out',script:await hold('red-cabbage-swapped-colours'),ok:false,confirmed:false},
 {name:'limp celery revived in very salty water (wrong: salt draws water out)',set:'hold-out',script:await hold('celery-salt-water'),ok:false,confirmed:false},
 {name:'tarnished silver soaked in bleach (wrong: bleach darkens silver)',set:'hold-out',script:await hold('silver-bleach'),ok:false,confirmed:false},
 {name:'squat: hips back, knees over toes, heels down',set:'hold-out',script:await hold('squat-form'),ok:true,confirmed:false},
 {name:'deadlift with a rounded back, pulled with the arms (wrong)',set:'hold-out',script:await hold('deadlift-rounded-back'),ok:false,confirmed:false},
 {name:'plank with sagging hips and an arched back (wrong)',set:'hold-out',script:await hold('plank-sagging-hips'),ok:false,confirmed:false},
 {name:'push-up: straight line, elbows about 45 degrees',set:'hold-out',script:await hold('pushup-form'),ok:true,confirmed:false},
];
const rows=[];let usd=0;
for(const c of PARTS){
 const script=await frozen(c.script),{file,sha256}=await freeze(join(CH,c.ch,c.clip),join(FROZEN,c.ch,c.clip)),bytes=await readFile(file);
 const watch=async()=>{const r=await generate({key:env.GEMINI_API_KEY,model:MODELS.watch,parts:[{video:bytes},{text:partQaPrompt(script,c.part,false)}],schema:PART_QA_SCHEMA});usd+=r.costUsd||0;return r.json;};
 // One run = the maker's two watches, exactly as in production.
 const run=async()=>{const [a,b]=await Promise.all([watch(),watch()]);if(b.result_as_written==='no')a.result_as_written='no';return partVerdict(a,{talking:c.talking});};
 const runs=await Promise.all(Array.from({length:k},run)),t=tally(runs.map(v=>v.pass),c.pass);
 rows.push({name:c.name,set:c.set,want:c.pass,...t,sha256,got:runs.map(v=>v.pass?'pass':`fail: ${v.problems.join(', ')}`)});
}
for(const c of SCRIPTS){
 const req=checkKitScriptRequest(c.script,null,null),ask=()=>jevAsk({...req,questions:{method_correct:req.questions.method_correct}},env.TYPESAFE_API_KEY);
 const noul=(await Promise.all(Array.from({length:k},ask))).map(r=>r.answers.method_correct.noul),t=tally(noul.map(x=>x>=0.5),c.ok);
 rows.push({name:c.name,set:c.set,want:c.ok,confirmed:c.confirmed,...t,got:noul.map(x=>`method ${x.toFixed(2)}`)});
}
const groups=byGroup(rows,'set'),score=rows.filter(r=>r.right).length,prev=await lastRun(LOG),f=flips(prev,rows);
for(const r of rows)console.log(`${r.right?'✓':'✗'} [${r.set}] ${r.name}: ${r.rightRuns} of ${r.k} runs right, agreement ${r.agreement}${r.confirmed===false?' (answer not yet confirmed by a person)':''} · ${r.got.join(' | ')}`);
const line=g=>groups[g]?`${groups[g].right} of ${groups[g].of}`:'none';
const held=rows.filter(r=>r.set==='hold-out'),bl=baselines(held.map(r=>r.want),[true,false]);
console.log(`Hold-out scripts ${line('hold-out')} (always "correct" would get ${bl.true}, always "wrong" ${bl.false}; ${held.filter(r=>!r.confirmed).length} answers not yet confirmed by a person)`);
console.log(`Parts ${line('parts')} · in-rule ${line('in-rule')} · in-prompt scripts ${line('in-prompt')} (answers are in the question, so they do not show the check works)`);
console.log(`${flipLine(f)} · majority of ${k} runs · Gemini $${usd.toFixed(3)}`);
await appendFile(LOG,JSON.stringify({at:new Date().toISOString(),k,score,of:rows.length,groups,regressions:f?.worse??null,rows})+'\n');

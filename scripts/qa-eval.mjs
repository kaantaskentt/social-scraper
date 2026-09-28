// The quality checks' exam: node scripts/qa-eval.mjs   (about 2 cents)
// Real clips and scripts whose right answer we know from looking at the frames (2026-09-28). Run it after any change
// to the part check or the script check; a lower score than the last line of data/qa-eval.jsonl is a regression.
import {readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS,jevAsk} from '../lib/secret-run.mjs';
import {PART_QA_SCHEMA,partQaPrompt,partVerdict,checkKitScriptRequest} from '../lib/kit-reel.mjs';

const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
// Scripts are frozen in evals/qa (a live plan.json changes with every new script); clips stay in data/.
const CH=new URL('../data/channels/',import.meta.url).pathname,frozen=async n=>JSON.parse(await readFile(new URL(`../evals/qa/${n}.json`,import.meta.url),'utf8'));
// Part cases: the clip, which part of which script, and whether the part should pass (the maker watches twice).
const PARTS=[
 {name:'silver: the spoon stays black (result missing)',script:'silver',ch:'cd88abf1-e0ac-4497-bc38-d32756318418',clip:'reels/1-tarnished-silver-polish-5bcebe/part-2-a2-new.mp4',part:1,talking:false,pass:false},
 {name:'fizz 99%: good voice-over part (no lips to judge)',script:'fizz-final',ch:'lab-fizzfinal',clip:'reels/0-baking-powder-fizz-test-3472d4/part-2-a1-new.mp4',part:1,talking:false,pass:true},
 {name:'baking soda talking: good part 1',script:'ken-baking-soda',ch:'a444f915-b549-4b73-bbde-664c3aea9216',clip:'reels/0-testing-baking-soda-activity-419945/part-1-a1.mp4',part:0,talking:true,pass:true},
];
// Script cases for Jev's method question.
const ken=await frozen('ken-baking-soda');
const SCRIPTS=[
 {name:'drzen pull-up form cue (animated highlight is an illustration)',script:await frozen('drzen-pull-up'),ok:true},
 {name:'Ken baking soda with vinegar',script:ken,ok:true},
 {name:'Ken baking soda in hot water (wrong method)',script:JSON.parse(JSON.stringify(ken).replace(/white vinegar/gi,'steaming hot water').replace(/vinegar/gi,'hot water')),ok:false},
];
const rows=[];let usd=0;
for(const c of PARTS){
 const script=await frozen(c.script),bytes=await readFile(join(CH,c.ch,c.clip));
 const watch=async()=>{const r=await generate({key:env.GEMINI_API_KEY,model:MODELS.watch,parts:[{video:bytes},{text:partQaPrompt(script,c.part,false)}],schema:PART_QA_SCHEMA});usd+=r.costUsd||0;return r.json;};
 const [a,b]=await Promise.all([watch(),watch()]);if(b.result_as_written==='no')a.result_as_written='no';
 const v=partVerdict(a,{talking:c.talking});rows.push({name:c.name,right:v.pass===c.pass,got:v.pass?'pass':`fail: ${v.problems.join(', ')}`});
}
for(const c of SCRIPTS){
 const req=checkKitScriptRequest(c.script,null,null),r=await jevAsk({...req,questions:{method_correct:req.questions.method_correct}},env.TYPESAFE_API_KEY);
 const ok=r.answers.method_correct.noul>=0.5;rows.push({name:c.name,right:ok===c.ok,got:`method ${r.answers.method_correct.noul.toFixed(2)}`});
}
const score=rows.filter(r=>r.right).length;
for(const r of rows)console.log(`${r.right?'✓':'✗'} ${r.name} (${r.got})`);
console.log(`${score} of ${rows.length} right · Gemini $${usd.toFixed(3)}`);
await appendFile(new URL('../data/qa-eval.jsonl',import.meta.url),JSON.stringify({at:new Date().toISOString(),score,of:rows.length,rows})+'\n');

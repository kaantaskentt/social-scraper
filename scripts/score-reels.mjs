// Scores reels with the studio rubric (lib/reel-score.mjs): node scripts/score-reels.mjs <label=file.mp4> ...
// Prints each reel's parts and total, then Jev's verdict for every reel not labelled "orig*" against the "orig*" ones.
import {readFile} from 'node:fs/promises';
import {generate} from '../lib/gemini.mjs';
import {SCORE_SCHEMA,SCORE_PROMPT,PARTS,total,verdictRequest} from '../lib/reel-score.mjs';
import {jevAsk} from '../lib/secret-run.mjs';
import {parseEnv} from 'node:util';
// Keys: Gemini in office/.env.local, Jev in JEV/.env.local (the same files the app reads through its launcher).
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local'),...process.env};
const items=process.argv.slice(2).map(a=>{const i=a.indexOf('=');return {label:a.slice(0,i),file:a.slice(i+1)};});
let usd=0;
const scored=await Promise.all(items.map(async it=>{const r=await generate({key:env.GEMINI_API_KEY,model:'gemini-3.8-flash',parts:[{video:await readFile(it.file)},{text:SCORE_PROMPT}],schema:SCORE_SCHEMA});usd+=r.costUsd;return {...it,s:r.json,total:total(r.json)};}));
const originals=scored.filter(x=>x.label.startsWith('orig')).map(x=>x.s);
console.log(['reel',...PARTS,'total'].join('\t'));
for(const x of scored)console.log([x.label,...PARTS.map(k=>x.s[k]),x.total].join('\t'));
for(const x of scored.filter(x=>!x.label.startsWith('orig'))){const v=await jevAsk(verdictRequest(x.s,originals),env.TYPESAFE_API_KEY);console.log(`${x.label}: Jev ${v.answers.as_gripping.score.toFixed(2)}/3, main gap: ${v.answers.main_gap.choice}. Fix: ${x.s.fix}`);}
console.log(`cost $${usd.toFixed(3)}`);

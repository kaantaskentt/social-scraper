// Finds a channel's Winner DNA from the command line: node scripts/dna.mjs <runId>
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {DnaBuilder} from '../lib/dna-run.mjs';
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...process.env};
const ROOT=new URL('../data/',import.meta.url).pathname,[runId]=process.argv.slice(2);
const job=JSON.parse(await readFile(`${ROOT}runs/${runId}.json`,'utf8'));
const b=new DnaBuilder(ROOT,()=>({gemini:env.GEMINI_API_KEY}));await b.start(job);
for(;;){const s=await b.status(job);if(s.state!=='working'){if(s.state==='failed')throw new Error(s.error);const d=s.saved;
 console.log(`@${d.account}: ${d.reels} reels, $${d.costUsd}. Hold-out test: ${d.validation.verdict} (rho ${d.validation.rho}, p ${d.validation.p})`);
 for(const r of d.details.filter(r=>r.evidence!=='none'))console.log(` ${r.evidence.padEnd(6)} ${r.rho>0?'+':'-'} ${r.plain} | ${r.withX}x with vs ${r.withoutX}x without | n ${r.n} | rho ${r.rho} q ${r.q} CI ${r.ci.join('..')}`);
 console.log(` ${d.details.filter(r=>r.evidence==='none').length} details with no evidence either way`);break;}
 process.stdout.write(`\r${s.stage} ${s.done}/${s.total}   `);await new Promise(r=>setTimeout(r,4000));}

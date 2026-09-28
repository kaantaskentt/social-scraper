// What the $70 test budget (2026-09-28) has spent so far, from the logs: every channel's spend.json since the baseline,
// plus the experiment logs that do not go through a channel (pairwise tests, checker exams).
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT=new URL('../data/',import.meta.url).pathname,readJson=f=>readFile(f,'utf8').then(JSON.parse).catch(()=>null);
const lines=async f=>(await readFile(f,'utf8').catch(()=>'')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
const b=await readJson(join(ROOT,'experiments','budget.json'));let logs=0;
for(const c of await readdir(join(ROOT,'channels')))for(const e of await readJson(join(ROOT,'channels',c,'spend.json'))||[])logs+=e.usd||0;
const since=b.setAt||'2026-09-28T21:40:00Z',pair=(await lines(join(ROOT,'experiments','pairwise.jsonl'))).filter(r=>r.at>=since).reduce((a,r)=>a+(r.usd||0),0);
const exam=(await lines(join(ROOT,'experiments','checker-eval.jsonl'))).filter(r=>r.at>=since).reduce((a,r)=>a+((r.usage?.input||0)*2+(r.usage?.output||0)*10)/1e6,0); // Sonnet 5 prices
const spent=logs-b.baselineUsd+pair+exam;
console.log(`Spent $${spent.toFixed(2)} of $${b.capUsd} (channels $${(logs-b.baselineUsd).toFixed(2)}, pairwise tests $${pair.toFixed(2)}, checker exams $${exam.toFixed(2)}). Left $${(b.capUsd-spent).toFixed(2)}.`);

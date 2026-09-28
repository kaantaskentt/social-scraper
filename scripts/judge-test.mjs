// Tests the reel judge on a channel's own past reels: node scripts/judge-test.mjs <runId> [runs=2]
// The judge (lib/reel-score.mjs, the same rubric and model the app uses) watches every reel with a score and a saved
// video `runs` times; scores are cached in data/channels/<run>/judge/<id>.json and every paid call goes into spend.json.
// Result: data/channels/<run>/judge-test.json and a plain report.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS} from '../lib/secret-run.mjs';
import {DnaBuilder} from '../lib/dna-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {SCORE_SCHEMA,SCORE_PROMPT} from '../lib/reel-score.mjs';
import {judgeTest,judgeSentence} from '../lib/judge-test.mjs';

const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...process.env};if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY missing');
const ROOT=new URL('../data/',import.meta.url).pathname,[runId,runsArg='2']=process.argv.slice(2),RUNS=Number(runsArg);
const job=JSON.parse(await readFile(`${ROOT}runs/${runId}.json`,'utf8'));
const b=new DnaBuilder(ROOT,()=>({})),reels=b.usable(job),dir=join(b.dir(runId),'judge');await mkdir(dir,{recursive:true});
const readJson=f=>readFile(f,'utf8').then(JSON.parse).catch(()=>null);
let usd=0,done=0,cursor=0,failure=null;const items=[];
const one=async({post,xNormal})=>{
 const file=join(dir,`${post.id}.json`);const saved=await readJson(file);let runs=saved?.model===MODELS.watch?saved.runs:[];
 while(runs.length<RUNS){
  const r=await generate({key:env.GEMINI_API_KEY,model:MODELS.watch,parts:[{video:await readFile(videoPath(ROOT,runId,post.id))},{text:SCORE_PROMPT}],schema:SCORE_SCHEMA});
  usd+=r.costUsd||0;await b.spend(runId,{step:'judge test',usd:r.costUsd||0});runs=[...runs,r.json];
  await writeFile(file,JSON.stringify({model:MODELS.watch,id:post.id,runs},null,1));
 }
 items.push({id:post.id,xNormal,runs});done++;process.stdout.write(`\rwatched ${done}/${reels.length}  $${usd.toFixed(3)}   `);
};
const worker=async()=>{while(!failure&&cursor<reels.length){try{await one(reels[cursor++]);}catch(e){failure??=e;}}};
await Promise.all(Array.from({length:4},worker));if(failure)throw failure;
const order=new Map(reels.map((r,i)=>[r.post.id,i]));items.sort((a,c)=>order.get(a.id)-order.get(c.id));
const t=judgeTest(items),out={runId,account:job.creator,createdAt:new Date().toISOString(),model:MODELS.watch,runsPerReel:RUNS,...t,sentence:judgeSentence(t),costUsd:Math.round(usd*1e4)/1e4};
await writeFile(join(b.dir(runId),'judge-test.json'),JSON.stringify(out,null,1));
console.log(`\n@${job.creator}: ${t.verdict.toUpperCase()}\n${out.sentence}`);
if(t.parts)for(const p of [t.total,...t.parts])console.log(` ${p.part.padEnd(14)} rho ${String(p.rho).padStart(6)}  range ${p.ci[0]}..${p.ci[1]}  q ${p.q}`);
console.log(`new spend $${usd.toFixed(3)}`);

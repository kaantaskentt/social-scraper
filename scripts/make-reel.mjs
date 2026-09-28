// Makes the reel for a channel's current, passed script, exactly as the app's Make button does (no server needed):
// node scripts/make-reel.mjs <runId>        → prints each stage, then the finished reel with its checks
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {lockChannel} from './lock.mjs';
import {parseEnv} from 'node:util';
import {ReelMaker} from '../lib/reel-make.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local'),...process.env};
const [runId]=process.argv.slice(2);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));
lockChannel(ROOT,runId,'make reel');
const plan=JSON.parse(await readFile(join(ROOT,'channels',runId,'plan.json'),'utf8'));
if(!plan.check?.pass)throw new Error('The current script has not passed Jev\'s check');
const maker=new ReelMaker(ROOT,()=>({gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY,groq:env.GROQ_API_KEY,anthropic:env.ANTHROPIC_API_KEY}));
await maker.start(job,{mode:'fast',confirmCredits:plan.price.usd});let last='';
for(;;){const s=await maker.status(job);if(s.stage!==last){console.log(new Date().toISOString().slice(11,19),s.stage);last=s.stage;}
 if(s.state!=='working'){if(s.state==='failed'||s.error)throw new Error(s.error);const r=s.reels.find(x=>x.id===s.reelId)||s.reels[0];
  console.log(JSON.stringify({id:r.id,title:r.title,seconds:r.seconds,spentUsd:r.spentUsd,heard:r.heard?.all,missing:r.heard?.missing,weakest:r.score?.weakest,fix:r.score?.fix,check:r.check,rank:r.rank&&{wins:r.rank.wins,of:r.rank.of,sentence:r.rank.sentence,error:r.rank.error}}));break;}
 await new Promise(r=>setTimeout(r,4000));}

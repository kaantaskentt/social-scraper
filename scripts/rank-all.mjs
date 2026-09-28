// Ranks every finished reel of a channel against N of the channel's typical reels, and our reels against each other:
// node scripts/rank-all.mjs <runId> [n=10]   (about 1 cent a comparison). Saves reel.rank10; prints a posting order.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS} from '../lib/secret-run.mjs';
import {DnaBuilder} from '../lib/dna-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {typicalReels,rankAgainstTypical,pairwiseRecord} from '../lib/rank.mjs';
import {lockChannel} from './lock.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local')};
const [runId,nArg='10']=process.argv.slice(2),N=Number(nArg);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));lockChannel(ROOT,runId,'rank all');
const base=join(ROOT,'channels',runId,'reels'),ours=[];
for(const id of await readdir(base)){const f=join(base,id,'reel.json');const r=JSON.parse(await readFile(f,'utf8').catch(()=>'null'));if(r?.video&&r.review?.postable!==false)ours.push({id,f,r});}
const typical=typicalReels(new DnaBuilder(ROOT,()=>({})).usable(job).map(x=>({id:x.post.id,xNormal:x.xNormal,file:videoPath(ROOT,runId,x.post.id)})),N);
let usd=0;
for(const o of ours){const r=await rankAgainstTypical({ours:o.r.video,opponents:typical,gemini:generate,key:env.GEMINI_API_KEY,model:MODELS.watch});usd+=r.costUsd;o.r.rank10={wins:r.wins,of:r.of,games:r.games,at:new Date().toISOString()};await writeFile(o.f,JSON.stringify(o.r,null,1));o.wins=r.wins;}
// Head to head: every pair of our reels once (sides shuffled inside rankAgainstTypical).
const h2h=Object.fromEntries(ours.map(o=>[o.id,0]));
for(let i=0;i<ours.length;i++)for(let j=i+1;j<ours.length;j++){const r=await rankAgainstTypical({ours:ours[i].r.video,opponents:[{id:ours[j].id,file:ours[j].r.video,xNormal:1}],gemini:generate,key:env.GEMINI_API_KEY,model:MODELS.watch});usd+=r.costUsd;h2h[r.wins?ours[i].id:ours[j].id]++;}
const record=await pairwiseRecord(ROOT,runId);
console.log(`@${job.creator}: vs ${typical.length} typical reels (comparison right ${record?Math.round(record.accuracy*100)+'%':'untested'} on this channel's past pairs)`);
for(const o of ours.sort((a,b)=>b.wins-a.wins||h2h[b.id]-h2h[a.id]))console.log(` ${String(o.wins).padStart(2)} of ${typical.length} · head-to-head ${h2h[o.id]} of ${ours.length-1} · ${o.r.title}`);
console.log(`$${usd.toFixed(3)}`);

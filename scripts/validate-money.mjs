// Hand check: run the latest money formula on every local run and print what a person should verify. Reads data/ only.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {score} from '../public/money/index.mjs';
const dir=join(process.cwd(),'data','runs');
for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')&&!n.endsWith('.raw.json')&&!n.endsWith('.summary.json'))){
 const job=JSON.parse(await readFile(join(dir,name),'utf8'));const {manifest,results,summary}=score(job);const R=Object.values(results);
 console.log(`\n@${job.creator} ${job.posts.length} reels · ${manifest.formula} · observed ${manifest.observedAt} (${manifest.observedAtSource})`);
 console.log(JSON.stringify({...summary,topKeywords:summary.topKeywords.slice(0,5)}));
 const buckets={};for(const r of R){const b=r.bucket??'scored';buckets[b]=(buckets[b]||0)+1;}console.log('buckets',JSON.stringify(buckets));
 for(const r of R.filter(r=>r.xNormal!==null).sort((a,b)=>b.xNormal-a.xNormal).slice(0,8))console.log(`  ${r.id} ${r.xNormal.toFixed(1)}x ${r.label} rate ${r.rate?.toFixed(1)} ${r.rateKind} ${r.quadrant} ${r.keyword??'-'} age ${r.ageDays.toFixed(0)}d${r.growth?.flag?' '+r.growth.flag:''}`);
 const missed=job.posts.filter(p=>/\b(comment|dm me|type)\b/i.test(p.caption||'')&&!results[p.id].keyword);
 console.log(`  captions mentioning comment/DM/type without a parsed keyword: ${missed.length}`);for(const p of missed.slice(0,5))console.log('   ?',(p.caption||'').replace(/\s+/g,' ').slice(0,120));
}

// Can a judge pick the better of two reels from the same channel? Tested on real pairs with a clear gap in views
// against the creator's normal (one reel at least `gap` times the other). node scripts/pairwise-test.mjs <runId> <jev|gemini> [pairs=60]
// Sides are shuffled (A/B), so a judge that always says "A" scores 50%. Results: data/experiments/pairwise.jsonl
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {generate} from '../lib/gemini.mjs';
import {MODELS,jevAsk} from '../lib/secret-run.mjs';
import {DnaBuilder} from '../lib/dna-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {DETAILS,rng} from '../lib/dna.mjs';
import {PARTS} from '../lib/reel-score.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
const [runId,judge,nArg='60',gapArg='3']=process.argv.slice(2),N=Number(nArg),GAP=Number(gapArg);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));
const ch=join(ROOT,'channels',runId),readJson=f=>readFile(f,'utf8').then(JSON.parse).catch(()=>null);
const dna=await readJson(join(ch,'dna.json')),labels=new Map((dna?.labels||[]).map(l=>[l.id,l.labels]));
const reels=new DnaBuilder(ROOT,()=>({})).usable(job).map(r=>({id:r.post.id,xNormal:r.xNormal,post:r.post}));
// Deterministic sample of clear pairs, sides shuffled.
const rand=rng(42),pairs=[];
for(let tries=0;pairs.length<N&&tries<20000;tries++){
 const a=reels[Math.floor(rand()*reels.length)],b=reels[Math.floor(rand()*reels.length)];
 if(a===b||Math.max(a.xNormal,b.xNormal)/Math.min(a.xNormal,b.xNormal)<GAP)continue;
 if(pairs.some(p=>(p[0]===a&&p[1]===b)||(p[0]===b&&p[1]===a)))continue;pairs.push(rand()<0.5?[a,b]:[b,a]);
}
// What Jev reads about a reel: the judge's notes (averaged scores), the Winner DNA details in plain words, the opening words.
async function describe(r){
 const j=await readJson(join(ch,'judge',`${r.id}.json`)),s=j?.runs?.[0]||{},l=labels.get(r.id)||{};
 return {length_seconds:Math.round(r.post.duration||0),opening_words:String(r.post.transcript?.text||'').split(/\s+/).slice(0,25).join(' '),
  first_second:s.first_second,best_moment:s.best_moment,weakest_moment:s.weakest_moment,
  scores:j?Object.fromEntries(PARTS.map(k=>[k,Math.round(j.runs.reduce((a,x)=>a+(x[k]||0),0)/j.runs.length*10)/10])):null,
  details:Object.entries(l).map(([k,v])=>DETAILS[k]?.plain?.[v]).filter(Boolean)};
}
const PAIR_SCHEMA={type:'object',required:['more_views','why'],properties:{more_views:{type:'string',enum:['A','B'],description:'Which reel got more views relative to this creator\'s usual reels?'},why:{type:'string'}}};
let usd=0;
async function pick([a,b]){
 if(judge==='jev'){const r=await jevAsk({model:'jev-latest',state:{reel_a:await describe(a),reel_b:await describe(b)},questions:{more_views:{type:'choice',instructions:'Two reels from the same Instagram creator. Which one got more views compared with this creator\'s usual reels: `reel_a` or `reel_b`?',criteria:{A:'reel_a got more views',B:'reel_b got more views'}}}},env.TYPESAFE_API_KEY);return r.answers.more_views.choice;}
 const r=await generate({key:env.GEMINI_API_KEY,model:MODELS.watch,parts:[{text:'Reel A:'},{video:await readFile(videoPath(ROOT,runId,a.id))},{text:'Reel B:'},{video:await readFile(videoPath(ROOT,runId,b.id))},{text:'Both reels are from the same Instagram creator. One got clearly more views than the other, compared with the creator\'s usual reels. Watch both with sound and say which one, judging as a typical scroller: which one would more people watch to the end and share?'}],schema:PAIR_SCHEMA});
 usd+=r.costUsd||0;return r.json.more_views;
}
const rows=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<pairs.length){const p=pairs[cursor++];const choice=await pick(p);rows.push({a:p[0].id,b:p[1].id,xa:p[0].xNormal,xb:p[1].xNormal,choice,right:(choice==='A')===(p[0].xNormal>p[1].xNormal)});}}));
const k=rows.filter(r=>r.right).length,n=rows.length,acc=k/n;
// 95% interval for the hit rate (Wilson), so 60% on 60 pairs is not mistaken for a real skill.
const z=1.96,centre=(acc+z*z/(2*n))/(1+z*z/n),half=z*Math.sqrt(acc*(1-acc)/n+z*z/(4*n*n))/(1+z*z/n);
const out={at:new Date().toISOString(),runId,account:job.creator,judge,gap:GAP,pairs:n,right:k,accuracy:Math.round(acc*1000)/1000,ci:[Math.round((centre-half)*1000)/1000,Math.round((centre+half)*1000)/1000],usd:Math.round(usd*1e4)/1e4};
await mkdir(join(ROOT,'experiments'),{recursive:true});await appendFile(join(ROOT,'experiments','pairwise.jsonl'),JSON.stringify({...out,rows})+'\n');
console.log(`@${job.creator} ${judge}: ${k} of ${n} right (${Math.round(acc*100)}%, range ${Math.round(out.ci[0]*100)} to ${Math.round(out.ci[1]*100)}%; 50% = coin flip) $${out.usd}`);

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DnaBuilder} from '../lib/dna-run.mjs';
import {DETAILS} from '../lib/dna.mjs';

// A run of reels with plays over time, so the money formula can score them against their normal.
async function setup(n=40){
 const root=await mkdtemp(join(tmpdir(),'dna-'));const id='r1',now=Date.parse('2026-09-20T00:00:00Z');
 const posts=Array.from({length:n},(_,i)=>({id:`p${i}`,publishedAt:new Date(now-i*86400000*2).toISOString(),scrapedAt:'2026-09-28T00:00:00Z',plays:1000+((i*7919)%5000)*(i%3===0?20:1),views:null,likes:50+i,comments:3,caption:'c',duration:20+i%50,transcript:{text:'hello'},status:'complete',analysis:{}}));
 const job={id,creator:'x',posts,createdAt:'2026-09-28T00:00:00Z',status:'complete'};
 await mkdir(join(root,'videos',id),{recursive:true});for(const p of posts)await writeFile(join(root,'videos',id,`${p.id}.mp4`),'v');
 return {root,job};
}
const labels=Object.fromEntries(Object.entries(DETAILS).filter(([,d])=>!d.code).map(([k,d])=>[k,d.values[0]]));
const until=async(b,job)=>{const end=Date.now()+10000;while(Date.now()<end){const s=await b.status(job);if(s.state!=='working')return s;await new Promise(r=>setTimeout(r,5));}throw new Error('stuck');};
// The money formula has its own tests; here each reel simply gets a times-its-normal value.
const scoreRun=job=>Object.fromEntries(job.posts.map((p,i)=>[p.id,{quadrant:'x',xNormal:0.5+(i%7)/2}]));
const fastStats={analyse:()=>[{key:'glasses=yes',detail:'glasses',value:'yes',plain:'The host wears glasses',rho:0.4,withX:2,withoutX:1,n:10,evidence:'hint'}],validate:()=>({verdict:'luck',rho:0,p:1,n:0})};

test('the builder watches every usable reel once (cached), adds the code-measured length, saves the result and the spend',async()=>{
 const {root,job}=await setup();let calls=0;
 const gemini=async({parts})=>{calls++;assert.match(parts.at(-1).text,/never skin colour/);return {json:{...labels,glasses:calls%2?'yes':'no'},costUsd:0.005};};
 const b=new DnaBuilder(root,()=>({gemini:'g'}),{gemini,stats:fastStats,scoreRun});
 const st=await b.status(job);assert.equal(st.state,'none');assert.ok(st.estimate.reels>=30);
 await b.start(job);const s=await until(b,job);assert.equal(s.state,'done',s.error);
 assert.equal(calls,s.saved.reels);assert.equal(s.saved.labels[0].labels.length!==undefined,true);assert.match(s.saved.labels[0].labels.length,/^(under_15|15_to_30|30_to_60|over_60)$/);
 assert.equal(s.view.shown[0].plain,'The host wears glasses');
 const ledger=JSON.parse(await readFile(join(root,'channels','r1','spend.json'),'utf8'));assert.equal(ledger.length,calls);
 await b.start(job);await until(b,job);assert.equal(calls,s.saved.reels); // second run: all cached
 await rm(root,{recursive:true});
});

test('the builder refuses too few reels and a missing key, and a failed watch fails the build loudly',async()=>{
 const small=await setup(12);await assert.rejects(new DnaBuilder(small.root,()=>({gemini:'g'}),{scoreRun}).start(small.job),/needs at least 30/);
 const {root,job}=await setup();await assert.rejects(new DnaBuilder(root,()=>({}),{scoreRun}).start(job),/Gemini key/);
 const b=new DnaBuilder(root,()=>({gemini:'g'}),{gemini:async()=>{throw Object.assign(new Error('Gemini: HTTP 500'),{costUsd:0.001});},stats:fastStats,scoreRun});
 await b.start(job);const s=await until(b,job);assert.equal(s.state,'failed');assert.match(s.error,/HTTP 500/);
 await rm(root,{recursive:true});await rm(small.root,{recursive:true});
});

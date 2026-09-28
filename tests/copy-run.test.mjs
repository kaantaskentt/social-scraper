import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {CopyStudio,partsFor,castPrompt} from '../lib/copy-run.mjs';
import {videoPath} from '../lib/videos.mjs';
import {wordsKept} from '../lib/copy.mjs';

const RUN='run1',kit={createdAt:'K1',approved:true,format:'ai_host',kit:{name:'Food Fact Check',place:'a bright kitchen',cast:[{name:'Felix',look:'a man'},{name:'Stella',look:'a woman'}]}};
const breakdown={hook_words:'Pour boiling water over raw chicken',beats:[{from:0,to:4,shot:'close-up',happens:'a man pours boiling water on chicken',says:'',sound:'pour'},{from:4,to:15,shot:'close-up of foam',happens:'foam rises',says:'',sound:'sizzle'},{from:15,to:22,shot:'medium',happens:'the woman reacts',says:'',sound:''}]};
const text='Pour boiling water over raw chicken. If white foam comes out, that is what they pumped into it. If it holds firm, it is clean.';
const post={id:'chk',caption:'Test your chicken',duration:22,transcript:{text,segments:[{start:0,end:3,text:'Pour boiling water over raw chicken.'},{start:4,end:12,text:'If white foam comes out, that is what they pumped into it.'},{start:15,end:20,text:'If it holds firm, it is clean.'}]}};
const job={id:RUN,creator:'ken',posts:[post,{id:'bad',duration:30,transcript:{text:'x'}}]};

async function setup({makeKit,gate}={}){
 const root=await mkdtemp(join(tmpdir(),'copy-'));const ledger=[],calls={cast:0,compare:0,jev:0};
 for(const id of ['chk','bad']){const f=videoPath(root,RUN,id);await mkdir(dirname(f),{recursive:true});await writeFile(f,'orig');}
 const planner={approvedKit:async()=>kit,breakdown:async()=>({breakdown}),voiceDecision:async()=>({mode:'talking',why:'w'})};
 const maker={dir:r=>join(root,'channels',r),spendLedger:async(r,e)=>ledger.push(e),channelVoices:async()=>{throw new Error('talking hosts need no designed voices');},
  makeKit:makeKit||(async(j,plan,k,{price},live)=>{
   for(const s of ['Filming part 1 of 3','Checking part 1','Filming part 2 of 3','Checking part 2','Filming part 3 of 3','Checking part 3','Editing the reel','Making the cover']){live.stage=s;await new Promise(r=>setTimeout(r,15));if(s==='Filming part 2 of 3'&&gate)await gate;}
   const dir=join(root,'channels',RUN,'reels',live.reelId);await mkdir(dir,{recursive:true});await writeFile(join(dir,'reel.mp4'),'ours');
   await writeFile(join(dir,'reel.json'),JSON.stringify({id:live.reelId,video:join(dir,'reel.mp4'),url:`/channels/${RUN}/${live.reelId}/reel.mp4`,seconds:24.5,said:plan.script.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' '),heard:{all:true,missing:[]},spentUsd:price.usd}));
  })};
 const gemini=async({schema,parts})=>{
  if(schema.properties.beats&&schema.required.includes('same_feel')){calls.compare++;assert.equal(String(parts[1].video),'orig');assert.equal(String(parts[3].video),'ours');return {json:{beats:[{beat:1,match:3,differs:'nothing'},{beat:2,match:3,differs:'nothing'},{beat:3,match:2,differs:'smaller reaction'}],same_feel:3,biggest_gap:'nothing'},costUsd:0.01};}
  calls.cast++;return {json:{beats:[{who:'Felix',does:'Felix pours boiling water on chicken'},{who:'Felix',does:'foam rises'},{who:'Mystery',does:'Stella reacts'}]},costUsd:0.002};};
 const jev=async req=>{calls.jev++;return {answers:{copyable:{score:2.5},roles_fit:{noul:0.9}}};};
 const studio=new CopyStudio(root,()=>({gemini:'g',jev:'j',groq:'q'}),{planner,maker,gemini,jev,tick:5});
 studio.reels=()=>[{id:'chk',xNormal:104,seconds:22,plays:5800000,text},{id:'bad',xNormal:40,seconds:30,plays:1,text:'x'}];
 return {root,studio,ledger,calls};
}
const until=async(get,ok)=>{const end=Date.now()+10000;for(;;){const s=await get();if(ok(s)||Date.now()>end)return s;await new Promise(r=>setTimeout(r,10));}};

test('parts: 10-second parts, at most 4 (Google extends a video only up to 30 s)',()=>{assert.equal(partsFor(22),3);assert.equal(partsFor(37.4),4);assert.equal(partsFor(30.2),3);assert.equal(partsFor(41),4);assert.equal(partsFor(120),4);});

test('picking: winners with speech, their breakdowns and Jev\'s "can we copy it", saved with the reason and the price',async()=>{
 const {root,studio,calls}=await setup();
 try{
  await studio.pickStart(job);const s=await until(()=>studio.status(job),s=>s.picking?.state!=='working');assert.equal(s.picking.state,'done',s.picking.error);
  assert.deepEqual(s.picks.picks.map(p=>p.id),['chk']);assert.equal(s.picks.picks[0].parts,3);assert.equal(s.picks.picks[0].usd,3.3);assert.equal(s.picks.picks[0].why,'Jev: copies 2.5 of 3.');assert.equal(calls.jev,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('making: the price must be confirmed; the script keeps the original words; progress climbs to 100; the copy is compared',async()=>{
 let open;const gate=new Promise(r=>{open=r;});const {root,studio,calls,ledger}=await setup({gate});
 try{
  await studio.pickStart(job);await until(()=>studio.status(job),s=>s.picking?.state!=='working');
  await assert.rejects(studio.start(job,{ids:['chk'],confirmUsd:1}),/Confirm the price first \(\$3\.30\)/);await assert.rejects(studio.start(job,{ids:['nope'],confirmUsd:3.3}),/Choose 1 to 5/);
  await studio.start(job,{ids:['chk'],confirmUsd:3.3});
  // Paused while filming part 2: the ring must show real progress between 0 and 100.
  const mid=await until(()=>studio.status(job),s=>s.batch.items[0].stage==='Filming part 2 of 3');assert.ok(mid.batch.items[0].pct>0&&mid.batch.items[0].pct<100,`mid-way progress ${mid.batch.items[0].pct}`);assert.ok(mid.batch.pct>0&&mid.batch.left>0);open();
  const s=await until(()=>studio.status(job),s=>['done','failed'].includes(s.batch.items[0].state));const it=s.batch.items[0];
  assert.equal(it.state,'done',it.error);assert.equal(it.pct,100);
  assert.equal(it.fidelity.faithful,true);assert.equal(it.fidelity.words,100);assert.equal(it.fidelity.shots,Math.round(8/9*100));assert.equal(calls.compare,1);
  const plan=JSON.parse(await readFile(join(root,'channels',RUN,'copies','chk.plan.json'),'utf8'));assert.equal(plan.source,'copy');assert.equal(plan.copyOf,'chk');
  assert.equal(wordsKept(text,plan.script.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ')),1);assert.equal(plan.script.parts[1].beats.find(b=>/foam/.test(b.does)).who,'Felix');
  assert.ok(plan.script.parts.flatMap(p=>p.beats).every(b=>['Felix','Stella','voice'].includes(b.who)),'an unknown cast name falls back to our lead host');
  assert.ok(ledger.some(e=>e.step==='copy compare'));assert.equal(it.original,`/videos/${RUN}/chk`);
  const learned=JSON.parse(await readFile(join(root,'experiments','stage-times.json'),'utf8'));assert.ok(Number.isFinite(learned.film_first),'stage times are learned');
  // After a restart the finished copy is still there; a copy that was still working is shown as stopped.
  const again=new CopyStudio(root,()=>({}),{planner:{},maker:{dir:r=>join(root,'channels',r)}});assert.equal((await again.status(job)).batch.items[0].state,'done');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a copy that fails says why and does not stop the others',async()=>{
 let n=0;const {root,studio}=await setup();const real=studio.maker.makeKit;studio.maker.makeKit=async(...a)=>{if(++n===1)throw new Error('Part 1 failed its check twice (only partly follows the script)');return real(...a);};
 try{
  await studio.pickStart(job);await until(()=>studio.status(job),s=>s.picking?.state!=='working');
  await studio.start(job,{ids:['chk'],confirmUsd:3.3});const s=await until(()=>studio.status(job),s=>['done','failed'].includes(s.batch.items[0].state));
  assert.equal(s.batch.items[0].state,'failed');assert.equal(s.batch.items[0].error,'Part 1 did not match the original twice (only partly follows the script)');assert.equal(s.batch.items[0].retryUsd,3.3);
  // Try again: only unfilmed parts are priced, and the copy finishes in the same batch.
  await assert.rejects(studio.retry(job,{ids:['chk'],confirmUsd:1}),/Confirm the price first \(\$3\.30\)/);
  await studio.retry(job,{ids:['chk'],confirmUsd:3.3});const r=await until(()=>studio.status(job),s=>['done','failed'].includes(s.batch.items[0].state));assert.equal(r.batch.items[0].state,'done',r.batch.items[0].error);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('casting asks for every beat in order and our names only',()=>{assert.match(castPrompt(breakdown.beats,kit.kit),/1\. close-up; a man pours boiling water on chicken/);assert.match(castPrompt(breakdown.beats,kit.kit),/changing NOTHING else/);});

test('a copy with parts already filmed is priced for the rest only',async()=>{
 const {root,studio}=await setup();
 try{const dir=join(root,'channels',RUN,'reels','copy-x');await mkdir(dir,{recursive:true});await writeFile(join(dir,'reel.json'),JSON.stringify({parts:[{check:{pass:true}},{check:{pass:true}},{check:{pass:false}}]}));
  assert.equal(await studio.remainingUsd(RUN,{reelId:'copy-x',parts:4}),2.26);assert.equal(await studio.remainingUsd(RUN,{reelId:'none',parts:2}),2.17);
 }finally{await rm(root,{recursive:true,force:true});}
});

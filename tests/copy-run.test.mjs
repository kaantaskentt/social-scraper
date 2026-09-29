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
 studio.reels=()=>[{id:'chk',xNormal:104,seconds:22,plays:5800000,text,timed:true},{id:'bad',xNormal:40,seconds:30,plays:1,text:'x',timed:true}];
 return {root,studio,ledger,calls};
}
const until=async(get,ok)=>{const end=Date.now()+10000;for(;;){const s=await get();if(ok(s)||Date.now()>end)return s;await new Promise(r=>setTimeout(r,10));}};

test('parts: 10-second parts covering the whole reel, no cap (every 4 parts a fresh Omni chain starts)',()=>{assert.equal(partsFor(22),3);assert.equal(partsFor(37.4),4);assert.equal(partsFor(30.2),3);assert.equal(partsFor(41),4);assert.equal(partsFor(120),12);});

test('picking: winners with speech, their breakdowns and Jev\'s "can we copy it", saved with the reason and the price',async()=>{
 const {root,studio,calls}=await setup();
 try{
  await studio.pickStart(job);const s=await until(()=>studio.status(job),s=>s.picking?.state!=='working');assert.equal(s.picking.state,'done',s.picking.error);
  assert.deepEqual(s.picks.picks.map(p=>p.id),['chk']);assert.equal(s.picks.picks[0].parts,3);assert.equal(s.picks.picks[0].usd,3.3);assert.equal(s.picks.picks[0].why,'Jev rates it 2.5 of 3 for copying.');assert.equal(calls.jev,1);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
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
  const mystery=plan.script.parts.flatMap(p=>p.beats).filter(b=>b.does==='Stella reacts');assert.ok(mystery.length);
  assert.ok(mystery.every(b=>b.who==='Felix'),'an unknown cast name falls back to our lead host'); // Felix: kit.kit.cast[0]
  assert.ok(ledger.some(e=>e.step==='copy compare'));assert.equal(it.original,`/videos/${RUN}/chk`);
  await studio.finished(RUN);const learned=JSON.parse(await readFile(join(root,'experiments','stage-times.json'),'utf8'));assert.ok(Number.isFinite(learned.film_first),'stage times are learned');
  // Every stage is learned once per copy, comparing too (it was never learned; audit, 2026-09-29).
  for(const k of ['study','script','film_first','edit','cover','compare'])assert.equal(learned.samples[k]?.length,1,k);
  // After a restart the finished copy is still there; a copy that was still working is shown as stopped.
  const again=new CopyStudio(root,()=>({}),{planner:{},maker:{dir:r=>join(root,'channels',r)}});assert.equal((await again.status(job)).batch.items[0].state,'done');
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
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
  await studio.finished(RUN);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('casting asks for every beat in order and our names only',()=>{assert.match(castPrompt(breakdown.beats,kit.kit),/1\. close-up; a man pours boiling water on chicken/);assert.match(castPrompt(breakdown.beats,kit.kit),/changing NOTHING else/);});

test('a copy with parts already filmed is priced for the rest only',async()=>{
 const {root,studio}=await setup();
 try{const dir=join(root,'channels',RUN,'reels','copy-x');await mkdir(dir,{recursive:true});await writeFile(join(dir,'reel.json'),JSON.stringify({parts:[{check:{pass:true}},{check:{pass:true}},{check:{pass:false}}]}));
  assert.equal(await studio.remainingUsd(RUN,{reelId:'copy-x',parts:4}),2.26);assert.equal(await studio.remainingUsd(RUN,{reelId:'none',parts:2}),2.17);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

const picked=async studio=>{await studio.pickStart(job);await until(()=>studio.status(job),s=>s.picking?.state!=='working');};
const settled=s=>['done','failed'].includes(s.batch.items[0].state);

test('two start requests close together make the copies once (audit, 2026-09-29)',async()=>{
 let made=0;const {root,studio}=await setup();const real=studio.maker.makeKit;studio.maker.makeKit=async(...a)=>{made++;return real(...a);};
 let open;const slow=new Promise(r=>{open=r;});studio.planner.voiceDecision=async()=>{await slow;return {mode:'talking',why:'w'};};
 try{
  await picked(studio);const a=studio.start(job,{ids:['chk'],confirmUsd:3.3}),b=studio.start(job,{ids:['chk'],confirmUsd:3.3});open();
  const r=await Promise.allSettled([a,b]);assert.deepEqual(r.map(x=>x.status).sort(),['fulfilled','rejected']);
  // While every copy is still waiting, a third request is refused too.
  await assert.rejects(studio.start(job,{ids:['chk'],confirmUsd:3.3}),/already being made/);
  const s=await until(()=>studio.status(job),settled);assert.equal(s.batch.items[0].state,'done',s.batch.items[0].error);await studio.finished(RUN);assert.equal(made,1);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a failed voice design leaves no copy stuck on Waiting, and start works again (audit, 2026-09-29)',async()=>{
 const {root,studio}=await setup();studio.planner.voiceDecision=async()=>({mode:'voiceover',why:'w'});let n=0;studio.maker.channelVoices=async()=>{if(++n===1)throw new Error('Gemini: HTTP 400. bad voice');};
 try{
  await picked(studio);await assert.rejects(studio.start(job,{ids:['chk'],confirmUsd:3.3}),/bad voice/);
  const s=await studio.status(job);assert.ok(!s.batch?.items.some(i=>['waiting','working'].includes(i.state)),'nothing waits forever');
  await studio.start(job,{ids:['chk'],confirmUsd:3.3});const d=await until(()=>studio.status(job),settled);assert.equal(d.batch.items[0].state,'done',d.batch.items[0].error);await studio.finished(RUN);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('after a restart, Try again keeps the paid parts: same reel, only the rest priced, limit covers what was spent (audit, 2026-09-29)',async()=>{
 const {root,studio}=await setup();const reelIds=[],prices=[];let hold;const held=new Promise(r=>{hold=r;});
 studio.maker.makeKit=async(j,plan,k,{price},live)=>{reelIds.push(live.reelId);prices.push(price);
  const dir=join(root,'channels',RUN,'reels',live.reelId),f=join(dir,'reel.json');await mkdir(dir,{recursive:true});
  if(reelIds.length===1){await writeFile(f,JSON.stringify({parts:[{check:{pass:true}},{check:{pass:true}}],spentUsd:2.17,paid:{}}));live.stage='Filming part 3 of 3';await held;throw new Error('the app went away');}
  // The maker's own limit check: part 3 costs 1.13 on top of the 2.17 already spent.
  const reel=JSON.parse(await readFile(f,'utf8'));if(reel.spentUsd+1.13>price.maxUsd+1e-9)throw new Error(`Stopped: the next part would pass the confirmed limit of $${price.maxUsd.toFixed(2)}`);
  await writeFile(join(dir,'reel.mp4'),'ours');await writeFile(f,JSON.stringify({...reel,video:join(dir,'reel.mp4'),url:`/channels/${RUN}/${live.reelId}/reel.mp4`,seconds:24.5,said:plan.script.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' '),spentUsd:3.3}));};
 try{
  await picked(studio);await studio.start(job,{ids:['chk'],confirmUsd:3.3});await until(()=>studio.status(job),s=>s.batch.items[0].stage==='Filming part 3 of 3');
  // The restart: a new studio on the same folder.
  const again=new CopyStudio(root,studio.keys,{planner:studio.planner,maker:studio.maker,gemini:studio.gemini,jev:studio.jev,tick:5});
  const s=await again.status(job),it=s.batch.items[0];assert.equal(it.state,'stopped');assert.match(it.error,/Try again/);assert.doesNotMatch(it.error,/start it again/);assert.equal(it.retryUsd,1.13);
  await again.retry(job,{ids:['chk'],confirmUsd:1.13});const d=await until(()=>again.status(job),settled);assert.equal(d.batch.items[0].state,'done',d.batch.items[0].error);
  assert.equal(reelIds[1],reelIds[0],'the same reel folder, so filmed parts are skipped');assert.equal(prices[1].usd,1.13);assert.equal(prices[1].maxUsd,4.43); // 2.17 spent + twice 1.13
  await again.finished(RUN);hold();await studio.finished(RUN);
 }finally{hold();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a comparison that fails keeps the made copy; comparing again costs no filming (audit, 2026-09-29)',async()=>{
 const {root,studio,calls}=await setup();let made=0;const real=studio.maker.makeKit;studio.maker.makeKit=async(...a)=>{made++;return real(...a);};
 const gem=studio.gemini;let fail=true;studio.gemini=async a=>{if(a.schema.required.includes('same_feel')&&fail)throw new Error('Gemini: HTTP 400. Request payload size exceeds the limit');return gem(a);};
 try{
  await picked(studio);await studio.start(job,{ids:['chk'],confirmUsd:3.3});
  const s=await until(()=>studio.status(job),settled);await studio.finished(RUN);const it=s.batch.items[0];
  assert.equal(it.state,'done');assert.ok(it.reel);assert.match(it.fidelity.error,/payload size/);assert.equal(it.retryUsd,0);
  fail=false;await assert.rejects(studio.retry(job,{ids:['chk'],confirmUsd:1}),/Confirm the price first \(\$0\.00\)/);
  await studio.retry(job,{ids:['chk'],confirmUsd:0});const d=await until(()=>studio.status(job),s=>s.batch.items[0].state==='done');await studio.finished(RUN);
  assert.equal(d.batch.items[0].fidelity.faithful,true);assert.equal(made,1);assert.equal(calls.compare,1);
  // The same through the compare route's method.
  await studio.compareAgain(job,{postId:'chk'});await until(()=>studio.status(job),s=>s.batch.items[0].state==='done');await studio.finished(RUN);assert.equal(calls.compare,2);assert.equal(made,1);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a batch file that cannot be written mid-batch is logged, never an unhandled rejection (audit, 2026-09-29)',async()=>{
 const {root,studio}=await setup();const seen=[],on=e=>seen.push(e);process.on('unhandledRejection',on);
 const save=studio.saveBatch.bind(studio);let n=0;studio.saveBatch=(r,b)=>++n===1?save(r,b):Promise.reject(Object.assign(new Error('ENOSPC: no space left on device'),{code:'ENOSPC'}));
 const log=console.error;console.error=()=>{};
 try{
  await picked(studio);await studio.start(job,{ids:['chk'],confirmUsd:3.3});await until(()=>studio.status(job),settled);await studio.finished(RUN);await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(seen,[]);
 }finally{console.error=log;process.off('unhandledRejection',on);await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a transcript without word times fails before the cast call is paid (audit, 2026-09-29)',async()=>{
 const {root,studio,calls,ledger}=await setup();const untimed={...job,posts:[{...post,transcript:{text,segments:[]}}]};
 try{
  await picked(studio);await studio.start(untimed,{ids:['chk'],confirmUsd:3.3});const s=await until(()=>studio.status(untimed),settled);await studio.finished(RUN);
  assert.equal(s.batch.items[0].state,'failed');assert.match(s.batch.items[0].error,/no word times/);assert.equal(calls.cast,0);assert.ok(!ledger.some(e=>e.step==='copy cast'));
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a failed copy is out of the batch bar: time left and percent follow the copies still running (audit, 2026-09-29)',async()=>{
 const {root,studio}=await setup();const {plannedStages}=await import('../lib/copy.mjs');
 try{
  const planned=plannedStages(3,'native'),now=Date.now(),total=planned.reduce((a,s)=>a+s.seconds,0);
  studio.batches.set(RUN,{id:'B',createdAt:'T',usd:6.6,voiceMode:'native',items:[{postId:'chk',reelId:'copy-a',parts:3,usd:3.3,state:'failed',error:'x',planned,pointer:0,stageAt:now},{postId:'bad',reelId:'copy-b',parts:3,usd:3.3,state:'working',stage:'Filming part 3 of 3',planned,pointer:6,stageAt:now}]});
  const b=(await studio.status(job)).batch,run=b.items[1];assert.equal(b.left,run.left);assert.ok(b.left<total);assert.equal(b.pct,run.pct);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('learned stage times: copies at once keep every sample, and one change is learned once (audit, 2026-09-29)',async()=>{
 const {root,studio}=await setup();const {plannedStages}=await import('../lib/copy.mjs');
 try{
  const planned=plannedStages(1,'native'),mk=()=>({state:'working',stage:'Studying the reel',stageAt:Date.now()-2000,pointer:0,planned});
  const items=Array.from({length:5},mk);await Promise.all(items.map(i=>studio.setStage(i,'Writing the copy')));
  const one=mk();await Promise.all([studio.setStage(one,'Writing the copy'),studio.setStage(one,'Writing the copy')]);
  const learned=JSON.parse(await readFile(join(root,'experiments','stage-times.json'),'utf8'));assert.equal(learned.samples.study.length,6);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('a copy that was only being compared when the app stopped stays done, not "stopped"',async()=>{
 const {root,studio}=await setup();
 try{const dir=join(root,'channels',RUN,'reels','copy-z');await mkdir(dir,{recursive:true});await writeFile(join(dir,'reel.json'),JSON.stringify({video:join(dir,'reel.mp4')}));
  await mkdir(join(root,'channels',RUN,'copies'),{recursive:true});
  await writeFile(join(root,'channels',RUN,'copies','batch.json'),JSON.stringify({id:'B',usd:3.3,items:[{postId:'chk',reelId:'copy-z',parts:3,usd:3.3,state:'working',stage:'Comparing with the original',planned:[{key:'compare',seconds:30}],pointer:0},{postId:'x',reelId:'copy-none',parts:3,usd:3.3,state:'working',planned:[{key:'film_first',seconds:45}],pointer:0}]}));
  const fresh=new CopyStudio(root,()=>({}),{planner:{},maker:{dir:r=>join(root,'channels',r)}}),s=await fresh.status(job);
  assert.equal(s.batch.items[0].state,'done');assert.equal(s.batch.items[1].state,'stopped');
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}); /* a background save may still be writing */}
});

test('both models: each winner copied once by Omni and once by Veo 3.1 Fast, Veo priced per second, each made by its own maker',async()=>{
 const {root,studio}=await setup();const used=[];
 try{
  const make=engine=>async(j,plan,k,{price},live)=>{used.push([engine,plan.engine,plan.script.parts.map(p=>p.seconds||10)]);
   const dir=join(root,'channels',RUN,'reels',live.reelId);await mkdir(dir,{recursive:true});await writeFile(join(dir,'reel.mp4'),'ours');
   await writeFile(join(dir,'reel.json'),JSON.stringify({id:live.reelId,video:join(dir,'reel.mp4'),url:`/x/${live.reelId}.mp4`,seconds:24.5,said:plan.script.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' '),heard:{all:true,missing:[]},spentUsd:price.usd}));};
  studio.maker.makeKit=make('omni');studio.maker.makeVeo=make('veo');
  await studio.pickStart(job);await until(()=>studio.status(job),s=>s.picking?.state!=='working');
  const pick=(await studio.status(job)).picks.picks[0];assert.deepEqual(pick.veo,{parts:3,usd:2.2}); // 22 s: 8 + 7 + 7 s at $0.10
  await assert.rejects(studio.start(job,{ids:['chk'],engines:['omni','veo-fast'],confirmUsd:3.3}),/Confirm the price first \(\$5\.50\)/);
  await studio.start(job,{ids:['chk'],engines:['omni','veo-fast'],confirmUsd:5.5});
  const s=await until(()=>studio.status(job),s=>s.batch.items.every(i=>['done','failed'].includes(i.state)));
  assert.deepEqual(s.batch.items.map(i=>[i.key,i.engine,i.state]),[['chk:omni','omni','done'],['chk:veo-fast','veo-fast','done']]);
  assert.deepEqual(used.sort(),[['omni','omni',[10,10,10]],['veo','veo-fast',[8,7,7]]]);
  assert.notEqual(s.batch.items[0].reelId,s.batch.items[1].reelId);assert.match(s.batch.items[1].reelId,/^copy-chk-veo-fast-/);
 }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
// Prep ahead (Kaan, 2026-09-29: "pre-load or get prepped before moving to the next stage"): right after a scan, the
// candidates' breakdowns are made and cached, so "Find the 5 to copy" only asks Jev. It needs no look yet.
test('prepare: breaks down every copy candidate ahead of time, without a look, and skips one that fails',async()=>{
 const {root,studio}=await setup();const seen=[];
 studio.planner={...studio.planner,approvedKit:async()=>null,breakdown:async(j,id)=>{seen.push(id);if(id==='bad')throw new Error('no video');return {breakdown};}};
 studio.reels=()=>[{id:'chk',xNormal:104,seconds:22,plays:5800000,text,timed:true},{id:'bad',xNormal:40,seconds:30,plays:900000,text:'Here is another thing you should try at home today with your family and friends',timed:true}];
 try{const r=await studio.prepare(job);assert.deepEqual(seen.sort(),['bad','chk']);assert.deepEqual(r,{candidates:2,ready:1});}
 finally{await rm(root,{recursive:true,force:true});}
});

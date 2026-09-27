import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SecretBuilder,MODELS} from '../lib/secret-run.mjs';
import {LABELS} from '../lib/secret.mjs';

async function setup({failOn}={}){
 const root=await mkdtemp(join(tmpdir(),'cl-secret-'));await mkdir(join(root,'videos','run1'),{recursive:true});
 const posts=Array.from({length:12},(_,i)=>({id:`r${i}`,duration:20+i,transcript:{text:`Opening words for reel ${i} and more`},analysis:{labels:{mechanism:{value:i<6?'mistake':'curiosity'},emotion:{value:'concern'}}}}));
 for(const p of posts)await writeFile(join(root,'videos','run1',`${p.id}.mp4`),`video-${p.id}`);
 const results=Object.fromEntries(posts.map((p,i)=>[p.id,{quadrant:'dud',xNormal:12-i}]));
 const calls={watch:[],write:0,jev:0};
 const gemini=async({model,parts,schema})=>{
  if(model===MODELS.watch){const id=String(parts[0].video).replace('video-','');if(id===failOn)throw new Error('Gemini: HTTP 500. boom');calls.watch.push(id);
   return {json:{person:+id.slice(1)<6?'a man in a white coat':'a woman in a hoodie',setting:'white wall',format:'demo',opening:'x',shots:'x',on_screen_text:'none',sound:'voice',style:'x'},costUsd:0.001};}
  if(!schema.required.includes('recipe'))return {json:{ok:true},costUsd:0.0001};calls.write++;
  return {json:{headline:'He looks like a doctor.',person:{text:'Doctor look',evidence:['r0','r1','ghost']},setting:{text:'Clean wall',evidence:['nope']},format:{text:'Demo',evidence:['r2']},script:{text:'s',evidence:['r0']},sound:{text:'v',evidence:['r0']},pace:{text:'p',evidence:['r0']},
   differences:[{claim:'Coat wins',evidence:['r0','r1']}],recipe:[{step:'Wear a white coat',evidence:['r0']}]},costUsd:0.05};};
 const jev=async req=>{calls.jev++;const white=JSON.stringify(req.state).includes('white coat');
  return {answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{choice:k==='look'?(white?'doctor_or_expert':'casual_creator'):Object.keys(q.criteria)[0]}])),usage:{input_tokens:500}};};
 const shots=async()=>({duration:20,shots:[{},{},{},{}]});
 const job={id:'run1',creator:'ken.test',posts};
 const b=new SecretBuilder(root,()=>({gemini:'g',jev:'j'}),{gemini,jev,shots});
 return {root,b,job,results,calls};
}
const done=async(b,id)=>{for(let i=0;i<500&&b.state.get(id)?.state==='building';i++)await new Promise(r=>setTimeout(r,5));return b.state.get(id);};

test('before building: an estimate and no spend; building watches each picked reel once, labels it, writes the page with checked evidence',async()=>{
 const {root,b,job,results,calls}=await setup();
 try{const before=await b.status(job,results);assert.equal(before.state,'none');assert.equal(before.plan.winners,6);assert.ok(before.plan.usd>0);assert.equal(calls.watch.length,0);
  await b.start(job,results);assert.equal((await done(b,'run1')).state,'done',b.state.get('run1').error);
  assert.equal(calls.watch.length,12);assert.equal(calls.jev,12);assert.equal(calls.write,1);
  const s=JSON.parse(await readFile(join(root,'secret','run1','secret.json'),'utf8'));
  assert.deepEqual(s.secret.person.evidence,['r0','r1']);assert.equal(s.secret.setting,null);assert.deepEqual(s.dropped,['setting']);
  const doc=s.stats.differences.find(d=>d.question==='look'&&d.value==='doctor_or_expert');assert.deepEqual([doc.winners,doc.flops,doc.perSide],[6,0,6]);
  const said=s.stats.differences.find(d=>d.question==='said_mechanism'&&d.value==='mistake');assert.deepEqual([said.winners,said.flops],[6,0],'what was said is compared too');
  assert.ok(s.stats.house.some(h=>h.question==='said_emotion'&&h.value==='concern'));assert.match(s.stats.names.said_mechanism.values.mistake,/Warns of a mistake/);
  assert.equal(s.stats.names.look.values.doctor_or_expert.slice(0,7),'Like a ');
  assert.equal(s.picked.length,12);assert.ok(s.costUsd>0.05);assert.equal(s.models.watch,MODELS.watch);
  const after=await b.status(job,results);assert.equal(after.state,'done');assert.equal(after.saved.secret.headline,'He looks like a doctor.');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a failure halfway is shown, and the retry pays only for the reels not watched yet',async()=>{
 const {root,b,job,results,calls}=await setup({failOn:'r9'});
 try{await b.start(job,results);const failed=await done(b,'run1');assert.equal(failed.state,'failed');assert.match(failed.error,/HTTP 500/);
  const watchedFirst=calls.watch.length;assert.ok(watchedFirst<12);await new Promise(r=>setTimeout(r,30));assert.equal(calls.watch.length,watchedFirst,'nothing keeps watching after the run says failed');
  const fresh=await setup();b.gemini=fresh.b.gemini;fresh.calls.watch.length=0;
  await b.start(job,results);assert.equal((await done(b,'run1')).state,'done');
  assert.equal(fresh.calls.watch.length,12-watchedFirst,'only the missing reels are watched again');
  await rm(fresh.root,{recursive:true,force:true});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('refuses clearly: missing keys, a second start while building, too few reels with saved videos',async()=>{
 const {root,b,job,results}=await setup();
 try{const noKey=new SecretBuilder(root,()=>({jev:'j'}),{});await assert.rejects(noKey.start(job,results),/Gemini key/);
  await b.start(job,results);await assert.rejects(b.start(job,results),/already being built/);await done(b,'run1');
  const few={...job,id:'run2',posts:job.posts.slice(0,5)};await assert.rejects(b.start(few,results),/at least 8/);
  assert.match((await b.status(few,results)).plan.error,/at least 8/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a key that cannot use the writing model fails before any video is sent',async()=>{
 const {root,b,job,results,calls}=await setup();
 try{const real=b.gemini;b.gemini=async args=>{if(args.model===MODELS.write)throw new Error('Your Gemini key is on the free tier. Turn on billing');return real(args);};
  await b.start(job,results);const failed=await done(b,'run1');assert.equal(failed.state,'failed');assert.match(failed.error,/free tier/);assert.equal(calls.watch.length,0,'no video sent');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('"Write it again" reuses the same reels and pays only for the write-up; the spend ledger keeps every build',async()=>{
 const {root,b,job,results,calls}=await setup();
 try{await b.start(job,results);await done(b,'run1');const first=JSON.parse(await readFile(join(root,'secret','run1','secret.json'),'utf8'));
  const watched=calls.watch.length,labelled=calls.jev;
  const moved=Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{...v,xNormal:-v.xNormal}]));// scores changed since: a fresh pick would choose other reels
  await b.start(job,moved,{rewrite:true});assert.equal((await done(b,'run1')).state,'done');
  assert.equal(calls.watch.length,watched,'no new watching');assert.equal(calls.jev,labelled,'no new labels');assert.equal(calls.write,2);
  const second=JSON.parse(await readFile(join(root,'secret','run1','secret.json'),'utf8'));
  assert.deepEqual(second.picked.map(p=>p.id),first.picked.map(p=>p.id));assert.ok(second.costUsd<first.costUsd);
  assert.ok(Math.abs(second.spentAllTime-(first.costUsd+second.costUsd))<1e-9,'the ledger adds up every build');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a replaced video is watched again instead of reusing the old description',async()=>{
 const {root,b,job,results,calls}=await setup();
 try{await b.start(job,results);await done(b,'run1');const n=calls.watch.length;
  await writeFile(join(root,'videos','run1','r0.mp4'),'video-r0 but longer now');await b.start(job,results);await done(b,'run1');
  assert.equal(calls.watch.length,n+1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('money spent on an answer that failed is still recorded',async()=>{
 const {root,b,job,results}=await setup();
 try{const real=b.gemini;let first=true;b.gemini=async a=>{if(a.model===MODELS.watch&&first){first=false;const e=new Error('Gemini answer was not valid JSON');e.costUsd=0.004;throw e;}return real(a);};
  await b.start(job,results);assert.equal((await done(b,'run1')).state,'failed');
  const ledger=JSON.parse(await readFile(join(root,'secret','run1','spend.json'),'utf8'));assert.ok(ledger.some(x=>x.usd===0.004&&x.step==='watch'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('"did we get it right?" is stored with the Secret and only yes or no is accepted',async()=>{
 const {root,b,job,results}=await setup();
 try{await assert.rejects(b.feedback(job,'yes'),/Build the Secret first/);await b.start(job,results);await done(b,'run1');
  assert.deepEqual(await b.feedback(job,'no'),{feedback:'no'});assert.equal(JSON.parse(await readFile(join(root,'secret','run1','secret.json'),'utf8')).feedback,'no');
  await assert.rejects(b.feedback(job,'maybe'),/yes or no/);
 }finally{await rm(root,{recursive:true,force:true});}
});

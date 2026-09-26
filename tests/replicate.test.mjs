import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildReplicatePrompt,higgsfieldArgs,parseCredits,Replicator} from '../lib/replicate.mjs';

test('prompt: video is master for camera and pacing only, references are the only design, no copied text',()=>{
 const p=buildReplicatePrompt({images:2,shots:[{start:0,end:3.2},{start:3.2,end:12.5}],overlayText:'dev team justifying a dinner'});
 assert.match(p,/@Video 1 is the master for camera, framing, movement, pacing, cut timing, location and lighting/);
 assert.match(p,/Do not use the faces, identities or clothing of the people in @Video 1/);
 assert.match(p,/@Image 1 and @Image 2/);assert.match(p,/exactly as shown/);
 assert.match(p,/Do not copy any on-screen text, captions, logos or watermarks from @Video 1/);
 assert.match(p,/Shot 1: 0\.0-3\.2s/);assert.match(p,/Shot 2: 3\.2-12\.5s/);
 assert.match(p,/【dev team justifying a dinner】/);
 assert.doesNotMatch(buildReplicatePrompt({images:1,shots:[]}),/【/);
 assert.match(buildReplicatePrompt({images:1,shots:[]}),/corresponds to @Image 1\./);
});

test('CLI arguments: cost vs create, references, duration clamped to 4..30, sound off when keeping the original',()=>{
 const base={prompt:'P',videoPath:'/v.mp4',imagePaths:['/a.png','/b.png'],duration:12.49,keepSound:true};
 assert.deepEqual(higgsfieldArgs('cost',base),['generate','cost','seedance_2_5','--prompt','P','--mode','omni_reference','--video-references','/v.mp4','--image-references','/a.png','--image-references','/b.png','--duration','12','--aspect_ratio','9:16','--resolution','720p','--generate_audio','false']);
 const create=higgsfieldArgs('create',{...base,keepSound:false,duration:2});
 assert.deepEqual(create.slice(0,3),['generate','create','seedance_2_5']);assert.equal(create.at(-1),'--json');
 assert.equal(create[create.indexOf('--duration')+1],'4');assert.equal(create[create.indexOf('--generate_audio')+1],'true');
 assert.equal(higgsfieldArgs('cost',{...base,duration:44})[higgsfieldArgs('cost',{...base,duration:44}).indexOf('--duration')+1],'30');
 assert.throws(()=>higgsfieldArgs('cost',{...base,imagePaths:[]}),/at least one reference image/);
});

test('parseCredits reads the CLI estimate and fails loudly on anything else',()=>{
 assert.equal(parseCredits('84 credits\n'),84);assert.equal(parseCredits('Estimated: 12.5 credits'),12.5);
 assert.throws(()=>parseCredits('Error: Session expired'),/credit estimate/);
});

const tick=()=>new Promise(r=>setTimeout(r,5));
async function setup(overrides={}){
 const root=await mkdtemp(join(tmpdir(),'cl-rep-'));await mkdir(join(root,'refs'),{recursive:true});
 await writeFile(join(root,'refs','a.png'),'png');await writeFile(join(root,'src.mp4'),'video');
 const calls=[];let gets=0;
 const run=overrides.run||(async args=>{calls.push(args);
  if(args[1]==='cost')return '84 credits';
  if(args[1]==='create')return JSON.stringify([{id:'job-1',status:'queued'}]);
  if(args[1]==='get'){gets++;return JSON.stringify(gets<2?{id:'job-1',status:'in_progress'}:{id:'job-1',status:'completed',result_url:'https://cdn.example/out.mp4'});}
  throw new Error('unexpected '+args.join(' '));});
 const fetched=[];const download=overrides.download||(async(url,file)=>{fetched.push(url);await writeFile(file,'generated');});
 const muxed=[];const mux=overrides.mux||(async(video,sound,out)=>{muxed.push([video,sound]);await writeFile(out,'with-sound');});
 const r=new Replicator(root,{run,download,mux,pollMs:1,probeDuration:async()=>12.49,prepareSource:async p=>p});
 await r.init();
 return {root,r,calls,fetched,muxed,input:{runId:'run1',postId:'reel1',sourcePath:join(root,'src.mp4'),imagePaths:[join(root,'refs','a.png')],overlayText:'dev team',keepSound:true,shots:[{start:0,end:12.49}]}};
}

test('estimate returns the prompt and the credits; start refuses without the confirmed amount',async()=>{
 const {root,r,input}=await setup();
 try{const est=await r.estimate(input);assert.equal(est.credits,84);assert.match(est.prompt,/@Video 1/);
  await assert.rejects(r.start({...input,confirmCredits:50}),/cost changed/);
  await assert.rejects(r.start({...input}),/Confirm the cost/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('start submits once, polls until done, downloads, keeps the original sound, and persists every step',async()=>{
 const {root,r,calls,fetched,muxed,input}=await setup();
 try{const rep=await r.start({...input,confirmCredits:84});assert.equal(rep.status,'generating');assert.equal(rep.jobId,'job-1');
  while(r.get(rep.id).status==='generating'||r.get(rep.id).status==='finishing')await tick();
  const done=r.get(rep.id);assert.equal(done.status,'done',done.error);
  assert.equal(calls.filter(c=>c[1]==='create').length,1);assert.deepEqual(fetched,['https://cdn.example/out.mp4']);
  assert.equal(muxed.length,1);assert.equal(muxed[0][1],input.sourcePath);
  await r.saved(rep.id);const disk=JSON.parse(await readFile(join(root,'replicas',rep.id+'.json'),'utf8'));assert.equal(disk.status,'done');assert.equal(disk.jobId,'job-1');
  assert.equal(String(await readFile(join(root,'replicas',rep.id+'.mp4'))),'with-sound');
  assert.deepEqual(r.list({runId:'run1',postId:'reel1'}).map(x=>x.id),[rep.id]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a lost submit response is never retried automatically',async()=>{
 const run=async args=>{if(args[1]==='cost')return '84 credits';if(args[1]==='create')throw new Error('request failed (no response received)');throw new Error('unexpected');};
 const {root,r,input}=await setup({run});
 try{const rep=await r.start({...input,confirmCredits:84});while(r.get(rep.id).status==='submitting')await tick();
  const x=r.get(rep.id);assert.equal(x.status,'uncertain');assert.match(x.error,/may have gone through/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('polling survives short connection drops and resumes after a restart',async()=>{
 let gets=0;const run=async args=>{if(args[1]==='cost')return '84 credits';if(args[1]==='create')return '[{"id":"job-9"}]';
  if(args[1]==='get'){gets++;if(gets<=3)throw new Error('request failed (no response received)');return '{"id":"job-9","status":"completed","result_url":"https://cdn.example/x.mp4"}';}};
 const {root,r,input}=await setup({run});
 try{const rep=await r.start({...input,keepSound:false,confirmCredits:84});while(!['done','failed'].includes(r.get(rep.id).status))await tick();assert.equal(r.get(rep.id).status,'done');
  await r.saved(rep.id);const state=JSON.parse(await readFile(join(root,'replicas',rep.id+'.json'),'utf8'));state.status='generating';await writeFile(join(root,'replicas',rep.id+'.json'),JSON.stringify(state));
  const again=new Replicator(root,{run,download:async(u,f)=>writeFile(f,'g'),mux:async()=>{},pollMs:1,probeDuration:async()=>12,prepareSource:async p=>p});await again.init();
  while(again.get(rep.id).status!=='done')await tick();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a failed Higgsfield job is reported, not retried',async()=>{
 const run=async args=>{if(args[1]==='cost')return '84 credits';if(args[1]==='create')return '[{"id":"job-2"}]';return '{"id":"job-2","status":"failed","error":"nsfw"}';};
 const {root,r,input}=await setup({run});
 try{const rep=await r.start({...input,confirmCredits:84});while(r.get(rep.id).status==='generating')await tick();assert.equal(r.get(rep.id).status,'failed');assert.match(r.get(rep.id).error,/failed/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('saves of one replicate land in order even when the disk is slow',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-rep-'));
 try{const r=new Replicator(root,{run:async()=>'',pollMs:1});await r.init();
  const rep={id:'00000000-0000-0000-0000-000000000001',runId:'a',postId:'b',status:'one',createdAt:'x'};
  const writes=[];for(const st of ['two','three','four','done']){rep.status=st;writes.push(r.save(rep));}
  await Promise.all(writes);assert.equal(JSON.parse(await readFile(join(root,'replicas',rep.id+'.json'),'utf8')).status,'done');
 }finally{await rm(root,{recursive:true,force:true});}
});

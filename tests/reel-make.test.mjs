import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReelMaker,qaVerdict,shotArgs} from '../lib/reel-make.mjs';

const plan={pattern:{format:'demo'},chosen:0,picked:[{idea:{title:'Celery'}}],check:{pass:true},
 script:{hook_title:'Revive celery',keyword:'CRISP',caption:'Try it #kitchen',voiceover:[{line:'Drop it in ice water.',shot:'s1'},{line:'Comment CRISP.',shot:'s2'}],shots:[{id:'s1',seconds:6,visual:'hands drop celery in ice water',camera:'top-down'},{id:'s2',seconds:4,visual:'hands snap the celery',camera:'close'}]}};
const price={shots:[{id:'s1',seconds:6,credits:27,fastCredits:15},{id:'s2',seconds:4,credits:18,fastCredits:10}],voice:2.5,kit:3.5,total:51,withOneRetryEach:96,fastTotal:31,fastWithOneRetryEach:56};
async function setup({qa=()=>true}={}){
 const root=await mkdtemp(join(tmpdir(),'cl-make-'));await mkdir(join(root,'channels','run1'),{recursive:true});await writeFile(join(root,'channels','run1','plan.json'),JSON.stringify(plan));
 const creates=[];let n=0;const checks={};
 const model={};const run=async args=>{if(args[1]==='create'){creates.push(args[2]);const id=`job-${++n}`;model[id]=args[2];return JSON.stringify([id]);}return JSON.stringify({status:'completed',result_url:`https://cdn.example/${model[args[2]]}/${args[2]}`});};
 const download=async(url,file)=>writeFile(file,url);
 const gemini=async({parts})=>{const clip=String(parts[0].video);checks[clip]=(checks[clip]||0)+1;const ok=qa(clip,checks[clip]);assert.match(parts[1].text,/The brief for the shot was/,'the judge sees the brief');return {json:{shows:'x',match:ok?3:1,missing:'nothing',face_visible:false,text_visible:false,hands_look_wrong:false},costUsd:0.001};};
 const jev=async()=>({answers:{matches:{noul:0.9}}});
 const renders=[];const render=async o=>{renders.push(o);await writeFile(o.out,'mp4');return {out:o.out,seconds:12};};
 const m=new ReelMaker(root,()=>({gemini:'g',jev:'j',groq:'q'}),{run,download,gemini,jev,render,price:async()=>price,pollMs:1});
 return {root,m,creates,renders,checks};
}
const done=async(m,id)=>{for(let i=0;i<500&&m.state.get(id)?.state==='working';i++)await new Promise(r=>setTimeout(r,5));return m.state.get(id);};
const job={id:'run1'};

test('the pilot: price re-checked, reference image, voice, each shot once, checked, edited; spend recorded',async()=>{
 const {root,m,creates,renders}=await setup();
 try{const s=await m.start(job,{mode:'std',confirmCredits:51});assert.equal(s.ceiling,96);assert.equal((await done(m,'run1')).state,'done',m.state.get('run1').error);
  assert.deepEqual(creates,['gpt_image_2','seed_audio','seedance_2_0','seedance_2_0']);
  const reel=JSON.parse(await readFile(join(root,'channels','run1','reel','reel.json'),'utf8'));assert.equal(reel.spent,51);assert.equal(reel.shots.s1.pass,true);
  assert.equal(renders.length,1);assert.equal(renders[0].clips.length,2);assert.equal(renders[0].endCard.title,'Comment CRISP');
  assert.equal(String(await readFile(join(root,'channels','run1','reel','caption.txt'))),'Try it #kitchen\n');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a shot that fails its check gets exactly one retry; a second failure stops before anything else is spent',async()=>{
 const one=await setup({qa:(clip,times)=>!(clip.includes('seedance')&&times===1&&!one?.retried&&(one.retried=true))});
 try{await one.m.start(job,{mode:'std',confirmCredits:51});assert.equal((await done(one.m,'run1')).state,'done',one.m.state.get('run1').error);
  assert.equal(one.creates.filter(c=>c==='seedance_2_0').length,3);assert.equal(JSON.parse(await readFile(join(one.root,'channels','run1','reel','reel.json'),'utf8')).spent,78);
 }finally{await rm(one.root,{recursive:true,force:true});}
 const two=await setup({qa:clip=>!clip.includes('seedance')});
 try{await two.m.start(job,{mode:'fast',confirmCredits:31});const r=await done(two.m,'run1');assert.equal(r.state,'failed');assert.match(r.error,/failed its check twice/);
  assert.equal(two.creates.filter(c=>c==='seedance_2_0').length,2,'shot 2 is never paid for');assert.equal(two.renders.length,0);
 }finally{await rm(two.root,{recursive:true,force:true});}
});

test('nothing is spent when the price changed, the mode is unknown, or the script has open problems',async()=>{
 const {root,m,creates}=await setup();
 try{await assert.rejects(m.start(job,{mode:'std',confirmCredits:40}),/price changed to 51/);await assert.rejects(m.start(job,{mode:'turbo',confirmCredits:51}),/standard or fast/);
  await writeFile(join(root,'channels','run1','plan.json'),JSON.stringify({...plan,check:{pass:false}}));await assert.rejects(m.start(job,{mode:'std',confirmCredits:51}),/open problems/);
  assert.equal(creates.length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('the check fails on a face, text, broken hands, a missing main action, or a missing detail that matters; small differences pass',()=>{
 const ok={match:3,missing:'nothing',face_visible:false,text_visible:false,hands_look_wrong:false};
 assert.deepEqual(qaVerdict({...ok,face_visible:true},null).problems,['a face is visible']);
 assert.deepEqual(qaVerdict({...ok,match:1},null).problems,['the right objects but the wrong action']);assert.deepEqual(qaVerdict({...ok,match:0},null).problems,['it shows something else']);assert.equal(qaVerdict({...ok,match:2},null).pass,true);
 assert.equal(qaVerdict({...ok,missing:'the stalk is snapped rather than bent'},{answers:{matters:{noul:0.2}}}).pass,true,'a wording or order difference that does not matter passes');
 assert.deepEqual(qaVerdict({...ok,missing:'no knife cut'},{answers:{matters:{noul:0.8}}}).problems,['it misses what matters: no knife cut']);
 assert.equal(qaVerdict(ok,null).pass,true);
 const a=shotArgs({seconds:6,visual:'v',camera:'c'},'/k.png','fast');assert.equal(a[a.indexOf('--generate_audio')+1],'false');assert.equal(a[a.indexOf('--image-references')+1],'/k.png');
});

test('every attempt keeps its own file, so a retry never overwrites a clip that might be the better one',async()=>{
 const one=await setup({qa:(clip,times)=>!(clip.includes('seedance')&&!one?.retried&&(one.retried=true))});
 try{await one.m.start(job,{mode:'std',confirmCredits:51});await done(one.m,'run1');
  const {readdir}=await import('node:fs/promises');const files=(await readdir(join(one.root,'channels','run1','reel'))).filter(f=>/^shot-s1-a\d\.mp4$/.test(f)).sort();
  assert.deepEqual(files,['shot-s1-a1.mp4','shot-s1-a2.mp4']);
 }finally{await rm(one.root,{recursive:true,force:true});}
});

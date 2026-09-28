import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';

const saved={account:'ken.remedie',createdAt:'2026-09-27T10:00:00Z',secret:{headline:'h',format:{text:'demo'},script:{text:'steps'}},stats:{house:[],differences:[{question:'said_structure',value:'steps',winners:12,flops:5,perSide:15}]}};
const ideas=[{title:'Egg float',hook_line:'Drop it in',demo:'egg sinks',steps:['a'],keyword:'EGG'},{title:'Detox water',hook_line:'x',demo:'y',steps:['a'],keyword:'D'},{title:'Ice cubes',hook_line:'x',demo:'y',steps:['a'],keyword:'ICE'}];
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'cl-plan-'));await mkdir(join(root,'secret','run1'),{recursive:true});await writeFile(join(root,'secret','run1','secret.json'),JSON.stringify(saved));
 const calls={gemini:[],jev:0,price:0};let drafts=0;
 const gemini=async({schema,parts})=>{calls.gemini.push(parts[0].text);
  if(schema.properties.ideas)return {json:{ideas},costUsd:0.02};
  drafts++;return {json:{hook_title:'Fresh?',voiceover:[{line:'Drop an egg',shot:'s1'}],keyword:'EGG',caption:'c',shots:[{id:'s1',seconds:5,visual:'hands drop an egg',camera:'close'},{id:'s2',seconds:4,visual:drafts===1?'a woman reads the label':'hands lift the glass',camera:'close'}]},costUsd:0.03};};
 const jev=async req=>{calls.jev++;const q=req.questions;
  if(q.fit){const health=req.state.idea.title==='Detox water';return {answers:{fit:{score:req.state.idea.title==='Egg float'?3:2},ai_ready:{score:3},hook:{score:3},health_claim:{noul:health?0.9:0.1},true_demo:{noul:0.9}},usage:{input_tokens:1000}};}
  const risky=JSON.stringify(req.state).includes('woman');
  return {answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.9},health_fact:{noul:0.1},emotion:{choice:'curiosity'},...Object.fromEntries(req.state.script.shots.map(s=>[`shot_${s.id}_risky`,{noul:risky&&s.id==='s2'?0.9:0.1}]))},usage:{input_tokens:1000}};};
 const price=async shots=>{calls.price++;return {shots:shots.map(s=>({id:s.id,seconds:s.seconds,credits:s.seconds*4.5})),voice:0.1,total:40.6,withOneRetryEach:81.1,fastTotal:22.6,fastWithOneRetryEach:45.1};};
 return {root,calls,p:new ReelPlanner(root,()=>({gemini:'g',jev:'j'}),{gemini,jev,price})};
}
const settle=async(p,id)=>{for(let i=0;i<400&&p.state.get(id)?.state==='working';i++)await new Promise(r=>setTimeout(r,5));return p.state.get(id);};
const job={id:'run1',creator:'ken.remedie',posts:[]};

test('ideas: Gemini writes them, Jev judges each, health claims are removed, the best fit comes first',async()=>{
 const {root,calls,p}=await setup();
 try{await p.startIdeas(job);assert.equal((await settle(p,'run1')).state,'ready',p.state.get('run1')?.error);
  const plan=JSON.parse(await readFile(join(root,'channels','run1','plan.json'),'utf8'));
  assert.deepEqual(plan.picked.map(x=>x.idea.title),['Egg float','Ice cubes']);assert.deepEqual(plan.rejected.map(x=>[x.idea.title,x.reason]),[['Detox water','health or medical claim']]);
  assert.equal(calls.jev,3);assert.match(calls.gemini[0],/hands/i);
  const ledger=JSON.parse(await readFile(join(root,'channels','run1','spend.json'),'utf8'));assert.equal(ledger.length,4);assert.ok(ledger.some(x=>x.step==='judge idea'&&x.usd>0));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('script: Jev flags a risky shot, the script is rewritten once, checked again, then priced',async()=>{
 const {root,calls,p}=await setup();
 try{await p.startIdeas(job);await settle(p,'run1');await p.startScript(job,0);assert.equal((await settle(p,'run1')).state,'ready',p.state.get('run1')?.error);
  const plan=JSON.parse(await readFile(join(root,'channels','run1','plan.json'),'utf8'));
  assert.equal(plan.chosen,0);assert.equal(plan.check.rewritten,true);assert.equal(plan.check.pass,true);assert.match(plan.script.shots[1].visual,/hands/);
  assert.match(calls.gemini.at(-1),/Shot s2 is risky/);assert.equal(plan.price.fastTotal,22.6);assert.equal(calls.price,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('refuses clearly: no Secret yet, no ideas yet, a pick that does not exist, a second job while working, missing keys',async()=>{
 const {root,p}=await setup();
 try{await assert.rejects(p.startIdeas({...job,id:'run2'}),/Build the Secret/);await assert.rejects(p.startScript(job,0),/Make the ideas first/);
  await p.startIdeas(job);await assert.rejects(p.startIdeas(job),/Already working/);await settle(p,'run1');await assert.rejects(p.startScript(job,9),/Pick one/);
  await assert.rejects(new ReelPlanner(root,()=>({jev:'j'})).startIdeas(job),/Gemini key/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('the price is checked again for free, so the page never shows a price the maker would refuse',async()=>{
 const {root,p}=await setup();
 try{await p.startIdeas(job);await settle(p,'run1');await p.startScript(job,0);await settle(p,'run1');
  let n=0;p.price=async()=>({total:61+(++n),fastTotal:61});const st=await p.reprice(job);assert.equal(st.plan.price.total,62);assert.ok(st.plan.pricedAt);
  await rm(join(root,'channels','run1','plan.json'));await assert.rejects(p.reprice(job),/Write the script first/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('autopilot: a blocked idea hands over to the next best one; the page gets the script that passed and why the others did not',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-auto-'));
 try{
  const p=new ReelPlanner(root,()=>({gemini:'g',jev:'j'}),{});await mkdir(join(root,'channels','run1'),{recursive:true});
  const plan={mode:'kit',kitAt:'K1',createdAt:'P1',pattern:'x',picked:['Soda','Egg','Rice','Salt'].map(title=>({idea:{title},scores:{}}))};
  await writeFile(join(root,'channels','run1','plan.json'),JSON.stringify(plan));
  const written=[];
  const payoffs=[];await writeFile(join(root,'channels','run1','dna.json'),JSON.stringify({labels:Array.from({length:90},(_,i)=>({labels:{payoffs:i<20?'1':'0'}}))}));
  Object.assign(p,{approvedKit:async()=>({createdAt:'K1',kit:{},format:'ai_host'}),craft:async()=>null,voiceDecision:async()=>({mode:'talking',why:'w'}),madeIdeas:async()=>new Set([1]),
   writeChecked:async(job,kit,craft,prompt,keys,live,mode,payoff)=>{payoffs.push(payoff);const t=['Soda','Egg','Rice','Salt'].find(x=>prompt.includes(x));written.push(t);
    return {script:{hook_title:t,parts:[{beats:[]},{beats:[]}]},check:t==='Rice'?{pass:true,problems:[]}:{pass:false,problems:[`${t} is not true`]}};}});
  await p.startScript({id:'run1',posts:[]},0);const st=await settle(p,'run1');assert.notEqual(st?.state,'failed',st?.error);
  const saved=JSON.parse(await readFile(join(root,'channels','run1','plan.json'),'utf8'));
  assert.deepEqual(written,['Soda','Rice']); // Egg already has a reel, so it is skipped
  assert.deepEqual(payoffs,[false,false]);assert.equal(saved.result.payoff,false); // 20 of 90 reels show a result: the full readings reach the decision
  assert.equal(saved.chosen,2);assert.equal(saved.check.pass,true);assert.deepEqual(saved.blocked.map(b=>[b.title,b.problems[0]]),[['Soda','Soda is not true']]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new ideas are told which tests this channel already made',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-fresh-'));
 try{
  const p=new ReelPlanner(root,()=>({gemini:'g',jev:'j'}),{});
  for(const [id,title] of [['a','Egg Freshness Float'],['b','Baking Powder Fizz Test'],['c','Baking Powder Fizz Test']]){await mkdir(join(root,'channels','run1','reels',id),{recursive:true});await writeFile(join(root,'channels','run1','reels',id,'reel.json'),JSON.stringify({title}));}
  assert.deepEqual((await p.madeTitles('run1')).sort(),['Baking Powder Fizz Test','Egg Freshness Float']);assert.deepEqual(await p.madeTitles('none1'),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

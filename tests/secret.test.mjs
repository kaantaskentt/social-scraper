import test from 'node:test';
import assert from 'node:assert/strict';
import {pickReels,LABELS,labelRequest,readLabels,compare,checkEvidence,estimate} from '../lib/secret.mjs';

const posts=Array.from({length:40},(_,i)=>({id:`r${i}`,duration:30}));
const results=Object.fromEntries(posts.map((p,i)=>[p.id,{quadrant:i===39?'insufficient':'dud',xNormal:i===38?null:40-i}]));

test('pick: 15 best and 15 weakest scored reels with a video; unscored and videoless ones are skipped',()=>{
 const {winners,flops}=pickReels(posts,results,{hasVideo:p=>p.id!=='r0'});
 assert.equal(winners.length,15);assert.equal(flops.length,15);assert.equal(winners[0].id,'r1');
 assert.ok(!winners.concat(flops).some(x=>['r0','r38','r39'].includes(x.id)));
 assert.ok(Math.min(...winners.map(w=>w.xNormal))>Math.max(...flops.map(f=>f.xNormal)));
 const few=pickReels(posts.slice(0,12),results,{hasVideo:()=>true});assert.equal(few.winners.length,6);assert.equal(few.flops.length,6);
 assert.throws(()=>pickReels(posts.slice(0,6),results,{hasVideo:()=>true}),/at least 8 scored reels/);
});

test('labels: one Jev request per reel with every question over the description; answers must be known options',()=>{
 const req=labelRequest({person:'A man in a white coat',setting:'clean white wall'},'Your socks should not leave marks');
 assert.deepEqual(Object.keys(req.questions).sort(),Object.keys(LABELS).sort());
 for(const q of Object.values(req.questions))assert.ok(q.criteria.unclear||q.criteria.other||q.criteria.none,'every question has a way out');
 assert.match(JSON.stringify(req.state),/white coat/);
 const raw={answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,{choice:Object.keys(q.criteria)[0],confidence:.9}])),usage:{input_tokens:1000}};
 const out=readLabels(raw,req);assert.equal(Object.keys(out.labels).length,Object.keys(LABELS).length);assert.equal(out.costUsd,0.000042);
 raw.answers.format.choice='made_up';assert.throws(()=>readLabels(raw,req),/format/);
});

test('compare: house style is what most reels share; differences need a real gap between winners and flops',()=>{
 const mk=(id,group,format,sound,secondsPerShot=3)=>({id,group,labels:{format,sound,look:'doctor_or_expert'},seconds:30,secondsPerShot});
 const items=[...Array.from({length:10},(_,i)=>mk(`w${i}`,'winner',i<8?'demonstration':'talking_head',i<5?'voice_with_music':'voice_only',2)),
  ...Array.from({length:10},(_,i)=>mk(`f${i}`,'flop',i<2?'demonstration':'talking_head',i<4?'voice_with_music':'voice_only',4))];
 const c=compare(items);
 assert.deepEqual(c.house.map(h=>[h.question,h.value,h.count,h.total]),[['look','doctor_or_expert',20,20]]);
 const d=c.differences.find(x=>x.question==='format'&&x.value==='demonstration');assert.deepEqual([d.winners,d.flops,d.perSide],[8,2,10]);
 assert.ok(!c.differences.some(x=>x.question==='sound'),'5 vs 4 is not a real gap');
 assert.deepEqual(c.numbers.secondsPerShot,{winners:2,flops:4});
 assert.deepEqual(c.differences.map(x=>x.evidence.length),c.differences.map(x=>x.winners>=x.flops?x.winners:x.flops));
});

test('evidence check: unknown reel ids are removed; a claim left with no proof is dropped and reported',()=>{
 const secret={headline:'h',person:{text:'p',evidence:['a','zz']},setting:{text:'s',evidence:['zz']},differences:[{claim:'c1',evidence:['b']},{claim:'c2',evidence:['nope']}],recipe:[{step:'s1',evidence:['a']}]};
 const {secret:clean,dropped}=checkEvidence(secret,new Set(['a','b']));
 assert.deepEqual(clean.person.evidence,['a']);assert.equal(clean.setting,null);assert.deepEqual(clean.differences.map(d=>d.claim),['c1']);
 assert.deepEqual(dropped.sort(),['c2','setting']);
});

test('estimate: seconds of video and a fixed writing cost, in dollars',()=>{
 const e=estimate([{seconds:40},{seconds:20}]);assert.ok(e.usd>0&&e.usd<0.2,String(e.usd));assert.equal(e.reels,2);assert.equal(e.seconds,60);
});

test('a value can be house style and a difference at once (15 of 15 best vs 8 of 15 weakest)',()=>{
 const items=[...Array.from({length:15},(_,i)=>({id:`w${i}`,group:'winner',labels:{format:'demonstration'}})),...Array.from({length:15},(_,i)=>({id:`f${i}`,group:'flop',labels:{format:i<8?'demonstration':'talking_head'}}))];
 const c=compare(items);assert.ok(c.house.some(h=>h.value==='demonstration'));const d=c.differences.find(x=>x.value==='demonstration');assert.deepEqual([d.winners,d.flops],[15,8]);
});

test('claims with counts that are not in the stats are dropped, so the writer cannot invent numbers',()=>{
 const stats={house:[{question:'look',value:'x',count:26,total:30}],differences:[{question:'opening',value:'y',winners:10,flops:3,perSide:15,evidence:['a']}],numbers:{}};
 const secret={headline:'h',differences:[{claim:'Result first: 10 of 15 best, 3 of 15 weakest',evidence:['a']},{claim:'Hooks win: 14 of 15 best',evidence:['a']}],recipe:[{step:'Open with the result (26 of 30 reels do)',evidence:['a']},{step:'Say 9 of 10 doctors agree',evidence:['a']}]};
 const {secret:clean,dropped}=checkEvidence(secret,new Set(['a']),stats);
 assert.deepEqual(clean.differences.map(d=>d.claim),['Result first: 10 of 15 best, 3 of 15 weakest']);assert.deepEqual(clean.recipe.map(r=>r.step),['Open with the result (26 of 30 reels do)']);
 assert.deepEqual(dropped.sort(),['Hooks win: 14 of 15 best','Say 9 of 10 doctors agree']);
});

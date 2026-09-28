import test from 'node:test';
import assert from 'node:assert/strict';
import {pickReels,LABELS,labelRequest,readLabels,compare,checkEvidence,estimate,WATCH_PROMPT,writePrompt} from '../lib/secret.mjs';

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
 assert.deepEqual(c.numbers.secondsPerShot,{winners:2,flops:4,all:3,clear:true});
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

test('length and pace count as a finding only when the gap is clear (30% or more)',()=>{
 const mk=(id,group,seconds,secondsPerShot)=>({id,group,labels:{},seconds,secondsPerShot});
 const close=compare([...[40,42,44].map((s,i)=>mk(`w${i}`,'winner',s,9)),...[45,46,47].map((s,i)=>mk(`f${i}`,'flop',s,7.5))]);
 assert.equal(close.numbers.seconds.clear,false);assert.equal(close.numbers.secondsPerShot.clear,false);
 const far=compare([...[30,32,34].map((s,i)=>mk(`w${i}`,'winner',s,2.5)),...[60,62,64].map((s,i)=>mk(`f${i}`,'flop',s,6))]);
 assert.equal(far.numbers.seconds.clear,true);assert.equal(far.numbers.secondsPerShot.clear,true);
});

test('the page cannot state seconds that were not measured, or a length or pace gap that is not clear',()=>{
 const stats={house:[],differences:[],numbers:{seconds:{winners:32,flops:62,clear:true},secondsPerShot:{winners:9.5,flops:7.4,clear:false}}};
 const s={headline:'h',pace:{text:'Best reels hold each shot for 9.5 seconds',evidence:['a']},format:{text:'Best reels run 32 s, weakest 62 s',evidence:['a']},sound:{text:'About 45 seconds of talking',evidence:['a']}};
 const {secret,dropped}=checkEvidence(s,new Set(['a']),stats);
 assert.equal(secret.pace,null,'no measured pace, no pace line');assert.equal(secret.format.text,'Best reels run 32 s, weakest 62 s');assert.equal(secret.sound,null);assert.deepEqual(dropped.sort(),['sound']);
});

test('no ethnicity or race on the page: the brief describes look, clothes and vibe',()=>{
 const {secret,dropped}=checkEvidence({headline:'h',person:{text:'An Asian man and a Black woman in casual tees',evidence:['a']},setting:{text:'White counters, bright kitchen',evidence:['a']},recipe:[{step:'Cast a white woman',evidence:['a']}]},new Set(['a']),{house:[],differences:[],numbers:{}});
 assert.equal(secret.person,null);assert.equal(secret.setting.text,'White counters, bright kitchen','white counters are fine');assert.deepEqual(secret.recipe,[]);assert.ok(dropped.includes('person'));
 assert.match(WATCH_PROMPT,/ethnicity/i);assert.match(writePrompt({account:'a',stats:{},reels:[]}),/ethnicity/i);
});

import {MECHANISMS} from '../public/secret-mechanisms.mjs';
test('Jev also asks why people watch: the feeling, shown or said, a clear action, and the angle, using the words too',()=>{
 for(const k of ['feel','proof','action','angle'])assert.ok(LABELS[k],k);
 const req=labelRequest({opening:'boiling water poured on raw chicken'},'Pour boiling water','Pour boiling water on raw chicken. If white foam comes out it is full of chemicals. Buy organic instead.');
 assert.match(JSON.stringify(req.state),/Buy organic instead/);assert.match(req.questions.action.instructions,/spoken_words/);
});

test('"Why it works" may only use mechanisms from the evidence list; the critique must be backed by reels and honest numbers',()=>{
 const stats={house:[{question:'feel',value:'disgust',count:24,total:30}],differences:[],numbers:{}};
 const s={headline:'h',why:[{mechanism:'disgust_memory',pattern:'Gross foam in the first second (24 of 30 reels)',evidence:['a']},{mechanism:'dopamine_loop',pattern:'Addictive',evidence:['a']},{mechanism:'fear_with_action',pattern:'Fear then fix: 99 of 100 reels',evidence:['a']}],
  critique:[{point:'The home tests make health claims; check them before copying',kind:'risk',evidence:['a']},{point:'Unproven',kind:'weakness',evidence:[]}]};
 const {secret,dropped}=checkEvidence(s,new Set(['a']),stats);
 assert.deepEqual(secret.why.map(w=>w.mechanism),['disgust_memory']);assert.deepEqual(secret.critique.map(c=>c.kind),['risk']);
 assert.ok(dropped.includes('Addictive')&&dropped.includes('Unproven')&&dropped.includes('Fear then fix: 99 of 100 reels'));
 assert.ok(Object.keys(MECHANISMS).length>=10);
});

test('the writer is given the mechanisms with their strength, the myths to avoid, and the rule to flag unverified health claims',()=>{
 const p=writePrompt({account:'a',stats:{},reels:[]});
 assert.match(p,/disgust_memory/);assert.match(p,/strong|moderate/);assert.match(p,/dopamine slot machine/);assert.match(p,/check/i);
});

import {scrubPeople} from '../lib/secret.mjs';
test('descriptions lose ethnicity words before the writer sees them; the rest of the sentence stays',()=>{
 assert.equal(scrubPeople('An East Asian man in his 30s wearing glasses, alongside a Black woman with long dark hair.'),'A man in his 30s wearing glasses, alongside a woman with long dark hair.');
 assert.equal(scrubPeople('White counters and a white bowl'),'White counters and a white bowl');
 assert.deepEqual(scrubPeople({person:'a Hispanic couple',n:3}),{person:'a couple',n:3});
 assert.equal(scrubPeople('a user holds an umbrella next to an African actor'),'a user holds an umbrella next to an actor');assert.equal(scrubPeople('Asian recipes'),'Asian recipes');
});

test('every dropped part is kept with its reason',()=>{
 const {dropped,droppedWhy}=checkEvidence({headline:'h',person:{text:'An Asian man',evidence:['a']},setting:{text:'x',evidence:['zz']},differences:[{claim:'Wins: 14 of 15',evidence:['a']}]},new Set(['a']),{house:[],differences:[],numbers:{}});
 assert.deepEqual(dropped.sort(),['Wins: 14 of 15','person','setting']);
 assert.deepEqual(droppedWhy.map(d=>d.reason).sort(),['a number that is not in the counts','ethnicity or race','no proof reels']);
 assert.equal(droppedWhy.find(d=>d.part==='person').text,'An Asian man');
});

test('the pace line is written from our measurements, never from the writer\'s impression',()=>{
 const stats={house:[],differences:[],numbers:{secondsPerShot:{winners:6.5,flops:5,all:5.8,clear:false}}};
 const {secret}=checkEvidence({headline:'h',pace:{text:'Fast jump cuts keep the action constant',evidence:['a']}},new Set(['a']),stats);
 assert.equal(secret.pace.text,'A new shot about every 5.8 s. No clear difference between the best (6.5 s) and the weakest (5 s).');assert.deepEqual(secret.pace.evidence,['a']);
 const clear=checkEvidence({headline:'h',pace:{text:'x',evidence:['zz']}},new Set(['a']),{house:[],differences:[],numbers:{secondsPerShot:{winners:2.5,flops:6,all:4,clear:true}}}).secret;
 assert.equal(clear.pace.text,'A new shot about every 4 s. The best reels cut faster: every 2.5 s, against every 6 s for the weakest.');assert.deepEqual(clear.pace.evidence,[]);
 assert.equal(checkEvidence({headline:'h'},new Set(),{house:[],differences:[],numbers:{secondsPerShot:{winners:null,flops:null,all:null,clear:false}}}).secret.pace,null);
});

test('review round 2: number check has no easy way around it, and ages are not durations',()=>{
 const stats={house:[{question:'x',value:'y',count:26,total:30}],differences:[{question:'o',value:'v',winners:9,flops:3,perSide:15,evidence:['a']}],numbers:{seconds:{winners:40,flops:42,all:41,clear:false},secondsPerShot:{winners:2.5,flops:6,all:4,clear:true},likesPer1k:{winners:30.6,flops:10,all:20,clear:true}}};
 const check=t=>checkEvidence({headline:'h',differences:[{claim:t,evidence:['a']}]},new Set(['a']),stats).secret.differences.length===1;
 for(const bad of ['Cut every 30.6 seconds','fifteen of fifteen best reels','9/15 best, 1/15 weakest','9 OF 16 best','2x more likes','50 percent more','99-second shots','12 likes per 1,000 views'])assert.equal(check(bad),false,bad);
 for(const good of ['9 of 15 best, 3 of 15 weakest','9 OF 15 best','A new shot every 2.5 s','30.6 likes per 1,000 views vs 10','A presenter in his 30s or 40s','A woman in her early 20s'])assert.equal(check(good),true,good);
});

test('review round 2: ethnicity with a modifier in between is caught; other meanings of the words are not',()=>{
 const check=t=>checkEvidence({headline:'h',differences:[{claim:t,evidence:['a']}]},new Set(['a']),{house:[],differences:[],numbers:{}}).secret.differences.length===1;
 for(const bad of ['A Black female presenter','An Asian-looking presenter','a young white male host','their ethnicity'])assert.equal(check(bad),false,bad);
 for(const good of ['Film the race finish','Black coffee on a white wall','A woman in a black top'])assert.equal(check(good),true,good);
 assert.equal(scrubPeople('A Black female presenter and an Asian-looking host'),'A female presenter and a host');
});

test('review round 2: missing measurements never become a comparison',()=>{
 const c=compare([{id:'w',group:'winner',labels:{},secondsPerShot:3,likesPer1k:null},{id:'f',group:'flop',labels:{},secondsPerShot:null,likesPer1k:null}]);
 assert.equal(c.numbers.secondsPerShot.clear,false);assert.equal(c.numbers.likesPer1k.winners,null);
 const {secret}=checkEvidence({headline:'h'},new Set(),{house:[],differences:[],numbers:{secondsPerShot:{winners:3,flops:null,all:3,clear:false}}});
 assert.equal(secret.pace.text,'A new shot about every 3 s.');
});

// The count gap alone filled all three "Do these" cards in about half of simulated channels where best and weakest
// reels did not differ; a difference now also passes a chance test across every value (audit, 2026-09-29).
test('a count gap chance alone could make is not a difference; a strong one is, with its chance test',()=>{
 const items=[...Array.from({length:15},(_,i)=>({id:`w${i}`,group:'winner',labels:{opening:i<6?'question':'bold_claim',format:i<12?'demonstration':'talking_head'}})),
  ...Array.from({length:15},(_,i)=>({id:`f${i}`,group:'flop',labels:{opening:i<2?'question':'bold_claim',format:i<2?'demonstration':'talking_head'}}))];
 const c=compare(items);
 assert.ok(!c.differences.some(d=>d.question==='opening'),'6 of 15 against 2 of 15 happens by chance');
 const d=c.differences.find(x=>x.question==='format'&&x.value==='demonstration');assert.deepEqual([d.winners,d.flops],[12,2]);assert.ok(d.q<=0.1&&d.p<0.001,JSON.stringify(d));
});

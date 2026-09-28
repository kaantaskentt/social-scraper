import test from 'node:test';
import assert from 'node:assert/strict';
import {patternFrom,judgeIdeaRequest,rankIdeas,checkScriptRequest,readScriptCheck,IDEA_SCHEMA,SCRIPT_SCHEMA,ideaPrompt,scriptPrompt,priceShots} from '../lib/reel-plan.mjs';

const secret={account:'ken.remedie',secret:{headline:'Kitchen tests that start mid-action',format:{text:'Hands-on demo'},script:{text:'Do this and watch, then steps, then comment a word'}},
 stats:{house:[{question:'format',value:'demonstration',count:26,total:30}],differences:[{question:'said_structure',value:'steps',winners:12,flops:5,perSide:15},{question:'said_structure',value:'problem_solution',winners:3,flops:9,perSide:15}]}};

test('the pattern handed to Jev and the writer is plain words from the Secret: do more of, do less of, keep',()=>{
 const p=patternFrom(secret);assert.match(p.do_more.join(' '),/Step by step \(12 of 15 best, 5 of 15 weakest\)/);assert.match(p.do_less.join(' '),/Problem, then fix/);assert.match(p.keep.join(' '),/Demonstration/);
});

test('Jev judges each idea: fit to the pattern, how AI-ready it is, the hook, a health claim, and whether the demo is true',()=>{
 const req=judgeIdeaRequest({title:'Egg float test',hook_line:'Drop an egg in water',demo:'An egg sinks or floats',steps:['Fill a glass','Drop the egg']},patternFrom(secret));
 assert.deepEqual(Object.keys(req.questions).sort(),['ai_ready','fit','health_claim','hook','true_demo']);
 assert.equal(req.questions.health_claim.type,'noul');assert.equal(req.questions.fit.type,'score');assert.match(JSON.stringify(req.state),/Egg float test/);
});

test('ranking: health claims and false demos are out; the rest are ordered by fit, AI-readiness and hook, with the reasons kept',()=>{
 const ideas=[{title:'A'},{title:'B'},{title:'C'},{title:'D'}];
 const j=(fit,ai,hook,health,truth)=>({answers:{fit:{score:fit},ai_ready:{score:ai},hook:{score:hook},health_claim:{noul:health},true_demo:{noul:truth}}});
 const ranked=rankIdeas(ideas,[j(3,3,3,0.9,0.9),j(2,2,2,0.1,0.8),j(3,3,2,0.1,0.9),j(3,3,3,0.1,0.2)]);
 assert.deepEqual(ranked.picked.map(r=>r.idea.title),['C','B']);
 assert.deepEqual(ranked.rejected.map(r=>[r.idea.title,r.reason]),[['A','health or medical claim'],['D','the demo may not be true']]);
 assert.ok(ranked.picked[0].scores.fit===3&&ranked.picked[0].total>ranked.picked[1].total);
});

test('Jev checks the script: starts mid-action, one clear action, no health claim as fact, and each shot is safe for AI video',()=>{
 const script={hook_title:'Is your egg fresh?',voiceover:[{line:'Drop an egg into water.',shot:'s1'}],shots:[{id:'s1',seconds:5,visual:'Hands drop an egg into a glass of water',camera:'close-up'},{id:'s2',seconds:4,visual:'A woman smiles at the camera and reads the label',camera:'medium'}]};
 const req=checkScriptRequest(script);assert.ok(req.questions.starts_mid_action&&req.questions.clear_action&&req.questions.health_fact&&req.questions.shot_s1_risky&&req.questions.shot_s2_risky);
 const raw={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},emotion:{choice:'curiosity'},shot_s1_risky:{noul:0.1},shot_s2_risky:{noul:0.9}}};
 const c=readScriptCheck(raw,script);assert.equal(c.pass,false);assert.deepEqual(c.riskyShots,['s2']);assert.deepEqual(c.problems,['Shot s2 is risky for AI video']);
 assert.equal(readScriptCheck({answers:{...raw.answers,shot_s2_risky:{noul:0.2},health_fact:{noul:0.7}}},script).problems[0],'States a health claim as fact');
});

test('prompts and schemas: faceless hands and voice, true and non-medical, 4 to 8 second shots (Seedance 2.0 minimum is 4)',()=>{
 assert.match(ideaPrompt(patternFrom(secret),secret),/hands/i);assert.match(ideaPrompt(patternFrom(secret),secret),/non-medical|no health/i);
 assert.match(scriptPrompt({title:'Egg'},patternFrom(secret)),/4 to 8 seconds/);
 assert.ok(IDEA_SCHEMA.properties.ideas&&SCRIPT_SCHEMA.properties.shots);
});

test('price: every shot, the real voiceover text and the reference image are priced with the free Higgsfield cost check',async()=>{
 const calls=[];const run=async args=>{calls.push(args);if(args[2]==='seed_audio')return '{"credits":2.5}';if(args[2]==='gpt_image_2')return '{"credits":3.5}';const d=+args[args.indexOf('--duration')+1];return `{"credits":${args.includes('fast')?d*2.5:d*4.5}}`;};
 const p=await priceShots([{id:'s1',seconds:6},{id:'s2',seconds:4}],{run,voiceText:'Drop an egg. Comment EGG.'});
 assert.deepEqual(p.shots.map(s=>s.credits),[27,18]);assert.equal(p.voice,2.5);assert.equal(p.kit,3.5);assert.equal(p.total,51);assert.equal(p.withOneRetryEach,96);assert.equal(p.fastTotal,31);
 assert.ok(calls.some(a=>a[2]==='seed_audio'&&a.includes('Drop an egg. Comment EGG.')),'the voice is priced on its real text');
 assert.ok(calls.filter(a=>a[2]==='seedance_2_0').every(a=>a[a.indexOf('--generate_audio')+1]==='false'),'shots are silent');
 assert.ok(calls.every(a=>a[0]==='generate'&&a[1]==='cost'));
});

import {kitPrompt,shotPrompt} from '../lib/reel-make.mjs';
test('nothing is Ken-specific: ideas stay in the channel\'s own topic and the place comes from its Secret',()=>{
 const fashion={account:'nudeproject',secret:{headline:'Show the outfit being put together',format:{text:'Outfit reveals'},setting:{text:'A concrete studio with a clothing rail'}},stats:{house:[],differences:[]}};
 const pattern=patternFrom(fashion);assert.equal(pattern.setting,'A concrete studio with a clothing rail');
 const p=ideaPrompt(pattern,fashion);assert.doesNotMatch(p,/kitchen/i);assert.match(p,/channel's own topic and setting/);
 const kit=kitPrompt({pattern});assert.match(kit,/concrete studio with a clothing rail/);assert.doesNotMatch(kit,/kitchen/i);
 assert.doesNotMatch(shotPrompt({visual:'Hands fold a tee',camera:'top-down'}),/kitchen/i);
});

test('kit ideas with a payoff score: a dramatic reveal outranks a mild one with the same fit',async()=>{
 const {rankIdeas}=await import('../lib/reel-plan.mjs');
 const j=payoff=>({answers:{fit:{score:3},ai_ready:{score:3},hook:{score:3},payoff:{score:payoff},health_claim:{noul:0.1},true_demo:{noul:0.9}}});
 const r=rankIdeas([{title:'mild'},{title:'whoa'}],[j(1),j(3)]);
 assert.deepEqual(r.picked.map(p=>p.idea.title),['whoa','mild']);assert.equal(r.picked[0].total,1);assert.equal(r.picked[1].total,0.8);
 assert.equal(rankIdeas([{title:'old'}],[{answers:{fit:{score:3},ai_ready:{score:3},hook:{score:3},health_claim:{noul:0},true_demo:{noul:1}}}]).picked[0].total,1);
});

test('novelty and a felt problem lift an idea above a well-known tip with the same craft scores',async()=>{
 const {rankIdeas}=await import('../lib/reel-plan.mjs');
 const j=(novel,pain)=>({answers:{fit:{score:3},ai_ready:{score:3},hook:{score:3},payoff:{score:3},novel:{score:novel},pain_point:{score:pain},health_claim:{noul:0.1},true_demo:{noul:0.9}}});
 const {picked}=rankIdeas([{title:'Egg float'},{title:'Frozen herbs in oil'}],[j(0,1),j(3,3)]);
 assert.deepEqual(picked.map(p=>p.idea.title),['Frozen herbs in oil','Egg float']);assert.equal(picked[0].scores.novel,3);
});

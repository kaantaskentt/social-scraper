import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HEALTH_Q,PART_USD,PARTS,MAX_WORDS,kitBrief,kitIdeaPrompt,judgeKitIdeaRequest,kitScriptPrompt,remakePrompt,scriptProblems,checkKitScriptRequest,readKitScriptCheck,kitPrice,referencesFor,partPrompt,spokenText,discloseCaption,partVerdict} from '../lib/kit-reel.mjs';
const craft={rules:[{kind:'hook',rule:'Open on a pour',how:'extreme close-up of pouring',reels:['a','b']}],voice_direction:'brisk and confident, close to the mic',shot_style:'close-ups, cut every 2 s',sound_style:'loud fizz at the reveal',ending_style:'end on the result'};
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {ReelMaker} from '../lib/reel-make.mjs';

const host=(name,outfit)=>({name,role:'tests a trick',look:'x',outfit,manner:'calm',voice:'warm'});
const kit={name:'Kitchen Check',promise:'Tricks that work.',cast:[host('Leo','a navy tee'),host('Mia','a dark green long-sleeve shirt')],hands:'none',art_style:'none',place:'A bright white kitchen',places:[],camera:'Eye-level medium shot on a tripod',light:'Soft daylight',palette:[],sound:{voice:'clear and quick',music:'none',natural:'pouring water'},assets:[{what:'glass mugs',kind:'object',how:'every test'}],dont:['no health claims']};
const kitSaved={format:'ai_host',createdAt:'2026-09-28T00:00:00Z',approved:true,kit,pictures:[{role:'face0',file:'face0-a.jpg'},{role:'turn0',file:'turn0-a.jpg'},{role:'face1',file:'face1-a.jpg'},{role:'place',file:'place-a.jpg'},{role:'scene',file:'scene-a.jpg'}]};
const beat=(from,to,who,does,says='',shot='',sound='')=>({from,to,who,does,says,shot,sound});
const script=(o={})=>({hook_title:'Floppy celery?',caption:'Save your celery. Tried it? #kitchen',parts:[
 {beats:[beat(0,3,'Leo','holds a bendy celery stalk','Floppy celery? Wait.','Extreme close-up on the celery'),beat(3,10,'Mia','drops it into ice water','Ice water, fifteen minutes.','Close-up of the glass','ice clinks')]},
 {beats:[beat(0,5,'Leo','snaps a crisp stalk','Crunchy again.','Extreme close-up','loud crunch'),beat(5,10,'Mia','smiles at the camera','Follow for the next test.','Medium shot of Mia')]}],...o});

test('price: two 10-second parts at the Omni price, the limit allows one retry each',()=>{
 assert.equal(PART_USD,1.04);assert.deepEqual(kitPrice(),{usd:2.17,maxUsd:4.34,parts:2,partSeconds:10,model:'gemini-omni-1.1-flash'});
});

test('ideas and judging use the kit: hosts, place, signature things, AI-video safety',()=>{
 const p=kitIdeaPrompt(kit,'ai_host',{headline:'h'});assert.match(p,/Leo and Mia\) are on camera/);assert.match(p,/"place":"A bright white kitchen"/);assert.match(p,/no brand names/);assert.match(p,/20 to 30 seconds/);assert.match(p,/payoff every 6 to 9 seconds/);assert.match(p,/pattern_used/);assert.match(p,/why_true/);assert.match(p,/honey in water/);assert.match(p,/Write 12 different/);
 assert.match(kitIdeaPrompt(kit,'ai_host',{},craft),/craft of the winners: .*Open on a pour/);
 assert.match(kitIdeaPrompt({...kit,cast:[]},'hands_pov',{}),/Only hands are on camera/);
 const req=judgeKitIdeaRequest({title:'t'},{},kit,'ai_host');assert.deepEqual(Object.keys(req.questions),['fit','ai_ready','hook','payoff','health_claim','true_demo']);assert.match(kitIdeaPrompt(kit,'ai_host',{}),/DRAMATIC to see and hear/);assert.equal(req.state.channel.hosts[0].name,'Leo');
 assert.equal(kitBrief(kit,'ai_host').hands,undefined);
});

test('code checks the script: 2 or 3 parts, timing, speakers, word counts, no comment-keyword ending',()=>{
 assert.deepEqual(scriptProblems(script(),kit,'ai_host'),[]);
 assert.match(scriptProblems(script({parts:[script().parts[0]]}),kit,'ai_host').join(),/needs 2 or 3 parts, got 1/);
 const gap=script();gap.parts[0].beats[1].from=4;assert.match(scriptProblems(gap,kit,'ai_host').join(),/does not follow on/);
 const short=script();short.parts[1].beats[1].to=9;assert.match(scriptProblems(short,kit,'ai_host').join(),/from 0 to 10/);
 const stranger=script();stranger.parts[0].beats[0].who='Bob';assert.match(scriptProblems(stranger,kit,'ai_host').join(),/"Bob" is not one of/);
 const chatty=script();chatty.parts[0].beats[1].says=Array(MAX_WORDS+1).fill('word').join(' ');assert.match(scriptProblems(chatty,kit,'ai_host').join(),/at most 28/);
 const ask=script();ask.parts[1].beats[1].says='Comment CRISP for the full guide.';assert.match(scriptProblems(ask,kit,'ai_host').join(),/comment keyword or promises a guide/);
 const wide=script();for(const p of wide.parts)for(const b of p.beats)b.shot='Medium shot of both hosts';assert.match(scriptProblems(wide,kit,'ai_host').join(),/only 0 of 4 shots are close-ups/);
 const hands=script();for(const p of hands.parts)for(const b of p.beats)b.who='hands';assert.deepEqual(scriptProblems(hands,{...kit,cast:[]},'hands_pov'),[]);
});

test('Jev checks truth, health, feeling and risk per part; code turns answers into problems',()=>{
 const req=checkKitScriptRequest(script(),craft);assert.ok(req.questions.true_claim&&req.questions.gripping&&req.questions.part_1_risky&&req.questions.part_2_risky);assert.equal(req.state.craft.voice,'brisk and confident, close to the mic');
 const good={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.9},emotion:{choice:'satisfaction'},gripping:{score:2.4},part_1_risky:{noul:0.1},part_2_risky:{noul:0.2}}};
 assert.equal(readKitScriptCheck(good,script(),kit,'ai_host').pass,true);
 const bad=readKitScriptCheck({answers:{...good.answers,true_claim:{noul:0.2},part_2_risky:{noul:0.8}}},script(),kit,'ai_host');
 assert.deepEqual(bad.problems,['Something the reel shows or implies may not be true: check what each shot shows (for example which muscle works or what the result proves)','Part 2 is risky for AI video']);assert.deepEqual(bad.riskyParts,[2]);
 assert.deepEqual(readKitScriptCheck({answers:{...good.answers,first_second:{score:1.1}}},script(),kit,'ai_host').problems,['The first second is not striking enough (1.1 of 3)']);assert.ok(req.questions.first_second);
 const dull=readKitScriptCheck({answers:{...good.answers,gripping:{score:1.2}}},script(),kit,'ai_host');assert.deepEqual(dull.problems,['Not gripping enough (1.2 of 3)']);assert.equal(dull.gripping,1.2);
});

test('part prompts: references named in order, beats timed, sounds from the kit, no text, logos or gear; part 2 continues',()=>{
 assert.deepEqual(referencesFor(kitSaved).map(r=>r.role),['face0','face1','place']);
 const p1=partPrompt(script(),0,kitSaved,craft);
 assert.match(p1,/^\[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2 <IMAGE_REF_2>@Image3\]/);
 assert.match(p1,/Leo <IMAGE_REF_0> \(a navy tee\) and Mia <IMAGE_REF_1> \(a dark green long-sleeve shirt\) in this place <IMAGE_REF_2>/);
 assert.match(p1,/\[0-3s\] Extreme close-up on the celery: holds a bendy celery stalk Leo says: "Floppy celery\? Wait\."/);assert.match(p1,/\(sound: ice clinks\)/);
 assert.match(p1,/Cut to a new shot at each timed beat/);assert.doesNotMatch(p1,/single continuous shot/);
 assert.match(p1,/voice direction: brisk and confident.*loud, crisp, close-mic real sounds: loud fizz at the reveal; no music/);
 assert.match(partPrompt(script(),0,kitSaved),/clear real sounds: pouring water; no music/);assert.match(p1,/No text, captions, logos, brand stickers/);assert.match(p1,/No camera, tripod/);
 const p2=partPrompt(script(),1,kitSaved);assert.match(p2,/^The video continues/);assert.doesNotMatch(p2,/IMAGE_REF/);assert.match(p2,/Follow for the next test/);
 const hands=partPrompt(script(),0,{...kitSaved,kit:{...kit,cast:[]},pictures:[{role:'hands',file:'h.jpg'},{role:'place',file:'p.jpg'}]});
 assert.match(hands,/Only the hands <IMAGE_REF_0> are on camera, never a face, in this place <IMAGE_REF_1>/);
});

test('spoken text for captions, AI disclosure in the caption, part verdicts',()=>{
 assert.equal(spokenText(script()),'Floppy celery? Wait. Ice water, fifteen minutes. Crunchy again. Follow for the next test.');
 assert.match(kitScriptPrompt({title:'t'},kit,'ai_host',{},craft),/Never ask viewers to comment a keyword.*The winners' craft, follow it/s);
 const rp=remakePrompt({first_second:'pour'},kit,'ai_host',craft);assert.match(rp,/Remake this proven reel/);assert.match(rp,/never copy sentences/);assert.match(rp,/myth.*replace it with a TRUE test/);
 assert.equal(discloseCaption('Save it. #x','ai_host'),'Save it. #x\n\nOur hosts are AI.');assert.equal(discloseCaption('Our AI hosts. #x','ai_host'),'Our AI hosts. #x');assert.equal(discloseCaption('Hands. #x','hands_pov'),'Hands. #x');
 const ok={match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false};
 assert.deepEqual(partVerdict(ok),{pass:true,problems:[]});
 assert.deepEqual(partVerdict({...ok,match:1,same_people:'no',text_or_logos:true,gear_visible:true}).problems,['only partly follows the script','the hosts look different from the kit','text or a logo is visible','filming gear is visible']);
});

// The kit path end to end with fakes: plan → script → make (2 parts, checks, edit), money and records.
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'kitreel-'));const run='r1',ch=join(root,'channels',run);
 await mkdir(join(root,'secret',run),{recursive:true});await writeFile(join(root,'secret',run,'secret.json'),JSON.stringify({account:'ken',secret:{headline:'h'},stats:{differences:[],house:[]}}));
 await mkdir(join(ch,'kit'),{recursive:true});await writeFile(join(ch,'kit','kit.json'),JSON.stringify(kitSaved));for(const p of kitSaved.pictures)await writeFile(join(ch,'kit',p.file),'JPG '+p.role);
 return {root,job:{id:run,creator:'ken'},ch};
}
const good={answers:{fit:{score:3},ai_ready:{score:3},hook:{score:2},health_claim:{noul:0.1},true_demo:{noul:0.9},starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.9},emotion:{choice:'satisfaction'},part_1_risky:{noul:0.1},part_2_risky:{noul:0.1}}};
const until=async(get)=>{const end=Date.now()+10000;while(Date.now()<end){const s=await get();if(s.state!=='working')return s;await new Promise(r=>setTimeout(r,5));}throw new Error('stuck');};
function fakeGoogle(){
 const calls={post:[]};const done=new Map();
 const fetchImpl=async(url,o={})=>{
  if(o.method==='POST'){const body=JSON.parse(o.body);calls.post.push(body);const id=`job${calls.post.length}`;done.set(id,body);return Response.json({id});}
  if(url.includes(':download'))return new Response('MP4 '+url.split('/files/')[1]);
  const id=decodeURIComponent(url.split('/').pop());return Response.json({status:'completed',usage:{total_input_tokens:1000,total_output_tokens:57920,output_tokens_by_modality:[{modality:'video',tokens:57920}]},steps:[{type:'model_output',content:[{type:'video',uri:`https://generativelanguage.googleapis.com/v1beta/files/${id}:download`}]}]});};
 return {calls,fetchImpl};
}

test('kit path: ideas and script use the kit; the maker films two parts, checks each, edits and discloses AI',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const gemini=async({schema,parts})=>schema.required.includes('ideas')?{json:{ideas:[{title:'Revive celery',hook_line:'Floppy?',demo:'d',steps:[],keyword:'CRISP'}]},costUsd:0.01}:{json:script(),costUsd:0.02};
 const planner=new ReelPlanner(root,keys,{gemini,jev:async()=>good,price:async()=>{throw new Error('Higgsfield must not be priced');}});
 await planner.startIdeas(job);let s=await until(()=>planner.status(job));assert.equal(s.plan.mode,'kit');assert.equal(s.plan.kitAt,kitSaved.createdAt);
 await planner.startScript(job,0);s=await until(()=>planner.status(job));assert.equal(s.state,'ready',s.error);assert.equal(s.plan.check.pass,true);assert.equal(s.plan.price.usd,2.17);
 const g=fakeGoogle(),checks=[];let rendered;
 // The judge answers the scoring rubric: the winners 7 everywhere, our reel 6 with a weak hook (4).
 const scoreOf=n=>({first_second:'x',stops_scroll:n,visuals:n,sound:n,voice:n,payoff:n,pace:n,looks_real:n,keep_watching:n,best_moment:'b',weakest_moment:'w',fix:'Open on the fizz.'});
 const scored=[];const watch=async({parts,schema})=>{if(schema.required.includes('keep_watching')){const f=String(parts[0].video);scored.push(f);return {json:f==='v'?scoreOf(7):{...scoreOf(6),stops_scroll:4},costUsd:0.001};}
  checks.push(parts.length);return {json:{shows:'ok',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'},costUsd:0.003};};
 let seconds=20;const spoken=[];const voices={design:async({name})=>({id:`voice_${name}`,sample:null,costUsd:0.02}),speak:async({voice,text})=>{spoken.push(text);return {wav:Buffer.from('w'),costUsd:0.001};},mix:async a=>{await writeFile(a.out,'MIX');return a.out;},trim:async(i,o)=>{await writeFile(o,'t');return o;}};
 const maker=new ReelMaker(root,keys,{gemini:watch,jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/line-/.test(f)?1:seconds,voices,cut:async(i,o)=>{await writeFile(o,'cut');return o;},render:async a=>{rendered=a;await writeFile(a.out,'REEL');return {seconds:22.5};}});
 // Two winners with saved videos, to score against.
 await writeFile(join(root,'secret','r1','secret.json'),JSON.stringify({account:'ken',secret:{headline:'h'},stats:{differences:[],house:[]},picked:[{id:'w1',group:'winner',xNormal:9},{id:'w2',group:'winner',xNormal:8}]}));
 await mkdir(join(root,'videos','r1'),{recursive:true});for(const id of ['w1','w2'])await writeFile(join(root,'videos','r1',`${id}.mp4`),'v');
 await assert.rejects(maker.start(job,{confirmCredits:1.5}),/price changed to \$2\.17/);
 const started=await maker.start(job,{confirmCredits:2.17});assert.equal(started.ceiling,4.34);
 await assert.rejects(maker.start(job,{confirmCredits:2.17}),/already being made/);
 const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(g.calls.post.length,2);assert.equal(g.calls.post[0].background,true);assert.equal(g.calls.post[0].input.filter(x=>x.type==='image').length,3);
 assert.equal(g.calls.post[0].response_format.aspect_ratio,'9:16');assert.equal(g.calls.post[1].previous_interaction_id,'job1');assert.equal(g.calls.post[1].input.length,1);
 assert.deepEqual(checks,[4,4]); // the clip, two face pictures, the brief
 const final=join(ch,'reels',m.reels[0].id,'part-2-a1.mp4');assert.equal(rendered.clips[0],final);assert.equal(rendered.voice,join(ch,'reels',m.reels[0].id,'voices.wav'));
 assert.equal(m.reels[0].voiceMode,'designed');assert.equal(spoken.length,4);assert.match(g.calls.post[0].input.at(-1).text,/No dialogue/);
 assert.equal(rendered.sayText,spokenText(script()));assert.equal(rendered.endCard.title,'Kitchen Check');assert.equal(rendered.endCard.subtitle,'Follow for the next one');
 const reel=m.reels[0];assert.equal(reel.mode,'kit');assert.equal(reel.idea,0);assert.match(reel.caption,/Our hosts are AI\.$/);assert.match(reel.url,/^\/channels\/r1\/0-revive-celery-[0-9a-f]{6}\/reel\.mp4$/);
 // Scored against the winners: 2 winners × 3 + our reel × 3; winners cached for the next reel.
 assert.equal(scored.length,9);assert.equal(reel.score.share,83); // 5.8 of 10 (shown rounded) against the winners 7assert.equal(reel.score.weakest,'stops_scroll');assert.equal(reel.score.fix,'Open on the fizz.');
 const partCost=(1000*1.5+57920*17.5)/1e6;assert.ok(Math.abs(reel.spentUsd-2*partCost)<1e-3);
 const ledger=JSON.parse(await readFile(join(ch,'spend.json'),'utf8')).map(x=>x.step);assert.deepEqual(ledger.filter(x=>/part/.test(x)),['reel part-1','check part-1','reel part-2','check part-2']);
 // Asked again after it is done: nothing new is filmed or paid.
 await maker.start(job,{confirmCredits:2.17});await until(()=>maker.status(job));assert.equal(g.calls.post.length,2);
 await rm(root,{recursive:true});
});

test('kit path: a part that fails its check is filmed once more; failing twice stops; a short video fails loudly; a changed look blocks',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T01:00:00Z',chosen:0,picked:[{idea:{title:'Revive celery'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 let n=0;const g=fakeGoogle();const bad={shows:'x',match:3,same_people:'no',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'},fine={...bad,same_people:'yes'};
 const maker=new ReelMaker(root,keys,{gemini:async()=>({json:++n===1?bad:fine,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:22};}});
 await maker.start(job,{confirmCredits:2.17});let m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(g.calls.post.length,3);assert.equal(g.calls.post[2].previous_interaction_id,'job2'); // part 2 extends the RETRIED part 1
 const always=new ReelMaker(root,keys,{gemini:async()=>({json:bad,costUsd:0}),jev:async()=>good,videoFetch:fakeGoogle().fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async()=>({})});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T02:00:00Z',chosen:0,picked:[{idea:{title:'Other'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 await always.start(job,{confirmCredits:2.17});m=await until(()=>always.status(job));assert.equal(m.state,'failed');assert.match(m.error,/Part 1 failed its check twice \(the hosts look different from the kit\)/);
 const short=new ReelMaker(root,keys,{gemini:async()=>({json:fine,costUsd:0}),jev:async()=>good,videoFetch:fakeGoogle().fetchImpl,pollMs:0,seconds:async()=>10,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async()=>({})});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T03:00:00Z',chosen:0,picked:[{idea:{title:'Third'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 await short.start(job,{confirmCredits:2.17});m=await until(()=>short.status(job));assert.match(m.error,/finished video is 10\.0 s, expected about 20 s/);
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:'older',createdAt:'x',chosen:0,picked:[{idea:{title:'T'}}],script:script(),check:{pass:true}}));
 await assert.rejects(short.start(job,{confirmCredits:2.17}),/Your look changed/);
 await rm(root,{recursive:true});
});

test('remake: studies the winner shot by shot, learns the craft once (cached), writes a checked remake plan',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 await writeFile(join(root,'secret','r1','secret.json'),JSON.stringify({account:'ken',secret:{headline:'h'},stats:{differences:[],house:[]},picked:[{id:'w1',group:'winner',xNormal:9},{id:'w2',group:'winner',xNormal:8},{id:'f1',group:'flop',xNormal:0.1}]}));
 await mkdir(join(root,'videos','r1'),{recursive:true});for(const id of ['w1','w2','f1'])await writeFile(join(root,'videos','r1',`${id}.mp4`),'v');
 job.posts=[{id:'w1',transcript:{text:'Pour it and watch.'}},{id:'w2'},{id:'f1'}];
 const calls={breakdown:0,craft:0,script:[]};
 const gemini=async({schema,parts})=>{
  if(schema.required.includes('first_second')){calls.breakdown++;assert.match(parts.at(-1).text,/Pour it and watch|transcript|producer/);return {json:{first_second:'extreme close-up of a pour',beats:[]},costUsd:0.01};}
  if(schema.required.includes('voice_direction')){calls.craft++;return {json:{...craft,rules:[{kind:'hook',rule:'r',how:'h',reels:['w1','w2','zz']},{kind:'pace',rule:'lonely',how:'h',reels:['w1']}]},costUsd:0.03};}
  calls.script.push(parts[0].text);return {json:script(),costUsd:0.02};};
 const planner=new ReelPlanner(root,keys,{gemini,jev:async()=>good});
 await assert.rejects(planner.startRemake(job,'nope'),/Pick one of this account/);
 await planner.startRemake(job,'w1');let s=await until(()=>planner.status(job));assert.equal(s.state,'ready',s.error);
 assert.equal(s.plan.source,'remake');assert.equal(s.plan.remakeOf,'w1');assert.equal(s.plan.chosen,0);assert.equal(s.plan.check.pass,true);assert.equal(s.plan.price.usd,2.17);
 assert.match(calls.script[0],/Remake this proven reel.*extreme close-up of a pour/s);assert.equal(calls.breakdown,2);assert.equal(calls.craft,1); // w1 and w2 studied once each
 const saved=JSON.parse(await readFile(join(ch,'craft.json'),'utf8'));assert.deepEqual(saved.rules.map(r=>r.reels),[['w1','w2']]);assert.deepEqual(saved.dropped,['lonely']);
 await planner.startRemake(job,'w2');await until(()=>planner.status(job));assert.equal(calls.breakdown,2);assert.equal(calls.craft,1); // all cached
 await rm(root,{recursive:true});
});

test('hands never talk, objects are named, and health framing never reaches the video prompt',()=>{
 const hk={...kitSaved,format:'hands_pov',kit:{...kit,cast:[]},pictures:[{role:'hands',file:'h.jpg'},{role:'place',file:'p.jpg'}]};
 const s=script();for(const p of s.parts)for(const b of p.beats)b.who='hands';
 const p=partPrompt(s,0,hk,{...craft,voice_direction:'Speak fast, as if you are revealing a forbidden health secret they must know.'});
 assert.doesNotMatch(p,/hands says/);assert.match(p,/A voice says: "Floppy celery\? Wait\."/);assert.doesNotMatch(p,/health|forbidden|secret/i);assert.match(p,/voice direction: Speak fast/);
 assert.match(kitScriptPrompt({title:'t'},kit,'ai_host',{}),/never "white powder"/);
});

test('designed voices: nobody speaks on camera; each host gets one voice (made once, kept in the kit); lines laid over the real sounds',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 assert.match(partPrompt(script(),0,kitSaved,null,{silent:true}),/No dialogue: nobody speaks/);assert.doesNotMatch(partPrompt(script(),0,kitSaved,null,{silent:true}),/says:/);
 const plan={mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T05:00:00Z',chosen:0,picked:[{idea:{title:'Voice test'}}],script:script(),check:{pass:true},price:{usd:2.17},voiceMode:'designed'};
 await writeFile(join(ch,'plan.json'),JSON.stringify(plan));
 const g=fakeGoogle(),designed=[],spoken=[];let mixed,rendered;
 const voices={design:async({name,description})=>{designed.push(name);return {id:`voice_${designed.length}`,sample:Buffer.from('WAV'),costUsd:0.02};},
  speak:async({voice,text})=>{spoken.push([voice,text]);return {wav:Buffer.from('w'),costUsd:0.001};},mix:async a=>{mixed=a;await writeFile(a.out,'MIX');return a.out;},trim:async(i,o)=>{await writeFile(o,'t');return o;}};
 const ok={shows:'ok',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};
 const maker=new ReelMaker(root,keys,{gemini:async()=>({json:ok,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/line-/.test(f)?1.5:20,cut:async(i,o)=>{await writeFile(o,'c');return o;},voices,render:async a=>{rendered=a;await writeFile(a.out,'R');return {seconds:22};}});
 await maker.start(job,{confirmCredits:2.17});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.match(g.calls.post[0].input.at(-1).text,/No dialogue/);assert.deepEqual(designed,['Kitchen Check Leo','Kitchen Check Mia']);
 assert.deepEqual(spoken.map(s=>s[0]),['voice_1','voice_2','voice_1','voice_2']);
 assert.deepEqual(mixed.lines.map(l=>l.start),[0,3,10,15]);assert.equal(rendered.voice,mixed.out);assert.equal(rendered.clips[0],mixed.video);
 const k=JSON.parse(await readFile(join(ch,'kit','kit.json'),'utf8'));assert.equal(k.voices.Leo.id,'voice_1');assert.match(k.voices.Leo.description,/speaking naturally and close to the mic\.$/);
 // A second reel reuses the saved voices.
 await writeFile(join(ch,'plan.json'),JSON.stringify({...plan,createdAt:'2026-09-28T06:00:00Z'}));await maker.start(job,{confirmCredits:2.17});await until(()=>maker.status(job));assert.equal(designed.length,2);
 await rm(root,{recursive:true});
});

test('health claims: remedies and cures are out, exercise form and muscles are fitness instruction, not medicine',()=>{
 const q=HEALTH_Q('idea');assert.match(q,/curing, treating or preventing an illness, pain/);assert.match(q,/detox/);assert.match(q,/weight-loss/);assert.match(q,/good form, and which muscles it works is NOT a health claim/);
 assert.equal(judgeKitIdeaRequest({},{},kit,'ai_host').questions.health_claim.instructions,q);assert.equal(checkKitScriptRequest(script()).questions.health_fact.instructions,HEALTH_Q('script'));
});

test('medical-looking props from the look never reach the writers',()=>{
 const k={...kit,assets:[{what:'A transparent plastic model',kind:'object',how:'shows build-up'},{what:'glass mugs',kind:'object',how:'every test'}]};
 assert.deepEqual(kitBrief(k,'ai_host').signature,['glass mugs (object): every test']);
});

test('Jev checks every spoken line, so a rewrite knows which sentence is doubtful',()=>{
 const req=checkKitScriptRequest(script());assert.ok(req.questions.line_1_1_true);assert.match(req.questions.line_1_1_true.instructions,/"Floppy celery\? Wait\."/);
 const good={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.3},emotion:{choice:'satisfaction'},gripping:{score:2.4},part_1_risky:{noul:0.1},part_2_risky:{noul:0.1},line_1_2_true:{noul:0.2}}};
 assert.deepEqual(readKitScriptCheck(good,script(),kit,'ai_host').problems,['Not sure this is true: "Ice water, fifteen minutes."']);
 assert.match(readKitScriptCheck({answers:{...good.answers,line_1_2_true:{noul:0.9}}},script(),kit,'ai_host').problems.join(),/shows or implies may not be true: check what each shot shows/);
 assert.deepEqual(readKitScriptCheck({answers:{...good.answers,true_claim:{noul:0.9},line_1_2_true:{noul:0.9},emotion:{choice:'aspiration'}}},script(),kit,'ai_host').problems,[]);
 const link=script();link.parts[1].beats[1].says='Check the link for more recipes.';assert.match(scriptProblems(link,kit,'ai_host').join(),/link, bio, DM or freebie/);
});

test('medical props in the craft study never reach the writers either',async()=>{
 const {craftBrief}=await import('../lib/craft.mjs');
 const b=craftBrief({...craft,rules:[{rule:'Show it on a clear pipe model',how:'drop it in the model'},{rule:'Open on a pour',how:'close-up'}]});
 assert.deepEqual(b.moves,['Open on a pour (close-up)']);
});

test('each spoken line fits its own beat',()=>{
 const long=script();long.parts[0].beats[0].says="Don't buy expensive chemical polishes for your tarnished spoons.";
 assert.doesNotMatch(scriptProblems(long,kit,'ai_host').join(),/part 1 beat 1 says/); // 9 words in 3 s fits
 long.parts[0].beats[0]={...long.parts[0].beats[0],to:2};long.parts[0].beats[1].from=2;
 assert.match(scriptProblems(long,kit,'ai_host').join(),/part 1 beat 1 says 9 words in 2 s, at most 6/);
});

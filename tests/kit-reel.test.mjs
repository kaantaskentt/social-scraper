import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PART_USD,PARTS,MAX_WORDS,kitBrief,kitIdeaPrompt,judgeKitIdeaRequest,kitScriptPrompt,remakePrompt,scriptProblems,checkKitScriptRequest,readKitScriptCheck,kitPrice,referencesFor,partPrompt,spokenText,discloseCaption,partVerdict} from '../lib/kit-reel.mjs';
const craft={rules:[{kind:'hook',rule:'Open on a pour',how:'extreme close-up of pouring',reels:['a','b']}],voice_direction:'brisk and confident, close to the mic',shot_style:'close-ups, cut every 2 s',sound_style:'loud fizz at the reveal',ending_style:'end on the result'};
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {ReelMaker,checkPart} from '../lib/reel-make.mjs';
import {createHash} from 'node:crypto';

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
 const p=kitIdeaPrompt(kit,'ai_host',{headline:'h'});assert.match(p,/Leo and Mia\) are on camera/);assert.match(p,/"place":"A bright white kitchen"/);assert.match(p,/no brand names/);assert.match(p,/20 to 30 seconds/);assert.match(p,/payoff every 6 to 9 seconds/);assert.match(p,/pattern_used/);assert.doesNotMatch(p,/honey in water|non-medical|TRUE and really happens|no health claims/i); // claims stay in, also from old looks (Kaan, 2026-09-29)
assert.match(p,/Write 12 different/);
 assert.match(kitIdeaPrompt(kit,'ai_host',{},craft),/craft of the winners: .*Open on a pour/);
 assert.match(kitIdeaPrompt({...kit,cast:[]},'hands_pov',{}),/Only hands are on camera/);
 const req=judgeKitIdeaRequest({title:'t'},{},kit,'ai_host');assert.deepEqual(Object.keys(req.questions),['fit','ai_ready','hook','payoff','novel','pain_point']);assert.match(kitIdeaPrompt(kit,'ai_host',{}),/do NOT already know/);assert.match(kitIdeaPrompt(kit,'ai_host',{}),/DRAMATIC to see and hear/);assert.equal(req.state.channel.hosts[0].name,'Leo');
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

test('Jev checks feeling and risk per part, never whether a claim is true; code turns answers into problems',()=>{
 const req=checkKitScriptRequest(script(),craft);assert.equal(req.questions.true_claim??req.questions.health_fact??req.questions.method_correct??req.questions.line_1_1_true,undefined);assert.ok(req.questions.gripping&&req.questions.part_1_risky&&req.questions.part_2_risky);assert.equal(req.state.craft.voice,'brisk and confident, close to the mic');
 const good={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.9},emotion:{choice:'satisfaction'},gripping:{score:2.4},part_1_risky:{noul:0.1},part_2_risky:{noul:0.2}}};
 assert.equal(readKitScriptCheck(good,script(),kit,'ai_host').pass,true);
 const bad=readKitScriptCheck({answers:{...good.answers,true_claim:{noul:0.2},part_2_risky:{noul:0.8}}},script(),kit,'ai_host');
 assert.deepEqual(bad.problems,['Part 2 is risky for AI video']); // a "not true" answer from an old check blocks nothing
assert.deepEqual(bad.riskyParts,[2]);
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
 const rp=remakePrompt({first_second:'pour'},kit,'ai_host',craft);assert.match(rp,/Remake this proven reel/);assert.match(rp,/never copy sentences/);assert.doesNotMatch(rp,/myth|TRUE test/);
 assert.equal(discloseCaption('Save it. #x','ai_host'),'Save it. #x\n\nOur hosts are AI.');assert.equal(discloseCaption('Our AI hosts. #x','ai_host'),'Our AI hosts. #x');assert.equal(discloseCaption('Hands. #x','hands_pov'),'Hands. #x\n\nMade with AI.');assert.equal(discloseCaption('Old reel. #x',undefined),'Old reel. #x\n\nMade with AI.');
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
// The real cover renderer is checked on a real reel; here it only writes a file.
const fakeCover=async a=>{await writeFile(a.out,'COVER');return a.out;};
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
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:watch,jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/line-/.test(f)?1:seconds,voices,cut:async(i,o)=>{await writeFile(o,'cut');return o;},render:async a=>{rendered=a;await writeFile(a.out,'REEL');return {seconds:22.5};}});
 // Two winners with saved videos, to score against.
 await writeFile(join(root,'secret','r1','secret.json'),JSON.stringify({account:'ken',secret:{headline:'h'},stats:{differences:[],house:[]},picked:[{id:'w1',group:'winner',xNormal:9},{id:'w2',group:'winner',xNormal:8}]}));
 await mkdir(join(root,'videos','r1'),{recursive:true});for(const id of ['w1','w2'])await writeFile(join(root,'videos','r1',`${id}.mp4`),'v');
 await assert.rejects(maker.start(job,{confirmCredits:1.5}),/price changed to \$2\.17/);
 const started=await maker.start(job,{confirmCredits:2.17});assert.equal(started.ceiling,4.34);
 await assert.rejects(maker.start(job,{confirmCredits:2.17}),/already being made/);
 const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(g.calls.post.length,2);assert.equal(g.calls.post[0].background,true);assert.equal(g.calls.post[0].input.filter(x=>x.type==='image').length,3);
 assert.equal(g.calls.post[0].response_format.aspect_ratio,'9:16');assert.equal(g.calls.post[1].previous_interaction_id,'job1');assert.equal(g.calls.post[1].input.length,1);
 assert.deepEqual(checks,[4,4,4,4]); // each part watched twice: the clip, two face pictures, the brief
 // No readings here, so the hosts talk on camera: Omni's own lip-synced voices are the sound, nothing is dubbed.
 const final=join(ch,'reels',m.reels[0].id,'part-2-a1.mp4');assert.equal(rendered.clips[0],final);assert.equal(rendered.voice,final);
 assert.equal(m.reels[0].voiceMode,'native');assert.equal(spoken.length,0);assert.doesNotMatch(g.calls.post[0].input.at(-1).text,/No dialogue/);
 assert.match(g.calls.post[0].input.at(-1).text,/Voices: Leo speaks with a warm voice; Mia speaks with a warm voice\. Each line is spoken on camera/);
 assert.equal(s.plan.voice.mode,'talking');assert.match(s.plan.voice.why,/No readings yet/);
 assert.equal(rendered.sayText,spokenText(script()));assert.equal(rendered.endCard.title,'Kitchen Check');assert.equal(rendered.endCard.subtitle,'Follow for the next one');
 const reel=m.reels[0];assert.equal(reel.mode,'kit');assert.equal(reel.idea,0);assert.match(reel.caption,/Our hosts are AI\.$/);assert.match(reel.url,/^\/channels\/r1\/0-revive-celery-[0-9a-f]{6}\/reel\.mp4$/);
 // Scored against the winners: 2 winners × 3 + our reel × 3; winners cached for the next reel.
 // Only our reel is judged (3 times, averaged); the winners are no longer scored, and there is no share of them.
 assert.equal(scored.length,3);assert.equal(reel.score.share,undefined);assert.equal(reel.score.weakest,'stops_scroll');assert.equal(reel.score.fix,'Open on the fizz.');
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
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:++n===1?bad:fine,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:22};}});
 await maker.start(job,{confirmCredits:2.17});let m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(g.calls.post.length,3);assert.equal(g.calls.post[2].previous_interaction_id,'job2'); // part 2 extends the RETRIED part 1
 const always=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:bad,costUsd:0}),jev:async()=>good,videoFetch:fakeGoogle().fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async()=>({})});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T02:00:00Z',chosen:0,picked:[{idea:{title:'Other'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 await always.start(job,{confirmCredits:2.17});m=await until(()=>always.status(job));assert.equal(m.state,'failed');assert.match(m.error,/Part 1 failed its check twice \(the hosts look different from the kit\)/);
 const short=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:fine,costUsd:0}),jev:async()=>good,videoFetch:fakeGoogle().fetchImpl,pollMs:0,seconds:async()=>10,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async()=>({})});
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
 let drift=false;const planner=new ReelPlanner(root,keys,{gemini,jev:async req=>req.questions.same_subject?{answers:{same_subject:{noul:drift?0.1:0.9}}}:good});
 await assert.rejects(planner.startRemake(job,'nope'),/Pick one of this account/);
 await planner.startRemake(job,'w1');let s=await until(()=>planner.status(job));assert.equal(s.state,'ready',s.error);
 assert.equal(s.plan.source,'remake');assert.equal(s.plan.remakeOf,'w1');assert.equal(s.plan.chosen,0);assert.equal(s.plan.check.pass,true);assert.equal(s.plan.price.usd,2.17);
 assert.match(calls.script[0],/Remake this proven reel.*extreme close-up of a pour/s);assert.equal(calls.breakdown,2);assert.equal(calls.craft,1); // w1 and w2 studied once each
 const saved=JSON.parse(await readFile(join(ch,'craft.json'),'utf8'));assert.deepEqual(saved.rules.map(r=>r.reels),[['w1','w2']]);assert.deepEqual(saved.dropped,['lonely']);
 await planner.startRemake(job,'w2');await until(()=>planner.status(job));assert.equal(calls.breakdown,2);assert.equal(calls.craft,1); // all cached
 drift=true;await planner.startRemake(job,'w2');s=await until(()=>planner.status(job));assert.equal(s.plan.check.pass,false);assert.match(s.plan.check.problems.at(-1),/drifted to a different subject \(Jev 0\.10\)/); // an egg test is not a sweet potato remake
 await rm(root,{recursive:true});
});

test('hands never talk, objects are named, and the channel\'s own framing reaches the video prompt as it is',()=>{
 const hk={...kitSaved,format:'hands_pov',kit:{...kit,cast:[]},pictures:[{role:'hands',file:'h.jpg'},{role:'place',file:'p.jpg'}]};
 const s=script();for(const p of s.parts)for(const b of p.beats)b.who='hands';
 const p=partPrompt(s,0,hk,{...craft,voice_direction:'Speak fast, as if you are revealing a forbidden health secret they must know.'});
 assert.doesNotMatch(p,/hands says/);assert.match(p,/A voice says: "Floppy celery\? Wait\."/);assert.match(p,/voice direction: Speak fast, as if you are revealing a forbidden health secret/);
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
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:ok,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/line-/.test(f)?1.5:20,cut:async(i,o)=>{await writeFile(o,'c');return o;},voices,render:async a=>{rendered=a;await writeFile(a.out,'R');return {seconds:22};}});
 await maker.start(job,{confirmCredits:2.17});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.match(g.calls.post[0].input.at(-1).text,/No dialogue/);assert.deepEqual(designed,['Kitchen Check Leo','Kitchen Check Mia']);
 assert.deepEqual(spoken.map(s=>s[0]),['voice_1','voice_2','voice_1','voice_2']);
 assert.deepEqual(mixed.lines.map(l=>l.start),[0,3,10,15]);assert.equal(rendered.voice,mixed.out);assert.equal(rendered.clips[0],mixed.video);
 const k=JSON.parse(await readFile(join(ch,'kit','kit.json'),'utf8'));assert.equal(k.voices.Leo.id,'voice_1');assert.match(k.voices.Leo.description,/speaking naturally and close to the mic\.$/);
 // A second reel reuses the saved voices.
 await writeFile(join(ch,'plan.json'),JSON.stringify({...plan,createdAt:'2026-09-28T06:00:00Z'}));await maker.start(job,{confirmCredits:2.17});await until(()=>maker.status(job));assert.equal(designed.length,2);
 await rm(root,{recursive:true});
});


test('medical-looking props from the look never reach the writers',()=>{
 const k={...kit,assets:[{what:'A transparent plastic model',kind:'object',how:'shows build-up'},{what:'glass mugs',kind:'object',how:'every test'}]};
 assert.deepEqual(kitBrief(k,'ai_host').signature,['glass mugs (object): every test']);
});

test('a line that points to a link, bio, DM or freebie we do not have is still a problem',()=>{
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

test('the payoff must be shown up close, and objects named in every beat',()=>{
 const req=checkKitScriptRequest(script());assert.ok(req.questions.payoff_closeup);
 const a={starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.9},emotion:{choice:'satisfaction'},gripping:{score:2.4},part_1_risky:{noul:0.1},part_2_risky:{noul:0.1},payoff_closeup:{noul:0.2}};
 assert.deepEqual(readKitScriptCheck({answers:a},script(),kit,'ai_host').problems,['The result is not shown in a close-up right after the action']);
 assert.match(kitScriptPrompt({title:'t'},kit,'ai_host',{}),/never just "curls"/);
});

test('the Winner DNA reaches the idea and script writers, Jev\'s check, and the voice direction',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 await writeFile(join(ch,'dna.json'),JSON.stringify({validation:{verdict:'luck'},details:[{detail:'voice',value:'calm',plain:'A calm voice',rho:0.27,withX:3.28,withoutX:1.21,n:34,evidence:'hint'},{detail:'payoffs',value:'3+',plain:'Three or more payoffs',rho:0.33,withX:4.74,withoutX:1.2,n:11,evidence:'hint'}]}));
 const prompts=[],jevStates=[];
 const gemini=async({schema,parts})=>{prompts.push(parts[0].text);return schema.required.includes('ideas')?{json:{ideas:[{title:'T',hook_line:'h',demo:'d',steps:[],keyword:'K'}]},costUsd:0}:{json:script(),costUsd:0};};
 const planner=new ReelPlanner(root,keys,{gemini,jev:async r=>{jevStates.push(r);return good;}});
 await planner.startIdeas(job);await until(()=>planner.status(job));await planner.startScript(job,0);const s=await until(()=>planner.status(job));
 assert.match(prompts[0],/Winner DNA of this channel.*tie-breakers, not rules.*Lean towards: A calm voice \(3\.28x.*Three or more payoffs/s);
 assert.match(prompts.at(-1),/Winner DNA of this channel/);
 const scriptCheck=jevStates.find(r=>r.questions.dna_match);assert.ok(scriptCheck);assert.match(scriptCheck.state.dna.do_more[0],/A calm voice/);
 assert.equal(s.plan.check.pass,true); // DNA never blocks
 // The voice direction follows the DNA.
 const spoken=[];const g=fakeGoogle(),ok={shows:'ok',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};
 await writeFile(join(ch,'plan.json'),JSON.stringify({...s.plan,voiceMode:'designed'}));
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:ok,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/line-/.test(f)?1:20,cut:async(i,o)=>{await writeFile(o,'c');return o;},
  voices:{design:async({name})=>({id:`v_${name}`,costUsd:0}),speak:async a=>{spoken.push(a.style);return {wav:Buffer.from('w'),costUsd:0};},mix:async a=>{await writeFile(a.out,'M');return a.out;},trim:async(i,o)=>{await writeFile(o,'t');return o;}},render:async a=>{await writeFile(a.out,'R');return {seconds:22};}});
 await maker.start(job,{confirmCredits:s.plan.price.usd});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.match(spoken[0],/^calm, warm and steady, at a natural pace/);
 await rm(root,{recursive:true});
});

test('talking hosts: the script rule, a lower close-up bar, a lip-sync check, and Kaan\'s switch',async()=>{
 const talkP=kitScriptPrompt({title:'t'},kit,'ai_host',{},null,'talking');assert.match(talkP,/The hosts talk to the viewer on camera/);assert.match(talkP,/At least 40% of beats/);assert.match(talkP,/side by side in one close-up/);assert.doesNotMatch(talkP,/At least 60%/);assert.doesNotMatch(kitScriptPrompt({title:'t'},kit,'ai_host',{},null,'voiceover'),/talk to the viewer on camera/);
 const halfClose=script();halfClose.parts[0].beats[1].shot='Medium shot of Mia'; // 2 of 4 close-ups: 50%
 assert.match(scriptProblems(halfClose,kit,'ai_host').join(),/at least 60%/);assert.doesNotMatch(scriptProblems(halfClose,kit,'ai_host','talking').join(),/close-ups/);
 const ok={match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false};
 assert.deepEqual(partVerdict({...ok,lips_match:'no'}).problems,['the lips do not match the words']);assert.equal(partVerdict({...ok,lips_match:'no_speech_on_camera'}).pass,true);
 const {root,job,ch}=await setup();const planner=new ReelPlanner(root,()=>({gemini:'g',jev:'j'}));
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',script:script(),voice:{mode:'talking',why:'In 63 of 79...',auto:'talking',autoWhy:'In 63 of 79...'},voiceMode:'native'}));
 let s=await planner.setVoice(job,'voiceover');assert.equal(s.plan.voiceMode,'designed');assert.equal(s.plan.voice.why,'You chose this.');assert.equal(s.plan.voice.byKaan,true);
 s=await planner.setVoice(job,'talking');assert.equal(s.plan.voiceMode,'native');assert.equal(s.plan.voice.why,'In 63 of 79...');
 await assert.rejects(planner.setVoice(job,'singing'),/talking or voice-over/);
 await rm(root,{recursive:true});
});


test('a clip whose result differs from the script always fails, whatever else is fine',()=>{
 const ok={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing',lips_match:'yes'};
 assert.equal(partVerdict({...ok,result_as_written:'yes'}).pass,true);assert.equal(partVerdict({...ok,result_as_written:'no_result_in_beats'}).pass,true);
 assert.deepEqual(partVerdict({...ok,result_as_written:'no'}).problems,['the result is not what the script says']);
});

test('lip sync is judged only when the hosts talk on camera',()=>{
 const ok={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing',lips_match:'no',result_as_written:'yes'};
 assert.deepEqual(partVerdict(ok).problems,['the lips do not match the words']);assert.equal(partVerdict(ok,{talking:false}).pass,true);
});

test('a channel that teaches movements has no close-up quota and no payoff close-up rule',async()=>{
 const {scriptRules:_}={};const sc={hook_title:'h',caption:'c?',parts:[0,1].map(()=>({beats:[{from:0,to:5,who:'Voice',does:'full-body squat',says:'Sit back.',shot:'wide'},{from:5,to:10,who:'Voice',does:'full-body squat',says:'Drive up.',shot:'wide'}]}))};
 const kit={cast:[],name:'k'};
 assert.ok(scriptProblems(sc,kit,'animated','voiceover',true).some(p=>/close-ups/.test(p)));assert.ok(!scriptProblems(sc,kit,'animated','voiceover',false).some(p=>/close-ups/.test(p)));
 const raw={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.9},health_fact:{noul:0.1},true_claim:{noul:0.9},payoff_closeup:{noul:0.1},gripping:{score:2.5},first_second:{score:2.5}}};
 assert.ok(readKitScriptCheck(raw,sc,kit,'animated','voiceover',true).problems.some(p=>/close-up right after/.test(p)));assert.ok(!readKitScriptCheck(raw,sc,kit,'animated','voiceover',false).problems.some(p=>/close-up right after/.test(p)));
 assert.match(kitScriptPrompt({title:'t'},kit,'animated',{},null,'voiceover',false),/teaches movements/);assert.doesNotMatch(kitScriptPrompt({title:'t'},kit,'animated',{},null,'voiceover',false),/Every payoff is shown in a close-up/);
});

test('a script that invents a pointless test is stopped (code: "Test Number" only in a reel about a test)',()=>{
 const sc=(hook,says)=>({hook_title:hook,caption:'c?',parts:[0,1].map(()=>({beats:[{from:0,to:5,who:'Leo',does:'grates carrots',says,shot:'close-up'},{from:5,to:10,who:'Leo',does:'stirs oats',says:'Stir.',shot:'close-up'}]}))});
 const kit={cast:[{name:'Leo'}],name:'k'};
 assert.ok(scriptProblems(sc('Carrot cake oatmeal','Test Number One.'),kit,'ai_host').includes('It adds a pointless test the idea does not need'));
 assert.ok(!scriptProblems(sc('Test your baking soda','Test Number One.'),kit,'ai_host').includes('It adds a pointless test the idea does not need'));
 assert.ok(!scriptProblems(sc('Carrot cake oatmeal','Grate them.'),kit,'ai_host').includes('It adds a pointless test the idea does not need'));
});

test('copy mode: a part Google refuses is softened once (only its words) and sent again; the copy is marked internal, not blocked',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',copyOf:'orig1',kitAt:kitSaved.createdAt,createdAt:'2026-09-29T01:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 const g=fakeGoogle();let refused=0;const fetchImpl=async(url,o={})=>{if(o.method==='POST'&&JSON.parse(o.body).previous_interaction_id&&refused++===0)return new Response(JSON.stringify({error:{message:'Request blocked due to prohibited content guidelines.'}}),{status:400});return g.fetchImpl(url,o);};
 const fine={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};let softens=0;
 const gemini=async({schema})=>{if(schema.properties.beats&&!schema.properties.shows){softens++;return {json:{beats:script().parts[1].beats.map(b=>({does:b.does,says:'softened words'}))},costUsd:0.001};}return {json:fine,costUsd:0};};
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini,jev:async()=>good,videoFetch:fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:22,spoken:[{text:'Comment'},{text:'EGG'}]};}});
 await maker.start(job,{confirmCredits:2.17});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(softens,1);assert.equal(refused,2);const reel=m.reels[0];assert.deepEqual(reel.softened,[2]);assert.equal(reel.internal,true);assert.equal(reel.copyOf,'orig1');
 assert.equal(reel.review,undefined); // a copied "comment" line is not a blocker in copy mode
 assert.match(JSON.stringify(g.calls.post.at(-1)),/softened words/);assert.equal(reel.score,undefined); // no creative scores for a copy
});

// One part check for the maker and the QA exam (audit, 2026-09-29): both watches with the face pictures, the merge,
// and Jev's "matters" gate, with every paid call in the ledger.
test('the part check: two watches with the hosts\' faces, either one can fail the result, Jev decides what matters',async()=>{
 const sent=[],spent=[];let n=0;
 const gemini=async({parts})=>{sent.push(parts);n++;return {json:{shows:'s',match:2,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'the second glass',result_as_written:n===2?'no':'yes'},costUsd:0.003};};
 const jev=async req=>{assert.ok(req.questions.matters);return {answers:{matters:{noul:0.8}},usage:{input_tokens:1000}};};
 const c=await checkPart({bytes:Buffer.from('clip'),faces:[Buffer.from('F1'),Buffer.from('F2')],script:script(),index:0,gemini,jev,keys:{gemini:'g',jev:'j'},ledger:async e=>{spent.push(e);}});
 assert.equal(sent.length,2);for(const p of sent){assert.equal(p.filter(x=>x.image).length,2);assert.match(p.at(-1).text,/reference pictures of the hosts/);}
 assert.equal(c.pass,false);assert.ok(c.problems.includes('the result is not what the script says'),'the second watch\'s "no" counts');
 const again=await checkPart({bytes:Buffer.from('clip'),script:script(),index:0,gemini:async()=>({json:{shows:'s',match:3,same_people:'no_people',text_or_logos:false,gear_visible:false,broken:false,missing:'a spoon'},costUsd:0}),jev,keys:{gemini:'g',jev:'j'}});
 assert.deepEqual(again.problems,['it misses what matters: a spoon']);
 assert.deepEqual(spent.map(e=>e.step),['check part-1','check part-1 jev']);assert.equal(spent[1].usd,0.000042);
 // One watch fails: the other one's cost is still written down.
 let k=0;const lost=[];const fail=async()=>{if(++k===2)throw Object.assign(new Error('Gemini: HTTP 500'),{costUsd:0.001});return {json:{},costUsd:0.003};};
 await assert.rejects(checkPart({bytes:Buffer.from('c'),script:script(),index:0,gemini:fail,jev,keys:{gemini:'g',jev:'j'},ledger:async e=>{lost.push(e);}}),/HTTP 500/);
 assert.equal(lost.length,1);assert.equal(Math.round(lost[0].usd*1000),4);assert.match(lost[0].failed,/HTTP 500/);
});

// A new script for an idea whose reel stopped partway used the same reel id, kept part 1 filmed from the OLD script
// and filmed part 2 of the new one on top of it (audit, 2026-09-29).
test('a new script for the same idea films a new reel; a reel begun before under the old id still resumes',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const plan=scriptAt=>JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T01:00:00Z',scriptAt,chosen:0,picked:[{idea:{title:'Revive celery'}}],script:script(),check:{pass:true},price:{usd:2.17}});
 const fine={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};let part2Bad=true;
 const g=fakeGoogle(),opts={cover:fakeCover,jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:22};},
  gemini:async({parts})=>({json:part2Bad&&/part 2/.test(parts.at(-1).text||'')?{...fine,same_people:'no'}:fine,costUsd:0})};
 await writeFile(join(ch,'plan.json'),plan('2026-09-28T01:05:00Z'));
 const first=new ReelMaker(root,keys,opts);const a=await first.start(job,{confirmCredits:2.17});let m=await until(()=>first.status(job));assert.match(m.error,/Part 2 failed its check twice/);assert.equal(g.calls.post.length,3);
 part2Bad=false;await writeFile(join(ch,'plan.json'),plan('2026-09-28T02:00:00Z'));
 const second=new ReelMaker(root,keys,opts);const b=await second.start(job,{confirmCredits:2.17});m=await until(()=>second.status(job));assert.equal(m.state,'done',m.error);
 assert.notEqual(b.reelId,a.reelId);assert.equal(g.calls.post.length,5,'both parts filmed again from the new script');assert.equal(g.calls.post[3].previous_interaction_id,undefined);
 const made=JSON.parse(await readFile(join(ch,'reels',b.reelId,'reel.json'),'utf8'));assert.equal(made.scriptAt,'2026-09-28T02:00:00Z');
 // A reel started under the old id (no scriptAt saved) after this script was written resumes where it is.
 const old=`0-revive-celery-${createHash('sha256').update('2026-09-28T01:00:00Z').digest('hex').slice(0,6)}`;
 await mkdir(join(ch,'reels',old),{recursive:true});await writeFile(join(ch,'reels',old,'reel.json'),JSON.stringify({version:1,id:old,mode:'kit',idea:0,planAt:'2026-09-28T01:00:00Z',createdAt:'2026-09-28T03:00:00Z',spentUsd:0,paid:{},parts:[]}));
 await writeFile(join(ch,'plan.json'),plan('2026-09-28T02:30:00Z'));
 const third=new ReelMaker(root,keys,opts);assert.equal((await third.start(job,{confirmCredits:2.17})).reelId,old);await until(()=>third.status(job));
 await rm(root,{recursive:true});
});

// A second opinion or rank that did not run was saved as {error} or {skipped}, and the card showed nothing, as for a
// clean reel; a failure reading the channel's reels was reported as "fewer than 3" (audit, 2026-09-29).
test('a final check or rank that did not run says so on the reel',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q',anthropic:'a'});
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',kitAt:kitSaved.createdAt,createdAt:'2026-09-28T01:00:00Z',scriptAt:'2026-09-28T01:05:00Z',chosen:0,picked:[{idea:{title:'Revive celery'}}],script:script(),check:{pass:true},price:{usd:2.17}}));
 const fine={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:fine,costUsd:0}),jev:async()=>good,videoFetch:fakeGoogle().fetchImpl,pollMs:0,seconds:async()=>20,cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:22};},
  frames:async()=>[],claude:async()=>{throw new Error('Claude check failed (529): overloaded');}});
 const posts=job.posts;job.posts=undefined; // the channel's reels cannot be read
 await maker.start(job,{confirmCredits:2.17});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);job.posts=posts;
 const r=m.reels[0];assert.equal(r.check.level,'unchecked');assert.match(r.check.weaknesses[0],/did not run: Claude check failed \(529\)/);
 assert.ok(r.rank.error);assert.doesNotMatch(r.rank.sentence,/Fewer than 3/i);assert.match(r.rank.sentence,/^Not compared with their typical reels: /);
 const skipped=await maker.finalCheck(job,'x',script(),[],null,{},async()=>{});assert.equal(skipped.level,'unchecked');assert.match(skipped.weaknesses[0],/ANTHROPIC_API_KEY/);
 await rm(root,{recursive:true});
});

// Remakes ignored the channel's payoff decision, so a channel that teaches movements got the close-up quota and every
// remake was blocked (audit, 2026-09-29).
test('a remake follows the channel\'s payoff decision',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 await writeFile(join(root,'secret','r1','secret.json'),JSON.stringify({account:'dz',secret:{headline:'h'},stats:{differences:[],house:[]},picked:[]}));
 await mkdir(join(root,'videos','r1'),{recursive:true});await writeFile(join(root,'videos','r1','w1.mp4'),'v');job.posts=[{id:'w1'}];
 await writeFile(join(ch,'dna.json'),JSON.stringify({labels:Array.from({length:30},(_,i)=>({id:`p${i}`,xNormal:1,labels:{payoffs:i<5?'1':'0',first_speaker:'voiceover',gaze:'no_person'}}))}));
 const wide={hook_title:'Squat right',caption:'Try it? #form',parts:[0,1].map(()=>({beats:[beat(0,5,'Leo','full-body squat','Sit back.','Wide shot of Leo'),beat(5,10,'Mia','full-body squat','Drive up.','Wide shot of Mia')]}))};
 const prompts=[];const gemini=async({schema,parts})=>schema.required.includes('first_second')?{json:{first_second:'a wide squat',beats:[]},costUsd:0.01}:(prompts.push(parts[0].text),{json:wide,costUsd:0.02});
 const planner=new ReelPlanner(root,keys,{gemini,jev:async req=>req.questions.same_subject?{answers:{same_subject:{noul:0.9}}}:{answers:{...good.answers,payoff_closeup:{noul:0.1},gripping:{score:2.5},first_second:{score:2.5}}}});
 await planner.startRemake(job,'w1');const s=await until(()=>planner.status(job));assert.equal(s.state,'ready',s.error);
 assert.equal(s.plan.result.payoff,false);assert.match(prompts[0],/each movement shown clearly/);assert.match(prompts[0],/teaches movements/);
 assert.equal(s.plan.check.pass,true,JSON.stringify(s.plan.check.problems));
 await rm(root,{recursive:true});
});

test('the Veo prompt names who is which picture, keeps every quoted line, and stays under Veo\'s limit',async()=>{
 const {veoPrompt}=await import('../lib/kit-reel.mjs');
 const sc={parts:[{seconds:8,beats:[{from:0,to:4,shot:'Close shot, chicken large in the foreground',who:'Leo',does:'Leo pours boiling water',says:'Pour boiling water over raw chicken.',sound:'pour'},{from:4,to:8,shot:'close on the chicken',who:'Leo',does:'white foam bubbles out',says:'If white foam comes out,',sound:''}]},{seconds:7,beats:[{from:0,to:7,shot:'x'.repeat(5000),who:'Mia',does:'Mia reacts',says:'that is what they pumped into it.',sound:''}]}]};
 const p0=veoPrompt(sc,0,kitSaved);assert.match(p0,/Leo \(reference image 1/);assert.match(p0,/Mia \(reference image 2/);assert.match(p0,/reference image 3\)/);assert.match(p0,/Leo says: "Pour boiling water over raw chicken\."/);
 const p1=veoPrompt(sc,1,kitSaved);assert.match(p1,/^Continue the same video/);assert.match(p1,/Mia says: "that is what they pumped into it\."/);assert.ok(p1.length<=3600);
});

test('Veo copy: the 8 s clip carries our pictures, the 7 s extension carries the video so far, each is checked, priced per second',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const vs={hook_title:'H',caption:'c',parts:[{seconds:8,beats:[{from:0,to:8,shot:'close',who:'Leo',does:'Leo pours',says:'Pour boiling water.',sound:'pour'}]},{seconds:7,beats:[{from:0,to:7,shot:'close',who:'Mia',does:'foam',says:'That is the foam.',sound:''}]}]};
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',engine:'veo-fast',copyOf:'o1',kitAt:kitSaved.createdAt,createdAt:'2026-09-29T02:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:vs,check:{pass:true},price:{usd:1.5}}));
 const posts=[];let n=0;const veoFetch=async(url,o={})=>{
  if(o.method==='POST'){posts.push({url,body:JSON.parse(o.body)});return Response.json({name:`models/x/operations/op${posts.length}`});}
  if(url.includes(':download'))return new Response('VEO'+posts.length);
  return Response.json({done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/v:download?alt=media'}}]}}});};
 const bad={shows:'x',match:1,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'the foam'},fine={...bad,match:3,missing:'nothing'};
 // Part 2's first film is off (both watches say so), its retry passes.
 const gemini=async()=>{n++;return {json:n===3||n===4?bad:fine,costUsd:0};};
 const lengths=[8,15,15];let k=0;
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini,jev:async()=>good,veoFetch,pollMs:0,seconds:async()=>lengths[Math.min(k++,2)],cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:17.5,spoken:[]};}});
 await maker.start(job,{confirmCredits:1.5});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(posts.length,3);assert.match(posts[0].url,/veo-3\.1-fast-generate-preview:predictLongRunning/);
 assert.ok(posts[0].body.instances[0].referenceImages.length>=1);assert.equal(posts[0].body.instances[0].video,undefined);
 assert.ok(posts[1].body.instances[0].video.bytesBase64Encoded);assert.equal(posts[1].body.instances[0].referenceImages,undefined);
 const reel=m.reels[0];assert.equal(reel.engine,'veo-fast');assert.deepEqual(Object.keys(reel.paid),['part-1#1','part-2#1','part-2#2']);assert.equal(reel.spentUsd,0.8+0.7+0.7);
 assert.equal(reel.parts[1].attempt,2);assert.equal(reel.copyOf,'o1');
});

// Kaan, 2026-09-29: no length caps, and a refusal must not break a copy. Veo extends one video up to 148 s (a small
// limit here), so a longer copy starts a fresh clip with the pictures (a new chain) and the chains are joined. Veo
// refused our host's photo as "a real person" once on natural.solutions (the same photo passed in another copy): a
// refusal is free, so the maker tries the host's other pictures before giving up.
test('Veo copy: a long reel is filmed as joined chains, and a "real person" refusal retries with another host picture',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const beat=(who,says)=>({from:0,to:7,shot:'close',who,does:`${who} talks`,says,sound:''});
 const vs={hook_title:'H',caption:'c',parts:[{seconds:8,beats:[{...beat('Leo','One.'),to:8}]},{seconds:7,beats:[beat('Mia','Two.')]},{seconds:8,beats:[{...beat('Leo','Three.'),to:8}]}]};
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',engine:'veo-fast',copyOf:'o1',kitAt:kitSaved.createdAt,createdAt:'2026-09-29T02:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:vs,check:{pass:true},price:{usd:2.3}}));
 const posts=[];const veoFetch=async(url,o={})=>{
  if(o.method==='POST'){posts.push({url,body:JSON.parse(o.body)});return Response.json({name:`models/x/operations/op${posts.length}`});}
  if(url.includes(':download'))return new Response('VEO'+posts.length);
  if(url.endsWith('/op1'))return Response.json({done:true,error:{code:400,message:"Sorry, we can't create videos with real people's names or likenesses. Please remove the celebrity reference and try again."}});
  return Response.json({done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/v:download?alt=media'}}]}}});};
 const fine={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};
 let joined=null;const secs=f=>/part-2/.test(f)?15:/part-[13]/.test(f)?8:23;
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:fine,costUsd:0}),jev:async()=>good,veoFetch,pollMs:0,veoChainSeconds:15,seconds:async f=>secs(f),
  join:async(files,out)=>{joined=files;await writeFile(out,'JOINED');return out;},cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:23,spoken:[]};}});
 await maker.start(job,{confirmCredits:2.3});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(posts.length,4);
 const img=b=>Buffer.from(b.instances[0].referenceImages[0].image.bytesBase64Encoded,'base64').toString();
 assert.equal(img(posts[0].body),'JPG face0');assert.equal(img(posts[1].body),'JPG turn0'); // the refused face is swapped for another picture of the same host
 assert.ok(posts[2].body.instances[0].video);assert.equal(posts[2].body.instances[0].referenceImages,undefined); // part 2 extends chain 1
 assert.equal(posts[3].body.instances[0].video,undefined);assert.equal(img(posts[3].body),'JPG turn0');assert.match(posts[3].body.instances[0].prompt,/^Vertical phone video/); // part 3 starts chain 2 fresh, with the picture that worked
 const reel=m.reels[0];assert.equal(reel.refVariant,1);assert.equal(reel.spentUsd,0.8+0.7+0.8);assert.deepEqual(joined.map(f=>f.split('/').pop()),['part-2-a1.mp4','part-3-a1.mp4']);
});
test('Veo copy: when Google refuses every picture of the host, it stops with a clear next step and costs nothing',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const vs={hook_title:'H',caption:'c',parts:[{seconds:8,beats:[{from:0,to:8,shot:'close',who:'Leo',does:'Leo talks',says:'One.',sound:''}]}]};
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',engine:'veo-fast',copyOf:'o1',kitAt:kitSaved.createdAt,createdAt:'2026-09-29T02:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:vs,check:{pass:true},price:{usd:0.8}}));
 let posts=0;const veoFetch=async(url,o={})=>{if(o.method==='POST'){posts++;return Response.json({name:`models/x/operations/op${posts}`});}
  return Response.json({done:true,error:{code:400,message:'Sorry, we can\'t create videos with real people\'s names or likenesses.'}});};
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:{},costUsd:0}),jev:async()=>good,veoFetch,pollMs:0,seconds:async()=>8,cut:async(i,o)=>o,render:async()=>({})});
 await maker.start(job,{confirmCredits:0.8});const m=await until(()=>maker.status(job));
 assert.equal(m.state,'failed');assert.match(m.error,/looks like a real person.*Gemini Omni.*new host/);assert.equal(posts,2); // face0, then turn0 (face1 has no other picture)
});
test('Omni copy: every 4 parts a fresh chain starts with the pictures (Google extends only up to 30 s), and chains are joined',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const part=n=>({seconds:10,beats:[{from:0,to:10,shot:'close',who:'Leo',does:'Leo talks',says:`Line ${n}.`,sound:''}]});
 const sc={hook_title:'H',caption:'c',parts:[1,2,3,4,5].map(part)};
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',engine:'omni',copyOf:'o1',voiceMode:'native',kitAt:kitSaved.createdAt,createdAt:'2026-09-29T02:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:sc,check:{pass:true},price:{usd:0}}));
 const g=fakeGoogle();let joined=null;const fine={shows:'x',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'};
 const {kitPrice}=await import('../lib/kit-reel.mjs');const usd=kitPrice(5).usd;
 const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini:async()=>({json:fine,costUsd:0}),jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async f=>/chains-joined/.test(f)?50:10,
  join:async(files,out)=>{joined=files;await writeFile(out,'JOINED');return out;},cut:async(i,o)=>{await writeFile(o,'c');return o;},render:async a=>{await writeFile(a.out,'R');return {seconds:50,spoken:[]};}});
 await maker.start(job,{confirmCredits:usd});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 const hasImages=b=>b.input.some(x=>x.type==='image');
 assert.deepEqual(g.calls.post.map(hasImages),[true,false,false,false,true]);assert.deepEqual(g.calls.post.map(b=>Boolean(b.previous_interaction_id)),[false,true,true,true,false]);
 assert.deepEqual(joined.map(f=>f.split('/').pop()),['part-4-a1.mp4','part-5-a1.mp4']);assert.equal(usd,Math.round((2*PART_USD+3*1.13)*100)/100);
});

test('visual copy prompt: only the garment\'s printed line may show, no speech, room sound only; its text does not fail the check',async()=>{
 const {veoPrompt,partVerdict}=await import('../lib/kit-reel.mjs');
 const sc={visual:true,print:"DON'T TALK TO ME",parts:[{seconds:8,beats:[{from:0,to:8,shot:'Medium shot from behind',who:'Leo',does:'Leo walks down a store aisle, back to the camera',says:'',sound:''}]}]};
 const p=veoPrompt(sc,0,kitSaved);
 assert.match(p,/printed large on the back of Leo's top: "DON'T TALK TO ME"/);assert.doesNotMatch(p,/no walking/);assert.match(veoPrompt({...sc,still:true},0,kitSaved),/stays in place, no walking/);assert.match(p,/No one speaks/);assert.match(p,/no music/i);assert.doesNotMatch(p,/No text, captions, logos or labels on screen;/);
 const seen={match:3,same_people:'yes',text_or_logos:true,gear_visible:false,broken:false,lips_match:'no_speech_on_camera',result_as_written:'yes'};
 assert.equal(partVerdict(seen,{talking:false,allowText:true}).pass,true);assert.equal(partVerdict(seen,{talking:false}).pass,false);
});

test('a visual copy fails its check when the printed line is wrong or unreadable',async()=>{
 const {partVerdict,printMatch}=await import('../lib/kit-reel.mjs');
 const seen=t=>({match:3,same_people:'no_people',text_or_logos:true,gear_visible:false,broken:false,lips_match:'no_speech_on_camera',result_as_written:'yes',printed_text:t});
 const print="DON'T TALK TO ME I HAVE A CRAZY GIRLFRIEND";
 assert.equal(printMatch(print,'Dont talk to me, I have a crazy girlfriend'),1);assert.ok(printMatch(print,'LASTIA IULRD WEGS')<0.2);
 assert.equal(partVerdict(seen("DON'T TALK TO ME I HAVE A CRAZY GIRLFRIEND"),{talking:false,allowText:true,print}).pass,true);
 assert.deepEqual(partVerdict(seen('LASTIA IULRD WEGS'),{talking:false,allowText:true,print}).problems,['the printed line reads "LASTIA IULRD WEGS", not the line we asked for']);
});
test('Veo visual copy: the first frame is drawn with the exact line, read back, redrawn once if wrong, then animated',async()=>{
 const {root,job,ch}=await setup();const keys=()=>({gemini:'g',jev:'j',groq:'q'});
 const kitNoHost={...kitSaved,format:'visuals',kit:{...kitSaved.kit,cast:[]},pictures:[{role:'place',file:'place-a.jpg'},{role:'scene',file:'scene-a.jpg'}]};
 await writeFile(join(ch,'kit','kit.json'),JSON.stringify(kitNoHost));
 const vs={visual:true,print:"DON'T TALK TO ME",originalSeconds:6,hook_title:'',caption:'c',parts:[{seconds:8,beats:[{from:0,to:8,shot:'Medium shot from behind, slow push-in',who:'voice',does:'A young man stands in a store aisle, back to the camera',says:'',sound:''}]}]};
 await writeFile(join(ch,'plan.json'),JSON.stringify({mode:'kit',source:'copy',engine:'veo-fast',copyOf:'o1',kitAt:kitNoHost.createdAt,createdAt:'2026-09-29T02:00:00Z',chosen:0,picked:[{idea:{title:'Copy'}}],script:vs,check:{pass:true},price:{usd:0.8}}));
 const posts=[];const veoFetch=async(url,o={})=>{if(o.method==='POST'){posts.push(JSON.parse(o.body));return Response.json({name:'models/x/operations/op1'});}
  if(url.includes(':download'))return new Response('VEO');return Response.json({done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/v:download?alt=media'}}]}}});};
 const {videoPath}=await import('../lib/videos.mjs');await mkdir(join(root,'videos','r1'),{recursive:true});await writeFile(videoPath(root,'r1','o1'),'ORIG');
 let drawn=0;const image=async({prompt,refs})=>{drawn++;assert.match(prompt,/"DON'T TALK TO ME"/);assert.equal(String(refs[0].data),'ORIGFRAME@0.5');assert.equal(String(refs[1].data),'JPG place');assert.match(prompt,/Frame it exactly like the first picture[\s\S]*the place from the second picture/);return {data:Buffer.from(`FRAME${drawn}`),mime:'image/jpeg',costUsd:0.04};};
 const gemini=async({schema,parts})=>{if(schema.required?.includes('a'))return {json:{a:[200,100,700,900],b:[400,300,700,700]},costUsd:0.001}; // theirs is larger: crop
  if(schema.required?.includes('printed_text')&&!schema.required.includes('match'))return {json:{printed_text:drawn===1?'DONT TALK T0 NE':"DON'T TALK TO ME"},costUsd:0.001};
  return {json:{shows:'x',match:3,same_people:'no_people',text_or_logos:true,gear_visible:false,broken:false,missing:'nothing',printed_text:"DON'T TALK TO ME"},costUsd:0};};
 let rendered=null,trimmed=null,cropped=null;const maker=new ReelMaker(root,keys,{cover:fakeCover,gemini,image,frame:async(v,o,at)=>Buffer.from(`${await readFile(v,'utf8')}FRAME@${at}`),trim:async(f,o,sec)=>{trimmed=sec;await writeFile(o,'TRIM');return o;},imageSize:async()=>({width:720,height:1280}),cropImage:async(b,c)=>{cropped=c;return Buffer.from(`CROPPED(${b})`);},jev:async()=>good,veoFetch,pollMs:0,seconds:async()=>8,cut:async(i,o)=>o,render:async a=>{rendered=a;await writeFile(a.out,'R');return {seconds:8,spoken:[]};}});
 await maker.start(job,{confirmCredits:0.8});const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(drawn,2);assert.equal(Buffer.from(posts[0].instances[0].image.bytesBase64Encoded,'base64').toString(),'CROPPED(FRAME2)');assert.ok(Math.abs(cropped.scale-5/3)<1e-9); // framed like the original by codeassert.equal(rendered.endCard,null);assert.equal(m.reels[0].endCard,false); // a copy ends like the original
 assert.equal(trimmed,6.3);assert.match(rendered.clips[0],/trimmed\.mp4$/); // as long as the originalassert.equal(posts[0].instances[0].referenceImages,undefined);
});

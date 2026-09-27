import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PART_USD,PARTS,MAX_WORDS,kitBrief,kitIdeaPrompt,judgeKitIdeaRequest,scriptProblems,checkKitScriptRequest,readKitScriptCheck,kitPrice,referencesFor,partPrompt,spokenText,discloseCaption,partVerdict} from '../lib/kit-reel.mjs';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {ReelMaker} from '../lib/reel-make.mjs';

const host=(name,outfit)=>({name,role:'tests a trick',look:'x',outfit,manner:'calm',voice:'warm'});
const kit={name:'Kitchen Check',promise:'Tricks that work.',cast:[host('Leo','a navy tee'),host('Mia','a dark green long-sleeve shirt')],hands:'none',art_style:'none',place:'A bright white kitchen',places:[],camera:'Eye-level medium shot on a tripod',light:'Soft daylight',palette:[],sound:{voice:'clear and quick',music:'none',natural:'pouring water'},assets:[{what:'glass mugs',kind:'object',how:'every test'}],dont:['no health claims']};
const kitSaved={format:'ai_host',createdAt:'2026-09-28T00:00:00Z',approved:true,kit,pictures:[{role:'face0',file:'face0-a.jpg'},{role:'turn0',file:'turn0-a.jpg'},{role:'face1',file:'face1-a.jpg'},{role:'place',file:'place-a.jpg'},{role:'scene',file:'scene-a.jpg'}]};
const beat=(from,to,who,does,says='')=>({from,to,who,does,says});
const script=(o={})=>({hook_title:'Floppy celery?',keyword:'CRISP',caption:'Save your celery. #kitchen',parts:[
 {beats:[beat(0,3,'Leo','holds a bendy celery stalk','Floppy celery? Wait.'),beat(3,10,'Mia','drops it into ice water','Ice water, fifteen minutes.')]},
 {beats:[beat(0,5,'Leo','snaps a crisp stalk','Crunchy again.'),beat(5,10,'Mia','smiles at the camera','Comment CRISP for more.')]}],...o});

test('price: two 10-second parts at the Omni price, the limit allows one retry each',()=>{
 assert.equal(PART_USD,1.04);assert.deepEqual(kitPrice(),{usd:2.17,maxUsd:4.34,parts:2,partSeconds:10,model:'gemini-omni-1.1-flash'});
});

test('ideas and judging use the kit: hosts, place, signature things, AI-video safety',()=>{
 const p=kitIdeaPrompt(kit,'ai_host',{headline:'h'});assert.match(p,/Leo and Mia\) are on camera/);assert.match(p,/"place":"A bright white kitchen"/);assert.match(p,/no brand names/);assert.match(p,/20 seconds/);assert.match(p,/why_true/);assert.match(p,/honey in water/);
 assert.match(kitIdeaPrompt({...kit,cast:[]},'hands_pov',{}),/Only hands are on camera/);
 const req=judgeKitIdeaRequest({title:'t'},{},kit,'ai_host');assert.deepEqual(Object.keys(req.questions),['fit','ai_ready','hook','health_claim','true_demo']);assert.equal(req.state.channel.hosts[0].name,'Leo');
 assert.equal(kitBrief(kit,'ai_host').hands,undefined);
});

test('code checks the script: parts, timing, speakers, word counts, the keyword ask',()=>{
 assert.deepEqual(scriptProblems(script(),kit,'ai_host'),[]);
 assert.match(scriptProblems(script({parts:[script().parts[0]]}),kit,'ai_host').join(),/exactly 2 parts/);
 const gap=script();gap.parts[0].beats[1].from=4;assert.match(scriptProblems(gap,kit,'ai_host').join(),/does not follow on/);
 const short=script();short.parts[1].beats[1].to=9;assert.match(scriptProblems(short,kit,'ai_host').join(),/from 0 to 10/);
 const stranger=script();stranger.parts[0].beats[0].who='Bob';assert.match(scriptProblems(stranger,kit,'ai_host').join(),/"Bob" is not one of/);
 const chatty=script();chatty.parts[0].beats[1].says=Array(MAX_WORDS+1).fill('word').join(' ');assert.match(scriptProblems(chatty,kit,'ai_host').join(),/at most 24/);
 const noAsk=script();noAsk.parts[1].beats[1].says='Bye.';assert.match(scriptProblems(noAsk,kit,'ai_host').join(),/comment the keyword/);
 const hands=script();for(const p of hands.parts)for(const b of p.beats)b.who='hands';assert.deepEqual(scriptProblems(hands,{...kit,cast:[]},'hands_pov'),[]);
});

test('Jev checks truth, health, feeling and risk per part; code turns answers into problems',()=>{
 const req=checkKitScriptRequest(script());assert.ok(req.questions.true_claim&&req.questions.part_1_risky&&req.questions.part_2_risky);
 const good={answers:{starts_mid_action:{noul:0.9},clear_action:{noul:0.8},health_fact:{noul:0.1},true_claim:{noul:0.9},emotion:{choice:'satisfaction'},part_1_risky:{noul:0.1},part_2_risky:{noul:0.2}}};
 assert.equal(readKitScriptCheck(good,script(),kit,'ai_host').pass,true);
 const bad=readKitScriptCheck({answers:{...good.answers,true_claim:{noul:0.2},part_2_risky:{noul:0.8}}},script(),kit,'ai_host');
 assert.deepEqual(bad.problems,['Says something that may not be true','Part 2 is risky for AI video']);assert.deepEqual(bad.riskyParts,[2]);
});

test('part prompts: references named in order, beats timed, sounds from the kit, no text, logos or gear; part 2 continues',()=>{
 assert.deepEqual(referencesFor(kitSaved).map(r=>r.role),['face0','face1','place']);
 const p1=partPrompt(script(),0,kitSaved);
 assert.match(p1,/^\[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2 <IMAGE_REF_2>@Image3\]/);
 assert.match(p1,/Leo <IMAGE_REF_0> \(a navy tee\) and Mia <IMAGE_REF_1> \(a dark green long-sleeve shirt\) in this place <IMAGE_REF_2>/);
 assert.match(p1,/\[0-3s\] holds a bendy celery stalk Leo says: "Floppy celery\? Wait\."/);
 assert.match(p1,/clear real sounds: pouring water; no music/);assert.match(p1,/No text, captions, logos, brand stickers/);assert.match(p1,/No camera, tripod/);
 const p2=partPrompt(script(),1,kitSaved);assert.match(p2,/^The scene continues/);assert.doesNotMatch(p2,/IMAGE_REF/);assert.match(p2,/Comment CRISP/);
 const hands=partPrompt(script(),0,{...kitSaved,kit:{...kit,cast:[]},pictures:[{role:'hands',file:'h.jpg'},{role:'place',file:'p.jpg'}]});
 assert.match(hands,/Only the hands <IMAGE_REF_0> are on camera, never a face, in this place <IMAGE_REF_1>/);
});

test('spoken text for captions, AI disclosure in the caption, part verdicts',()=>{
 assert.equal(spokenText(script()),'Floppy celery? Wait. Ice water, fifteen minutes. Crunchy again. Comment CRISP for more.');
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
const until=async(get)=>{for(let i=0;i<300;i++){const s=await get();if(s.state!=='working')return s;await new Promise(r=>setTimeout(r,5));}throw new Error('stuck');};
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
 const watch=async({parts})=>{checks.push(parts.length);return {json:{shows:'ok',match:3,same_people:'yes',text_or_logos:false,gear_visible:false,broken:false,missing:'nothing'},costUsd:0.003};};
 let seconds=20;const maker=new ReelMaker(root,keys,{gemini:watch,jev:async()=>good,videoFetch:g.fetchImpl,pollMs:0,seconds:async()=>seconds,cut:async(i,o)=>{await writeFile(o,'cut');return o;},render:async a=>{rendered=a;await writeFile(a.out,'REEL');return {seconds:22.5};}});
 await assert.rejects(maker.start(job,{confirmCredits:1.5}),/price changed to \$2\.17/);
 const started=await maker.start(job,{confirmCredits:2.17});assert.equal(started.ceiling,4.34);
 await assert.rejects(maker.start(job,{confirmCredits:2.17}),/already being made/);
 const m=await until(()=>maker.status(job));assert.equal(m.state,'done',m.error);
 assert.equal(g.calls.post.length,2);assert.equal(g.calls.post[0].background,true);assert.equal(g.calls.post[0].input.filter(x=>x.type==='image').length,3);
 assert.equal(g.calls.post[0].response_format.aspect_ratio,'9:16');assert.equal(g.calls.post[1].previous_interaction_id,'job1');assert.equal(g.calls.post[1].input.length,1);
 assert.deepEqual(checks,[4,4]); // the clip, two face pictures, the brief
 const final=join(ch,'reels',m.reels[0].id,'part-2-a1.mp4');assert.equal(rendered.clips[0],final);assert.equal(rendered.voice,final);
 assert.equal(rendered.sayText,spokenText(script()));assert.equal(rendered.endCard.title,'Comment CRISP');
 const reel=m.reels[0];assert.equal(reel.mode,'kit');assert.equal(reel.idea,0);assert.match(reel.caption,/Our hosts are AI\.$/);assert.match(reel.url,/^\/channels\/r1\/0-revive-celery-[0-9a-f]{6}\/reel\.mp4$/);
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

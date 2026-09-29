import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FORMATS,winnerCounts,formatRequest,formatWhy,expertLook,castSize,kitPrompt,checkKit,picturePlan,checkVerdict,estimateKit,STUDY_PROMPT,kitOptions,optionsRequest,pickBest} from '../lib/kit.mjs';
import {KitBuilder} from '../lib/kit-run.mjs';

const winner=(id,labels,x=5)=>({id,group:'winner',xNormal:x,labels});
const saved={account:'doc.tips',secret:{headline:'Quick tests in a kitchen',person:{text:'A casual host'},setting:{text:'A bright kitchen'},format:{text:'Tests things'}},picked:[
 winner('a',{presenter:'one_talking',look:'doctor_or_expert',format:'talking_head',sound:'voice_with_music'},9),winner('b',{presenter:'one_talking',look:'doctor_or_expert'},8),
 winner('c',{presenter:'hands_only',look:'none'},7),{id:'z',group:'flop',xNormal:0.2,labels:{presenter:'nobody'}}]};
const host={name:'Mira',role:'tests a kitchen trick',look:'woman in her thirties, slim, short wavy brown hair, green eyes, freckles',outfit:'a mustard knit sweater',manner:'calm, curious',voice:'warm, medium pitch, unhurried'};
const kit=(o={})=>({name:'Kitchen Checks',promise:'You learn one kitchen trick.',cast:[host],hands:'none',art_style:'none',place:'A white kitchen counter with a green tile wall',camera:'handheld medium shot',light:'soft daylight',palette:[{name:'mustard',hex:'#D4A017'},{name:'green',hex:'#2E7D5B'}],sound:{voice:'calm',music:'soft',natural:'crunching, pouring'},assets:[{what:'a mustard mug',kind:'object',how:'on the counter in every shot'},{what:'a finger snap',kind:'action',how:'at the reveal'},{what:'STEP 1 titles',kind:'words',how:'on screen'}],dont:['no health claims'],...o});

test('winner counts use only the best reels, and the expert rule and cast size follow them',()=>{
 const c=winnerCounts(saved);assert.equal(c.total,3);assert.deepEqual(c.presenter,{one_talking:2,hands_only:1});assert.equal(c.look.doctor_or_expert,2);
 assert.equal(expertLook(c),true);assert.equal(expertLook({total:9,look:{doctor_or_expert:2}}),false);
 assert.equal(castSize('ai_host',{total:10,presenter:{two_or_more:6}}),2);assert.equal(castSize('ai_host',{total:10,presenter:{two_or_more:5}}),1);assert.equal(castSize('hands_pov',{total:10,presenter:{two_or_more:9}}),1);
});

test('the format reason is written by code from the counts',()=>{
 const c=winnerCounts(saved);
 assert.equal(formatWhy('ai_host',c),'In 2 of their 3 best reels, people are on camera.');
 assert.equal(formatWhy('hands_pov',c),'In 1 of their 3 best reels, you only see hands.');
 assert.equal(formatWhy('visuals',c),'In 0 of their 3 best reels, nobody is on camera.');
});

test('Jev is asked to choose between exactly the four formats, with the counts and the study',()=>{
 const req=formatRequest(winnerCounts(saved),[{people:[{role:'host'}],style:'real_footage',voice:'calm',natural_sounds:'crunch'}],saved);
 assert.deepEqual(Object.keys(req.questions.format.criteria),Object.keys(FORMATS));assert.equal(req.state.winners.total,3);
 assert.deepEqual(req.state.how_three_winners_are_made[0].people,['host']);
});

test('the kit prompt carries the research rules: no origin, new person, AI host, expert without credentials',()=>{
 const p=kitPrompt({account:'doc.tips',format:'ai_host',cast:1,expert:true,study:[],saved});
 assert.match(p,/never skin colour, ethnicity/);assert.match(p,/new, made-up person/);assert.match(p,/openly an AI host/);assert.match(p,/never with a white coat/);assert.match(p,/exactly 1 host\./);
 assert.doesNotMatch(kitPrompt({account:'x',format:'ai_host',cast:1,expert:false,study:[],saved}),/white coat/);
 assert.match(kitPrompt({account:'x',format:'ai_host',cast:1,expert:false,study:[],saved,avoid:'Mira: freckles'}),/clearly different.*Mira: freckles/);
 assert.match(kitPrompt({account:'x',format:'hands_pov',cast:1,expert:false,study:[],saved}),/Cast: empty/);
 assert.match(STUDY_PROMPT,/never skin colour/);
});

test('a kit that does not fit its format is caught',()=>{
 assert.deepEqual(checkKit(kit(),'ai_host',1),[]);
 assert.match(checkKit(kit(),'ai_host',2).join(),/exactly 2 hosts/);
 assert.match(checkKit(kit(),'hands_pov',1).join(),/no hosts.*hands are not described/);
 assert.deepEqual(checkKit(kit({cast:[],hands:'slim hands, grey sleeves'}),'hands_pov',1),[]);
 assert.match(checkKit(kit({assets:[{what:'x',how:'y'}]}),'ai_host',1).join(),/signature/);
 assert.match(checkKit(kit(),'animated',1).join(),/art style/);
 assert.match(checkKit(kit({cast:[{...host,look:'AI host: man, 30s'}]}),'ai_host',1).join(),/must look real/);
 assert.match(checkKit(kit({place:'a virtual hangout room'}),'ai_host',1).join(),/must look real/);
 assert.doesNotMatch(checkKit(kit({promise:'Easy tricks and simple health drinks.'}),'ai_host',1).join(),/non-medical/); // claims stay in (Kaan, 2026-09-29)
 assert.doesNotMatch(kitPrompt({account:'x',format:'ai_host',cast:1,expert:false,study:[],saved}),/stays non-medical/);
 assert.deepEqual(checkKit(kit({art_style:'flat cartoon',name:'Digital Doodles'}),'animated',1),[]);
 assert.match(checkKit(kit({cast:[{...host,outfit:'a vintage graphic tee, olive cargo pants'}]}),'ai_host',1).join(),/every piece/);
 assert.deepEqual(checkKit(kit({cast:[{...host,outfit:'a black ribbed tank top, olive cargo pants and white sneakers'}]}),'ai_host',1),[]);
 assert.match(checkKit(kit({cast:[{...host,outfit:'a trendy crop top'}]}),'ai_host',1).join(),/Mira's outfit needs the exact colour of every piece/);
});

test('picture plan: face first, later pictures reference it, the scene uses face and place',()=>{
 const plan=picturePlan(kit(),'ai_host');
 assert.deepEqual(plan.map(p=>p.role),['face0','turn0','body0','place','scene']);
 assert.deepEqual(plan[1].refs,['face0']);assert.equal(plan[1].aspect,'16:9');assert.deepEqual(plan[4].refs,['face0','place']);
 assert.equal(plan[4].expectedPeople,1);assert.equal(plan[4].faceRef,'face0');
 for(const p of plan)assert.match(p.prompt,/No text, no letters/);
 assert.match(plan[0].prompt,/freckles.*mustard knit sweater.*Photorealistic/);assert.match(plan[4].prompt,/a mustard mug; a finger snap\./);assert.doesNotMatch(plan[4].prompt,/STEP/);
 const hands=picturePlan(kit({cast:[],hands:'slim hands, grey sleeves'}),'hands_pov');
 assert.deepEqual(hands.map(p=>p.role),['hands','place','scene']);assert.deepEqual(hands[2].refs,['hands','place']);assert.equal(hands[2].expectedPeople,0);assert.match(hands[2].prompt,/No face/);
 assert.deepEqual(picturePlan(kit({cast:[]}),'visuals').map(p=>p.role),['place','scene']);
 const cartoon=picturePlan(kit({art_style:'flat pastel 2D cartoon'}),'animated');assert.match(cartoon[0].prompt,/flat pastel 2D cartoon\. Not photorealistic/);
 const duo=picturePlan(kit({cast:[host,{...host,name:'Teo'}]}),'ai_host');assert.deepEqual(duo.at(-1).refs,['face0','face1','place']);assert.equal(duo.at(-1).faceRef,undefined);
});

test('picture check: code decides from what Gemini saw',()=>{
 const ok={match:3,text_visible:false,broken:false,people_count:1,same_person:'yes',looks_like_original:'no'};
 const [face,turn,,place,scene]=picturePlan(kit(),'ai_host');
 assert.deepEqual(checkVerdict(ok,face),{pass:true,problems:[]});
 assert.deepEqual(checkVerdict({...ok,match:1},face).problems,['only partly what was asked']);
 assert.deepEqual(checkVerdict({...ok,text_visible:true},face).problems,['letters or a logo are visible']);
 assert.deepEqual(checkVerdict({...ok,same_person:'no'},scene).problems,['not the same person as the face']);
 assert.deepEqual(checkVerdict({...ok,looks_like_original:'yes'},face,{hasOriginal:true}).problems,['looks like a person from the original channel']);
 assert.deepEqual(checkVerdict({...ok,looks_like_original:'yes',same_person:'no'},scene,{hasFace:false,hasOriginal:false}).problems,[]); // not sent, not judged
 assert.deepEqual(checkVerdict({...ok,people_count:3},turn).problems,[]); // a sheet shows the same person three times
 assert.deepEqual(checkVerdict({...ok,people_count:1},place).problems,['1 people instead of 0']);
 assert.deepEqual(checkVerdict({...ok,people_count:2},scene).problems,['2 people instead of 1']);
 assert.deepEqual(checkVerdict({...ok,people_count:1},{...face,role:'opt2-face0'}).problems,[]);assert.deepEqual(checkVerdict({...ok,people_count:1},{...place,role:'opt1-place'}).problems,['1 people instead of 0']);
});

test('the price covers the options, the chosen sheet and a check each; the limit allows one retry each',()=>{
 const e=estimateKit('ai_host',1);assert.equal(e.pictures,3+2+2+1);assert.ok(e.usd>0.55&&e.usd<0.7);assert.ok(e.ceiling>e.usd*1.8);
 assert.equal(estimateKit('ai_host',2).pictures,6+2+4+1);assert.equal(estimateKit('hands_pov').pictures,2+1+1);assert.equal(estimateKit('visuals').pictures,2+1);
});

test('options: up to 3 host options of the right size and 3 places; Jev picks the best that passed its checks',()=>{
 const k=kit({alt_casts:[[{...host,name:'Ada'}],[{...host,name:'Bo'},{...host,name:'Cy'}]],alt_places:['A green tiled kitchen','']});
 const o=kitOptions(k,'ai_host',1);assert.deepEqual(o.casts.map(c=>c[0].name),['Mira','Ada']);assert.equal(o.places.length,2);
 assert.deepEqual(kitOptions(k,'hands_pov',1).casts,[]);
 const req=optionsRequest(k,{name:'n'},o.casts,o.places.map(t=>({text:t})));assert.deepEqual(Object.keys(req.questions),['cast_0','cast_1','place_0','place_1']);
 assert.deepEqual(pickBest([2.1,2.8,1],[true,true,true]),{index:1,score:2.8,why:"Jev's pick: the best fit for the channel (2.8 of 3; next best 2.1)."});
 assert.equal(pickBest([2.1,2.8],[true,false]).index,0);
});

// The builder, end to end with fake models.
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'kit-'));const run='r1';
 await mkdir(join(root,'secret',run),{recursive:true});await writeFile(join(root,'secret',run,'secret.json'),JSON.stringify(saved));
 await mkdir(join(root,'videos',run),{recursive:true});for(const id of ['a','b','c'])await writeFile(join(root,'videos',run,`${id}.mp4`),'video '+id);
 return {root,job:{id:run,creator:'doc.tips'}};
}
const study={people:[{role:'host',look:'a man',manner:'calm'}],place:'kitchen',camera:'handheld',light:'daylight',colors:['white'],props:['jar'],voice:'calm',music:'none',natural_sounds:'crunch',text_style:'captions',edit:'fast',signature:'a snap',style:'real_footage'};
const seenOk={shows:'fine',match:3,text_visible:false,broken:false,people_count:1,same_person:'yes',looks_like_original:'no'};
const optKit=(o={})=>kit({alt_casts:[[{...host,name:'Ada',look:'woman in her twenties, tall, long black curly hair'}],[{...host,name:'Bo',look:'man in his fifties, stocky, grey buzz cut'}]],alt_places:['A green tiled kitchen','A wooden farmhouse kitchen'],...o});
// People in a picture follow its prompt: none in a place, one in a face or sheet, the cast in a scene.
const people=t=>/Empty, ready for filming/.test(t)?0:/single frame/.test(t)?1:1;
function fakes({kits=[optKit()],checks=t=>({...seenOk,people_count:people(t)}),format='ai_host',scores={cast_0:2.1,cast_1:2.8,cast_2:1.5,place_0:2.6,place_1:2,place_2:1}}={}){
 const calls={watch:0,write:0,image:0,check:0,jev:0,prompts:[],imageRefs:[],jevStates:[]};let k=0;
 const gemini=async({model,parts,schema})=>{
  if(schema.required.includes('signature')){calls.watch++;return {json:study,costUsd:0.01};}
  if(schema.required.includes('assets')){calls.write++;calls.prompts.push(parts[0].text);return {json:kits[Math.min(k++,kits.length-1)],costUsd:0.05};}
  calls.check++;return {json:checks(parts[parts.length-1].text,calls.check),costUsd:0.002};};
 const image=async({prompt,refs})=>{calls.image++;calls.imageRefs.push(refs.length);return {data:Buffer.from(`img ${calls.image} ${prompt.slice(0,40)}`),mime:'image/jpeg',costUsd:0.067};};
 const jev=async req=>{calls.jev++;calls.jevStates.push(req.state);return req.questions.format?{answers:{format:{choice:format}}}:{answers:Object.fromEntries(Object.keys(req.questions).map(q=>[q,{score:scores[q]??1}]))};};
 const frame=async()=>Buffer.from('original frame');
 return {calls,opts:{gemini,image,jev,frame}};
}
// A time limit, not a count: the whole suite runs in parallel and 200 short waits was not enough under load.
const until=async(b,job)=>{const end=Date.now()+10000;while(Date.now()<end){const s=await b.status(job);if(s.state!=='working')return s;await new Promise(r=>setTimeout(r,5));}throw new Error('stuck');};
const keys=()=>({gemini:'g',jev:'j'});

test('build: study, Jev picks the format, the look is written with 3 host and 3 place options, each drawn and checked, Jev picks one',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes();const b=new KitBuilder(root,keys,opts);
 await b.start(job);const s=await until(b,job);assert.equal(s.state,'done',s.error);const k=s.saved;
 assert.equal(k.stage,'choose');assert.equal(calls.watch,3);assert.equal(calls.write,1);assert.equal(calls.image,6);assert.equal(calls.check,6);
 assert.deepEqual(k.options.casts.map(c=>c.hosts[0].name),['Mira','Ada','Bo']);assert.deepEqual(k.options.casts.map(c=>c.score),[2.1,2.8,1.5]);
 assert.equal(k.options.pick.cast.index,1);assert.match(k.options.pick.cast.why,/2\.8 of 3; next best 2\.1/);assert.equal(k.options.pick.place.index,0);
 assert.match(k.options.casts[0].hosts[0].picture.url,/^\/channels\/r1\/kit\/opt0-face0-[0-9a-f]{12}\.jpg$/);assert.equal(calls.jevStates[1].casts[1][0].name,'Ada');
 await assert.rejects(b.approve(job),/Choose your host and place first/);
 await rm(root,{recursive:true});
});

test('choose: the full sheet is drawn for the chosen host and place; their option pictures are reused, not paid again',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes();const b=new KitBuilder(root,keys,opts);
 await b.start(job);await until(b,job);await assert.rejects(b.choose(job,{cast:7}),/Choose one of the host options/);
 await b.choose(job,{cast:1,place:2});const s=await until(b,job);assert.equal(s.state,'done',s.error);const k=s.saved;
 assert.equal(k.stage,'ready');assert.deepEqual(k.chose,{cast:1,place:2});assert.equal(k.kit.cast[0].name,'Ada');assert.equal(k.kit.place,'A wooden farmhouse kitchen');
 assert.deepEqual(k.pictures.map(p=>p.role),['face0','turn0','body0','place','scene']);
 assert.equal(calls.image,6+3); // face and place reused; every angle, full outfit and a scene are new
 assert.equal(k.kit.cast[0].picture,undefined);assert.equal((await b.approve(job)).approved,true);
 await rm(root,{recursive:true});
});

test('choose without a choice takes Jev\'s pick; a failed picture is drawn once more, a second failure is kept and flagged',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes({checks:t=>/three views side by side/.test(t)?{...seenOk,text_visible:true}:{...seenOk,people_count:people(t)}});
 const b=new KitBuilder(root,keys,opts);await b.start(job);await until(b,job);await b.choose(job);const s=await until(b,job);
 assert.equal(s.saved.kit.cast[0].name,'Ada');const turn=s.saved.pictures.find(p=>p.role==='turn0');assert.equal(turn.attempts,2);assert.deepEqual(turn.check.problems,['letters or a logo are visible']);
 assert.equal(calls.image,6+4);await rm(root,{recursive:true});
});

test('new host: same format without Jev\'s format question, every earlier option is named to avoid, the old look is kept',async()=>{
 const {root,job}=await setup();const first=fakes();const b=new KitBuilder(root,keys,first.opts);await b.start(job);await until(b,job);await b.choose(job);await until(b,job);
 const second=fakes({format:'nonsense'});const b2=new KitBuilder(root,keys,second.opts);await b2.start(job,{redo:'character'});const s=await until(b2,job);
 assert.equal(s.state,'done',s.error);assert.equal(s.saved.stage,'choose');assert.match(second.calls.prompts[0],/clearly different.*Mira.*Ada.*Bo/);assert.equal(second.calls.watch,0);
 assert.ok((await readdir(join(root,'channels','r1','kit'))).some(f=>/^kit-.*\.json$/.test(f)));
 await rm(root,{recursive:true});
});

test('format switch uses Kaan\'s choice; a kit that misfits twice stops loudly; guards before paying',async()=>{
 const {root,job}=await setup();
 const bad=fakes({kits:[optKit()]});const b=new KitBuilder(root,keys,bad.opts);
 await assert.rejects(b.start(job,{redo:'format',format:'hands_pov'}),/Build the kit first/);
 await assert.rejects(b.start(job,{redo:'format',format:'nonsense'}),/Choose a format/);
 await assert.rejects(new KitBuilder(root,()=>({jev:'j'}),bad.opts).start(job),/Gemini key/);
 await assert.rejects(new KitBuilder(root,keys,bad.opts).start({id:'none',creator:'x'}),/Secret first/);
 const hands=fakes({format:'hands_pov',kits:[optKit()]});const b2=new KitBuilder(root,keys,hands.opts);await b2.start(job);const s=await until(b2,job);
 assert.equal(s.state,'failed');assert.match(s.error,/did not fit the format twice.*no hosts/);assert.equal(hands.calls.write,2);assert.equal(hands.calls.image,0);
 await rm(root,{recursive:true});
});

test('hands only: no host options, 3 places, then the hands, place and scene',async()=>{
 const {root,job}=await setup();const handsKit=kit({cast:[],hands:'slim hands, grey sleeves',alt_casts:[],alt_places:['A marble counter','A butcher block']});
 const {calls,opts}=fakes({format:'hands_pov',kits:[handsKit],checks:t=>({...seenOk,people_count:0})});const b=new KitBuilder(root,keys,opts);
 await b.start(job);let s=await until(b,job);assert.equal(s.saved.options.casts.length,0);assert.equal(s.saved.options.pick.cast,null);assert.equal(calls.image,3);
 await b.choose(job,{place:1});s=await until(b,job);assert.equal(s.saved.kit.place,'A marble counter');assert.deepEqual(s.saved.pictures.map(p=>p.role),['hands','place','scene']);assert.equal(calls.image,3+2);
 await rm(root,{recursive:true});
});

test('draw flagged pictures again: same look and choice; only the failed picture is paid again',async()=>{
 const {root,job}=await setup();const first=fakes({checks:t=>/single frame/.test(t)?{...seenOk,text_visible:true}:{...seenOk,people_count:people(t)}});
 const b=new KitBuilder(root,keys,first.opts);await b.start(job);await until(b,job);await assert.rejects(b.start(job,{redo:'pictures'}),/Choose your host and place first/);
 await b.choose(job);const s1=await until(b,job);assert.equal(s1.saved.pictures.at(-1).check.pass,false);
 const second=fakes();const b2=new KitBuilder(root,keys,second.opts);await b2.start(job,{redo:'pictures'});const s=await until(b2,job);
 assert.equal(s.state,'done',s.error);assert.equal(second.calls.write,0);assert.equal(second.calls.jev,0);assert.equal(second.calls.watch,0);
 assert.equal(second.calls.image,1);assert.equal(s.saved.pictures.at(-1).check.pass,true);assert.deepEqual(s.saved.kit,s1.saved.kit);assert.deepEqual(s.saved.chose,s1.saved.chose);
 await rm(root,{recursive:true});
});

test('a picture the image filter refuses is tried once more, then kept as a flagged gap; the look still finishes; a failed build shows as failed',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes();let refused=0;
 const image=opts.image;opts.image=async a=>{if(/single frame/.test(a.prompt)){refused++;throw new Error('Gemini: HTTP 400. Image generation blocked for unspecified reasons.');}return image(a);};
 const b=new KitBuilder(root,keys,opts);await b.start(job);await until(b,job);await b.choose(job);const s=await until(b,job);
 assert.equal(s.state,'done',s.error);assert.equal(refused,2);const scene=s.saved.pictures.find(p=>p.role==='scene');
 assert.equal(scene.url,null);assert.deepEqual(scene.check.problems,['the image filter refused it']);assert.equal(s.saved.stage,'ready');
 const g=opts.gemini;opts.gemini=async a=>{if(a.schema.required.includes('assets'))throw new Error('Gemini: HTTP 500. down');return g(a);};const b2=new KitBuilder(root,keys,opts);await b2.start(job,{redo:'character'});const f=await until(b2,job);
 assert.equal(f.state,'failed');assert.match(f.error,/HTTP 500/);assert.ok(f.saved);
 await rm(root,{recursive:true});
});

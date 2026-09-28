import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FORMATS,winnerCounts,formatRequest,formatWhy,expertLook,castSize,kitPrompt,checkKit,picturePlan,checkVerdict,estimateKit,STUDY_PROMPT} from '../lib/kit.mjs';
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
 assert.match(checkKit(kit({promise:'Easy tricks and simple health drinks.'}),'ai_host',1).join(),/non-medical/);
 assert.match(kitPrompt({account:'x',format:'ai_host',cast:1,expert:false,study:[],saved}),/stays non-medical/);
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
});

test('the price covers every picture with a check, and the limit allows one retry each',()=>{
 const e=estimateKit('ai_host',1);assert.equal(e.pictures,5);assert.ok(e.usd>0.35&&e.usd<0.5);assert.ok(e.ceiling>e.usd*1.8);
 assert.equal(estimateKit('ai_host',2).pictures,8);assert.equal(estimateKit('hands_pov').pictures,3);assert.equal(estimateKit('visuals').pictures,2);
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
function fakes({kits=[kit()],checks=()=>seenOk,format='ai_host'}={}){
 const calls={watch:0,write:0,image:0,check:0,jev:0,prompts:[],imageRefs:[]};let k=0;
 const gemini=async({model,parts,schema})=>{
  if(schema.required.includes('signature')){calls.watch++;return {json:study,costUsd:0.01};}
  if(schema.required.includes('assets')){calls.write++;calls.prompts.push(parts[0].text);return {json:kits[Math.min(k++,kits.length-1)],costUsd:0.05};}
  calls.check++;const people=parts[parts.length-1].text;return {json:checks(people,calls.check),costUsd:0.002};};
 const image=async({prompt,refs})=>{calls.image++;calls.imageRefs.push(refs.length);return {data:Buffer.from(`img ${calls.image} ${prompt.slice(0,20)}`),mime:'image/jpeg',costUsd:0.067};};
 const jev=async()=>{calls.jev++;return {answers:{format:{choice:format}}};};
 const frame=async()=>Buffer.from('original frame');
 return {calls,opts:{gemini,image,jev,frame}};
}
// A time limit, not a count: the whole suite runs in parallel and 200 short waits was not enough under load.
const until=async(b,job)=>{const end=Date.now()+10000;while(Date.now()<end){const s=await b.status(job);if(s.state!=='working')return s;await new Promise(r=>setTimeout(r,5));}throw new Error('stuck');};
const keys=()=>({gemini:'g',jev:'j'});

test('build: studies 3 winners, Jev picks the format, writes the kit, draws and checks every picture, saves it',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes();
 // The last test-scene check sees 1 person: pass. Place sees 0.
 opts.gemini=((g)=>async a=>{const r=await g(a);if(a.schema.required.includes('looks_like_original')&&/Empty, ready for filming/.test(a.parts.at(-1).text))r.json={...r.json,people_count:0};return r;})(opts.gemini);
 const b=new KitBuilder(root,keys,opts);await b.start(job);const s=await until(b,job);
 assert.equal(s.state,'done',s.error);const k=s.saved;
 assert.equal(calls.watch,3);assert.equal(calls.jev,1);assert.equal(calls.write,1);assert.equal(calls.image,5);assert.equal(calls.check,5);
 assert.deepEqual(calls.imageRefs,[0,1,1,0,2]);
 assert.equal(k.format,'ai_host');assert.equal(k.byJev,true);assert.equal(k.expert,true);assert.equal(k.formatWhy,'In 2 of their 3 best reels, people are on camera.');
 assert.deepEqual(k.pictures.map(p=>p.role),['face0','turn0','body0','place','scene']);assert.ok(k.pictures.every(p=>p.check.pass&&p.attempts===1));
 assert.match(k.pictures[0].url,/^\/channels\/r1\/kit\/face0-[0-9a-f]{12}\.jpg$/);
 assert.match(calls.prompts[0],/never with a white coat/);
 const ledger=JSON.parse(await readFile(join(root,'channels','r1','spend.json'),'utf8'));assert.equal(ledger.length,3+1+5+5);
 assert.equal(Math.round(k.costUsd*1000),Math.round((0.03+0.05+5*0.067+5*0.002)*1000));
 await rm(root,{recursive:true});
});

test('a failed picture is drawn once more with its problems; a second failure is kept and flagged, not hidden',async()=>{
 const {root,job}=await setup();const {calls,opts}=fakes({checks:(t)=>/Plain light grey background, soft even light/.test(t)?{...seenOk,text_visible:true}:{...seenOk,people_count:/Empty, ready/.test(t)?0:1}});
 const b=new KitBuilder(root,keys,opts);await b.start(job);const s=await until(b,job);
 const face=s.saved.pictures[0];assert.equal(face.attempts,2);assert.equal(face.check.pass,false);assert.deepEqual(face.check.problems,['letters or a logo are visible']);
 assert.equal(calls.image,6);await rm(root,{recursive:true});
});

test('new character: same format without Jev, the old hosts are named to avoid, the place picture is reused, the old kit is kept',async()=>{
 const {root,job}=await setup();const placeFix=g=>async a=>{const r=await g(a);if(a.schema.required.includes('looks_like_original')&&/Empty, ready/.test(a.parts.at(-1).text))r.json={...r.json,people_count:0};return r;};
 const first=fakes();first.opts.gemini=placeFix(first.opts.gemini);const b=new KitBuilder(root,keys,first.opts);await b.start(job);await until(b,job);
 const second=fakes({kits:[kit({cast:[{...host,name:'Lale',look:'woman in her forties, tall, long black curly hair'}]})]});second.opts.gemini=placeFix(second.opts.gemini);
 const b2=new KitBuilder(root,keys,second.opts);await b2.start(job,{redo:'character'});const s=await until(b2,job);
 assert.equal(s.state,'done',s.error);assert.equal(second.calls.jev,0);assert.equal(second.calls.watch,0);assert.match(second.calls.prompts[0],/clearly different.*Mira/);
 assert.equal(second.calls.image,4); // face, sheet, body, scene; the place is unchanged
 assert.equal(s.saved.kit.cast[0].name,'Lale');assert.equal(s.saved.approved,false);
 assert.ok((await readdir(join(root,'channels','r1','kit'))).some(f=>/^kit-.*\.json$/.test(f)));
 await rm(root,{recursive:true});
});

test('format switch uses Kaan\'s choice; a kit that misfits twice stops loudly; guards before paying',async()=>{
 const {root,job}=await setup();
 const bad=fakes({kits:[kit()]});const b=new KitBuilder(root,keys,bad.opts);
 await assert.rejects(b.start(job,{redo:'format',format:'hands_pov'}),/Build the kit first/);
 await assert.rejects(b.start(job,{redo:'format',format:'nonsense'}),/Choose a format/);
 await assert.rejects(new KitBuilder(root,()=>({jev:'j'}),bad.opts).start(job),/Gemini key/);
 await assert.rejects(new KitBuilder(root,keys,bad.opts).start({id:'none',creator:'x'}),/Secret first/);
 const hands=fakes({format:'hands_pov',kits:[kit()]});const b2=new KitBuilder(root,keys,hands.opts);await b2.start(job);const s=await until(b2,job);
 assert.equal(s.state,'failed');assert.match(s.error,/did not fit the format twice.*no hosts/);assert.equal(hands.calls.write,2);assert.equal(hands.calls.image,0);
 await rm(root,{recursive:true});
});

test('approve marks the kit as the one to use',async()=>{
 const {root,job}=await setup();const {opts}=fakes();const b=new KitBuilder(root,keys,opts);
 await assert.rejects(b.approve(job),/Build the kit first/);await b.start(job);await until(b,job);
 assert.equal((await b.approve(job)).approved,true);assert.equal((await b.status(job)).saved.approved,true);
 await rm(root,{recursive:true});
});

test('draw flagged pictures again: same kit text, no study, Jev or writing; only the failed picture is paid again',async()=>{
 const {root,job}=await setup();const first=fakes({checks:t=>/single frame/.test(t)?{...seenOk,text_visible:true}:{...seenOk,people_count:/Empty, ready/.test(t)?0:1}});
 const b=new KitBuilder(root,keys,first.opts);await b.start(job);const s1=await until(b,job);assert.equal(s1.saved.pictures.at(-1).check.pass,false);
 const second=fakes({checks:t=>({...seenOk,people_count:/Empty, ready/.test(t)?0:1})});const b2=new KitBuilder(root,keys,second.opts);
 await b2.start(job,{redo:'pictures'});const s=await until(b2,job);
 assert.equal(s.state,'done',s.error);assert.equal(second.calls.write,0);assert.equal(second.calls.jev,0);assert.equal(second.calls.watch,0);
 assert.equal(second.calls.image,1);assert.equal(s.saved.pictures.at(-1).check.pass,true);assert.deepEqual(s.saved.kit,s1.saved.kit);
 await rm(root,{recursive:true});
});

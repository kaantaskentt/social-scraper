// Runs "Make one original reel" for a scan: ideas (Gemini) → Jev ranks them → Kaan picks → script (Gemini) → Jev checks
// it and flags risky shots → one rewrite if needed → exact price (free cost check). Saved in data/channels/<runId>/;
// every paid call goes into data/channels/<runId>/spend.json. Nothing here makes a video.
import {mkdir,readFile} from 'node:fs/promises';
import {readJson,writeJson} from './json.mjs';
import {join} from 'node:path';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {patternFrom,IDEA_SCHEMA,ideaPrompt,judgeIdeaRequest,rankIdeas,SCRIPT_SCHEMA,scriptPrompt,checkScriptRequest,readScriptCheck,priceShots} from './reel-plan.mjs';
import {kitIdeaPrompt,judgeKitIdeaRequest,KIT_SCRIPT_SCHEMA,kitScriptPrompt,remakePrompt,checkKitScriptRequest,readKitScriptCheck,kitPrice} from './kit-reel.mjs';
import {BREAKDOWN_SCHEMA,breakdownPrompt,CRAFT_SCHEMA,craftPrompt,checkCraft} from './craft.mjs';
import {existsSync} from 'node:fs';
import {videoPath} from './videos.mjs';
import {readdir} from 'node:fs/promises';
import {lessonsFrom,lessonsText} from './feedback.mjs';
import {dnaBrief} from './dna.mjs';
import {decideVoice,voiceModeOf,decidePayoff} from './decide.mjs';
import {recordSpend} from './dna-run.mjs';

const AUTO_IDEAS=3; // at most 3 ideas per click: about 2 to 8 cents each (2 rewrites), never a paid video

const ID=/^[\w-]{1,90}$/;
const jevCost=raw=>Number.isFinite(raw?.usage?.input_tokens)?raw.usage.input_tokens*0.042/1e6:0;

export class ReelPlanner{
 constructor(root,keys,{gemini=generate,jev=jevAsk,price=priceShots}={}){this.root=root;this.keys=keys;this.gemini=gemini;this.jev=jev;this.price=price;this.state=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 // The one shared queue per spend.json (lib/dna-run.mjs), so the maker's entries and ours never overwrite each other.
 spend(runId,entry){return recordSpend(join(this.dir(runId),'spend.json'),entry);}
 async paid(runId,step,call){try{const r=await call();await this.spend(runId,{step,usd:r.costUsd||0});return r;}catch(e){if(e.costUsd)await this.spend(runId,{step,usd:e.costUsd,failed:e.message});throw e;}}
 async askJev(runId,step,req,key){return (await this.paid(runId,step,async()=>{const raw=await this.jev(req,key);return {raw,costUsd:jevCost(raw)};})).raw;}
 async status(job){const live=this.state.get(job.id),now=live?{...live}:null;const plan=await readJson(join(this.dir(job.id),'plan.json'));return {state:now?.state||(plan?'ready':'none'),stage:now?.stage||null,error:now?.error||null,plan};}
 begin(job,stage,work){
  if(this.state.get(job.id)?.state==='working')throw new Error('Already working on this reel plan');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');if(!keys.jev)throw new Error('Connect Jev first');
  const live={state:'working',stage,error:null};this.state.set(job.id,live);
  work(keys,live).then(()=>Object.assign(live,{state:'ready',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: reel plan for ${job.id} failed: ${e.message}`);});
  return {...live};
 }
 // The look Kaan chose (Kit step). With one, reels are made from it with Omni; without, the hands-only pilot path.
 async approvedKit(runId){const kit=await readJson(join(this.dir(runId),'kit','kit.json'));return kit?.approved?kit:null;}
 // Lessons from every reel made for this account: its scores and Kaan's taps (the feedback loop).
 async lessons(runId){const base=join(this.dir(runId),'reels');let names=[];try{names=await readdir(base);}catch{}
  const reels=(await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))))).filter(Boolean);return lessonsText(lessonsFrom(reels));}
 // The channel's Winner DNA (its details tested against its own normal), as a brief for the writers and Jev.
 async dna(runId){const d=await readJson(join(this.dir(runId),'dna.json'));return dnaBrief(d);}
 // The full readings (every labelled reel), for decisions that count reels; dna() is the short brief for writers.
 async dnaRaw(runId){return readJson(join(this.dir(runId),'dna.json'));}
 dnaText(brief){return brief&&(brief.do_more.length||brief.do_less.length)?`Winner DNA of this channel, from all its reels (${brief.note}) Lean towards: ${brief.do_more.join('; ')||'nothing specific'}. Lean away from: ${brief.do_less.join('; ')||'nothing specific'}.`:'';}
 // Talking on camera or voice-over, decided from the channel's own readings, with the reason.
 async voiceDecision(runId,kit){const [dna,secret]=await Promise.all([readJson(join(this.dir(runId),'dna.json')),readJson(join(this.root,'secret',runId,'secret.json'))]);return decideVoice({format:kit.format,dna,secret});}
 // Kaan's switch: talking or voice-over for the current script (free; the next reel uses it).
 async setVoice(job,mode){if(!['talking','voiceover'].includes(mode))throw new Error('Choose talking or voice-over');const file=join(this.dir(job.id),'plan.json'),plan=await readJson(file);if(!plan?.script)throw new Error('Write the script first');
  const voice={...plan.voice,mode,why:mode===plan.voice?.auto?plan.voice?.autoWhy:'You chose this.',byKaan:mode!==plan.voice?.auto};await writeJson(file,{...plan,voice,voiceMode:voiceModeOf({mode})});return this.status(job);}
 // One winner, shot by shot (cached per reel). Its transcript from the scan gives the exact words.
 async breakdown(job,id,keys){
  const file=join(this.dir(job.id),'craft',`${id}.json`),cached=await readJson(file);if(cached?.model===MODELS.watch)return cached;
  const video=videoPath(this.root,job.id,id);if(!existsSync(video))throw new Error('This reel has no saved video to study');
  const post=job.posts.find(p=>p.id===id),bytes=await readFile(video);
  const r=await this.paid(job.id,'craft breakdown',()=>this.gemini({key:keys.gemini,model:MODELS.watch,parts:[{video:bytes},{text:breakdownPrompt(post?.status==='music'?'':post?.transcript?.text)}],schema:BREAKDOWN_SCHEMA}));
  const out={id,model:MODELS.watch,breakdown:r.json,at:new Date().toISOString()};await mkdir(join(this.dir(job.id),'craft'),{recursive:true});await writeJson(file,out);return out;
 }
 // The craft of the 6 best reels with a saved video (cached; about 8 cents the first time).
 async craft(job,keys,live){
  const file=join(this.dir(job.id),'craft.json'),saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved)return null;
  const ids=(saved.picked||[]).filter(p=>p.group==='winner'&&existsSync(videoPath(this.root,job.id,p.id))).sort((a,b)=>b.xNormal-a.xNormal).slice(0,6).map(p=>p.id);
  const cached=await readJson(file);if(cached&&cached.ids.join()===ids.join())return cached;if(ids.length<2)return null;
  if(live)live.stage='Studying how their best reels grab you';
  const breakdowns=await Promise.all(ids.map(id=>this.breakdown(job,id,keys)));
  const r=await this.paid(job.id,'craft rules',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:craftPrompt(job.creator,breakdowns)}],schema:CRAFT_SCHEMA,thinking:'low'}));
  const craft={...checkCraft(r.json,ids),ids,at:new Date().toISOString()};await writeJson(file,craft);return craft;
 }
 // Step 1: six ideas, each judged by Jev; code ranks them.
 async startIdeas(job,{angle=null}={}){
  const saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved)throw new Error('Build the Secret for this account first');
  const kit=await this.approvedKit(job.id);
  return this.begin(job,'Writing ideas',async(keys,live)=>{
   const pattern=patternFrom(saved);await mkdir(this.dir(job.id),{recursive:true});
   const craft=kit?await this.craft(job,keys,live):null;if(kit)live.stage='Writing ideas';
   const lessons=kit?await this.lessons(job.id):'',dna=kit?this.dnaText(await this.dna(job.id)):'';
   const made=kit?await this.madeTitles(job.id):[];
   // Familiar with a twist, not the same reel again (research library: familiar-with-a-twist; Ken's lab made one fizz test 6 times).
   const fresh=made.length?`\nAlready made on this channel, do not repeat the same test, ingredient or object: ${made.join('; ')}.`:'';
   const prompt=kit?kitIdeaPrompt(kit.kit,kit.format,pattern,craft,12,angle)+(dna?`\n${dna}`:'')+(lessons?`\n${lessons}`:'')+fresh:ideaPrompt(pattern,saved);
   const out=await this.paid(job.id,'ideas',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:prompt}],schema:IDEA_SCHEMA,thinking:'low'}));
   live.stage='Jev is judging the ideas';const ideas=out.json.ideas.slice(0,kit?12:8);
   // Jev judges all ideas at once (in parallel): about a second instead of one after another.
   const judgments=await Promise.all(ideas.map(idea=>this.askJev(job.id,'judge idea',kit?judgeKitIdeaRequest(idea,pattern,kit.kit,kit.format,craft):judgeIdeaRequest(idea,pattern),keys.jev)));
   const {picked,rejected}=rankIdeas(ideas,judgments);
   await writeJson(join(this.dir(job.id),'plan.json'),{version:1,runId:job.id,account:job.creator,secretCreatedAt:saved.createdAt,...(kit?{mode:'kit',format:kit.format,kitAt:kit.createdAt}:{format:'faceless_hands_voice'}),pattern,picked,rejected,chosen:null,script:null,check:null,price:null,createdAt:new Date().toISOString()});
  });
 }
 // The price is checked again (free) whenever it is older than the current way of pricing (voice text and reference
 // image included since 2026-09-27), so the page never shows a price the maker would refuse.
 async reprice(job){
  const file=join(this.dir(job.id),'plan.json'),plan=await readJson(file);if(!plan?.script)throw new Error('Write the script first');
  if(plan.mode==='kit'){await writeJson(file,{...plan,price:kitPrice(plan.script.parts.length),pricedAt:new Date().toISOString()});return {...await this.status(job)};}
  const price=await this.price(plan.script.shots,{voiceText:plan.script.voiceover.map(v=>v.line).join(' ')});await writeJson(file,{...plan,price,pricedAt:new Date().toISOString()});return {...await this.status(job)};
 }
 // Step 2: the script for the picked idea, checked by Jev; risky shots or broken rules get one rewrite; then prices.
 async startScript(job,index){
  const file=join(this.dir(job.id),'plan.json'),plan=await readJson(file);if(!plan)throw new Error('Make the ideas first');
  const pick=plan.picked[index];if(!pick)throw new Error('Pick one of the ideas');
  if(plan.mode==='kit')return this.startKitScript(job,plan,index,pick);
  return this.begin(job,'Writing the script',async(keys,live)=>{
   const write=extra=>this.paid(job.id,'script',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:scriptPrompt(pick.idea,plan.pattern)+extra}],schema:SCRIPT_SCHEMA,thinking:'low'}));
   let script=(await write('')).json;live.stage='Jev is checking the script';
   let check=readScriptCheck(await this.askJev(job.id,'check script',checkScriptRequest(script),keys.jev),script),rewritten=false;
   if(!check.pass){live.stage='Fixing what Jev flagged';rewritten=true;
    script=(await write(`\nA reviewer flagged these problems in an earlier draft; fix every one: ${check.problems.join('; ')}. Replace risky shots with hands-only close-ups of simple objects.`)).json;
    check=readScriptCheck(await this.askJev(job.id,'check script',checkScriptRequest(script),keys.jev),script);}
   live.stage='Pricing the shots';const price=await this.price(script.shots,{voiceText:script.voiceover.map(v=>v.line).join(' ')});
   await writeJson(file,{...plan,chosen:index,script,check:{...check,rewritten},price,scriptAt:new Date().toISOString()});
  });
 }
 // Step 2 with a kit: 2 or 3 parts for Omni, written with the winners' craft. Code checks timing, speakers and the
 // ending; Jev checks feeling, risk and how gripping it is; one rewrite.
 async startKitScript(job,plan,index,pick){
  const kit=await this.approvedKit(job.id);if(!kit||kit.createdAt!==plan.kitAt)throw new Error('Your look changed since these ideas. Get new ideas first.');
  return this.begin(job,'Writing the script',async(keys,live)=>{
   const craft=await this.craft(job,keys,live),voice=await this.voiceDecision(job.id,kit),result=decidePayoff({dna:await this.dnaRaw(job.id)});
   // Autopilot (Kaan, 2026-09-28: a blocked script was a dead end): a blocked idea hands over to the next best idea
   // not yet blocked or made, up to AUTO_IDEAS ideas; the page shows a script that passed, and why the others did not.
   const made=await this.madeIdeas(job.id,plan),blocked=[...(plan.blocked||[])].filter(b=>b.index!==index);
   const order=[index,...plan.picked.map((_,i)=>i).filter(i=>i!==index&&!made.has(i)&&!blocked.some(b=>b.index===i))].slice(0,AUTO_IDEAS);
   let last;
   for(const i of order){
    const idea=plan.picked[i].idea;live.idea=i;live.stage=last?`Jev stopped "${plan.picked[last.i].idea.title}". Trying "${idea.title}"`:'Writing the script';
    const {script,check}=await this.writeChecked(job,kit,craft,kitScriptPrompt(idea,kit.kit,kit.format,plan.pattern,craft,voice.mode,result.payoff),keys,live,voice.mode,result.payoff);
    last={i,script,check};if(check.pass)break;
    blocked.push({index:i,title:idea.title,problems:check.problems,at:new Date().toISOString()});
   }
   await writeJson(join(this.dir(job.id),'plan.json'),{...plan,chosen:last.i,script:last.script,check:last.check,blocked:blocked.filter(b=>b.index!==last.i||!last.check.pass),result,voice:{...voice,auto:voice.mode,autoWhy:voice.why},voiceMode:voiceModeOf(voice),price:kitPrice(last.script.parts.length),scriptAt:new Date().toISOString()});
  });
 }
 // Every reel title made on this channel (any plan), for the idea writer.
 async madeTitles(runId){
  const base=join(this.dir(runId),'reels');let names=[];try{names=await readdir(base);}catch{}
  return [...new Set((await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))))).map(r=>r?.title).filter(Boolean))];
 }
 // Ideas of this plan that already have a reel (so the autopilot does not make the same one twice).
 async madeIdeas(runId,plan){
  const base=join(this.dir(runId),'reels');let names=[];try{names=await readdir(base);}catch{}
  const reels=await Promise.all(names.map(n=>readJson(join(base,n,'reel.json'))));
  return new Set(reels.filter(r=>r&&r.planAt===plan.createdAt&&Number.isInteger(r.idea)).map(r=>r.idea));
 }
 async writeChecked(job,kit,craft,prompt,keys,live,mode='voiceover',payoff=true){
  const lessons=await this.lessons(job.id),dnaB=await this.dna(job.id),dna=this.dnaText(dnaB);if(dna)prompt+=`\n${dna}`;if(lessons)prompt+=`\n${lessons}`;
  const write=extra=>this.paid(job.id,'script',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:prompt+extra}],schema:KIT_SCRIPT_SCHEMA,thinking:'low'}));
  const check=async script=>readKitScriptCheck(await this.askJev(job.id,'check script',checkKitScriptRequest(script,craft,dnaB),keys.jev),script,kit.kit,kit.format,mode,payoff);
  let script=(await write('')).json;live.stage='Jev is checking the script';let result=await check(script),rewritten=false;
  // Up to two rewrites: the writer often misses word counts once (35 words where 28 fit, 2026-09-28); a rewrite costs
  // about 2 cents, a failed reel about 2 dollars.
  for(let n=0;n<2&&!result.pass;n++){live.stage='Fixing what Jev flagged';rewritten=true;
   script=(await write(`\nA reviewer flagged these problems in an earlier draft; fix every one: ${result.problems.join('; ')}. Count the spoken words of every part before answering. Keep every action simple.\nThe earlier draft: ${JSON.stringify(script)}`)).json;result=await check(script);}
  return {script,check:{...result,rewritten}};
 }
 // Remake one of the channel's winners with our look: same proven shots and payoffs, our hosts, our words, true claims.
 async startRemake(job,postId){
  const kit=await this.approvedKit(job.id);if(!kit)throw new Error('Choose your look first (Kit step)');
  const saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved)throw new Error('Build the Secret for this account first');
  if(!job.posts.some(p=>p.id===postId))throw new Error('Pick one of this account\'s reels');
  return this.begin(job,'Studying the reel shot by shot',async(keys,live)=>{
   await mkdir(this.dir(job.id),{recursive:true});const b=await this.breakdown(job,postId,keys),craft=await this.craft(job,keys,live),voice=await this.voiceDecision(job.id,kit);
   // The channel's payoff decision, as for a new script: remakes ignored it, so a channel that teaches movements got the
   // close-up quota and had every remake blocked (audit, 2026-09-29).
   const result=decidePayoff({dna:await this.dnaRaw(job.id)});
   live.stage='Writing the remake';let {script,check}=await this.writeChecked(job,kit,craft,remakePrompt(b.breakdown,kit.kit,kit.format,craft,voice.mode,result.payoff),keys,live,voice.mode,result.payoff);
   // A remake keeps the original's subject: a sweet potato ice cream remake drifted into an egg test while its rewrites
   // fixed Jev's objections, and was filmed ($3.28, 2026-09-28).
   const same=(await this.askJev(job.id,'remake subject',{model:'jev-latest',state:{original:b.breakdown,remake:script},questions:{same_subject:{type:'noul',instructions:'Is `remake` about the same subject as `original` (the same dish, object or trick), even with different people and words?',criteria:{true:'Yes, the same subject',false:'No, it is about something else'}}}},keys.jev))?.answers?.same_subject?.noul;
   if(!(same>=0.5))check={...check,pass:false,problems:[...check.problems,`The remake drifted to a different subject (Jev ${Number(same??0).toFixed(2)})`]};
   const idea={title:script.hook_title,hook_line:script.parts[0].beats[0].says||script.parts[0].beats[0].does,remakeOf:postId};
   await writeJson(join(this.dir(job.id),'plan.json'),{version:1,runId:job.id,account:job.creator,secretCreatedAt:saved.createdAt,mode:'kit',source:'remake',remakeOf:postId,format:kit.format,kitAt:kit.createdAt,pattern:patternFrom(saved),
    picked:[{idea,scores:null,total:null}],rejected:[],chosen:0,script,check,result,voice:{...voice,auto:voice.mode,autoWhy:voice.why},voiceMode:voiceModeOf(voice),price:kitPrice(script.parts.length),createdAt:new Date().toISOString(),scriptAt:new Date().toISOString()});
  });
 }
}

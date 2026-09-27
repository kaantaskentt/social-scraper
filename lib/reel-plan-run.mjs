// Runs "Make one original reel" for a scan: ideas (Gemini) → Jev ranks them → Kaan picks → script (Gemini) → Jev checks
// it and flags risky shots → one rewrite if needed → exact price (free cost check). Saved in data/channels/<runId>/;
// every paid call goes into data/channels/<runId>/spend.json. Nothing here makes a video.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {generate} from './gemini.mjs';
import {jevAsk,MODELS} from './secret-run.mjs';
import {patternFrom,IDEA_SCHEMA,ideaPrompt,judgeIdeaRequest,rankIdeas,SCRIPT_SCHEMA,scriptPrompt,checkScriptRequest,readScriptCheck,priceShots} from './reel-plan.mjs';

const ID=/^[\w-]{1,90}$/;
async function writeJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,1));await rename(temp,file);}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
const jevCost=raw=>Number.isFinite(raw?.usage?.input_tokens)?raw.usage.input_tokens*0.042/1e6:0;

export class ReelPlanner{
 constructor(root,keys,{gemini=generate,jev=jevAsk,price=priceShots}={}){this.root=root;this.keys=keys;this.gemini=gemini;this.jev=jev;this.price=price;this.state=new Map();this.ledgers=new Map();}
 dir(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId);}
 spend(runId,entry){const file=join(this.dir(runId),'spend.json');const next=(this.ledgers.get(runId)||Promise.resolve()).catch(()=>{}).then(async()=>{const list=await readJson(file)||[];list.push({at:new Date().toISOString(),...entry});await writeJson(file,list);});this.ledgers.set(runId,next);return next;}
 async paid(runId,step,call){try{const r=await call();await this.spend(runId,{step,usd:r.costUsd||0});return r;}catch(e){if(e.costUsd)await this.spend(runId,{step,usd:e.costUsd,failed:e.message});throw e;}}
 async askJev(runId,step,req,key){return (await this.paid(runId,step,async()=>{const raw=await this.jev(req,key);return {raw,costUsd:jevCost(raw)};})).raw;}
 async status(job){const live=this.state.get(job.id);const plan=await readJson(join(this.dir(job.id),'plan.json'));return {state:live?.state||(plan?'ready':'none'),stage:live?.stage||null,error:live?.error||null,plan};}
 begin(job,stage,work){
  if(this.state.get(job.id)?.state==='working')throw new Error('Already working on this reel plan');
  const keys=this.keys();if(!keys.gemini)throw new Error('Add your Gemini key first (GEMINI_API_KEY)');if(!keys.jev)throw new Error('Connect Jev first');
  const live={state:'working',stage,error:null};this.state.set(job.id,live);
  work(keys,live).then(()=>Object.assign(live,{state:'ready',stage:null}),e=>{Object.assign(live,{state:'failed',error:e.message});console.error(`Social Scraper: reel plan for ${job.id} failed: ${e.message}`);});
  return {...live};
 }
 // Step 1: six ideas, each judged by Jev; code ranks them and removes health claims and doubtful demos.
 async startIdeas(job){
  const saved=await readJson(join(this.root,'secret',job.id,'secret.json'));if(!saved)throw new Error('Build the Secret for this account first');
  return this.begin(job,'Writing ideas',async(keys,live)=>{
   const pattern=patternFrom(saved);await mkdir(this.dir(job.id),{recursive:true});
   const out=await this.paid(job.id,'ideas',()=>this.gemini({key:keys.gemini,model:MODELS.write,parts:[{text:ideaPrompt(pattern,saved)}],schema:IDEA_SCHEMA,thinking:'low'}));
   live.stage='Jev is judging the ideas';const ideas=out.json.ideas.slice(0,8),judgments=[];
   for(const idea of ideas)judgments.push(await this.askJev(job.id,'judge idea',judgeIdeaRequest(idea,pattern),keys.jev));
   const {picked,rejected}=rankIdeas(ideas,judgments);
   await writeJson(join(this.dir(job.id),'plan.json'),{version:1,runId:job.id,account:job.creator,secretCreatedAt:saved.createdAt,format:'faceless_hands_voice',pattern,picked,rejected,chosen:null,script:null,check:null,price:null,createdAt:new Date().toISOString()});
  });
 }
 // Step 2: the script for the picked idea, checked by Jev; risky shots or broken rules get one rewrite; then prices.
 async startScript(job,index){
  const file=join(this.dir(job.id),'plan.json'),plan=await readJson(file);if(!plan)throw new Error('Make the ideas first');
  const pick=plan.picked[index];if(!pick)throw new Error('Pick one of the ideas');
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
}

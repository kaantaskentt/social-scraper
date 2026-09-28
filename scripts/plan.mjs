// The app's idea and script steps from the command line (no server needed):
//   node scripts/plan.mjs <runId> ideas ["angle"]  → new ranked ideas (a few cents), optionally from one angle
//   node scripts/plan.mjs <runId> script <index>   → the autopilot writes and checks a script (up to 3 ideas)
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {lockChannel} from './lock.mjs';
import {parseEnv} from 'node:util';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
const [runId,command,arg]=process.argv.slice(2);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));
lockChannel(ROOT,runId,`plan ${command}`);
const p=new ReelPlanner(ROOT,()=>({gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY}));
if(command==='ideas')await p.startIdeas(job,{angle:arg||null});else if(command==='script')await p.startScript(job,Number(arg));else throw new Error('ideas or script <index>');
let last='';for(;;){const s=p.state.get(runId);if(s?.stage&&s.stage!==last){console.log(s.stage);last=s.stage;}if(s?.state!=='working'){if(s?.state==='failed')throw new Error(s.error);break;}await new Promise(r=>setTimeout(r,2000));}
const plan=JSON.parse(await readFile(join(ROOT,'channels',runId,'plan.json'),'utf8'));
if(command==='ideas')for(const [i,x] of plan.picked.entries())console.log(`${i}. ${x.idea.title} | total ${x.total} | new ${x.scores.novel} pain ${x.scores.pain_point} payoff ${x.scores.payoff} ai ${x.scores.ai_ready} | "${x.idea.hook_line}"`);
else console.log(JSON.stringify({chosen:plan.chosen,title:plan.picked[plan.chosen].idea.title,pass:plan.check.pass,problems:plan.check.problems,blocked:(plan.blocked||[]).map(b=>b.title),hook:plan.script.hook_title,lines:plan.script.parts.flatMap(x=>x.beats.map(b=>b.says)).filter(Boolean)}));

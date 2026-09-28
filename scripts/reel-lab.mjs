// The reel lab: make several test reels from one channel's look IN PARALLEL, then score them against the
// channel's winners with the same rubric (lib/reel-score.mjs). Each variant gets its own lab channel
// (data/channels/lab-<name>), linked to the real account's Secret, videos, kit and craft, so the app's own planner
// and maker do the work exactly as in the app.
//   node scripts/reel-lab.mjs <runId> ideas                       → 12 ranked ideas (a few cents)
//   node scripts/reel-lab.mjs <runId> kit <name> <format>          → a look in a lab channel (the real look is untouched)
//   node scripts/reel-lab.mjs <runId> make <name>=idea:3[@kitname] <name>=remake:<postId> ... [--max-usd 10]
import {readFile,writeFile,mkdir,symlink,readdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {ReelPlanner} from '../lib/reel-plan-run.mjs';
import {ReelMaker} from '../lib/reel-make.mjs';
import {KitBuilder} from '../lib/kit-run.mjs';
import {generate} from '../lib/gemini.mjs';
import {jevAsk} from '../lib/secret-run.mjs';
import {SCORE_SCHEMA,SCORE_PROMPT,PARTS,total,verdictRequest} from '../lib/reel-score.mjs';

const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local'),...process.env};
const keys=()=>({gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY,groq:env.GROQ_API_KEY});
const [runId,command,...args]=process.argv.slice(2);
const maxUsd=Number(args.includes('--max-usd')?args[args.indexOf('--max-usd')+1]:10);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));
const until=async get=>{for(;;){const s=await get();if(!['working'].includes(s.state))return s;await new Promise(r=>setTimeout(r,3000));}};

// A lab channel shares the real account's Secret, videos, kit and craft (links, nothing copied twice).
async function lab(name,kitFrom=null){
 const id=`lab-${name}`,ch=join(ROOT,'channels',id),real=join(ROOT,'channels',runId),kitDir=kitFrom?join(ROOT,'channels',`lab-${kitFrom}`,'kit'):join(real,'kit');
 const link=async(target,path)=>{if(!existsSync(path))await symlink(target,path);};
 await mkdir(ch,{recursive:true});await link(join(ROOT,'secret',runId),join(ROOT,'secret',id));await link(join(ROOT,'videos',runId),join(ROOT,'videos',id));
 if(!kitFrom||name!==kitFrom)await link(kitDir,join(ch,'kit'));if(existsSync(join(real,'craft')))await link(join(real,'craft'),join(ch,'craft'));
 if(existsSync(join(real,'craft.json')))await copyFile(join(real,'craft.json'),join(ch,'craft.json'));
 return {...job,id};
}
const planner=new ReelPlanner(ROOT,keys),maker=new ReelMaker(ROOT,keys);

if(command==='kit'){
 const [name,format]=args;const j=await lab(name,name),kits=new KitBuilder(ROOT,keys);
 // A format given here is used from the first build (no paid build in another format first).
 await kits.start(j,format?{format}:{});const s=await until(()=>kits.status(j));if(s.state==='failed')throw new Error(s.error);
 // The lab takes Jev's pick of the host and place options (the app lets Kaan choose).
 const o=s.saved.options;console.log('options',o.casts.map(c=>`${c.hosts.map(h=>h.name).join('&')}:${c.score}`).join(' '),'| places',o.places.map(p=>p.score).join(' '),'| pick',JSON.stringify({cast:o.pick.cast?.index,place:o.pick.place?.index}));
 await kits.choose(j);const c=await until(()=>kits.status(j));if(c.state==='failed')throw new Error(c.error);
 const k=await kits.approve(j);console.log(k.format,k.kit.name,'$'+k.costUsd,k.pictures.map(p=>`${p.role}:${p.check.pass?'ok':p.check.problems.join('/')}`).join(' '));
}
if(command==='ideas'){
 // ideas [@kitname]: a lab look can be used for the ideas too.
 const kitFrom=args.find(a=>a.startsWith('@'))?.slice(1)||null,j=await lab(kitFrom?`ideas-${kitFrom}`:'ideas',kitFrom);await planner.startIdeas(j);const s=await until(()=>planner.status(j));if(s.state==='failed')throw new Error(s.error);
 // The craft study is shared: copy it back to the real account so every lab and the app reuse it.
 await mkdir(join(ROOT,'channels',runId),{recursive:true}); // a freshly scanned account has no folder yet
 for(const f of ['craft.json'])if(existsSync(join(ROOT,'channels',j.id,f)))await copyFile(join(ROOT,'channels',j.id,f),join(ROOT,'channels',runId,f));
 s.plan.picked.forEach((p,i)=>console.log(`${i}\t${p.total}\t${p.idea.title}\t| ${p.idea.pattern_used||''} | ${p.idea.why_true}`));
 for(const r of s.plan.rejected)console.log(`rejected\t${r.idea.title}\t(${r.reason})`);
}
if(command==='make'){
 // name=idea:3, name=remake:<postId>; add @kitname for a lab look and +voice for the designed voices.
 const variants=args.filter(a=>a.includes('=')).map(a=>{const [name,raw]=a.split('=');const voice=raw.endsWith('+voice'),full=raw.replace(/\+voice$/,'');const [spec,kitFrom]=full.split('@');const [kind,arg]=spec.split(':');return {name,kind,arg,kitFrom:kitFrom||null,voice};});
 const ideasFor=async v=>JSON.parse(await readFile(join(ROOT,'channels',v.kitFrom?`lab-ideas-${v.kitFrom}`:'lab-ideas','plan.json'),'utf8').catch(()=>'null'));
 // 1 Scripts (cheap), all at once.
 const planned=await Promise.all(variants.map(async v=>{
  const j=await lab(v.name,v.kitFrom);
  if(v.kind==='idea'){const ideas=await ideasFor(v);if(!ideas)throw new Error('Run "ideas" first');const kit=JSON.parse(await readFile(join(ROOT,'channels',j.id,'kit','kit.json'),'utf8'));
   await writeFile(join(ROOT,'channels',j.id,'plan.json'),JSON.stringify({...ideas,format:kit.format,kitAt:kit.createdAt,createdAt:new Date().toISOString()}));await planner.startScript(j,Number(v.arg));}
  else await planner.startRemake(j,v.arg);
  const s=await until(()=>planner.status(j));if(s.state==='failed')return {...v,j,error:s.error};
  if(v.voice){const f=join(ROOT,'channels',j.id,'plan.json');await writeFile(f,JSON.stringify({...s.plan,voiceMode:'designed'}));s.plan.voiceMode='designed';}
  return {...v,j,plan:s.plan};}));
 for(const p of planned){if(p.error){console.log(`${p.name}: script failed: ${p.error}`);continue;}console.log(`${p.name}: "${p.plan.script.hook_title}" ${p.plan.script.parts.length} parts, $${p.plan.price.usd}, check ${p.plan.check.pass?'passed':'FAILED: '+p.plan.check.problems.join('; ')}, gripping ${p.plan.check.gripping}`);}
 const go=planned.filter(p=>p.plan?.check?.pass),cost=go.reduce((a,p)=>a+p.plan.price.usd,0);
 if(cost>maxUsd)throw new Error(`These reels would cost $${cost.toFixed(2)}, over the --max-usd ${maxUsd}`);
 // 2 Reels, all in parallel.
 await Promise.all(go.map(p=>maker.start(p.j,{confirmCredits:p.plan.price.usd})));
 const made=await Promise.all(go.map(async p=>{const s=await until(()=>maker.status(p.j));return {...p,status:s,reel:s.reels.find(r=>r.planAt===p.plan.createdAt)};}));
 // 3 Scores against the two best originals.
 const winners=JSON.parse(await readFile(join(ROOT,'secret',runId,'secret.json'),'utf8')).picked.filter(p=>p.group==='winner').sort((a,b)=>b.xNormal-a.xNormal).slice(0,2);
 // The judge is noisy (the same winner scored 6.3 to 7.6 across runs), so every reel is scored 3 times and averaged,
 // and ours are read against the originals of the same run.
 const once=async file=>(await generate({key:env.GEMINI_API_KEY,model:'gemini-3.8-flash',parts:[{video:await readFile(file)},{text:SCORE_PROMPT}],schema:SCORE_SCHEMA})).json;
 const watch=async file=>{const r=await Promise.all([0,1,2].map(()=>once(file)));const avg=Object.fromEntries(PARTS.map(k=>[k,Math.round(r.reduce((a,x)=>a+x[k],0)/3*10)/10]));return {...r[0],...avg};};
 const originals=await Promise.all(winners.map(w=>watch(join(ROOT,'videos',runId,`${w.id}.mp4`))));
 console.log(['reel',...PARTS,'total','jev'].join('\t'));
 originals.forEach((o,i)=>console.log([`orig${i+1}`,...PARTS.map(k=>o[k]),total(o),''].join('\t')));
 for(const m of made){
  if(!m.reel?.video){console.log(`${m.name}: not made: ${m.status.error}`);continue;}
  const s=await watch(m.reel.video),v=await jevAsk(verdictRequest(s,originals),env.TYPESAFE_API_KEY);
  const base=originals.reduce((a,o)=>a+total(o),0)/originals.length;
  console.log([m.name,...PARTS.map(k=>s[k]),total(s),v.answers.as_gripping.score.toFixed(2),`${Math.round(total(s)/base*100)}% of the winners`].join('\t'),`\n   gap: ${v.answers.main_gap.choice} | fix: ${s.fix} | spent $${m.reel.spentUsd} | ${m.reel.video}`);
 }
}

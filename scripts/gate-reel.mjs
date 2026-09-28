// Runs the final check (Claude + Jev) and the rank (vs 5 typical reels) on reels that already exist, and saves both on
// the reel: node scripts/gate-reel.mjs <runId> [reelId ...]   (all the channel's reels when none are named)
// About 3 cents for the check and 5 cents for the rank per reel.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {tmpdir} from 'node:os';
import {ReelMaker} from '../lib/reel-make.mjs';
import {transcribeWords,linesHeard,alignScript} from '../lib/captions.mjs';

const exec=promisify(execFile);
const ROOT=new URL('../data/',import.meta.url).pathname;
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
const keys={gemini:env.GEMINI_API_KEY,jev:env.TYPESAFE_API_KEY,groq:env.GROQ_API_KEY,anthropic:env.ANTHROPIC_API_KEY};
const [runId,...ids]=process.argv.slice(2);
const job=JSON.parse(await readFile(join(ROOT,'runs',`${runId}.json`),'utf8'));
const maker=new ReelMaker(ROOT,()=>keys),base=join(ROOT,'channels',runId,'reels');
const plan=JSON.parse(await readFile(join(ROOT,'channels',runId,'plan.json'),'utf8').catch(()=>'null'));
const ledger=e=>maker.spendLedger(runId,e);
for(const id of ids.length?ids:await readdir(base)){
 const file=join(base,id,'reel.json'),reel=JSON.parse(await readFile(file,'utf8'));
 // The script only when this reel was made from the current plan (older reels are checked on what is said and shown).
 const script=plan&&reel.planAt===plan.createdAt&&reel.idea===plan.chosen?plan.script:null;
 const audio=join(tmpdir(),`gate-${id}.mp3`);await exec('ffmpeg',['-v','error','-y','-i',reel.video,'-vn','-ac','1','-ar','16000',audio]);
 const words=await transcribeWords(audio,keys.groq),said=script?script.parts.flatMap(p=>p.beats.map(b=>b.says)).filter(Boolean):null;
 const heard=said?linesHeard(said,alignScript(said.join(' '),words)):reel.heard||null;
 reel.check=await maker.finalCheck(job,reel.video,script,words,heard,keys,ledger).catch(e=>({error:e.message}));
 reel.rank=await maker.rankReel(job,reel.video,keys,ledger).catch(e=>({error:e.message}));
 await writeFile(file,JSON.stringify(reel,null,1));
 console.log(`${id}: ${reel.check.level||reel.check.error||reel.check.skipped} ${[...(reel.check.problems||[]),...(reel.check.weaknesses||[])].join(' | ').slice(0,260)}\n   ${reel.rank.sentence||reel.rank.error||reel.rank.skipped}`);
}

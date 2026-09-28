// The second checker's exam: node scripts/checker-eval.mjs [model]
// Reels whose right answer was verified by eye or by code on 2026-09-28. Run after any change to lib/claude-check.mjs.
// History: data/experiments/checker-eval.jsonl
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {frames,claudeCheck,checkVerdict,confirmClaims,CLAUDE_MODEL} from '../lib/claude-check.mjs';
import {jevAsk} from '../lib/secret-run.mjs';
import {transcribeWords,linesHeard,alignScript} from '../lib/captions.mjs';
import {mediaSeconds} from '../lib/render-reel.mjs';

const exec=promisify(execFile);
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
const D=new URL('../data/channels/',import.meta.url).pathname,E=new URL('../evals/',import.meta.url).pathname;
const script=async f=>f?JSON.parse(await readFile(join(E,f),'utf8')):null;
const KEN='a444f915-b549-4b73-bbde-664c3aea9216/reels/',NAT='cd88abf1-e0ac-4497-bc38-d32756318418/reels/1-tarnished-silver-polish-5bcebe/';
export const CASES=[
 {name:'silver now: all lines heard, spoon never shiny',file:NAT+'reel.mp4',script:'qa/silver.json',level:'broken'},
 {name:'silver before: advice cut off, spoon never shiny',file:NAT+'reel-before-1790616010931.mp4',script:'qa/silver.json',level:'broken'},
 {name:'egg before: garbled "Comment Egg G" ending',file:KEN+'0-egg-freshness-float-91c221/reel-before-1790615952073.mp4',script:null,level:'broken'},
 {name:'celery before: promises instructions we do not have',file:KEN+'0-revive-limp-celery/reel-before-1790616167898.mp4',script:null,level:'broken'},
 {name:'egg now: clean ending, but no floating egg is ever shown',file:KEN+'0-egg-freshness-float-91c221/reel.mp4',script:null,level:'weak'},
 {name:'celery now: the snap lands on "snap"',file:KEN+'0-revive-limp-celery/reel.mp4',script:null,level:'good'},
 {name:'baking soda talking hosts: both glasses foam, contrast unclear',file:KEN+'0-testing-baking-soda-activity-419945/reel.mp4',script:'qa/ken-baking-soda.json',level:'weak'},
 {name:'fizz final (voice-over)',file:'lab-fizzfinal/reels/0-baking-powder-fizz-test-3472d4/reel.mp4',script:'qa/fizz-final.json',level:'good'},
 {name:'bicep curl final (animated)',file:'lab-zenfinal/reels/0-bicep-curl-isolation-357d7b/reel.mp4',script:'checker/lab-zenfinal.json',level:'good'},
 {name:'fizz with DNA (voice-over)',file:'lab-dnafizz/reels/0-baking-powder-fizz-test-88c651/reel.mp4',script:'checker/lab-dnafizz.json',level:'good'},
];
// Code's measurements for a reel: timed transcript, silences, whether speech runs into the end card, lines heard.
export async function measure(file,s,groqKey){
 const seconds=await mediaSeconds(file),audio=join(tmpdir(),`chk-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
 await exec('ffmpeg',['-v','error','-y','-i',file,'-vn','-ac','1','-ar','16000',audio]);
 const words=await transcribeWords(audio,groqKey),transcript=words.map(w=>[Math.round(w.start*10)/10,w.text]);
 const said=s?s.parts.flatMap(p=>p.beats.map(b=>b.says)).filter(Boolean):null;
 const heard=said?linesHeard(said,alignScript(said.join(' '),words)):null;
 return {transcript,measures:{seconds:Math.round(seconds*10)/10,first_word_at:words[0]?.start??null,lines_not_heard:heard?heard.missing:'no script'}};
}
const model=process.argv[2]||CLAUDE_MODEL,rows=[],usage={input:0,output:0};
await Promise.all(CASES.map(async c=>{
 const s=await script(c.script),file=join(D,c.file),{transcript,measures}=await measure(file,s,env.GROQ_API_KEY);
 const {report,usage:u}=await claudeCheck({key:env.ANTHROPIC_API_KEY,images:await frames(file),script:s,transcript,measures,model});
 usage.input+=u.input_tokens||0;usage.output+=u.output_tokens||0;
 const v=checkVerdict(await confirmClaims(report,{jev:jevAsk,key:env.TYPESAFE_API_KEY}));
 // Right = the same post/no-post call; exact = the same level too.
 rows.push({name:c.name,want:c.level,level:v.level,right:v.pass===(c.level!=='broken'),exact:v.level===c.level,problems:[...v.problems,...v.weaknesses],swipe:report.swipe_second});
}));
const right=rows.filter(r=>r.right).length;
for(const r of rows)console.log(`${r.right?'✓':'✗'}${r.exact?'✓':' '} ${r.name}: ${r.level} (want ${r.want})${r.problems.length?` · ${r.problems.join(' | ').slice(0,300)}`:''}`);
console.log(`post/no-post ${right} of ${rows.length} right, exact level ${rows.filter(r=>r.exact).length} of ${rows.length} · ${model} · tokens in ${usage.input}, out ${usage.output}`);
await mkdir(new URL('../data/experiments/',import.meta.url),{recursive:true});
await appendFile(new URL('../data/experiments/checker-eval.jsonl',import.meta.url),JSON.stringify({at:new Date().toISOString(),model,right,of:rows.length,usage,rows})+'\n');

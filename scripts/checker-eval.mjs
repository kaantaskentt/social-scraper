// The second checker's exam: node scripts/checker-eval.mjs [model] [--k=3]
// Reels whose right answer was verified by eye or by code on 2026-09-28. Run after any change to lib/claude-check.mjs.
// Each reel is judged k times (3 by default) and the majority counts: the checker flipped on 5 of 10 reels across three
// runs. The score is printed next to what an always-post checker gets (6 of 10), with broken reels caught out of 4.
// History: data/experiments/checker-eval.jsonl
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {frames,claudeCheck,checkVerdict,CLAUDE_MODEL} from '../lib/claude-check.mjs';
import {jevAsk} from '../lib/secret-run.mjs';
import {transcribeWords,linesHeard,alignScript} from '../lib/captions.mjs';
import {mediaSeconds} from '../lib/render-reel.mjs';
import {repeats,plainArgs,tally,byGroup,baselines,flips,lastRun,flipLine,freeze} from '../evals/kit.mjs';

const exec=promisify(execFile);
const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(parseEnv).catch(()=>({}));
const env={...await read('../../office/.env.local'),...await read('../../JEV/.env.local')};
// The reels are copied into data/evals-frozen/checker on the first run and graded from there: a re-edit overwrites
// reel.mp4 in place (the celery reel changed between two runs), which would change a case under its old label
// (audit, 2026-09-29). A live reel changed after LABELED (the last run on the labelled bytes) is refused, not frozen.
const D=new URL('../data/channels/',import.meta.url).pathname,E=new URL('../evals/',import.meta.url).pathname,FROZEN=new URL('../data/evals-frozen/checker/',import.meta.url).pathname;
const LABELED='2026-09-28T22:06:00Z';
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
const model=plainArgs()[0]||CLAUDE_MODEL,k=repeats(),rows=[],usage={input:0,output:0},LOG=new URL('../data/experiments/checker-eval.jsonl',import.meta.url);
await Promise.all(CASES.map(async c=>{
 const s=await script(c.script),{file,sha256}=await freeze(join(D,c.file),join(FROZEN,c.file),{labeledAt:c.labeledAt||LABELED});
 // Code's measurements are made once; the checker's judgement is the part that varies, so it runs k times.
 const {transcript,measures}=await measure(file,s,env.GROQ_API_KEY),images=await frames(file);
 const runs=await Promise.all(Array.from({length:k},async()=>{
  const {report,usage:u}=await claudeCheck({key:env.ANTHROPIC_API_KEY,images,script:s,transcript,measures,model});
  usage.input+=u.input_tokens||0;usage.output+=u.output_tokens||0;
  return {v:checkVerdict(report),swipe:report.swipe_second};
 }));
 // Right = the same post/no-post call by majority; exact = the same level by majority too.
 const post=tally(runs.map(r=>r.v.pass),c.level!=='broken'),level=tally(runs.map(r=>r.v.level),c.level);
 rows.push({name:c.name,want:c.level,class:c.level==='broken'?'broken':'post',...post,levels:level.votes,level:level.majority,exact:level.right,sha256,problems:runs.map(r=>[...r.v.problems,...r.v.weaknesses]),swipe:runs.map(r=>r.swipe)});
}));
const right=rows.filter(r=>r.right).length,cls=byGroup(rows,'class'),bl=baselines(rows.map(r=>r.want!=='broken'),[true,false]);
const prev=await lastRun(LOG,r=>r.model===model),f=flips(prev,rows);
for(const r of rows){const p=r.problems.find(x=>x.length)||[];console.log(`${r.right?'✓':'✗'}${r.exact?'✓':' '} ${r.name}: ${r.levels.join(', ')} (want ${r.want}) · agreement ${r.agreement}${p.length?` · ${p.join(' | ').slice(0,300)}`:''}`);}
console.log(`post/no-post ${right} of ${rows.length} right by majority of ${k} (always post would get ${bl.true}, always broken ${bl.false}) · broken caught ${cls.broken?.right??0} of ${cls.broken?.of??0} · good or weak passed ${cls.post?.right??0} of ${cls.post?.of??0} · exact level ${rows.filter(r=>r.exact).length} of ${rows.length}`);
console.log(`${flipLine(f)} · ${model} · tokens in ${usage.input}, out ${usage.output}`);
await mkdir(new URL('../data/experiments/',import.meta.url),{recursive:true});
await appendFile(LOG,JSON.stringify({at:new Date().toISOString(),model,k,right,of:rows.length,classes:cls,baselines:bl,regressions:f?.worse??null,usage,rows})+'\n');

// What the paid exams share (scripts/qa-eval.mjs, checker-eval.mjs, fidelity-eval.mjs): run each case k times and
// take the majority, freeze the inputs so a label always points at the same bytes, and put a baseline next to the
// score. Pure code, tested in tests/eval-kit.test.mjs; it never calls a model.
import {readFile,writeFile,copyFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';

// How many times each case runs: --k=5 on the command line, 3 by default. One run is not a score: the checker flipped
// its verdict on 5 of 10 reels across three runs, and one part watch caught the silver spoon 2 times in 3 (audit, 2026-09-29).
export function repeats(argv=process.argv){
 const a=argv.find(x=>/^--k=/.test(x)),k=a?Number(a.slice(4)):3;
 if(!Number.isInteger(k)||k<3)throw new Error(`--k=${a?.slice(4)}: each case needs at least 3 runs`);return k;
}
// The command-line words that are not --flags (checker-eval's model name).
export const plainArgs=(argv=process.argv)=>argv.slice(2).filter(x=>!x.startsWith('--'));

// k answers for one case: the majority (null on a tie, which counts as wrong), how many runs agreed with it, and how
// many runs gave the wanted answer.
export function tally(votes,want){
 const counts=new Map();for(const v of votes)counts.set(v,(counts.get(v)||0)+1);
 const [first,second]=[...counts].sort((a,b)=>b[1]-a[1]),top=first?.[1]||0,majority=first&&!(second&&second[1]===top)?first[0]:null;
 return {k:votes.length,votes,majority,agreement:votes.length?Math.round(top/votes.length*100)/100:0,right:majority!==null&&majority===want,rightRuns:votes.filter(v=>v===want).length};
}

// Right answers per group of cases (in-prompt, hold-out, a class such as "broken"), so one easy group cannot hide another.
export function byGroup(rows,key){
 const out={};for(const r of rows){const g=out[r[key]]||={right:0,of:0};g.of++;if(r.right)g.right++;}return out;
}
// What a checker that always gives the same answer would score: the number the real score has to beat.
export const baseline=(wants,answer)=>wants.filter(w=>w===answer).length;
export const baselines=(wants,answers)=>Object.fromEntries(answers.map(a=>[String(a),baseline(wants,a)]));

// A regression is a case whose majority was right in the last exam of at least 3 runs and is wrong now. One lower
// total is not: a single silver miss could drop the score about 1 run in 9 with no code change (audit, 2026-09-29).
export function flips(prev,rows){
 if(!prev||!(prev.k>=3)||!Array.isArray(prev.rows))return null;
 const before=new Map(prev.rows.map(r=>[r.name,r.right]));
 return {worse:rows.filter(r=>before.get(r.name)===true&&!r.right).map(r=>r.name),better:rows.filter(r=>before.get(r.name)===false&&r.right).map(r=>r.name)};
}
// The last logged exam of at least 3 runs that `same` accepts (older one-run lines cannot be compared).
export async function lastRun(file,same=()=>true){
 let text='';try{text=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
 return text.trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.k>=3&&same(r)).at(-1)||null;
}
export function flipLine(f){
 if(!f)return 'No earlier exam of 3 or more runs to compare with.';
 return f.worse.length?`Regression: now wrong where the last exam was right: ${f.worse.join('; ')}`:`No case got worse than the last exam${f.better.length?` (now right: ${f.better.join('; ')})`:''}.`;
}

export async function sha256(file){return createHash('sha256').update(await readFile(file)).digest('hex');}
// The first run copies a live input into the frozen folder; every run after grades the frozen copy, so a re-edit that
// overwrites reel.mp4 cannot change an exam item under its old label (the celery reel changed between two checker runs,
// audit 2026-09-29). A sidecar <copy>.json keeps the source, the time and the sha256; a frozen file whose bytes changed
// stops the exam. labeledAt: when the right answer was checked; a live file changed after that is not frozen.
export async function freeze(src,dest,{labeledAt}={}){
 const side=`${dest}.json`;let meta=null;
 try{meta=JSON.parse(await readFile(side,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!meta){
  const s=await stat(src);
  if(labeledAt&&s.mtime>new Date(labeledAt))throw new Error(`${src} changed on ${s.mtime.toISOString()}, after its right answer was checked (${labeledAt}). Look at it again, then update the case's answer and labeledAt.`);
  await mkdir(dirname(dest),{recursive:true});await copyFile(src,dest);
  meta={source:src,sha256:await sha256(dest),frozenAt:new Date().toISOString()};await writeFile(side,JSON.stringify(meta,null,1)+'\n');
 }
 const now=await sha256(dest);
 if(now!==meta.sha256)throw new Error(`${dest} no longer matches the bytes frozen on ${meta.frozenAt} (sha256 ${meta.sha256.slice(0,12)}, now ${now.slice(0,12)}). An exam item changed; restore it or re-check its answer.`);
 return {file:dest,sha256:meta.sha256};
}
// The same for data the exam builds once (a transcript, a breakdown): made on the first run, read back after.
export async function freezeData(dest,make){
 try{return JSON.parse(await readFile(dest,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const value=await make();await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(value,null,1)+'\n');return value;
}

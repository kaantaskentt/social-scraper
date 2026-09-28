// Does our reel beat this channel's TYPICAL reels? Gemini watches our reel next to 5 of the channel's reels that did
// about their usual (xNormal nearest 1) and picks the one more people would finish and share, with the exact prompt
// that picked the better of two real reels 72% (Ken) and 75% (natural) of the time, and only 58% on drzen (not proven)
// (scripts/pairwise-test.mjs, 2026-09-28). Sides are shuffled. The channel's own test result travels with the answer.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const PAIR_PROMPT='Both reels are from the same Instagram creator. One got clearly more views than the other, compared with the creator\'s usual reels. Watch both with sound and say which one, judging as a typical scroller: which one would more people watch to the end and share?';
export const PAIR_SCHEMA={type:'object',required:['more_views','why'],properties:{more_views:{type:'string',enum:['A','B'],description:'Which reel got more views relative to this creator\'s usual reels?'},why:{type:'string'}}};
// The channel's reels that did about their usual: the n nearest xNormal 1 (in log terms), with a saved video.
export function typicalReels(reels,n=5){return [...reels].filter(r=>r.xNormal>0).sort((a,b)=>Math.abs(Math.log(a.xNormal))-Math.abs(Math.log(b.xNormal))).slice(0,n);}
// The pairwise test's result for this channel, if one ran: proven when its 95% range sits above 55%.
export async function pairwiseRecord(root,runId){
 let text='';try{text=await readFile(join(root,'experiments','pairwise.jsonl'),'utf8');}catch{return null;}
 const rows=text.trim().split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(r=>r&&r.runId===runId&&r.judge==='gemini');
 const last=rows.at(-1);return last?{accuracy:last.accuracy,ci:last.ci,pairs:last.pairs,proven:last.ci[0]>0.55}:null;
}
export async function rankAgainstTypical({ours,opponents,gemini,key,model,rand=Math.random}){
 const games=await Promise.all(opponents.map(async o=>{
  const oursFirst=rand()<0.5,[a,b]=oursFirst?[ours,o.file]:[o.file,ours];
  const r=await gemini({key,model,parts:[{text:'Reel A:'},{video:await readFile(a)},{text:'Reel B:'},{video:await readFile(b)},{text:PAIR_PROMPT}],schema:PAIR_SCHEMA});
  const won=(r.json.more_views==='A')===oursFirst;return {against:o.id,theirXNormal:o.xNormal,won,why:r.json.why,costUsd:r.costUsd||0};
 }));
 return {wins:games.filter(g=>g.won).length,of:games.length,games,costUsd:games.reduce((a,g)=>a+g.costUsd,0)};
}
// One sentence for the reel card; says plainly when the comparison is not proven for this channel.
export function rankSentence(rank,record){
 if(!rank)return '';
 const base=`Beat ${rank.wins} of ${rank.of} of their typical reels in a side-by-side watch.`;
 if(!record)return `${base} Not yet tested on this channel's past reels, so treat it as a hint.`;
 return record.proven?`${base} This comparison picked the better real reel ${Math.round(record.accuracy*100)}% of the time on ${record.pairs} past pairs from this channel.`
  :`${base} Not proven here: on this channel's past reels it was right only ${Math.round(record.accuracy*100)}% of the time.`;
}

// The feedback loop: every made reel gets the studio score against the account's winners (automatic) and Kaan's one
// tap (👍 or 👎 with reasons, no typing). Code turns both into lessons for the next ideas and scripts; each lesson
// carries its count, so it is clear why the engine changed.
import {PARTS,total} from './reel-score.mjs';

export const REASONS={boring_start:'Boring start',weak_payoff:'Weak payoff',voice:'The voice',looks_fake:'Looks fake',too_slow:'Too slow',wrong_topic:'Wrong topic'};
// What each reason (or weak score part) means for the next script.
const FIX={boring_start:'Open on the most striking moment, in an extreme close-up, in the first second.',
 weak_payoff:'Make the payoff bigger and clearer: show it up close, with its sound, and hold it a beat longer.',
 voice:'Keep the voice warm and natural, short sentences, like talking to a friend.',
 looks_fake:'Keep people moving in short shots and put more of the reel on close-ups of hands and objects.',
 too_slow:'Cut faster: a new shot every 1 to 2 seconds and a payoff every 6 to 9 seconds.',
 wrong_topic:'Stay closer to the topics of the channel\'s best reels.'};
const PART_REASON={stops_scroll:'boring_start',payoff:'weak_payoff',voice:'voice',looks_real:'looks_fake',pace:'too_slow'};

// A reel's score, read against the winners of the same account.
export function scoreSummary(scores,winnerTotals){
 const t=total(scores),base=winnerTotals.reduce((a,b)=>a+b,0)/Math.max(1,winnerTotals.length);
 const weakest=PARTS.filter(k=>k!=='keep_watching').sort((a,b)=>scores[a]-scores[b])[0];
 return {total:t,share:base?Math.round(t/base*100):null,weakest,fix:scores.fix,parts:Object.fromEntries(PARTS.map(k=>[k,scores[k]]))};
}
export function validFeedback({verdict,reasons=[]}){
 if(!['up','down'].includes(verdict))throw new Error('Tap 👍 or 👎');
 const bad=reasons.filter(r=>!REASONS[r]);if(bad.length)throw new Error(`Unknown reason: ${bad.join(', ')}`);
 return {verdict,reasons:[...new Set(reasons)],at:new Date().toISOString()};
}
// Lessons: Kaan's reasons count double (he knows his audience); a weak score part counts once when it is the reel's
// weakest and below 6 of 10. Only lessons seen at least once are returned, most frequent first.
export function lessonsFrom(reels){
 const count={};
 for(const r of reels){
  for(const reason of r.feedback?.verdict==='down'?r.feedback.reasons:[])count[reason]=(count[reason]||0)+2;
  const w=r.score?.weakest;if(w&&PART_REASON[w]&&r.score.parts?.[w]<6)count[PART_REASON[w]]=(count[PART_REASON[w]]||0)+1;
 }
 const liked=reels.filter(r=>r.feedback?.verdict==='up').map(r=>r.title).filter(Boolean);
 return {lessons:Object.entries(count).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k,n])=>({reason:k,label:REASONS[k],weight:n,rule:FIX[k]})),liked};
}
export const lessonsText=({lessons,liked})=>lessons.length||liked.length?`Lessons from the reels made so far (follow them): ${lessons.map(l=>`${l.rule} (${l.label}, weight ${l.weight})`).join(' ')}${liked.length?` Reels the owner liked: ${liked.join('; ')}.`:''}`:'';

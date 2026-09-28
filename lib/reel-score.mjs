// How interesting is a finished reel? The same rubric for our reels and for the original winners, so the numbers
// compare: Gemini watches (0-10 per part of the craft), Jev gives one verdict from what Gemini saw. Used by the lab
// (scripts/reel-lab.mjs) and by the feedback loop.
const text=d=>({type:'string',description:d});
const score=d=>({type:'integer',minimum:0,maximum:10,description:d});
export const SCORE_SCHEMA={type:'object',required:['first_second','stops_scroll','visuals','sound','voice','payoff','pace','looks_real','keep_watching','best_moment','weakest_moment','fix'],properties:{
 first_second:text('What fills the screen in the first second'),
 stops_scroll:score('Would the first second stop a scrolling viewer? 0 = no, 10 = certainly'),
 visuals:score('How interesting the images are: close-ups, motion, variety of shots'),
 sound:score('How satisfying or striking the sounds are (pours, fizz, crunch), not the voice'),
 voice:score('How pleasant and gripping the voice is to listen to'),
 payoff:score('How clear and satisfying the result or reveal is'),
 pace:score('How well it keeps moving: a new thing every few seconds, no dead time'),
 looks_real:score('How natural it looks: 10 = like real footage, 0 = obviously broken or uncanny'),
 keep_watching:score('Overall: would a viewer watch to the end?'),
 best_moment:text('The strongest moment, with its second'),
 weakest_moment:text('The weakest moment, with its second'),
 fix:text('The one change that would make this reel most interesting')}};
export const SCORE_PROMPT='You judge Instagram reels for a short-form video studio. Watch this reel with its sound and score it honestly on the rubric. Be strict: 5 is an average reel, 8 or more is a top reel. Judge only what you see and hear.';
export const PARTS=['stops_scroll','visuals','sound','voice','payoff','pace','looks_real','keep_watching'];
// The average of the parts, one decimal (code, not the model).
export const total=s=>Math.round(PARTS.reduce((a,k)=>a+(s[k]||0),0)/PARTS.length*10)/10;
// Jev's verdict on one reel against the channel's winners, from the scores and notes Gemini wrote.
export function verdictRequest(ours,originals){
 return {model:'jev-latest',state:{our_reel:ours,original_winners:originals},questions:{
  as_gripping:{type:'score',instructions:'Compared with `original_winners`, how gripping is `our_reel` to watch (first second, visuals, sounds, voice, payoff, pace)?',criteria:['Much weaker','Weaker','About as gripping','As gripping or more']},
  main_gap:{type:'choice',instructions:'What most holds `our_reel` back compared with `original_winners`?',criteria:{hook:'The first second',visuals:'The images and shots',sound:'The sounds',voice:'The voice',payoff:'The payoff',pace:'The pace',realism:'It looks fake or broken',nothing:'Nothing, it is as good'}}}};
}

// The craft of a channel's winners: HOW a reel grabs and holds you, shot by shot (first-second image, voice delivery,
// sound moments, the payoff, pace, ending). One breakdown per winning reel (Gemini watches it with its transcript),
// then craft rules across them, each with the reels that show it. Used by ideas, scripts, video prompts and remakes.
// Why: the first kit reels were "decent, not interesting" (Kaan, 2026-09-28); they were one static shot.
const text=d=>({type:'string',description:d});
const NO_ORIGIN='Describe people only by role, clothing, expression and manner: never skin colour, ethnicity, race or nationality.';

export const BREAKDOWN_SCHEMA={type:'object',required:['first_second','hook_words','voice','beats','payoff','curiosity','sounds','pace','ending'],properties:{
 first_second:text('Exactly what fills the screen in the first second: framing (extreme close-up, close-up, medium, wide), subject, motion'),
 hook_words:text('The first words spoken or shown, exactly'),
 voice:{type:'object',required:['delivery','why_pleasant'],properties:{delivery:text('How the voice sounds: tone, pace, pitch, energy, how close to the mic (e.g. calm low close-mic, fast excited, whispery)'),why_pleasant:text('Why this voice is nice or gripping to listen to, or "it is not"')}},
 beats:{type:'array',items:{type:'object',required:['from','to','shot','happens','says','sound'],properties:{
  from:{type:'number'},to:{type:'number'},shot:text('Framing, subject and camera move of this shot'),happens:text('What happens'),says:text('Words spoken in this beat, or ""'),sound:text('The main non-voice sound, or ""')}}},
 payoff:{type:'object',required:['at','what','why_satisfying'],properties:{at:{type:'number',description:'Second of the reveal or result'},what:text('The result the viewer waited for, and how it is shown (framing)'),why_satisfying:text('Why it feels good to see or hear')}},
 curiosity:{type:'object',required:['question','raised_at','answered_at'],properties:{question:text('The question the viewer wants answered'),raised_at:{type:'number'},answered_at:{type:'number'}}},
 sounds:{type:'array',items:{type:'string'},description:'Satisfying or striking sounds (fizz, crunch, pour, snap, whoosh) with the second they happen'},
 pace:text('How many shots, roughly how long each lasts, and how fast it feels'),
 ending:text('How it ends: the last image and the last words exactly (including any call to action)')}};
export const breakdownPrompt=(transcript)=>`You are a short-form video producer. Watch this reel and break it down so another team can film a new reel with the same craft. Be concrete and timed. ${NO_ORIGIN} Do not name the creator.${transcript?`\nThe transcript (for exact words): "${transcript}"`:''}`;

export const CRAFT_SCHEMA={type:'object',required:['rules','voice_direction','shot_style','sound_style','ending_style'],properties:{
 rules:{type:'array',items:{type:'object',required:['kind','rule','how','reels'],properties:{
  kind:{type:'string',enum:['hook','shots','voice','sound','payoff','pace','ending']},
  rule:text('The craft move in plain words a 10-year-old understands'),
  how:text('Exactly how to film it: framing, timing, sound, delivery'),
  reels:{type:'array',items:{type:'string'},description:'Ids of the reels that do this'}}},description:'5 to 8 craft moves most of these winners share'},
 voice_direction:text('One sentence to direct the voice of every reel (tone, pace, closeness), as a voice director would say it'),
 shot_style:text('One sentence on framing and cutting (e.g. open on an extreme close-up of the object, cut every 1-2 seconds, close-up at the reveal)'),
 sound_style:text('One sentence on the sounds to feature and when'),
 ending_style:text('How the winners end, and a natural way to end ours (no fake offers)')}};
export function craftPrompt(account,breakdowns){
 return `These are shot-by-shot breakdowns of the best-performing reels of @${account}. Find the 5 to 8 craft moves most of them share: how they open, frame, voice, sound, pay off, pace and end. Only moves that at least 2 reels show; list the reel ids that show each. Plain words. ${NO_ORIGIN} Describe the craft, not the topic: never mention health, medicine, the body, secrets or danger in the directions (our channel stays non-medical).
${JSON.stringify(breakdowns.map(b=>({id:b.id,...b.breakdown})))}`;
}
// Rules must name real reels that show them, and at least two; others are dropped (and counted).
export function checkCraft(craft,ids){
 const known=new Set(ids),rules=[],dropped=[];
 for(const r of craft.rules||[]){const reels=[...new Set((r.reels||[]).filter(id=>known.has(id)))];if(reels.length>=2)rules.push({...r,reels});else dropped.push(r.rule);}
 return {...craft,rules,dropped};
}
// The short brief handed to idea and script writers.
// Health or danger framing is scrubbed from directions even if a model writes it (a "forbidden health secret" voice
// direction slipped through on 2026-09-28).
const calm=t=>String(t||'').replace(/,?\s*as if[^.;]*\b(health|medical|forbidden|secret|danger\w*|toxic)\b[^.;]*/gi,'').replace(/\b(forbidden |health |medical )/gi,'');
// Medical props (body models, organs, arteries, pills) from a health channel's craft never reach the writers.
const MEDICAL=/\b(model|models|organ|organs|arter\w*|vein\w*|pill\w*|capsule\w*|syringe\w*|anatom\w*)\b/i;
export const craftBrief=craft=>craft?{moves:craft.rules.filter(r=>!MEDICAL.test(`${r.rule} ${r.how}`)).map(r=>calm(`${r.rule} (${r.how})`)),voice:calm(craft.voice_direction),shots:calm(craft.shot_style),sound:calm(craft.sound_style),ending:calm(craft.ending_style)}:null;

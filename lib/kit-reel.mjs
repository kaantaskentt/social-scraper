// Reels made from a channel kit with Gemini Omni Flash: the hosts, place and sounds come from the kit's reference
// pictures; each reel is two 10-second parts (the second extends the first, so faces and voices carry over; tested
// 2026-09-28: same faces, script spoken word for word, only the new 10 seconds billed). Gemini writes, Jev judges,
// code checks the timing, prices the parts and builds every video prompt.
import {FORMATS} from './kit.mjs';
import {craftBrief} from './craft.mjs';

export const PART_SECONDS=10,PARTS=2,VIDEO_MODEL='gemini-omni-1.1-flash';
// Omni bills 5,792 video tokens per second at $17.50 per 1M (pricing page, 2026-09-28): $0.1014 a second. The 3
// reference pictures and the prompt added about $0.02 per part in the tests; $0.03 is kept for safety.
export const PART_USD=Math.round((PART_SECONDS*5792*17.5/1e6+0.03)*100)/100;
// An extension also reads the video so far as input: part 2 cost $1.114 against $1.032 for part 1 (real run,
// 2026-09-28), so every later part is priced at $1.13.
export const EXTEND_USD=1.13;
export const partUsd=i=>i?EXTEND_USD:PART_USD;
export const WORDS_PER_SECOND=2.8;
export const MAX_WORDS=28; // Ken's winners speak about 2.9 words a second (craft study, 2026-09-28); 2.8 a second fits a part

const text=d=>({type:'string',description:d});
const hostsOf=kit=>(kit.cast||[]).map(h=>h.name);
const whoList=(kit,format)=>format==='hands_pov'?['hands','voice']:format==='visuals'?['nobody','voice']:[...hostsOf(kit),'voice'];

// Medical-looking props from a health channel's look never reach the writers (a "transparent plastic model" of a pipe
// kept appearing in a household-trick script, 2026-09-28).
export const MEDICAL_PROP=/\b(model|models|organ|organs|arter\w*|vein\w*|pill\w*|capsule\w*|syringe\w*|body part\w*|anatom\w*)\b/i;
// A short, plain summary of the kit for the writers (no picture file names, no prices).
export function kitBrief(kit,format){
 return {channel:kit.name,promise:kit.promise,format:FORMATS[format].name,hosts:(kit.cast||[]).map(h=>({name:h.name,role:h.role,manner:h.manner,voice:h.voice})),hands:format==='hands_pov'?kit.hands:undefined,
  place:kit.place,other_places:kit.places||[],camera:kit.camera,light:kit.light,sound:kit.sound,signature:(kit.assets||[]).filter(a=>!MEDICAL_PROP.test(`${a.what} ${a.how}`)).map(a=>`${a.what} (${a.kind}): ${a.how}`),never:kit.dont||[]};
}
export const MIN_PARTS=2,MAX_PARTS=3;
// What counts as a health claim. Exercise technique and the muscles an exercise works are fitness instruction, not
// medicine: the broad old wording ("anything good or bad for your body") rejected all 12 ideas of a workout channel
// (2026-09-28). Remedies, cures, pain relief, detox and body-change promises stay out.
export const HEALTH_Q=subject=>`Does \`${subject}\` make a medical or health claim: curing, treating or preventing an illness, pain, injury or condition; detox or toxins; a remedy, food or supplement that changes the body or health; weight-loss, anti-aging or other body-change promises? Showing how to do an exercise, good form, and which muscles it works is NOT a health claim.`;
const ENDING='End on the payoff or a short natural line in the host\'s own voice (a punchline, "follow for the next test", or a question to the viewer). Never ask viewers to comment a keyword and never promise a guide, a routine or anything we do not have.';

export function kitIdeaPrompt(kit,format,pattern,craft=null,count=12){
 const who=format==='ai_host'||format==='animated'?`The hosts (${hostsOf(kit).join(' and ')}) are on camera and talk to the viewer.`:format==='hands_pov'?'Only hands are on camera; a voice explains.':'Nobody is on camera; the thing itself happens, with its real sounds and a short voice line.';
 return `You plan reels for this channel: ${JSON.stringify(kitBrief(kit,format))}.
Write ${count} different reel ideas that follow the winners' pattern and their craft below. ${who} Rules:
- Stay in the channel's topic, in its main place, with its signature things.
- No hype words ("kills", "destroys", "secret", "never do this"): say the real effect plainly.
- Every idea is TRUE and really happens, with a real, well-known reason (write it in why_true). Many viral "real vs fake food" tests are myths (honey in water, pepper floating, coffee in water): never use a test unless its reason is established science. Non-medical: no cures, treatments, pain relief, remedies, detox, toxins, supplements or body-change promises (showing an exercise, good form and the muscles it works is fine).
- Choose reveals that are DRAMATIC to see and hear and still true: a sudden colour change, foam or fizz, sinking against floating, a loud snap or crunch, a clear before and after. A subtle difference (water a bit cloudy) is not enough. The stakes are honest: why the viewer should care, without scaring them.
- Each idea is 20 to 30 seconds and packs a VISIBLE payoff every 6 to 9 seconds (for example 2 or 3 quick tests in a row), each shown up close with its sound.
- Open mid-action on a close-up. One clear feeling (curiosity, surprise, satisfaction or amusement), one clear thing the viewer can do.
- Simple for AI video: few objects, simple hand actions, no readable text, no brand names, no tricky physics.
- In "pattern_used" name the winning pattern or craft move the idea builds on.
- Original ideas only: do not copy any specific reel.
pattern: ${JSON.stringify(pattern)}${craft?`\ncraft of the winners: ${JSON.stringify(craftBrief(craft))}`:''}`;
}
export function judgeKitIdeaRequest(idea,pattern,kit,format,craft=null){
 return {model:'jev-latest',state:{idea,pattern,channel:kitBrief(kit,format),...(craft?{craft:craftBrief(craft)}:{})},questions:{
  fit:{type:'score',instructions:'How closely does `idea` follow `pattern` (what this channel\'s best reels do more, and avoid what the weakest do)'+(craft?' and the winners\' `craft`':'')+', and fit `channel`?',criteria:['Does not follow it','Follows a little','Follows most of it','Follows it closely']},
  ai_ready:{type:'score',instructions:'How reliably can current AI video film `idea` in 20 to 30 seconds with the channel\'s hosts in one place: simple actions, few objects, no readable text, no tricky physics?',criteria:['Will likely fail','Some risky moments','Mostly simple','Simple and safe for AI video']},
  hook:{type:'score',instructions:'How strong is the opening of `idea` for stopping the scroll in the first 3 seconds?',criteria:['No real hook','Weak hook','Clear hook','Starts mid-action with a strong hook']},
  payoff:{type:'score',instructions:'How dramatic is the payoff of `idea` to SEE and HEAR in a phone video: a sudden colour change, foam, fizz, something sinking or floating, a snap, a before/after that makes you say "whoa"?',criteria:['Hard to see','Mild','Clear and satisfying','Dramatic, a "whoa" moment']},
  health_claim:{type:'noul',instructions:HEALTH_Q('idea'),criteria:{true:'Yes, it makes or implies a health claim',false:'No health claim'}},
  true_demo:{type:'noul',instructions:'Does `idea` show or claim something that really happens and is well established, not a myth, a trick or a doubtful tip?',criteria:{true:'It really happens',false:'It is a myth, a trick or doubtful'}}}};
}

// The script: 2 or 3 parts of 10 seconds, each a few timed beats: the shot, what happens, what is said, the sound.
export const KIT_SCRIPT_SCHEMA={type:'object',required:['hook_title','parts','caption'],properties:{
 hook_title:text('3 to 6 words shown on screen in the first 2 seconds'),
 parts:{type:'array',items:{type:'object',required:['beats'],properties:{beats:{type:'array',items:{type:'object',required:['from','to','shot','who','does','says','sound'],properties:{
  from:{type:'integer',minimum:0,maximum:10},to:{type:'integer',minimum:1,maximum:10},
  shot:text('Framing of this shot: extreme close-up, close-up, medium or wide, and on what'),
  who:text('Who acts or speaks in this beat'),does:text('What happens on camera, one simple action'),says:text('The exact words spoken in this beat, or "" for none'),sound:text('The key real sound in this beat (pour, fizz, crunch...), or ""')}}}}},description:`${MIN_PARTS} or ${MAX_PARTS} parts of ${PART_SECONDS} seconds; beat times are seconds within the part`},
 caption:text('The Instagram caption: 1-2 short lines that end with a question to the viewer, plus 3-5 hashtags')}};
const scriptRules=(kit,format,craft)=>`Rules: ${MIN_PARTS} or ${MAX_PARTS} parts of ${PART_SECONDS} seconds each (every part continues the one before in the same place); use ${MAX_PARTS} only when there is a third payoff worth it. Each part has 2 to 5 beats that cover 0 to ${PART_SECONDS} seconds in order; a new beat is a new shot (cut). "who" is one of: ${whoList(kit,format).join(', ')}. Each beat shows ONE simple action. Use only plain, unlabelled containers (glass jugs, bowls, clear jars), never cartons, packets, cans or bottles with labels (a milk carton's label failed a reel twice, 2026-09-28). Name every object in every beat where it appears ("curls a dumbbell", never just "curls": a curl came out with an empty hand, 2026-09-28). Name every object plainly ("baking powder", never "white powder"; video safety filters block vague powders and liquids). The first beat (0 to 2 seconds) shows the most striking moment of the reel in an extreme close-up (the payoff itself or the strongest action), with the hook line spoken over it; then show how you get there (the winners' first second scored 8 of 10, ours 6 when it was just a pour into a glass). Every payoff is shown in a close-up with its real sound. Use the channel's signature things only where they fit the action naturally; never force a prop into a beat where it makes no sense (a spoon dropped "into the clear plastic model pipe" slipped through on 2026-09-28). At least 60% of beats are close-ups of hands and objects in action; people appear in short shots (a quick reaction or one line), always moving and doing something (leaning in, pouring, pointing, reacting), never standing still and staring (static people looked fake: 3 of 10 for realism in our test). At most ${MAX_WORDS} spoken words per part, short spoken sentences. Each line fits its own beat: at most about 3 words per second of the beat (a 2-second beat holds 6 words). Every spoken line must be true on its own: no hype words ("kills", "destroys"), and for exercise only well-established form cues. ${ENDING} No health claims, no brand names, no readable text on objects. Everything shown must really happen.${craft?`\nThe winners' craft, follow it: ${JSON.stringify(craftBrief(craft))}`:''}`;
export function kitScriptPrompt(idea,kit,format,pattern,craft=null){
 return `Write the script for one reel of this channel: ${JSON.stringify(kitBrief(kit,format))}.
The reel: ${JSON.stringify(idea)}. Follow the winners' pattern: ${JSON.stringify(pattern)}.
${scriptRules(kit,format,craft)}`;
}
// Remake: the same proven structure (shots, timing, payoffs, sounds) with our hosts, our words and a true claim.
export function remakePrompt(breakdown,kit,format,craft=null){
 return `Remake this proven reel for our channel: ${JSON.stringify(kitBrief(kit,format))}.
The original, shot by shot: ${JSON.stringify(breakdown)}
Keep what made it work: the opening shot, the order and timing of the shots, each payoff shown up close, the sounds, the pace. Change the people to our hosts, the words to our hosts' own voice (never copy sentences), and the place to ours. If a claim or test in the original is a myth or not well established, replace it with a TRUE test of the same kind that gives the same kind of visible payoff. Title the remake in hook_title.
${scriptRules(kit,format,craft)}`;
}
// Code checks what code can check: parts, timing, speakers, word counts, a natural ending.
export function scriptProblems(script,kit,format){
 const problems=[],who=new Set(whoList(kit,format).map(w=>w.toLowerCase())),n=script.parts?.length||0;
 if(n<MIN_PARTS||n>MAX_PARTS)return [`needs ${MIN_PARTS} or ${MAX_PARTS} parts, got ${n}`];
 script.parts.forEach((p,i)=>{
  const b=p.beats||[];if(!b.length){problems.push(`part ${i+1} has no beats`);return;}
  if(b[0].from!==0||b.at(-1).to!==PART_SECONDS)problems.push(`part ${i+1} must run from 0 to ${PART_SECONDS} seconds`);
  b.forEach((x,j)=>{if(!(x.to>x.from))problems.push(`part ${i+1} beat ${j+1} ends before it starts`);if(j&&x.from!==b[j-1].to)problems.push(`part ${i+1} beat ${j+1} does not follow on`);if(!who.has(String(x.who).toLowerCase()))problems.push(`part ${i+1} beat ${j+1}: "${x.who}" is not one of ${[...who].join(', ')}`);});
  // Each line must fit its own beat, or the voice runs late for the rest of the reel (a 10-word line on a 2-second
  // beat pushed every later line 2.5 s late, 2026-09-28).
  b.forEach((x,j)=>{const n=String(x.says||'').trim().split(/\s+/).filter(Boolean).length,fits=Math.floor((x.to-x.from)*WORDS_PER_SECOND)+1;if(n>fits)problems.push(`part ${i+1} beat ${j+1} says ${n} words in ${x.to-x.from} s, at most ${fits}: shorten it or give it a longer beat`);});
  const words=b.map(x=>x.says||'').join(' ').trim().split(/\s+/).filter(Boolean).length;if(words>MAX_WORDS)problems.push(`part ${i+1} has ${words} spoken words, at most ${MAX_WORDS}`);
 });
 const beats=script.parts.flatMap(p=>p.beats||[]),close=beats.filter(b=>/close|macro/i.test(b.shot||'')).length;
 if(beats.length&&close/beats.length<0.6)problems.push(`only ${close} of ${beats.length} shots are close-ups of the action, at least 60%`);
 // "Comment EGG" sounded weird (Kaan, 2026-09-28) and promised a guide we do not have.
 if(script.parts.some(p=>p.beats.some(b=>/\bcomment\b/i.test(b.says||'')||/\bguide\b/i.test(b.says||''))))problems.push('the spoken ending asks for a comment keyword or promises a guide');
 // Offers we do not have: "check the link for more recipes" slipped into a script on 2026-09-28.
 if(script.parts.some(p=>p.beats.some(b=>/\b(link|bio|dm|download|free (guide|ebook|pdf|recipe))\b/i.test(b.says||''))))problems.push('a line points to a link, bio, DM or freebie we do not have');
 return problems;
}
export function checkKitScriptRequest(script,craft=null){
 const questions={
  starts_mid_action:{type:'noul',instructions:'Does the first beat of `script` start in the middle of an action (not a greeting or intro)?',criteria:{true:'Starts mid-action',false:'Does not'}},
  clear_action:{type:'noul',instructions:'Does `script` give the viewer one clear thing they can do?',criteria:{true:'Yes',false:'No'}},
  health_fact:{type:'noul',instructions:HEALTH_Q('script'),criteria:{true:'Yes',false:'No'}},
  true_claim:{type:'noul',instructions:'Is everything `script` says or shows true and well established (not a myth, a doubtful tip or an exaggeration)?',criteria:{true:'True',false:'Not true or doubtful'}},
  // Aspiration drives fitness and self-improvement channels (a workout account's Secret: 22 of 30 reels, 2026-09-28).
  emotion:{type:'choice',instructions:'What is the main feeling of `script`?',criteria:{curiosity:'Curiosity',satisfaction:'Satisfaction',surprise:'Surprise',amusement:'Amusement',aspiration:'Aspiration or motivation: wanting to look, feel or do better',fear:'Fear or worry',mixed:'Several at once',none:'None'}},
  payoff_closeup:{type:'noul',instructions:'In `script`, is the result the viewer waits for shown in a close-up shot right after the action (not only in a wide or medium shot, and not replaced by something else)?',criteria:{true:'Yes, the result is shown up close',false:'No'}},
  first_second:{type:'score',instructions:'How striking is the first beat of `script` (its first 2 seconds) as the first thing a scrolling viewer sees?',criteria:['Plain, easy to scroll past','Somewhat interesting','Striking','Impossible to scroll past']},
  gripping:{type:'score',instructions:'How gripping would this reel be to watch'+(craft?', judged against the winners\' `craft`':'')+': a strong first image, a visible payoff every few seconds, satisfying sounds, a voice you want to listen to?',criteria:['Boring','Somewhat interesting','Interesting','Gripping, like a top reel']}};
 // Every spoken line on its own, so a rewrite knows exactly which sentence is doubtful ("something may not be true"
 // left two fitness scripts failing after two rewrites, 2026-09-28).
 script.parts.forEach((p,i)=>p.beats.forEach((b,j)=>{if(b.says)questions[`line_${i+1}_${j+1}_true`]={type:'noul',instructions:`In the context of \`script\`, is the spoken line "${String(b.says).replace(/"/g,"'")}" true and well established (no myth, no exaggeration)?`,criteria:{true:'True',false:'Doubtful, wrong or exaggerated'}};}));
 script.parts.forEach((p,i)=>{questions[`part_${i+1}_risky`]={type:'noul',instructions:`Is \`script.parts[${i}]\` risky for AI video: many objects interacting, precise physics, readable text or brand labels, or more than one action per beat?`,criteria:{true:'Risky',false:'Safe'}};});
 return {model:'jev-latest',state:{script,...(craft?{craft:craftBrief(craft)}:{})},questions};
}
export const MIN_GRIPPING=2;
export function readKitScriptCheck(raw,script,kit,format){
 const a=raw?.answers||{},problems=[...scriptProblems(script,kit,format)];
 if(!(a.starts_mid_action?.noul>=0.5))problems.push('Does not start mid-action');
 if(!(a.clear_action?.noul>=0.5))problems.push('No clear action for the viewer');
 if(!(a.health_fact?.noul<0.5))problems.push('States a health claim as fact');
 const doubtful=script.parts.flatMap((p,i)=>p.beats.map((b,j)=>a[`line_${i+1}_${j+1}_true`]?.noul<0.5?b.says:null)).filter(Boolean);
 for(const line of doubtful)problems.push(`Not sure this is true: "${line}"`);
 if(!(a.true_claim?.noul>=0.5)&&!doubtful.length)problems.push('Something the reel shows or implies may not be true: check what each shot shows (for example which muscle works or what the result proves)');
 if(['fear','mixed','none'].includes(a.emotion?.choice))problems.push(`Feeling is ${a.emotion.choice}, not one clear feeling`);
 // The silver reel's payoff scored 2 of 10: its last shot was a medium shot with a cup of tea, not the shiny spoon.
 if(a.payoff_closeup&&!(a.payoff_closeup.noul>=0.5))problems.push('The result is not shown in a close-up right after the action');
 if(a.first_second&&!(a.first_second.score>=1.5))problems.push(`The first second is not striking enough (${a.first_second.score.toFixed(1)} of 3)`);
 if(a.gripping&&!(a.gripping.score>=MIN_GRIPPING))problems.push(`Not gripping enough (${a.gripping.score.toFixed(1)} of 3)`);
 const riskyParts=script.parts.map((_,i)=>i+1).filter(n=>a[`part_${n}_risky`]?.noul>=0.5);for(const n of riskyParts)problems.push(`Part ${n} is risky for AI video`);
 return {pass:!problems.length,problems,riskyParts,emotion:a.emotion?.choice||null,gripping:a.gripping?.score??null,firstSecond:a.first_second?.score??null};
}
export function kitPrice(parts=PARTS){const total=Math.round(Array.from({length:parts},(_,i)=>partUsd(i)).reduce((x,y)=>x+y,0)*100)/100;return {usd:total,maxUsd:Math.round(total*2*100)/100,parts,partSeconds:PART_SECONDS,model:VIDEO_MODEL};}

// The reference pictures sent with part 1, in order, and how the prompt names them.
export function referencesFor(kitSaved){
 const pics=Object.fromEntries(kitSaved.pictures.map(p=>[p.role,p])),refs=[];
 (kitSaved.kit.cast||[]).forEach((h,i)=>{if(pics[`face${i}`])refs.push({role:`face${i}`,file:pics[`face${i}`].file,name:`${h.name} <IMAGE_REF_${refs.length}>`});});
 if(pics.hands)refs.push({role:'hands',file:pics.hands.file,name:`the hands <IMAGE_REF_${refs.length}>`});
 if(pics.place)refs.push({role:'place',file:pics.place.file,name:`this place <IMAGE_REF_${refs.length}>`});
 return refs;
}
// Hands and "nobody" do not talk: their lines are a voice-over.
const speaker=who=>['voice','hands','nobody'].includes(String(who).toLowerCase())?'A voice says':`${who} says`;
// silent: the lines are added later in the channel's designed voices, so nobody speaks on camera.
const beatLines=(beats,silent=false)=>beats.map(b=>`[${b.from}-${b.to}s] ${b.shot?`${b.shot}: `:''}${b.does}${b.sound?` (sound: ${b.sound})`:''}${b.says&&!silent?` ${speaker(b.who)}: "${b.says}"`:''}`).join('\n');
const SILENT='No dialogue: nobody speaks and lips stay closed; people react only with faces and gestures. Keep every real sound.';
const soundLine=(kit,raw)=>{const s=kit.sound||{},none=v=>!v||/^none$/i.test(v),craft=craftBrief(raw);return `Sound: ${[craft?.voice?`voice direction: ${craft.voice}`:!none(s.voice)?`voices ${s.voice}`:'',craft?.sound?`loud, crisp, close-mic real sounds: ${craft.sound}`:!none(s.natural)?`clear real sounds: ${s.natural}`:'',!none(s.music)?`soft ${s.music} underneath, quieter than the voices`:'no music'].filter(Boolean).join('; ')}.`;};
const NEVER='No text, captions, logos, brand stickers or labels on screen. No camera, tripod or filming gear in view.';
// Each beat is its own shot: cutting to close-ups of the action is what the winners do (a single continuous
// shot made the first kit reel flat, 2026-09-28).
export function partPrompt(script,index,kitSaved,craft=null,{silent=false}={}){
 const kit=kitSaved.kit,part=script.parts[index],hosts=kit.cast||[],quiet=silent?` ${SILENT}`:'';
 const cuts='Cut to a new shot at each timed beat below, keeping the same '+(hosts.length?'people, outfits, ':'')+'place and light in every shot.';
 if(index>0)return `The video continues. ${cuts}\n${beatLines(part.beats,silent)}\n${silent?'':soundLine(kit,craft)+' '}${NEVER}${quiet}`;
 const refs=referencesFor(kitSaved),head=`[# References ${refs.map((r,i)=>`<IMAGE_REF_${i}>@Image${i+1}`).join(' ')}]`;
 const cast=hosts.length?`${hosts.map((h,i)=>`${refs[i].name} (${h.outfit})`).join(' and ')} in ${refs.at(-1).name}.`:`${refs.find(r=>r.role==='hands')?`Only ${refs.find(r=>r.role==='hands').name} are on camera, never a face, `:'Nobody is on camera, '}in ${refs.at(-1).name}.`;
 const style=kitSaved.format==='animated'?` Animated in this style: ${kit.art_style}.`:' Real phone footage.';
 return `${head} A vertical short video. ${cast} ${String(kit.light).replace(/\.+$/,'')}.${style} ${cuts}\n${beatLines(part.beats,silent)}\n${silent?'':soundLine(kit,craft)+' '}${NEVER}${quiet} Use the given images as references for the people and the place, not as literal first frames.`;
}
// Everything the viewer hears, for the captions (timed later from the real audio).
export const spokenText=script=>script.parts.flatMap(p=>p.beats.map(b=>b.says)).filter(Boolean).join(' ');
// AI hosts are always disclosed (research: ai-content-trust).
export function discloseCaption(caption,format){return ['ai_host','animated'].includes(format)&&!/\bAI\b/.test(caption)?`${caption.trim()}\n\nOur hosts are AI.`:caption;}

// The check for one part: Gemini watches the part WITH its beats and the face pictures; code decides.
export const PART_QA_SCHEMA={type:'object',required:['shows','match','same_people','text_or_logos','gear_visible','broken','missing'],properties:{
 shows:text('What happens in the clip, in one or two plain sentences'),
 match:{type:'integer',minimum:0,maximum:3,description:'How well the clip follows the beats: 0 = something else, 1 = partly, 2 = mostly, 3 = exactly'},
 same_people:{type:'string',enum:['yes','no','no_people'],description:'Are the people in the clip the same people as in the reference pictures?'},
 text_or_logos:{type:'boolean',description:'Readable or garbled text, captions, logos, brand stickers or labels'},
 gear_visible:{type:'boolean',description:'A camera, tripod, ring light or other filming gear is visible'},
 broken:{type:'boolean',description:'Warped faces or hands, extra fingers, objects melting or popping in and out'},
 missing:text('What from the beats is missing or different, or "nothing"')}};
export const partQaPrompt=(script,index,hasPeople)=>`Quality check for part ${index+1} of a reel (${PART_SECONDS} seconds). The FIRST input is the clip.${hasPeople?' The pictures after it are the reference pictures of the hosts.':''} The beats were:\n${beatLines(script.parts[index].beats)}\nSmall differences in wording or timing still count as "mostly".`;
export function partVerdict(seen){
 const problems=[];
 if(!(seen.match>=2))problems.push(seen.match===1?'only partly follows the script':'shows something else');
 if(seen.same_people==='no')problems.push('the hosts look different from the kit');
 if(seen.text_or_logos)problems.push('text or a logo is visible');
 if(seen.gear_visible)problems.push('filming gear is visible');
 if(seen.broken)problems.push('something looks warped or broken');
 return {pass:!problems.length,problems};
}

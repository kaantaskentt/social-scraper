// The channel kit (brand memory): how a new, original channel in the winners' style looks and sounds, plus the
// reference pictures every reel is made from. Gemini studies and writes, Jev picks the format, code builds every
// picture prompt, the checks and the money limits. Spec: docs/superpowers/specs/2026-09-28-channel-kit.md

// The four ways to make a channel. `pictures` is the order they are drawn in; later ones use earlier ones as references.
export const FORMATS={
 ai_host:{name:'AI host',kid:'A made-up host talks to you in every reel. It is openly an AI host.'},
 hands_pov:{name:'Hands only',kid:'You only see hands doing things, and a voice explains.'},
 visuals:{name:'No person',kid:'You just watch the thing happen, with its real sounds.'},
 animated:{name:'Animated',kid:'A cartoon character does it.'}};
export const MAX_CAST=2;

const text=d=>({type:'string',description:d});
const NO_ORIGIN='Describe people only by role, age range, build, hair, clothing, expression and manner: never skin colour, ethnicity, race or nationality.';

// 1 Study: how one winning reel is made, in producer's terms.
export const STUDY_SCHEMA={type:'object',required:['people','place','camera','light','colors','props','voice','music','natural_sounds','text_style','edit','signature','style'],properties:{
 people:{type:'array',items:{type:'object',required:['role','look','manner'],properties:{role:text('What this person does in the reel'),look:text(`Age range, build, hair, clothing, expression. ${NO_ORIGIN}`),manner:text('How they move and speak to the camera')}}},
 place:text('Where it is filmed, with the concrete details that repeat (surfaces, furniture, background)'),
 camera:text('Framing, angle and movement, e.g. handheld medium shot at eye level, top-down close-up'),
 light:text('The light: soft daylight, ring light, dark and moody...'),
 colors:{type:'array',items:{type:'string'},description:'The 2 to 4 main colours you see'},
 props:{type:'array',items:{type:'string'},description:'Objects that matter in the reel'},
 voice:text('The voice: who speaks, tone, pace, energy; or "none"'),
 music:text('The music style and loudness; or "none"'),
 natural_sounds:text('Real sounds the reel lets you hear: crunching, pouring, sizzling, tapping, whooshes (ASMR moments); or "none"'),
 text_style:text('On-screen text: captions, titles, their look; or "none"'),
 edit:text('Cut rhythm, zooms, transitions, how fast it moves'),
 signature:text('Anything that looks like a trademark repeated across their reels: a phrase, a gesture, a prop, a colour, a sound'),
 style:{type:'string',enum:['real_footage','animation','screen_or_graphics','mixed']}}};
export const STUDY_PROMPT=`You are a video producer. Watch this reel and write down HOW it is made, so a team can produce new, original reels in the same style. Be concrete: name colours, objects, camera moves and sounds. ${NO_ORIGIN} Do not name the creator.`;

// What the best reels show, counted from the Secret's own labels (winners only).
export function winnerCounts(saved){
 const w=(saved.picked||[]).filter(p=>p.group==='winner'),count=q=>w.reduce((m,p)=>{const v=p.labels?.[q];if(v)m[v]=(m[v]||0)+1;return m;},{});
 return {total:w.length,presenter:count('presenter'),look:count('look'),format:count('format'),sound:count('sound'),setting:count('setting')};
}

// 2 Decide: Jev picks the format from what the winners do and how they are made.
export function formatRequest(counts,study,saved){
 return {model:'jev-latest',state:{channel_summary:saved.secret?.headline||'',winners:counts,how_three_winners_are_made:study.map(s=>({people:s.people.map(p=>p.role),style:s.style,voice:s.voice,natural_sounds:s.natural_sounds}))},questions:{
  format:{type:'choice',instructions:'`winners` counts what the best reels of this channel show (out of `winners.total`): who is on camera, their look, the kind of video and the sound. `how_three_winners_are_made` describes three of them. We will make NEW, original reels in the same style with AI video. Which production format keeps what makes these reels work?',criteria:{
   ai_host:'A recurring host (or two) who talks to or acts for the camera',
   hands_pov:'Only hands and objects on camera, with a voiceover',
   visuals:'No person: the thing itself happening, carried by visuals and real sounds',
   animated:'An animated or cartoon character'}}}};
}
// Why, in one plain sentence, from the counts (code, not the model, so the numbers are always right).
export function formatWhy(format,counts){
 const p=counts.presenter,n=counts.total,people=(p.one_talking||0)+(p.one_doing||0)+(p.two_or_more||0);
 if(format==='ai_host')return `In ${people} of their ${n} best reels, people are on camera.`;
 if(format==='hands_pov')return `In ${p.hands_only||0} of their ${n} best reels, you only see hands.`;
 if(format==='visuals')return `In ${p.nobody||0} of their ${n} best reels, nobody is on camera.`;
 return `${counts.look.animated_or_ai||0} of their ${n} best reels are animated or made with AI.`;
}
// The expert rule (research: expertise-small-effect, strong): an expert LOOK is never faked with credentials.
export const expertLook=counts=>(counts.look.doctor_or_expert||0)*3>=counts.total&&counts.total>0;
export const castSize=(format,counts)=>['ai_host','animated'].includes(format)&&(counts.presenter.two_or_more||0)*2>counts.total?2:1;

// 3 Write: the kit itself.
const PERSON={type:'object',required:['name','role','look','outfit','manner','voice'],properties:{
 name:text('A distinctive first name that fits the channel (not a stock name like Leo, Mia, Alex, Sam or Max)'),role:text('What they do in every reel'),
 look:text(`Face and body in detail so an artist can draw the same person every time: age range, build, face shape, hair style and colour, eye colour, one or two distinctive details. ${NO_ORIGIN}`),
 outfit:text('One signature outfit worn in every reel: every piece with its exact colour, e.g. "a black ribbed tank top, olive cargo pants, white sneakers"'),manner:text('How they move and act'),voice:text('How the voice sounds: pitch, pace, tone, accent-free description')}};
export const KIT_SCHEMA={type:'object',required:['name','promise','cast','hands','place','camera','light','palette','sound','assets','dont'],properties:{
 name:text('A short working name for the NEW channel (not the original name)'),
 promise:text('One sentence a 10-year-old understands: what a viewer gets from this channel'),
 cast:{type:'array',items:PERSON,description:'The host or hosts (empty for hands-only and no-person formats)'},
 hands:text('For the hands-only format: the hands, nails and sleeves, the same in every reel; otherwise "none"'),
 art_style:text('For the animated format: the drawing and animation style; otherwise "none"'),
 place:text('The main place most reels are filmed in, as a real place, with its repeating details'),
 places:{type:'array',items:{type:'string'},description:'Other typical real places, only if their reels move around (0 to 2)'},
 camera:text('What the viewer sees: framing, angle and movement (never the equipment: no tripod, gimbal or ring light)'),light:text('The light'),
 palette:{type:'array',items:{type:'object',required:['name','hex'],properties:{name:{type:'string'},hex:text('#RRGGBB')}},description:'2 or 3 brand colours'},
 sound:{type:'object',required:['voice','music','natural'],properties:{voice:text('Voice style for every reel'),music:text('Music style, or "none"'),natural:text('Real sounds to feature, the ASMR moments; or "none"')}},
 assets:{type:'array',items:{type:'object',required:['what','kind','how'],properties:{what:text('A signature thing: a prop, colour, phrase, gesture or sound'),kind:{type:'string',enum:['object','colour','action','sound','words','effect'],description:'object = a prop you can see; colour = a colour worn or in the place; action = a gesture or move; sound; words = a phrase or on-screen text; effect = an edit effect like a flash, zoom or transition'},how:text('Where it appears in every reel')}},description:'2 or 3 distinctive assets repeated in every reel'},
 dont:{type:'array',items:{type:'string'},description:'3 to 5 things this channel never does'},
 alt_casts:{type:'array',items:{type:'array',items:PERSON},description:'Two more, clearly different options for the host or hosts (same number of hosts as cast, same roles); empty for formats without hosts'},
 alt_places:{type:'array',items:{type:'string'},description:'Two more options for the main place, described the same way'}}};
export function kitPrompt({account,format,cast,expert,study,saved,avoid}){
 return `Design the channel kit for a NEW, original Instagram channel inspired by what works for @${account}. It is not a copy: new name, new people, same winning style.
Format: ${FORMATS[format].name} (${FORMATS[format].kid})${['ai_host','animated'].includes(format)?`. Cast: exactly ${cast} host${cast>1?'s':''}.`:'. Cast: empty (no hosts).'}
Rules:
- ${NO_ORIGIN}
- Every host is a new, made-up person who looks clearly different from the people in the original reels. We say openly in every caption that the hosts are AI, and we never invent a life story or a job title. In the kit itself the hosts and places look like real people in real places: never write "AI", "virtual", "digital" or "avatar" into names, looks, outfits or places.
${expert?'- The original presenters look like experts. Our host may look knowledgeable and tidy, but never with a white coat, stethoscope, badge, scrubs, lab or any sign of a medical or professional title.\n':''}- The channel stays non-medical: its name and promise never mention health, remedies, cures, detox, immunity or what is good or bad for your body.
- Signature things are everyday, non-medical things: never body models, organs, pipes standing for arteries, pills or medical props.
- Name 2 or 3 signature things (a prop, colour, phrase, gesture or sound) that appear in every reel, so viewers recognise the channel in the first seconds.
- Give 3 options for the host or hosts (cast plus alt_casts, clearly different from each other: age, build, hair, style) and 3 options for the main place (place plus alt_places), so the owner can choose.
- Keep the look, place, camera, light, sound and edit that the winners share; keep the sounds that carry the reels (the ASMR moments).
- Plain words a 10-year-old understands.
${avoid?`- Make the host${cast>1?'s':''} clearly different from the last kit's: ${avoid}\n`:''}What the channel's best reels do: ${saved.secret?.headline||''}. Person: ${saved.secret?.person?.text||''} Place: ${saved.secret?.setting?.text||''} Format: ${saved.secret?.format?.text||''}
How three of their best reels are made: ${JSON.stringify(study)}`;
}
const COLOUR=/\b(black|white|grey|gray|navy|blue|red|green|olive|yellow|mustard|orange|pink|purple|brown|beige|cream|tan|khaki|burgundy|teal|denim|silver|gold|charcoal|ivory|lilac|coral|maroon|mint|sage|rust|camel)\b/i;
// The kit must fit its format; a mismatch is an error, not a silent fix.
export function checkKit(kit,format,cast){
 const problems=[];
 if(['ai_host','animated'].includes(format)&&kit.cast?.length!==cast)problems.push(`needs exactly ${cast} host${cast>1?'s':''}, got ${kit.cast?.length||0}`);
 if(!['ai_host','animated'].includes(format)&&kit.cast?.length)problems.push('this format has no hosts');
 if(format==='hands_pov'&&!(kit.hands&&!/^none$/i.test(kit.hands)))problems.push('the hands are not described');
 if(format==='animated'&&!(kit.art_style&&!/^none$/i.test(kit.art_style)))problems.push('the art style is not described');
 if(!(kit.assets?.length>=2))problems.push('needs 2 or 3 signature things');
 // Real-looking pictures need real-looking words: "AI" belongs in the caption, not in the look (learned 2026-09-28).
 const fake=/\b(AI|virtual|digital|avatar|robot|CGI)\b/i;
 if(format!=='animated'&&[kit.name,kit.place,...(kit.cast||[]).flatMap(p=>[p.name,p.look,p.outfit])].some(t=>fake.test(t||'')))problems.push('do not write AI, virtual or digital into the names, looks or places; they must look real');
 if(/\b(health|healthy|remed\w*|cure\w*|detox\w*|immun\w*|toxin\w*|medic\w*)\b/i.test(`${kit.name} ${kit.promise}`))problems.push('the name and promise must stay non-medical (no health, remedies or cures)');
 // An outfit without colours is drawn differently each time (a black top turned grey on 2026-09-28).
 for(const p of kit.cast||[]){const pieces=String(p.outfit||'').split(/,|\band\b|\bwith\b/).map(x=>x.trim()).filter(x=>x.length>3);if(!pieces.length||pieces.some(x=>!COLOUR.test(x)))problems.push(`${p.name}'s outfit needs the exact colour of every piece`);}
 return problems;
}

// 4 Draw: every picture, its prompt and its references, in order. Prompts are built by code from the kit.
const REAL='Photorealistic, natural skin texture and real phone-camera look.';
const CLEAN='No text, no letters, no numbers, no logos, no watermark; any phone or screen is turned away or dark; no camera, tripod or filming gear in view.';
export function picturePlan(kit,format){
 const drawn=format==='animated',look=drawn?`${kit.art_style}. Not photorealistic.`:REAL,list=[];
 (kit.cast||[]).forEach((p,i)=>{
  const who=`${p.look}. Wearing ${p.outfit}.`;
  list.push({role:`face${i}`,label:`${p.name}: face`,person:i,aspect:'9:16',refs:[],prompt:`Portrait of ${p.name}, head and shoulders, looking straight at the camera with a friendly neutral expression. ${who} Plain light grey background, soft even light. ${look} ${CLEAN}`});
  list.push({role:`turn${i}`,label:`${p.name}: every angle`,person:i,faceRef:`face${i}`,aspect:'16:9',refs:[`face${i}`],prompt:`Character reference sheet of exactly this person from the reference picture: three views side by side (front, three-quarter, side profile), head to waist, same face, hair and outfit (${p.outfit}). Plain light grey background, even light. ${look} ${CLEAN}`});
  list.push({role:`body${i}`,label:`${p.name}: full outfit`,person:i,faceRef:`face${i}`,aspect:'9:16',refs:[`face${i}`],prompt:`Full-body photo of exactly this person from the reference picture, standing relaxed, wearing ${p.outfit}. Plain light grey background. ${look} ${CLEAN}`});
 });
 if(format==='hands_pov')list.push({role:'hands',label:'The hands',aspect:'9:16',refs:[],prompt:`Close-up from above of a pair of hands resting on a plain surface: ${kit.hands}. No face. ${REAL} ${CLEAN}`});
 list.push({role:'place',label:'The place',aspect:'9:16',refs:[],prompt:`${kit.place}. ${kit.light}. Empty, ready for filming, no people. Seen as in a vertical phone video. ${look} ${CLEAN}`});
 // Only things you can see go into a picture; phrases, on-screen words and sounds belong to the edit and the voice.
 const props=(kit.assets||[]).filter(a=>['object','colour','action'].includes(a.kind)).map(a=>a.what).join('; ')||'none',hosts=(kit.cast||[]).map((p,i)=>`${p.name} (reference ${i+1})`).join(' and ');
 const sceneRefs=[...(kit.cast||[]).map((_,i)=>`face${i}`),...(format==='hands_pov'?['hands']:[]),'place'];
 const action=kit.cast?.length?`${hosts} ${kit.cast.map(p=>p.role).join('; ')}, in this exact place (last reference)`:format==='hands_pov'?`The hands from the reference doing the channel's typical action, seen from the channel's usual angle, in this exact place (last reference). No face`:`The channel's typical subject in action, in this exact place (last reference). No people`;
 list.push({role:'scene',label:'A frame from a reel',aspect:'9:16',refs:sceneRefs,expectedPeople:kit.cast?.length||0,...(kit.cast?.length===1?{faceRef:'face0'}:{}),prompt:`A single frame from one of this channel's vertical reels. ${action}. Camera: ${kit.camera}. Light: ${kit.light}. Signature things visible: ${props}. ${look} ${CLEAN}`});
 return list;
}

// 5 Check each picture: Gemini looks; code decides.
export const CHECK_SCHEMA={type:'object',required:['shows','match','text_visible','broken','people_count','same_person','looks_like_original'],properties:{
 shows:text('What the first picture shows, in one sentence'),
 match:{type:'integer',minimum:0,maximum:3,description:'How well the first picture shows the brief: 0 = something else, 1 = partly, 2 = mostly, 3 = exactly'},
 text_visible:{type:'boolean',description:'Any readable or garbled letters, words or logos in the first picture'},
 broken:{type:'boolean',description:'Warped faces, extra or missing fingers, melted objects in the first picture'},
 people_count:{type:'integer',description:'How many people (faces or bodies, not only hands) are in the first picture'},
 same_person:{type:'string',enum:['yes','no','no_reference'],description:'Is the person in the first picture the same person as in the face reference?'},
 looks_like_original:{type:'string',enum:['yes','no','no_reference'],description:'Could a viewer mistake a person in the first picture for a person in the frame from the original channel?'}}};
export function checkPrompt(item,{hasFace,hasOriginal}){
 return `Quality check for one reference picture. The FIRST picture is the new picture.${hasFace?' The SECOND picture is the face reference of the host it should show.':''}${hasOriginal?` The ${hasFace?'THIRD':'SECOND'} picture is a frame from the original channel we must NOT copy.`:''}
Brief for the new picture: "${item.prompt}"`;
}
// Answers about a reference that was not sent are ignored (Gemini answered "yes" to a missing one on 2026-09-28).
export function checkVerdict(seen,item,{hasFace=Boolean(item.faceRef),hasOriginal=false}={}){
 const problems=[];
 if(!(seen.match>=2))problems.push(seen.match===1?'only partly what was asked':'shows something else');
 if(seen.text_visible)problems.push('letters or a logo are visible');
 if(seen.broken)problems.push('something looks warped or broken');
 if(hasFace&&seen.same_person==='no')problems.push('not the same person as the face');
 if(hasOriginal&&seen.looks_like_original==='yes')problems.push('looks like a person from the original channel');
 // Option pictures are named opt<n>-face0 and opt<n>-place: the kind is read anywhere in the name.
 const person=/(^|-)(face|turn|body)\d/.test(item.role),expected=person?1:item.role==='scene'?item.expectedPeople:0;
 if(expected!==undefined&&!/(^|-)turn\d/.test(item.role)&&seen.people_count!==expected)problems.push(`${seen.people_count} people instead of ${expected}`);
 return {pass:!problems.length,problems};
}

// The options to choose from: every host option and place option that fits the format (the kit's own first).
export function kitOptions(kit,format,cast){
 const casts=['ai_host','animated'].includes(format)?[kit.cast,...(kit.alt_casts||[])].filter(c=>Array.isArray(c)&&c.length===cast&&c.every(h=>h?.name&&h.look&&h.outfit)).slice(0,3):[];
 const places=[kit.place,...(kit.alt_places||[])].filter(p=>typeof p==='string'&&p.trim()).slice(0,3);
 return {casts,places};
}
// Jev scores every option; code picks the best one whose pictures passed their checks, and says why from the scores.
export function optionsRequest(kit,brief,casts,places){
 const questions={};
 casts.forEach((c,i)=>{questions[`cast_${i}`]={type:'score',instructions:`How right is host option ${i+1} (\`casts[${i}]\`) for this channel (\`channel\`): fits the audience and the winners' style, looks trustworthy and relatable, is memorable, and is clearly a new person?`,criteria:['Wrong for it','Could work','Good fit','The right face for this channel']};});
 places.forEach((p,i)=>{questions[`place_${i}`]={type:'score',instructions:`How right is place option ${i+1} (\`places[${i}]\`) for this channel: fits the winners' setting, looks good and clean on camera, easy to film the channel's actions in?`,criteria:['Wrong for it','Could work','Good fit','The right place']};});
 return {model:'jev-latest',state:{channel:brief,casts:casts.map(c=>c.map(h=>({name:h.name,role:h.role,look:h.look,outfit:h.outfit,picture:h.picture}))),places:places.map(p=>({place:p.text,picture:p.picture}))},questions};
}
export function pickBest(scores,passed){
 const order=scores.map((s,i)=>({i,s:s??0,ok:passed[i]!==false})).sort((a,b)=>(b.ok-a.ok)||(b.s-a.s));
 if(!order.length)return null;const best=order[0],next=order[1];
 return {index:best.i,score:best.s,why:`Jev's pick: the best fit for the channel (${best.s.toFixed(1)} of 3${next?`; next best ${next.s.toFixed(1)}`:''})${best.ok?'':'. Its picture has a flagged check'}.`};
}
// Price before paying: pictures at the Nano Banana 2 price, one retry each at most, plus studying and writing.
export const PRICE={picture:0.067,check:0.003,study:0.012,write:0.06};
// With options: 3 faces per host and 3 places first, then the chosen host's other pictures and a scene.
export function estimateKit(format,cast=1){
 const hosts=['ai_host','animated'].includes(format)?cast:0,pictures=hosts*3+2+hosts*2+(format==='hands_pov'?1:0)+1;
 const once=pictures*(PRICE.picture+PRICE.check);
 return {pictures,usd:Math.round((3*PRICE.study+PRICE.write+once)*100)/100,ceiling:Math.round((3*PRICE.study+PRICE.write*2+once*2)*100)/100};
}

// Copy mode (Kaan, 2026-09-29): replicate a channel's proven winners with our own hosts and place, instead of
// inventing new ideas. Our invented reels beat 0 to 3 of 10 of Ken's typical reels; his "pour boiling water over X"
// format won four times (104x, 72x, 12x, 12x his normal). Everything here is code: which winners, the script built
// from the original's own timed words, how close a copy is, and how far along a batch is.
import {PART_SECONDS,partUsd,OMNI_CHAIN_PARTS} from './kit-reel.mjs';

// Google extends an Omni video only while it is 30 seconds or shorter (a 5-part copy was refused at part 5 on
// 2026-09-29), so one Omni chain is 4 parts (40 s); a longer copy starts a fresh chain every 4 parts and the chains are
// joined (no length cap, Kaan 2026-09-29).
export const COPY_MAX_PARTS=OMNI_CHAIN_PARTS;
const norm=w=>String(w).toLowerCase().replace(/[^\p{L}\p{N}']+/gu,'');
export const wordsOf=t=>String(t||'').split(/\s+/).map(norm).filter(Boolean);

// The format a reel belongs to: its first four spoken words ("pour boiling water over").
export const formatKey=t=>wordsOf(t).slice(0,4).join(' ');

// Winners worth copying (Kaan, 2026-09-29: "suggest their best high engagement viral videos, don't suggest bad ones"):
// at least 3x their normal, the most-PLAYED first, any length (a reel longer than one video model allows is filmed as
// joined videos), with speech and word times. On natural.solutions the old order (x-normal, at most 41 s) offered two
// 60K-play reels, one an ad for their book, and skipped the 14.3M, 5.4M and 2.0M ones.
// Never suggested: an ad for their own product (it only works with their product), and a reel whose engagement is under
// half the channel's usual (many plays and few likes is what a paid boost looks like: the book ad had 5.5 per 1,000 plays
// against 17 to 22 for their organic hits).
// `repeats`: how many winners share this script. Near-identical scripts count once (the most-played is kept), so five
// picks are five different reels; a script that won more than once is a formula, not luck.
// `timed`: the transcript has word times to copy from; an imported plain-text transcript has none (audit, 2026-09-29).
const PROMO=/\b(my|the|our) (new )?(book|cookbook|course|program|programme|ebook|e-book|masterclass|supplement|product|shop|store)\b|\blink in (my |the )?bio\b|\buse (my )?code\b/i;
export const isPromo=text=>PROMO.test(String(text||'').split(/\s+/).slice(0,25).join(' '));
const median=a=>{const v=a.filter(Number.isFinite).sort((x,y)=>x-y);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
// Two scripts are the same when they open with the same four words or share half their first 40 words.
export function sameScript(a,b){
 if(formatKey(a)&&formatKey(a)===formatKey(b))return true;
 const x=new Set(wordsOf(a).slice(0,40)),y=new Set(wordsOf(b).slice(0,40));if(!x.size||!y.size)return false;
 let both=0;for(const w of x)if(y.has(w))both++;return both/(x.size+y.size-both)>=0.5;
}
// A winner with no speech, or whose sound is a song, is copied by its shots and printed line (visual copy): it needs no
// word times. `silent`: the scan found no speech in it (music or too few words).
export function copyCandidates(reels,{max=8}={}){
 const usual=median(reels.map(r=>r.engagement));
 const winners=reels.filter(r=>r.xNormal>=3&&r.seconds>0&&(r.silent===true||wordsOf(r.text).length>=8&&r.timed===true)&&!isPromo(r.text)&&!(usual&&Number.isFinite(r.engagement)&&r.engagement<usual/2))
  .sort((a,b)=>(b.plays??-1)-(a.plays??-1)||b.xNormal-a.xNormal);
 const groups=[];for(const r of winners){const g=groups.find(g=>sameScript(g[0].text,r.text));if(g)g.push(r);else groups.push([r]);}
 return groups.slice(0,max).map(g=>({...g[0],format:formatKey(g[0].text),repeats:g.length}));
}
// Jev: can current AI video copy this reel shot by shot with our hosts in our place?
export function copyableRequest(breakdown,kit){
 return {model:'jev-latest',state:{reel:{beats:breakdown.beats,payoff:breakdown.payoff,first_second:breakdown.first_second},our_hosts:(kit.cast||[]).map(h=>({name:h.name,look:h.look,role:h.role})),our_place:kit.place},questions:{
  copyable:{type:'score',instructions:'How faithfully can current AI video copy `reel` shot by shot with `our_hosts` in `our_place`: the same actions, objects, results and sounds? Simple hand actions, few objects and a clear physical result copy well; many people, fast complex motion, text on screen or tricky physics copy badly.',criteria:['Will not copy','Loses a lot','Copies most of it','Copies almost exactly']},
  roles_fit:{type:'noul',instructions:'Can `our_hosts` play every person who appears in `reel` (same number of people or fewer)?',criteria:{true:'Yes, our hosts can play them',false:'No, it needs other people'}}}};
}
// The final five: strongest first, dropping reels Jev says will not copy or need people we do not have.
export function pickCopies(cands,judgments,n=5){
 return cands.map((c,i)=>({...c,copyable:judgments[i]?.answers?.copyable?.score??null,rolesFit:judgments[i]?.answers?.roles_fit?.noul??null}))
  .filter(c=>c.copyable>=1.5&&c.rolesFit>=0.5).slice(0,n)
  .map(c=>({...c,why:`${c.repeats>1?`${c.repeats} of their winners use this script. `:''}Jev rates it ${c.copyable.toFixed(1)} of 3 for copying.`}));
}
// Every transcript segment with words has a start and an end, so each word has a time to be copied on.
export const hasTimedWords=segments=>{const said=(segments||[]).filter(s=>String(s?.text||'').trim());return said.length>0&&said.every(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>=s.start);};

// The original's words with times: each transcript segment's time is shared out across its words by length.
export function timedWords(segments){
 const out=[];for(const s of segments||[]){const ws=String(s.text||'').trim().split(/\s+/).filter(Boolean);if(!ws.length)continue;
  const total=ws.reduce((a,w)=>a+w.length+1,0);let at=s.start;for(const w of ws){const d=(s.end-s.start)*(w.length+1)/total;out.push({text:w,start:at,end:at+d});at+=d;}}
 return out;
}
// The copy script, built by code: the original's beats cut at every 10-second part boundary, each carrying exactly the
// words the original says in it (by word time). `cast` maps each original beat to our host (or 'voice'); `does`
// swaps the original's people and place for ours. Nothing is rewritten, so nothing drifts.
// lengths: each part's seconds. Omni films 10-second parts (the default); Veo films 8 s, then 7 s per extension.
export function copyScript({breakdown,segments,seconds,cast,hook,caption,lengths=null}){
 const words=timedWords(segments),L=lengths||Array.from({length:Math.max(1,Math.ceil((seconds-1)/PART_SECONDS))},()=>PART_SECONDS);
 const parts=L.length,start=L.map((_,i)=>L.slice(0,i).reduce((a,b)=>a+b,0)),end=L.reduce((a,b)=>a+b,0),partAt=t=>{let p=0;while(p<parts-1&&t>=start[p+1])p++;return p;};
 // Beats in order, covering 0 to the end with no gaps; the last one runs to the end of the last part.
 const src=[...breakdown.beats].sort((a,b)=>a.from-b.from).filter(b=>b.from<end);
 const beats=src.map((b,i)=>({...cast[breakdown.beats.indexOf(b)],from:i?b.from:0,to:i===src.length-1?end:Math.min(src[i+1].from,end),shot:b.shot,sound:b.sound||''}));
 const out=Array.from({length:parts},()=>({beats:[]}));
 for(const b of beats)for(let p=partAt(b.from);p<parts&&start[p]<b.to;p++){
  const a=Math.max(b.from,start[p]),z=Math.min(b.to,start[p]+L[p]);
  const says=words.filter(w=>{const mid=(w.start+w.end)/2;return mid>=a&&mid<z;}).map(w=>w.text).join(' ');
  out[p].beats.push({from:a-start[p],to:z-start[p],shot:b.shot,who:b.who,does:b.does,says,sound:b.sound});
 }
 // Whole seconds for the maker, each part running 0 to 10 with no gaps.
 // A beat too short for a whole second keeps its words: they join the beat before it, or the next one when it comes
 // first. Dropping it lost words silently (up to 5% passed the kept check; audit, 2026-09-29).
 let carry='',last=null;const join=(a,b)=>`${a} ${b}`.trim();
 for(const pt of out){const kept=[];
  for(const x of pt.beats.map(x=>({...x,from:Math.round(x.from),to:Math.round(x.to)}))){
   if(x.to>x.from){if(carry){x.says=join(carry,x.says);carry='';}kept.push(x);last=x;}
   else if(kept.length)kept.at(-1).says=join(kept.at(-1).says,x.says);else carry=join(carry,x.says);}
  pt.beats=kept;if(pt.beats.length){pt.beats[0].from=0;pt.beats.at(-1).to=L[out.indexOf(pt)];for(let i=1;i<pt.beats.length;i++)pt.beats[i].from=pt.beats[i-1].to;}}
 if(carry&&last)last.says=join(last.says,carry);
 // Words said after the last whole part (a 37-second reel filmed as 40) still belong to the last beat.
 const late=words.filter(w=>(w.start+w.end)/2>=end).map(w=>w.text).join(' ');if(late){const b=out.at(-1).beats.at(-1);b.says=`${b.says} ${late}`.trim();}
 // Each part says how long it is, so its prompt and its check use the right length.
 return {hook_title:hook,caption,parts:out.map((p,i)=>({...p,seconds:L[i]})).filter(p=>p.beats.length)};
}
// How many of the original's words, in order, the copy keeps (longest common subsequence over the original's words).
export function wordsKept(original,copy){
 const a=wordsOf(original),b=wordsOf(copy);if(!a.length)return 1;
 let prev=new Array(b.length+1).fill(0);for(let i=1;i<=a.length;i++){const cur=[0];for(let j=1;j<=b.length;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}
 return Math.round(prev[b.length]/a.length*1000)/1000;
}
// Every 4th part starts a fresh Omni chain (Google extends a video only while it is 30 s or shorter), priced as a first part.
export const copyPrice=parts=>Math.round(Array.from({length:parts},(_,i)=>partUsd(i%COPY_MAX_PARTS)).reduce((x,y)=>x+y,0)*100)/100;

// Progress that means something: each stage's expected seconds (measured from real runs, then learned from each new
// one), the stage the copy is in, and how long it has been there. A stage never shows as done before it is.
// Veo's film times are separate (a guess until the first real runs teach them).
export const STAGE_SECONDS={study:20,script:15,film_first:45,film_next:75,veo_film_first:75,veo_film_next:90,check:8,voices:40,edit:50,cover:12,compare:35};
// The key a stage is learned under: Veo's filming is timed apart from Omni's.
export const engineKey=(key,engine)=>/^veo/.test(engine||'')&&/^film/.test(key||'')?`veo_${key}`:key;
export function stageKey(stage){
 const s=String(stage||'');
 if(/^Studying/.test(s))return 'study';if(/^Writing the copy/.test(s))return 'script';
 const f=s.match(/^Filming part (\d+)/);if(f)return f[1]==='1'?'film_first':'film_next';
 if(/^Checking part/.test(s))return 'check';if(/^Recording the voices/.test(s))return 'voices';if(/^Editing/.test(s))return 'edit';if(/^Making the cover/.test(s))return 'cover';if(/^Comparing/.test(s))return 'compare';
 return null;
}
export function plannedStages(parts,voiceMode,learned={},engine='omni'){
 const t=k=>learned[k]??STAGE_SECONDS[k],list=[{key:'study'},{key:'script'}];
 for(let i=0;i<parts;i++)list.push({key:engineKey(i?'film_next':'film_first',engine),part:i+1},{key:'check',part:i+1});
 if(voiceMode==='designed')list.push({key:'voices'});list.push({key:'edit'},{key:'cover'},{key:'compare'});
 return list.map(s=>({...s,seconds:t(s.key)}));
}
// done: stages finished; inStage: seconds spent in the current one. Returns 0-100 and the seconds left.
export function progressOf(stages,done,inStage){
 const total=stages.reduce((a,s)=>a+s.seconds,0),before=stages.slice(0,done).reduce((a,s)=>a+s.seconds,0),cur=stages[done];
 const inside=cur?Math.min(inStage,cur.seconds*0.95):0;
 return {pct:Math.min(100,Math.round((before+inside)/total*100)),left:Math.max(0,Math.round(total-before-inside))};
}
// Learned stage times: the median of what really happened (kept small), so the next ETA is closer.
export function learnStage(learned,key,seconds){const list=[...(learned.samples?.[key]||[]),seconds].slice(-12),sorted=[...list].sort((a,b)=>a-b);
 return {...learned,samples:{...learned.samples,[key]:list},[key]:Math.round(sorted[Math.floor(sorted.length/2)])};}

// Fidelity: code's words kept and length, the side-by-side watch per original beat (0-3), one number for the tile.
// `count` is the original's beat count: each original beat is scored once, and one the watch left out scores 0.
// Dividing by the beats Gemini returned let 5 judged beats of 9 read as 100% (audit, 2026-09-29).
// A beat counts as the lower of its action and its framing (a wide shot of the right action is not a copy).
export const matchByBeat=(seen,count)=>Array.from({length:count},(_,i)=>{const x=(seen||[]).find(y=>y.beat===i+1);return x?Math.min(x.match||0,x.framing??x.match??0):0;});
export function fidelityScore({wordsKept:w,lengthRatio,beats,count}){
 const m=Number.isInteger(count)&&count>0?matchByBeat(beats,count):beats?.length?beats.map(b=>b.match||0):null;
 const shots=m?m.reduce((a,v)=>a+v,0)/(m.length*3):null,len=Number.isFinite(lengthRatio)?Math.max(0,1-Math.abs(1-lengthRatio)):null;
 const parts=[[shots,0.6],[w,0.3],[len,0.1]].filter(([v])=>Number.isFinite(v));
 const score=parts.length?Math.round(parts.reduce((a,[v,x])=>a+v*x,0)/parts.reduce((a,[,x])=>a+x,0)*100):null;
 return {score,shots:shots===null?null:Math.round(shots*100),words:Number.isFinite(w)?Math.round(w*100):null,length:len===null?null:Math.round(len*100)};
}

// The side-by-side watch: Gemini sees the original (A) and our copy (B) and goes through the original's beats one by
// one. Jev then decides from what Gemini saw plus code's numbers: faithful, or which part to film again.
export const FIDELITY_SCHEMA={type:'object',required:['beats','same_feel','biggest_gap'],properties:{
// Framing and the result are asked apart from the action: the Omni chicken copy scored 78 "faithful" while its camera
// stood back and the foam (the payoff) was never visible (checked by eye, 2026-09-29).
 beats:{type:'array',description:'One entry per beat of the ORIGINAL, in order',items:{type:'object',required:['beat','match','framing','result_visible','differs'],properties:{
  beat:{type:'integer',description:'The beat number from the list (1 = first)'},
  match:{type:'integer',minimum:0,maximum:3,description:'How closely reel B copies this beat of reel A: 0 = missing, 1 = something else happens, 2 = the same action with visible differences, 3 = the same action, framing, result and sound (other people and place are expected and do not count)'},
  framing:{type:'integer',minimum:0,maximum:3,description:'How closely B copies the CAMERA of this beat: how close it is, the angle, what fills the frame (the food large in the foreground, a hand in close-up). 0 = a different kind of shot (wide instead of close), 3 = the same framing'},
  result_visible:{type:'string',enum:['yes','no','no_result'],description:'When A shows a result in this beat (foam, a colour change, something floating, a before and after), is the SAME result clearly visible in B? no_result when A shows no result here'},
  differs:{type:'string',description:'What is different in B, or "nothing"'}}}},
 same_feel:{type:'integer',minimum:0,maximum:3,description:'Would a viewer who saw A feel they watched the same reel in B, only with other people? 0 = not at all, 3 = exactly'},
 biggest_gap:{type:'string',description:'The one thing B most needs to match A, or "nothing"'}}};
export const fidelityPrompt=beats=>`Reel A is the original. Reel B is our copy of it, made with different people in a different place on purpose. Judge only how faithfully B copies A: the same actions, objects, camera framing, results, sounds, timing and words. Be strict about the camera (how close, what fills the frame) and about whether each result A shows is clearly visible in B. Different people, clothes and room are expected and never count against B.
The beats of A, in order:\n${beats.map((b,i)=>`${i+1}. ${b.from}-${b.to} s: ${b.shot}; ${b.happens}${b.says?`; says "${b.says}"`:''}${b.sound?`; sound: ${b.sound}`:''}`).join('\n')}`;
// Code's final word. Jev was tried here and failed (2026-09-29): an identical copy got 0.35 "faithful", a copy with one
// beat off got 0.78, and a different reel got "no redo". So code decides from the measured watch: faithful needs a
// score of 75 and the same feel (2 of 3); the part to film again is the one whose beats matched worst.
export function fidelityVerdict(score,seen,beats){
 const byPart=new Map();matchByBeat(seen?.beats,beats.length).forEach((m,i)=>{const p=Math.floor(beats[i].from/PART_SECONDS)+1;byPart.set(p,[...(byPart.get(p)||[]),m]);});
 const worst=[...byPart].map(([p,m])=>({p,avg:m.reduce((a,v)=>a+v,0)/m.length})).sort((a,b)=>a.avg-b.avg||a.p-b.p)[0];
 // A result the original shows that the copy does not is never faithful: the payoff is the reel.
 const missing=(seen?.beats||[]).filter(x=>x.result_visible==='no').map(x=>x.beat);
 const faithful=score>=75&&(seen?.same_feel??0)>=2&&!missing.length;
 const redoBeat=missing.length?beats[missing[0]-1]:null,redo=redoBeat?`part_${Math.floor(redoBeat.from/PART_SECONDS)+1}`:!faithful&&worst&&worst.avg<2.5?`part_${worst.p}`:null;
 return {faithful,redo,resultMissing:missing};
}

// What went wrong, in plain words (the tiles showed raw server messages on 2026-09-29).
export function plainError(message){
 const m=String(message||'');
 if(/longer than 30s are not supported for extension/i.test(m))return 'Google cannot make a video longer than 40 seconds.';
 if(/prohibited content/i.test(m))return 'Google refused this reel\'s words or images, even after softening them.';
 if(/rate limit|429/i.test(m))return 'Google was busy (too many requests). Try again.';
 if(/failed its check twice/i.test(m))return m.replace(/^Part (\d+) failed its check twice/,'Part $1 did not match the original twice');
 if(/restarted/i.test(m))return m;
 return m.split('\n')[0].replace(/^Gemini: HTTP \d+\.\s*/,'').slice(0,160);
}

// Visual copy (Kaan, 2026-09-29, @saywaybrand): when a winner's sound is a song (the transcript then holds lyrics) or it
// has no speech, the copy keeps its shots, timing and printed line (a shirt's quote) and speaks nothing; the song is
// added on Instagram. Code decides from the scan's status and the breakdown's own description of the voice.
const SUNG=/\b(sing|sings|singing|sung|song|songs|rap|raps|rapping|lyric|lyrics|chorus|vocals?|music|instrumental|no speech|no voice)\b/i;
export function copyMode({post,breakdown}){
 if(['music','no_speech','no_audio'].includes(post?.status)||post?.excludedReason)return 'visual';
 return SUNG.test(breakdown?.voice?.delivery||'')?'visual':'spoken';
}
export function visualScript({breakdown,seconds,cast,lengths=null,caption}){
 const s=copyScript({breakdown:{...breakdown,beats:(breakdown.beats||[]).map(b=>({...b,says:''}))},segments:[],seconds,cast,hook:'',caption,lengths});
 for(const p of s.parts)for(const b of p.beats)b.says='';
 return {...s,visual:true,print:String(breakdown.hook_words||'').trim(),hook_title:''};
}

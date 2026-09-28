// Copy mode (Kaan, 2026-09-29): replicate a channel's proven winners with our own hosts and place, instead of
// inventing new ideas. Our invented reels beat 0 to 3 of 10 of Ken's typical reels; his "pour boiling water over X"
// format won four times (104x, 72x, 12x, 12x his normal). Everything here is code: which winners, the script built
// from the original's own timed words, how close a copy is, and how far along a batch is.
import {PART_SECONDS,partUsd} from './kit-reel.mjs';

// 40 seconds: Google extends a video only while it is 30 seconds or shorter (a 5-part copy was refused at part 5 on
// 2026-09-29), so 4 parts is the longest reel. Winners up to 41 seconds are copied; the last second's words join the end.
export const COPY_MAX_PARTS=4;
const norm=w=>String(w).toLowerCase().replace(/[^\p{L}\p{N}']+/gu,'');
export const wordsOf=t=>String(t||'').split(/\s+/).map(norm).filter(Boolean);

// The format a reel belongs to: its first four spoken words ("pour boiling water over").
export const formatKey=t=>wordsOf(t).slice(0,4).join(' ');

// Winners worth copying: the strongest against their own normal first, short enough to film, with speech to copy.
// `repeats` counts the channel's winners (at least 3x normal) that share the format: a format that won more than once
// is a formula, not luck (Winner DNA found single hits mostly luck, rho 0.02 on Ken).
export function copyCandidates(reels,{max=8,maxSeconds=COPY_MAX_PARTS*PART_SECONDS+1}={}){
 const winners=reels.filter(r=>r.xNormal>=3),count=new Map();for(const r of winners){const k=formatKey(r.text);if(k)count.set(k,(count.get(k)||0)+1);}
 return reels.filter(r=>r.xNormal>=3&&r.seconds>0&&r.seconds<=maxSeconds&&wordsOf(r.text).length>=8).sort((a,b)=>b.xNormal-a.xNormal).slice(0,max)
  .map(r=>({...r,format:formatKey(r.text),repeats:count.get(formatKey(r.text))||1}));
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
  .map(c=>({...c,why:`${c.repeats>1?`This format won ${c.repeats} times. `:''}Jev: copies ${c.copyable.toFixed(1)} of 3.`}));
}

// The original's words with times: each transcript segment's time is shared out across its words by length.
export function timedWords(segments){
 const out=[];for(const s of segments||[]){const ws=String(s.text||'').trim().split(/\s+/).filter(Boolean);if(!ws.length)continue;
  const total=ws.reduce((a,w)=>a+w.length+1,0);let at=s.start;for(const w of ws){const d=(s.end-s.start)*(w.length+1)/total;out.push({text:w,start:at,end:at+d});at+=d;}}
 return out;
}
// The copy script, built by code: the original's beats cut at every 10-second part boundary, each carrying exactly the
// words the original says in it (by word time). `cast` maps each original beat to our host (or 'voice'); `does`
// swaps the original's people and place for ours. Nothing is rewritten, so nothing drifts.
export function copyScript({breakdown,segments,seconds,cast,hook,caption}){
 const words=timedWords(segments),parts=Math.min(COPY_MAX_PARTS,Math.max(1,Math.ceil((Math.min(seconds,COPY_MAX_PARTS*PART_SECONDS)-0.5)/PART_SECONDS))),end=parts*PART_SECONDS;
 // Beats in order, covering 0 to the end with no gaps; the last one runs to the end of the last part.
 const src=[...breakdown.beats].sort((a,b)=>a.from-b.from).filter(b=>b.from<end);
 const beats=src.map((b,i)=>({...cast[breakdown.beats.indexOf(b)],from:i?b.from:0,to:i===src.length-1?end:Math.min(src[i+1].from,end),shot:b.shot,sound:b.sound||''})).filter(b=>b.to-b.from>0.2);
 const out=Array.from({length:parts},()=>({beats:[]}));
 for(const b of beats)for(let p=Math.floor(b.from/PART_SECONDS);p<parts&&p*PART_SECONDS<b.to;p++){
  const a=Math.max(b.from,p*PART_SECONDS),z=Math.min(b.to,(p+1)*PART_SECONDS);if(z-a<0.2)continue;
  const says=words.filter(w=>{const mid=(w.start+w.end)/2;return mid>=a&&mid<z;}).map(w=>w.text).join(' ');
  out[p].beats.push({from:a-p*PART_SECONDS,to:z-p*PART_SECONDS,shot:b.shot,who:b.who,does:b.does,says,sound:b.sound});
 }
 // Whole seconds for the maker, each part running 0 to 10 with no gaps.
 for(const pt of out){pt.beats=pt.beats.map(x=>({...x,from:Math.round(x.from),to:Math.round(x.to)})).filter(x=>x.to>x.from);if(pt.beats.length){pt.beats[0].from=0;pt.beats.at(-1).to=PART_SECONDS;for(let i=1;i<pt.beats.length;i++)pt.beats[i].from=pt.beats[i-1].to;}}
 // Words said after the last whole part (a 37-second reel filmed as 40) still belong to the last beat.
 const late=words.filter(w=>(w.start+w.end)/2>=end).map(w=>w.text).join(' ');if(late){const b=out.at(-1).beats.at(-1);b.says=`${b.says} ${late}`.trim();}
 return {hook_title:hook,caption,parts:out.filter(p=>p.beats.length)};
}
// How many of the original's words, in order, the copy keeps (longest common subsequence over the original's words).
export function wordsKept(original,copy){
 const a=wordsOf(original),b=wordsOf(copy);if(!a.length)return 1;
 let prev=new Array(b.length+1).fill(0);for(let i=1;i<=a.length;i++){const cur=[0];for(let j=1;j<=b.length;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);prev=cur;}
 return Math.round(prev[b.length]/a.length*1000)/1000;
}
export const copyPrice=parts=>Math.round(Array.from({length:parts},(_,i)=>partUsd(i)).reduce((x,y)=>x+y,0)*100)/100;

// Progress that means something: each stage's expected seconds (measured from real runs, then learned from each new
// one), the stage the copy is in, and how long it has been there. A stage never shows as done before it is.
export const STAGE_SECONDS={study:20,script:15,film_first:45,film_next:75,check:8,voices:40,edit:50,cover:12,compare:35};
export function stageKey(stage){
 const s=String(stage||'');
 if(/^Studying/.test(s))return 'study';if(/^Writing the copy/.test(s))return 'script';
 const f=s.match(/^Filming part (\d+)/);if(f)return f[1]==='1'?'film_first':'film_next';
 if(/^Checking part/.test(s))return 'check';if(/^Recording the voices/.test(s))return 'voices';if(/^Editing/.test(s))return 'edit';if(/^Making the cover/.test(s))return 'cover';if(/^Comparing/.test(s))return 'compare';
 return null;
}
export function plannedStages(parts,voiceMode,learned={}){
 const t=k=>learned[k]??STAGE_SECONDS[k],list=[{key:'study'},{key:'script'}];
 for(let i=0;i<parts;i++)list.push({key:i?'film_next':'film_first',part:i+1},{key:'check',part:i+1});
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
export function fidelityScore({wordsKept:w,lengthRatio,beats}){
 const shots=beats?.length?beats.reduce((a,b)=>a+(b.match||0),0)/(beats.length*3):null,len=Number.isFinite(lengthRatio)?Math.max(0,1-Math.abs(1-lengthRatio)):null;
 const parts=[[shots,0.6],[w,0.3],[len,0.1]].filter(([v])=>Number.isFinite(v));
 const score=parts.length?Math.round(parts.reduce((a,[v,x])=>a+v*x,0)/parts.reduce((a,[,x])=>a+x,0)*100):null;
 return {score,shots:shots===null?null:Math.round(shots*100),words:Number.isFinite(w)?Math.round(w*100):null,length:len===null?null:Math.round(len*100)};
}

// The side-by-side watch: Gemini sees the original (A) and our copy (B) and goes through the original's beats one by
// one. Jev then decides from what Gemini saw plus code's numbers: faithful, or which part to film again.
export const FIDELITY_SCHEMA={type:'object',required:['beats','same_feel','biggest_gap'],properties:{
 beats:{type:'array',description:'One entry per beat of the ORIGINAL, in order',items:{type:'object',required:['beat','match','differs'],properties:{
  beat:{type:'integer',description:'The beat number from the list (1 = first)'},
  match:{type:'integer',minimum:0,maximum:3,description:'How closely reel B copies this beat of reel A: 0 = missing, 1 = something else happens, 2 = the same action with visible differences, 3 = the same action, framing, result and sound (other people and place are expected and do not count)'},
  differs:{type:'string',description:'What is different in B, or "nothing"'}}}},
 same_feel:{type:'integer',minimum:0,maximum:3,description:'Would a viewer who saw A feel they watched the same reel in B, only with other people? 0 = not at all, 3 = exactly'},
 biggest_gap:{type:'string',description:'The one thing B most needs to match A, or "nothing"'}}};
export const fidelityPrompt=beats=>`Reel A is the original. Reel B is our copy of it, made with different people in a different place on purpose. Judge only how faithfully B copies A: the same actions, objects, framing, results, sounds, timing and words. Different people, clothes and room are expected and never count against B.
The beats of A, in order:\n${beats.map((b,i)=>`${i+1}. ${b.from}-${b.to} s: ${b.shot}; ${b.happens}${b.says?`; says "${b.says}"`:''}${b.sound?`; sound: ${b.sound}`:''}`).join('\n')}`;
// Code's final word. Jev was tried here and failed (2026-09-29): an identical copy got 0.35 "faithful", a copy with one
// beat off got 0.78, and a different reel got "no redo". So code decides from the measured watch: faithful needs a
// score of 75 and the same feel (2 of 3); the part to film again is the one whose beats matched worst.
export function fidelityVerdict(score,seen,beats){
 const byPart=new Map();(seen?.beats||[]).forEach(x=>{const b=beats[x.beat-1];if(!b)return;const p=Math.floor(b.from/PART_SECONDS)+1;byPart.set(p,[...(byPart.get(p)||[]),x.match||0]);});
 const worst=[...byPart].map(([p,m])=>({p,avg:m.reduce((a,v)=>a+v,0)/m.length})).sort((a,b)=>a.avg-b.avg||a.p-b.p)[0];
 const faithful=score>=75&&(seen?.same_feel??0)>=2;
 return {faithful,redo:!faithful&&worst&&worst.avg<2.5?`part_${worst.p}`:null};
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

// Captions for finished reels: word timestamps from Groq Whisper on the final voiceover, grouped into short chunks.
// Accurate captions help people follow (research library: captions-comprehension, moderate), so the words come from the
// audio itself, not from the script.
import {readFile} from 'node:fs/promises';
import {request,auth} from './providers.mjs';

export function wordsFromWhisper(raw){
 if(!Array.isArray(raw?.words))throw new Error('Whisper returned no word timestamps');
 return raw.words.map(w=>({text:String(w.word).trim(),start:w.start,end:w.end})).filter(w=>w.text&&Number.isFinite(w.start)&&Number.isFinite(w.end));
}

// At most 3 words and about 18 letters per chunk; a chunk ends after , . ! ? : ; so a sentence never runs on. Each chunk
// stays up until the next one starts (no blank flicker between them).
export function chunkCaptions(words,{maxWords=3,maxChars=18}={}){
 const chunks=[];let cur=[];
 const flush=()=>{if(cur.length){chunks.push({words:cur,start:cur[0].start,end:cur.at(-1).end});cur=[];}};
 for(const w of words){
  if(cur.length&&(cur.length>=maxWords||cur.map(x=>x.text).join(' ').length+1+w.text.length>maxChars))flush();
  cur.push(w);if(/[,.!?:;]$/.test(w.text))flush();
 }
 flush();
 for(let i=0;i<chunks.length-1;i++)chunks[i].end=chunks[i+1].start;
 return chunks;
}

export async function transcribeWords(file,key){
 const form=new FormData();form.append('model','whisper-large-v3-turbo');form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('temperature','0');
 form.append('file',new Blob([await readFile(file)]),file.split('/').pop());
 const r=await request('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:auth(key),body:form},{service:'Groq'});
 return wordsFromWhisper(await r.json());
}

// The voice reads the script word for word, so captions use the script's own spelling; Whisper only supplies timing.
// Words are matched in order on their letters (dynamic programming); an unmatched script word gets a time between its
// neighbours. (Whisper dropped the "Sub" of "Submerge" on the first real reel, 2026-09-27.)
const norm=w=>w.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function similar(a,b){if(!a||!b)return false;return a===b||(a.length>3&&b.length>3&&(a.includes(b)||b.includes(a)));}
export function alignScript(text,whisper){
 const script=String(text).trim().split(/\s+/).filter(Boolean),n=script.length,m=whisper.length;
 const dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=similar(norm(script[i]),norm(whisper[j].text))?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const times=new Array(n).fill(null);let i=0,j=0;
 while(i<n&&j<m){if(similar(norm(script[i]),norm(whisper[j].text))){times[i]={start:whisper[j].start,end:whisper[j].end};i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
 const first=whisper[0]?.start??0,last=whisper.at(-1)?.end??0;
 return script.map((w,k)=>{if(times[k])return {text:w,...times[k]};
  let a=k-1;while(a>=0&&!times[a])a--;let b=k+1;while(b<n&&!times[b])b++;
  const lo=a>=0?times[a].end:first,hi=b<n?times[b].start:last,gap=b-a-1,step=Math.max(0,hi-lo)/Math.max(1,gap),slot=k-a-1;
  return {text:w,start:lo+step*slot,end:lo+step*(slot+1)};});
}

// Where each shot sits: from the start of its first voiceover line to the start of the next shot; the last shot runs
// through the end card. A clip longer than its slot is trimmed; a shorter one is slowed down, but never below 0.7x.
export function shotTimeline(shots,lines,{endCard=2.5}={}){
 const r=n=>Math.round(n*100)/100,starts=shots.map((s,i)=>{const first=lines.find(l=>l.shot===s.id);return first?first.start:null;});
 for(let i=0;i<starts.length;i++)if(starts[i]===null)starts[i]=i?starts[i-1]+shots[i-1].seconds:0;starts[0]=0;
 const voiceEnd=Math.max(...lines.map(l=>l.end),0),total=r(voiceEnd+endCard);
 const clips=shots.map((s,i)=>{const start=r(starts[i]),end=i<shots.length-1?starts[i+1]:total,duration=r(end-start);return {start,duration,playbackRate:Math.max(0.7,Math.min(1,s.seconds/duration))};}); // exact rate: rounding it left a gap
 return {clips,total,endCardStart:r(voiceEnd)};
}

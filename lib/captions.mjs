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

// The channel's voices: one designed voice per host (Gemini voice design, kept by Google for a year), so every reel
// sounds like the same people. Lines are spoken with Gemini 3.8 Flash TTS and laid over the video's real sounds.
// Why: Omni's own voices scored 4 of 10 ("generic AI voice") in the lab on 2026-09-28.
// Prices (pricing page, 2026-09-28): TTS $0.50 per 1M text tokens in, $9 per 1M audio tokens out (≈ $0.00225 per 10 s).
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const exec=promisify(execFile);
export const TTS_MODEL='gemini-3.8-flash-tts';
export const ttsCost=u=>((u?.total_input_tokens||0)*0.5+(u?.total_output_tokens||0)*9)/1e6;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(url,{key,body,fetchImpl=fetch,sleep=wait}){
 for(let attempt=0;;attempt++){
  const r=await fetchImpl(url,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
  if(r.ok)return data;
  // The voice service answered 500 once and worked on the next try (2026-09-28): server errors get two retries.
  if(r.status>=500&&attempt<2){await sleep(3000*(attempt+1));continue;}
  throw new Error(`Gemini voice: HTTP ${r.status}. ${data?.error?.message||raw.slice(0,200)}`);
 }
}
// A persistent voice from a 1-2 sentence description of permanent traits (age, timbre, accent, closeness).
export async function designVoice({key,name,description,gender,fetchImpl,sleep}){
 if(!key)throw new Error('GEMINI_API_KEY is not set. Add it with the secure pop-up.');
 const d=await post('https://generativelanguage.googleapis.com/v1beta/voices',{key,fetchImpl,sleep,body:{store:true,voice:{model:TTS_MODEL,type:'prompted',display_name:String(name).slice(0,60),...(gender?{gender}:{}),language_code:'en-US',prompted:{input:description}}}});
 if(!d?.id)throw new Error('Gemini did not return a voice id');
 return {id:d.id,expires:d.expire_time||null,sample:d.sample_audio?.data?Buffer.from(d.sample_audio.data,'base64'):null,costUsd:ttsCost(d.usage)};
}
// One spoken line (WAV, 24 kHz mono) in a designed voice, with a short acting note.
export async function speak({key,voice,text,style,fetchImpl,sleep}){
 const d=await post('https://generativelanguage.googleapis.com/v1beta/interactions',{key,fetchImpl,sleep,body:{model:TTS_MODEL,input:[{type:'user_input',content:[{type:'text',text,...(style?{annotations:[{type:'speech_metadata',style}]}:{})}]}],response_format:{type:'audio'},generation_config:{speech_config:[{voice}]}}});
 const audio=(d?.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(c=>c.type==='audio').at(-1);
 if(!audio?.data)throw Object.assign(new Error('No audio came back for a line'),{costUsd:ttsCost(d?.usage)});
 return {wav:Buffer.from(audio.data,'base64'),costUsd:ttsCost(d.usage)};
}
// A short, clean description of permanent vocal traits for voice design. Google's voice service failed (HTTP 500) on a
// garbled one ("a man with a resonant ... male voiceover with a calm delivery voice") and accepted a plain one at once
// (2026-09-28), so the kit's words are reduced to a few adjectives.
export function voiceDescription(host){
 const look=String(host.look||''),g=/\b(female|woman|girl)\b/i.test(look)?'woman':/\b(male|man|boy)\b/i.test(look)?'man':'person';
 const decade=(look.match(/\b\d0s\b/)||[])[0],older=/\b(older|elderly|senior|old)\b/i.test(look),young=/\b(young|youthful)\b/i.test(look);
 const age=decade?` in ${g==='woman'?'her':g==='man'?'his':'their'} ${decade}`:'',lead=older?'An older ':young?'A young ':'A ';
 const traits=String(host.voice||'clear, friendly').toLowerCase().replace(/\b(male|female|man|woman|voiceover|voice|delivery|tone|with|a|an|the|and|very|slightly)\b/g,' ').replace(/[^a-z\- ,]/g,' ').split(/[\s,]+/).filter(w=>w.length>2).slice(0,4);
 const words=traits.length?traits.join(', '):'clear, friendly';
 return {gender:g==='woman'?'female':g==='man'?'male':undefined,description:`${lead}${g}${age} with a ${words} voice and a neutral American accent, speaking naturally and close to the mic.`,
  simple:`${lead}${g} with a ${traits[0]||'warm'} voice.`};
}
// When each line starts: at its beat, but never on top of the line before (0.15 s gap).
export function lineTimes(lines){let end=-Infinity;return lines.map(l=>{const start=Math.max(l.at,end+0.15);end=start+l.seconds;return {...l,start:Math.round(start*100)/100};});}
// Silence around a spoken line is trimmed (Gemini's clips carry some, which pushed every later line late).
export async function trimSilence(input,out){await exec('ffmpeg',['-v','error','-y','-i',input,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',out],{timeout:60000});return out;}
// One speed for the whole reel, so every line fits before the next beat starts: never slower than normal, never
// faster than 1.35× (beyond that a voice sounds rushed). A voice-over of 35.7 s for 20 s of video was cut off on
// 2026-09-28; now nothing is cut, and a reel that still runs long holds its last frame.
export function fitTempo(lines,videoSeconds,max=1.35){
 const sorted=[...lines].sort((a,b)=>a.at-b.at);let need=1;
 sorted.forEach((l,i)=>{const window=(sorted[i+1]?.at??videoSeconds)-l.at;if(window>0)need=Math.max(need,l.seconds/window);});
 return Math.round(Math.min(max,need)*100)/100;
}
// The voice track: the video's own sound (pours, fizz) under the lines, as one WAV. Lines are sped up by `tempo`.
export async function mixVoices({video,lines,out,bedVolume=0.7,tempo=1}){
 const inputs=['-i',video,...lines.flatMap(l=>['-i',l.file])],speed=tempo>1.001?`atempo=${tempo},`:'';
 const delays=lines.map((l,i)=>`[${i+1}:a]${speed}adelay=${Math.round(l.start*1000)}|${Math.round(l.start*1000)},volume=1.4[v${i}]`);
 const graph=[`[0:a]volume=${bedVolume}[bed]`,...delays,`[bed]${lines.map((_,i)=>`[v${i}]`).join('')}amix=inputs=${lines.length+1}:duration=longest:normalize=0[out]`].join(';');
 await exec('ffmpeg',['-v','error','-y',...inputs,'-filter_complex',graph,'-map','[out]','-ac','1','-ar','48000',out],{timeout:120000});return out;
}
export async function saveLine(dir,i,wav){const f=join(dir,`line-${i}.wav`);await writeFile(f,wav);return f;}

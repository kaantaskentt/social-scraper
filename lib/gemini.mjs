// Gemini, the model that watches reels (whole video with sound) and writes the Channel Secret.
// Prices from Google's pricing page, paid tier, read 2026-09-27 (content is not used to improve their products).
// 3.8 Flash doubles on 2027-01-01: update PRICES then. Unknown models fail loudly instead of costing an unknown amount.
const PRICES={'gemini-3.8-flash':{input:0.75,output:3.75},'gemini-3.5-flash-lite':{input:0.30,output:2.50},'gemini-3.1-pro-preview':{input:2.00,output:12.00}};
export function costOf(model,inputTokens,outputTokens){const p=PRICES[model];if(!p)throw new Error(`No known price for ${model}`);return (inputTokens*p.input+outputTokens*p.output)/1e6;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const b64=v=>(Buffer.isBuffer(v)?v:Buffer.from(v)).toString('base64');
const toPart=p=>p.video?{inline_data:{mime_type:'video/mp4',data:b64(p.video)}}:p.image?{inline_data:{mime_type:p.mime||'image/jpeg',data:b64(p.image)}}:{text:p.text};

// One request, JSON out. Busy (429) and server errors (5xx) are retried twice; anything else fails at once.
export async function generate({key,model,parts,schema,thinking='low',fetchImpl=fetch,sleep=wait,timeoutMs=180000}){
 if(!key)throw new Error('GEMINI_API_KEY is not set. Add it with the secure pop-up.');
 const body={contents:[{parts:parts.map(toPart)}],generationConfig:{responseMimeType:'application/json',...(schema?{responseSchema:schema}:{}),thinkingConfig:{thinkingLevel:thinking}}};
 let r;
 for(let attempt=0;;attempt++){
  r=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  if(r.ok||attempt>=2||!(r.status===429||r.status>=500))break;
  if(r.status===429&&/free_tier/.test(await r.clone().text()))break; // no billing: waiting will not help
  await sleep(2000*(attempt+1));
 }
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
 if(r.status===429&&/free_tier/.test(raw))throw new Error('Your Gemini key is on the free tier. Turn on billing for its project in Google AI Studio (on the free tier Google may also use what you send), then try again.');
 if(!r.ok)throw new Error(`Gemini: HTTP ${r.status}. ${data?.error?.message||raw.slice(0,200)}`);
 if(data?.promptFeedback?.blockReason)throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason})`);
 // A 200 answer is billed even when it is unusable, so its cost travels with the error.
 const u=data?.usageMetadata||{},usage={input:u.promptTokenCount||0,output:(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0)},costUsd=costOf(model,usage.input,usage.output);
 const fail=message=>Object.assign(new Error(message),{costUsd});
 const cand=data?.candidates?.[0];const text=(cand?.content?.parts||[]).map(p=>p.text||'').join('');
 if(cand?.finishReason==='MAX_TOKENS')throw fail('Gemini answer was cut off (too long)');
 let json;try{json=JSON.parse(text);}catch{throw fail(`Gemini answer was not valid JSON (${cand?.finishReason||'no answer'})`);}
 return {json,usage,costUsd};
}

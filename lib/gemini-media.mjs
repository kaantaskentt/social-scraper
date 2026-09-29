// Pictures (and later video) from the Gemini key, through Google's Interactions API. Every answer carries its cost, also
// when it is unusable, so the ledger never misses a paid call. Prices: Google's pricing page, paid tier, read 2026-09-28.
// Media output is billed per token by kind (Nano Banana 2: $60 per 1M image tokens = $0.067 per 1K picture).
// Text and thinking tokens are counted at the text price; if Google already counts thinking inside the output total,
// this overstates the cost by a fraction of a cent, never understates it.
const PRICES={
 'gemini-3.1-flash-image':{input:0.50,text:3,image:60},
 'gemini-3-pro-image':{input:2,text:12,image:120},
 'gemini-omni-1.1-flash':{input:1.50,text:9,video:17.50}};
export const IMAGE_MODEL='gemini-3.1-flash-image';
export function mediaCost(model,usage={}){
 const p=PRICES[model];if(!p)throw new Error(`No known price for ${model}`);
 const by=Object.fromEntries((usage.output_tokens_by_modality||[]).map(m=>[m.modality,m.tokens||0]));
 const media=(by.image||0)+(by.video||0),other=Math.max(0,(usage.total_output_tokens||0)-media)+(usage.total_thought_tokens||0);
 return ((usage.total_input_tokens||0)*p.input+(by.image||0)*(p.image||0)+(by.video||0)*(p.video||0)+other*p.text)/1e6;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const b64=v=>(Buffer.isBuffer(v)?v:Buffer.from(v)).toString('base64');

// One interaction. Busy (429) and server errors (5xx) are retried twice; anything else fails at once.
export async function interact({key,model,input,responseFormat,generationConfig,fetchImpl=fetch,sleep=wait,timeoutMs=300000}){
 if(!key)throw new Error('GEMINI_API_KEY is not set. Add it with the secure pop-up.');
 const body={model,input,...(responseFormat?{response_format:responseFormat}:{}),...(generationConfig?{generation_config:generationConfig}:{})};
 let r;
 for(let attempt=0;;attempt++){
  r=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  if(r.ok||attempt>=2||!(r.status===429||r.status>=500))break;
  if(r.status===429&&/free_tier/.test(await r.clone().text()))break;
  await sleep(3000*(attempt+1));
 }
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
 if(r.status===429&&/free_tier/.test(raw))throw new Error('Your Gemini key is on the free tier. Pictures and video need billing turned on in Google AI Studio.');
 if(!r.ok)throw new Error(`Gemini: HTTP ${r.status}. ${data?.error?.message||raw.slice(0,200)}`);
 const costUsd=mediaCost(model,data?.usage);
 const outputs=(data?.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]);
 if(data?.status!=='completed')throw Object.assign(new Error(`Gemini did not finish (${data?.status||'no status'})${outputs.find(c=>c.type==='text')?`: ${outputs.find(c=>c.type==='text').text.slice(0,160)}`:''}`),{costUsd});
 return {id:data.id,outputs,costUsd,usage:data.usage};
}

// One picture. refs are earlier pictures (the face, the set) the model must stay faithful to.
export async function makeImage({key,prompt,refs=[],aspect='9:16',size='1K',model=IMAGE_MODEL,...rest}){
 const input=[...refs.map(r=>({type:'image',mime_type:r.mime||'image/jpeg',data:b64(r.data)})),{type:'text',text:prompt}];
 const r=await interact({key,model,input,responseFormat:{type:'image',mime_type:'image/jpeg',aspect_ratio:aspect,image_size:size},...rest});
 const img=r.outputs.find(c=>c.type==='image'&&c.data);
 if(!img){const said=r.outputs.find(c=>c.type==='text')?.text;throw Object.assign(new Error(`No picture came back${said?`: ${said.slice(0,160)}`:' (probably a safety filter)'}`),{costUsd:r.costUsd});}
 return {data:Buffer.from(img.data,'base64'),mime:img.mime_type||'image/jpeg',costUsd:r.costUsd,id:r.id};
}

// Background interactions (video): create returns an id at once; the result is fetched later, so a restart can pick up
// a paid job instead of paying again. Google keeps stored interactions for 55 days on the paid tier.
const BASE='https://generativelanguage.googleapis.com/v1beta/interactions';
export async function call(url,{key,fetchImpl=fetch,method='GET',body,timeoutMs=60000}){
 const r=await fetchImpl(url,{method,headers:{'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
 if(!r.ok)throw Object.assign(new Error(`Gemini: HTTP ${r.status}. ${data?.error?.message||raw.slice(0,200)}`),{status:r.status});
 return data;
}
export async function startInteraction({key,model,input,previousId,responseFormat,fetchImpl}){
 if(!key)throw new Error('GEMINI_API_KEY is not set. Add it with the secure pop-up.');
 const data=await call(BASE,{key,fetchImpl,method:'POST',body:{model,input,...(previousId?{previous_interaction_id:previousId}:{}),response_format:responseFormat,background:true}});
 if(!data?.id)throw new Error('Gemini did not return a job id');return data.id;
}
export const getInteraction=({key,id,fetchImpl})=>call(`${BASE}/${encodeURIComponent(id)}`,{key,fetchImpl});
// The finished video: inline bytes, or a download link that needs the same key.
export async function mediaBytes(content,{key,fetchImpl=fetch}){
 if(content.data)return Buffer.from(content.data,'base64');
 if(!content.uri||!/^https:\/\/generativelanguage\.googleapis\.com\//.test(content.uri))throw new Error('The video has no download link from Google');
 const r=await fetchImpl(content.uri,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(300000)});if(!r.ok)throw new Error(`Could not download the video: HTTP ${r.status}`);
 return Buffer.from(await r.arrayBuffer());
}

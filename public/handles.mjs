// Turns what the user typed into up to three Instagram handles: accepts commas, spaces, "@" and profile links.
export const MAX_PARALLEL=3;
export function parseHandles(text){
 const handles=[];
 for(const raw of String(text||'').split(/[\s,]+/).filter(Boolean)){
  const path=raw.replace(/^(https?:\/\/)?((www|m)\.)?instagram\.com\//i,'');
  if(/^(https?:\/\/)?([\w-]+\.)*(instagram\.com|instagr\.am)\/?$/i.test(raw)||/^(https?:\/\/)?instagr\.am\//i.test(raw))return {handles:[],error:`"${raw}" is not an account. Paste the account's profile link or @handle.`};
  if(path!==raw&&/^(p|reel|reels|tv|stories|explore)(\/|$)/i.test(path))return {handles:[],error:`"${raw}" is a post or reel link. Paste the account's profile link or @handle instead.`};
  const h=path.replace(/[/?#].*$/,'').replace(/^@/,'');
  if(!/^[a-zA-Z0-9_.]{1,30}$/.test(h))return {handles:[],error:`"${raw}" is not an Instagram handle`};
  if(!handles.includes(h))handles.push(h);
 }
 if(!handles.length)return {handles:[],error:'Enter at least one Instagram handle'};
 if(handles.length>MAX_PARALLEL)return {handles:[],error:`Enter up to ${MAX_PARALLEL} handles at a time`};
 return {handles,error:null};
}

// The error log (Kaan, 2026-09-29: "every time I do something, if there's an error, we log it, and it automatically goes
// to you for fixing"). Every error the app shows or hits in the background is one line in data/errors.jsonl; the same
// error (same place, same words once numbers and ids are masked) groups under one id. A scheduled Claude run reads the
// open ones (scripts/errors.mjs open), fixes their root cause and marks them (fixed / not a bug) in data/errors-done.json.
import {appendFile,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from './json.mjs';

// Numbers, money, times and long ids differ between occurrences of the same error; they are masked for grouping.
const shape=m=>String(m||'').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'<id>').replace(/\b[A-Za-z0-9_-]{11}\b(?=[^a-z]|$)/g,w=>/\d/.test(w)&&/[A-Za-z]/.test(w)?'<reel>':w).replace(/\$?\d+(\.\d+)?/g,'<n>').trim();
export const errorId=({source,where='',message})=>createHash('sha1').update(`${source}|${where}|${shape(message)}`).digest('hex').slice(0,10);
export class ErrorLog{
 constructor(root){this.root=root;this.file=join(root,'errors.jsonl');this.doneFile=join(root,'errors-done.json');this.recent=new Map();}
 // One occurrence. The same error within a minute is written once (a poll can repeat it every second).
 async add({source,where='',message,runId=null,account=null,detail=null,at=new Date().toISOString()}){
  const text=String(message||'').slice(0,1000);if(!text)return null;
  const id=errorId({source,where,message:text}),now=Date.parse(at);
  if(now-(this.recent.get(id)||-Infinity)<60000)return id;this.recent.set(id,now);
  await mkdir(this.root,{recursive:true});
  await appendFile(this.file,JSON.stringify({id,at,source,where:String(where).slice(0,200),message:text,runId,account,detail:detail?String(detail).slice(0,2000):null})+'\n');
  return id;
 }
 async lines(){const t=await readFile(this.file,'utf8').catch(()=>'');return t.split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);}
 // Grouped errors not yet handled, most frequent first; an error seen again after it was marked fixed is open again.
 async open(){
  const done=await readJson(this.doneFile)||{},groups=new Map();
  for(const e of await this.lines()){const g=groups.get(e.id)||{id:e.id,source:e.source,where:e.where,message:e.message,count:0,first:e.at,last:e.at,runIds:new Set(),accounts:new Set(),detail:null};
   g.count++;g.last=e.at;g.message=e.message;if(e.runId)g.runIds.add(e.runId);if(e.account)g.accounts.add(e.account);if(e.detail)g.detail=e.detail;groups.set(e.id,g);}
  return [...groups.values()].filter(g=>!done[g.id]||g.last>done[g.id].at).map(g=>({...g,runIds:[...g.runIds],accounts:[...g.accounts],before:done[g.id]||null})).sort((a,b)=>b.count-a.count||b.last.localeCompare(a.last));
 }
 async mark(id,{status,note}){if(!['fixed','not a bug'].includes(status))throw new Error('Status is fixed or not a bug');const done=await readJson(this.doneFile)||{};done[id]={status,note:String(note||''),at:new Date().toISOString()};await writeJson(this.doneFile,done);return done[id];}
}

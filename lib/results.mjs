// Real results for the reels Kaan posts: his account is scanned (public data, the same Apify scraper, no transcripts),
// each of our reels is found by its caption, and every check adds a dated snapshot of its plays, likes, comments and
// shares. Views after posting beat any pre-post score (research library: early-engagement-predicts; our own judge
// picked winners at a coin flip, 2026-09-28). Saved in data/channels/<run>/results.json.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as providers from './providers.mjs';
import {normalize} from './data.mjs';

const HANDLE=/^[a-zA-Z0-9_.]{1,30}$/,ID=/^[\w-]{1,90}$/;
const numeric=v=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):null;
async function readJson(f){try{return JSON.parse(await readFile(f,'utf8'));}catch{return null;}}
async function writeJson(f,v){const t=`${f}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v,null,1));await rename(t,f);}

// The caption's opening words, without hashtags, emoji or punctuation: what survives Kaan pasting it into Instagram.
export const captionKey=s=>String(s||'').split(/\n/)[0].replace(/#\S+/g,' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(' ').slice(0,8).join(' ');
// Each of our reels matched to at most one post (the earliest with the same opening words).
export function matchReels(reels,posts){
 const byKey=new Map();for(const p of [...posts].sort((a,b)=>String(a.publishedAt).localeCompare(String(b.publishedAt)))){const k=captionKey(p.caption);if(k.split(' ').length>=4&&!byKey.has(k))byKey.set(k,p);}
 return reels.map(r=>({reel:r,post:byKey.get(captionKey(r.caption))||null})).filter(x=>x.post);
}
// One dated reading of a post. Rates per 1,000 plays only when plays are known; nothing is guessed.
export function snapshot(post,at=new Date().toISOString()){
 const plays=post.plays??post.views??null,per=v=>plays>0&&Number.isFinite(v)?Math.round(v/plays*1000*10)/10:null;
 const hours=post.publishedAt?Math.round((Date.parse(at)-Date.parse(post.publishedAt))/36e5*10)/10:null;
 return {at,ageHours:hours,plays,likes:post.likes??null,comments:post.comments??null,shares:post.shares??null,likesPer1k:per(post.likes),sharesPer1k:per(post.shares)};
}
// The reading closest to an age (24 h, 72 h, 7 days), so reels are compared at the same age, never raw totals.
export function atAge(snaps,hours,tolerance=0.5){
 const ok=snaps.filter(s=>Number.isFinite(s.ageHours)&&Math.abs(s.ageHours-hours)<=hours*tolerance);
 return ok.sort((a,b)=>Math.abs(a.ageHours-hours)-Math.abs(b.ageHours-hours))[0]||null;
}

export class ResultsTracker{
 constructor(root,keys,{scrape=null,limit=24}={}){Object.assign(this,{root,keys,limit});this.scrape=scrape||(h=>this.apify(h));this.state=new Map();}
 file(runId){if(!ID.test(runId))throw new Error('Invalid run');return join(this.root,'channels',runId,'results.json');}
 async read(runId){return await readJson(this.file(runId))||{handle:null,checks:[],reels:{}};}
 async setHandle(runId,handle){
  const h=String(handle||'').trim().replace(/^@/,'');if(!HANDLE.test(h))throw new Error('Enter your Instagram handle, for example kaan.tests');
  const saved=await this.read(runId);await mkdir(join(this.root,'channels',runId),{recursive:true});await writeJson(this.file(runId),{...saved,handle:h});return {...saved,handle:h};
 }
 async status(runId){const live=this.state.get(runId);return {...await this.read(runId),state:live?.state||'none',error:live?.error||null};}
 // The public scrape of Kaan's account, with share counts (switched off for competitor scans). About $0.03 for 24 posts.
 async apify(handle){
  const key=this.keys().apify;if(!key)throw new Error('Add your Apify token first (APIFY_TOKEN)');
  const run=await providers.startScrape({creator:handle,limit:this.limit,budget:0.2,shares:true},key);let r=run;
  while(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(r.status)){await providers.delay(2500);r=await providers.pollScrape(run.id,key);}
  if(r.status!=='SUCCEEDED')throw new Error(`Scanning @${handle} stopped: ${r.status}`);
  const rows=await providers.dataset(r.defaultDatasetId,key,this.limit);
  return rows.map(row=>{try{return {...normalize(row),shares:numeric(row.sharesCount??row.shareCount)};}catch{return null;}}).filter(Boolean);
 }
 async check(runId,reels){
  if(this.state.get(runId)?.state==='working')throw new Error('Already checking');
  const saved=await this.read(runId);if(!saved.handle)throw new Error('Add your Instagram handle first');
  const live={state:'working',error:null};this.state.set(runId,live);
  try{
   const posts=await this.scrape(saved.handle),at=new Date().toISOString(),matched=matchReels(reels,posts),next={...saved,reels:{...saved.reels}};
   for(const {reel,post} of matched){const prev=next.reels[reel.id]||{postId:post.id,url:post.url,publishedAt:post.publishedAt,snapshots:[]};next.reels[reel.id]={...prev,snapshots:[...prev.snapshots,snapshot(post,at)]};}
   next.checks=[...saved.checks,{at,posts:posts.length,matched:matched.length}];await writeJson(this.file(runId),next);
   Object.assign(live,{state:'done'});return next;
  }catch(e){Object.assign(live,{state:'failed',error:e.message});throw e;}
 }
}

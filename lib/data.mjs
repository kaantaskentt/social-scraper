import {createHash} from 'node:crypto';
export const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export const median=values=>{const a=values.filter(v=>v!==null&&Number.isFinite(v)).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
export function normalize(row){
 const id=String(row.shortCode||row.id||'');if(!/^[\w-]{1,90}$/.test(id))throw new Error('Missing or invalid Reel ID');
 const views=numeric(row.videoViewCount),plays=numeric(row.videoPlayCount);
 const text=typeof row.transcript==='string'?row.transcript:typeof row.transcript?.text==='string'?row.transcript.text:typeof row.scrapedTranscript==='string'?row.scrapedTranscript:'';
 return {id,url:typeof row.url==='string'?row.url:`https://www.instagram.com/reel/${id}/`,creator:row.ownerUsername||row.creator||'unknown',caption:row.caption||'',publishedAt:row.timestamp||null,scrapedAt:new Date().toISOString(),likes:numeric(row.likesCount),comments:numeric(row.commentsCount),views,plays,duration:numeric(row.videoDuration),thumbnailUrl:row.displayUrl||row.thumbnailUrl||'',videoUrl:row.videoUrl||row.downloadedVideo||'',audioUrl:row.audioUrl||'',music:row.musicInfo?{song:String(row.musicInfo.song_name||''),artist:String(row.musicInfo.artist_name||''),original:row.musicInfo.uses_original_audio!==false}:null,transcript:text?{text,segments:row.transcript?.segments||[],source:'import'}:null,analysis:null,status:text?'transcribed':'queued',error:null};
}
export function deduplicate(rows){const seen=new Map();for(const row of rows){try{const p=normalize(row);if(!seen.has(p.id))seen.set(p.id,p);}catch{}}return [...seen.values()];}
export function fingerprint(text){return createHash('sha256').update(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()).digest('hex');}
export function metrics(posts,{dimension='mechanism',metric='views',minAgeDays=7,maxDuration=Infinity,after='',minConfidence=0,category='all'}={}){
 if(!['views','plays'].includes(metric)) throw new Error('Invalid metric');
 const base=posts.filter(p=>p.analysis&&!p.excludedReason&&(!after||(p.publishedAt&&p.publishedAt>=after))&&(!minAgeDays||(p.publishedAt&&(Date.now()-Date.parse(p.publishedAt))/864e5>=minAgeDays))&&(maxDuration===Infinity||(p.duration!==null&&p.duration<=maxDuration))&&p.analysis.labels[dimension]?.confidence>=minConfidence);
 const selected=base.filter(p=>category==='all'||p.analysis.labels[dimension]?.value===category);
 const eligible=selected.filter(p=>p[metric]>0&&p.likes!==null);
 const groups=new Map();for(const p of eligible){const key=p.analysis.labels[dimension]?.value||'unclear';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 return {total:selected.length,excluded:selected.length-eligible.length,medianViews:median(eligible.map(p=>p[metric])),medianRate:median(eligible.map(p=>p.likes/p[metric]*1000)),groups:[...groups].map(([key,ps])=>({key,n:ps.length,views:median(ps.map(p=>p[metric])),rate:median(ps.map(p=>p.likes/p[metric]*1000)),ids:ps.map(p=>p.id)})).sort((a,b)=>b.views-a.views),points:eligible.map(p=>({id:p.id,x:p[metric],y:p.likes/p[metric]*1000,category:p.analysis.labels[dimension]?.value||'unclear'}))};
}

// The reels furthest from the account's usual plays first (the winners, then the weakest), so the steps that look at
// them can start before the whole scan is done (2026-09-29). Reels without plays come last; ties keep their order.
export function byPriority(posts){
 const plays=p=>{const v=p.plays??p.views;return Number.isFinite(v)&&v>0?v:null;};
 const known=posts.map(plays).filter(v=>v!==null).sort((a,b)=>a-b);const mid=known.length?(known[Math.floor((known.length-1)/2)]+known[Math.ceil((known.length-1)/2)])/2:null;
 const distance=p=>plays(p)===null||!mid?-1:Math.abs(Math.log(plays(p)/mid));
 return posts.map((p,i)=>({p,i,d:distance(p)})).sort((a,b)=>b.d-a.d||a.i-b.i).map(x=>x.p);
}

// Registry of released money formulas. Old versions stay importable so any past result can be replayed exactly.
import * as v1_0 from './1.0.mjs';
export const VERSIONS=Object.freeze({[v1_0.FORMULA]:v1_0});
export const LATEST=v1_0.FORMULA;

// When the counts were read. Dataset download time is never used (spec 3.1).
export function observedAtOf(job){
 if(job.observedAt)return {observedAt:job.observedAt,source:'run'};
 if(!job.imported&&job.scrape?.finishedAt)return {observedAt:job.scrape.finishedAt,source:'apify_finishedAt'};
 return {observedAt:null,source:'unknown'};
}

// Identity of the inputs (FNV-1a, 32-bit): tells whether two reports were computed from the same data. Not security.
export function hashInput(posts,observedAt){
 const rows=posts.map(p=>[p.id,p.publishedAt??null,p.plays??null,p.views??null,p.comments??null,p.caption??'']).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 let h=0x811c9dc5;for(const ch of JSON.stringify([observedAt,rows])){h^=ch.codePointAt(0);h=Math.imul(h,0x01000193)>>>0;}
 return h.toString(16).padStart(8,'0');
}

export function score(job,version=LATEST){
 const impl=VERSIONS[version];if(!impl)throw new Error(`Unknown money formula ${version}`);
 const {observedAt,source}=observedAtOf(job);const {results,summary}=impl.scoreRun({posts:job.posts,observedAt});
 return {manifest:{formula:impl.FORMULA,params:impl.PARAMS,runId:job.id,observedAt,observedAtSource:source,inputHash:hashInput(job.posts,observedAt)},results,summary};
}

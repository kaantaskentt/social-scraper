// Prep ahead (Kaan, 2026-09-29: "pre-load or get prepped before moving to the next stage"). When a scan finishes, the
// next steps' cheap analysis runs in the background, all cached, so their buttons answer at once: the Secret (the Look
// needs it; $0.06 to $0.22 and 15 to 141 s on past runs), the Look's study of the three best reels (about $0.02) and
// the copy candidates' breakdowns (about $0.06). Nothing here films or draws. A failure shows on the page and never
// touches the scan.
export class Prep{
 constructor({keys,ensureSecret,kits,copies}){Object.assign(this,{keys,ensureSecret,kits,copies});this.state=new Map();}
 status(runId){return this.state.get(runId)||{state:'none'};}
 async run(job){
  const now=this.state.get(job.id);if(now&&['working','done'].includes(now.state))return;
  const keys=this.keys();if(!keys.gemini||!keys.jev)return;
  const live={state:'working',stage:'Studying why their winners work',error:null};this.state.set(job.id,live);
  try{
   const saved=await this.ensureSecret(job);
   live.stage='Studying their best reels and the ones worth copying';
   await Promise.all([this.kits.study(job,saved,keys),this.copies.prepare(job)]);
   Object.assign(live,{state:'done',stage:null});
  }catch(e){Object.assign(live,{state:'failed',stage:null,error:e.message});console.error(`Social Scraper: preparing the next steps for ${job.id} stopped: ${e.message}`);}
 }
}

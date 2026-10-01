// Transcript cache keys. Policy 1 (the original): one transcript per reel id, whatever language was requested, so a run
// set to English kept reusing wrong transcripts of Turkish speech. Policy 2 keys also carry the requested language
// (or auto), provider and model; the run records the provider and model it used. Policy-2 runs never read policy-1
// keys, unknown versions fail loudly, and no cache file is deleted.
export const TRANSCRIPT_POLICY=2;
export const transcriptPolicy=language=>({version:TRANSCRIPT_POLICY,language:language||''});
const safe=s=>String(s).replace(/[^\w.-]+/g,'_');
export function transcriptKey(job,postId,provider,model){
 if(job.transcriptPolicy==null)return `transcript-${postId}`; // policy 1: runs created before the fix
 if(job.transcriptPolicy.version!==TRANSCRIPT_POLICY)throw new Error(`Unsupported transcript policy ${job.transcriptPolicy.version}`);
 return `transcript-v2-${safe(postId)}-${job.transcriptPolicy.language||'auto'}-${safe(provider)}-${safe(model)}`;
}

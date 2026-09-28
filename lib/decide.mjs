// Production decisions taken from the channel's own data, each with the reason shown to Kaan. Rules are code; the
// numbers come from the Winner DNA readings (every scored reel) or, without them, the Secret's 30 labelled reels.
// Why: our hosts were made silent with a voice-over while Ken's hosts talk to camera in 63 of 79 reels (2026-09-28).
const ON_CAMERA_SPEAKERS=new Set(['man','woman']),FACING=new Set(['camera','mixed']);

// Do the hosts talk on camera (lip-synced, Omni's own voices) or is it a voice-over (designed voices)?
export function decideVoice({format,dna=null,secret=null}){
 if(!['ai_host','animated'].includes(format))return {mode:'voiceover',why:'Nobody is on camera in this look, so a voice explains.'};
 const labels=dna?.labels||[];
 if(labels.length>=20){
  const talk=labels.filter(x=>ON_CAMERA_SPEAKERS.has(x.labels.first_speaker)&&FACING.has(x.labels.gaze)).length;
  return talk*2>=labels.length?{mode:'talking',why:`In ${talk} of ${labels.length} of their reels a host speaks first, to the camera.`,share:talk/labels.length}
   :{mode:'voiceover',why:talk?`Only ${talk} of their ${labels.length} reels have a host talking to the camera; the rest use a voice-over.`:`None of their ${labels.length} reels has a host talking to the camera; they all use a voice-over.`,share:talk/labels.length};
 }
 const picked=secret?.picked||[];
 if(picked.length){const talk=picked.filter(p=>['one_talking'].includes(p.labels?.presenter)||p.labels?.format==='talking_head').length;
  return talk*2>=picked.length?{mode:'talking',why:`In ${talk} of ${picked.length} studied reels someone talks to the camera.`}:{mode:'voiceover',why:`Only ${talk} of ${picked.length} studied reels have someone talking to the camera.`};}
 return {mode:'talking',why:'No readings yet; hosts on camera talk by default.'};
}
// Plan field used by the maker: 'native' = Omni's own lip-synced voices, 'designed' = the channel's designed voice-over.
export const voiceModeOf=decision=>decision.mode==='talking'?'native':'designed';

// Is a visible result (a payoff) part of this channel's format? Ken shows one in 64 of 79 reels; drzen's form cues
// have none in 70 of 90, and the payoff close-up rule blocked every drzen script (2026-09-28).
export function decidePayoff({dna=null}={}){
 const labels=(dna?.labels||[]).map(r=>r.labels).filter(l=>l?.payoffs!==undefined);
 if(labels.length<30)return {payoff:true,why:'Not enough readings yet; every reel shows its result up close by default.'};
 const n=labels.filter(l=>l.payoffs!=='0').length;
 return n*2>=labels.length?{payoff:true,share:n/labels.length,why:`${n} of their ${labels.length} reels show a result, so ours show it up close.`}
  :{payoff:false,share:n/labels.length,why:`Only ${n} of their ${labels.length} reels show a result; the rest teach a movement, so ours show the movement clearly instead.`};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {decideVoice,voiceModeOf} from '../lib/decide.mjs';
const reel=(first_speaker,gaze)=>({labels:{first_speaker,gaze}});
const many=(n,a,b)=>Array.from({length:n},()=>reel(a,b));
test('hosts talk on camera when at least half the reels have a host speaking first to camera (Ken: 63 of 79)',()=>{
 const ken={labels:[...many(58,'man','camera'),...many(5,'woman','mixed'),...many(14,'voiceover','camera'),...many(2,'nobody','action')]};
 const d=decideVoice({format:'ai_host',dna:ken});assert.equal(d.mode,'talking');assert.equal(d.why,'In 63 of 79 of their reels a host speaks first, to the camera.');assert.equal(voiceModeOf(d),'native');
});
test('a voice-over channel keeps a voice-over (drzenphd: 0 of 90); hands-only and no-person looks always do',()=>{
 const zen={labels:[...many(84,'voiceover','no_person'),...many(6,'nobody','no_person')]};
 assert.equal(decideVoice({format:'animated',dna:zen}).mode,'voiceover');assert.equal(voiceModeOf(decideVoice({format:'animated',dna:zen})),'designed');
 assert.match(decideVoice({format:'hands_pov',dna:{labels:many(30,'man','camera')}}).why,/Nobody is on camera/);
});
test('without DNA readings the Secret decides; without either, hosts talk',()=>{
 assert.equal(decideVoice({format:'ai_host',secret:{picked:[...Array(10).fill({labels:{presenter:'one_talking'}}),...Array(5).fill({labels:{presenter:'hands_only'}})]}}).mode,'talking');
 assert.equal(decideVoice({format:'ai_host',secret:{picked:Array(10).fill({labels:{presenter:'nobody'}})}}).mode,'voiceover');
 assert.equal(decideVoice({format:'ai_host'}).mode,'talking');
});

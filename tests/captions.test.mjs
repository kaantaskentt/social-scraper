import test from 'node:test';
import assert from 'node:assert/strict';
import {wordsFromWhisper,chunkCaptions} from '../lib/captions.mjs';

test('words come from Whisper word timestamps, trimmed, empty ones dropped',()=>{
 const w=wordsFromWhisper({words:[{word:' Drop',start:0,end:0.3},{word:' an',start:0.3,end:0.4},{word:'  ',start:0.4,end:0.5},{word:' egg.',start:0.5,end:0.9}]});
 assert.deepEqual(w,[{text:'Drop',start:0,end:0.3},{text:'an',start:0.3,end:0.4},{text:'egg.',start:0.5,end:0.9}]);
 assert.throws(()=>wordsFromWhisper({text:'no words'}),/word timestamps/);
});

test('captions are short chunks (max 3 words, about 18 letters), break after punctuation, and stay on screen until the next one',()=>{
 const words=['Drop','an','egg','into','water.','If','it','sinks,','it','is','fresh.'].map((text,i)=>({text,start:i*0.4,end:i*0.4+0.35}));
 const chunks=chunkCaptions(words);
 assert.deepEqual(chunks.map(c=>c.words.map(w=>w.text).join(' ')),['Drop an egg','into water.','If it sinks,','it is fresh.']);
 for(let i=0;i<chunks.length-1;i++)assert.equal(chunks[i].end,chunks[i+1].start,'no flicker between chunks');
 assert.equal(chunks.at(-1).end,words.at(-1).end);
 const long=chunkCaptions([{text:'Unbelievably',start:0,end:1},{text:'extraordinary',start:1,end:2},{text:'kitchen',start:2,end:3}]);
 for(const c of long)assert.ok(c.words.length===1||c.words.map(w=>w.text).join(' ').length<=18,'a chunk goes over 18 letters only when it is one long word');assert.equal(long.length,3);
});

import {timeline} from '../lib/render-reel.mjs';
test('the timeline places clips back to back and holds the last one until the voice and end card finish',()=>{
 const t=timeline([4,5,3],14,2.5);assert.deepEqual(t.clips.map(c=>[c.start,c.duration]),[[0,4],[4,5],[9,7.5]]);assert.equal(t.total,16.5);assert.equal(t.endCardStart,14);
 assert.equal(timeline([10,10],12,2.5).total,20,'clips longer than the voice set the length');
});

import {alignScript,shotTimeline} from '../lib/captions.mjs';
test('captions use the script\'s own words with Whisper\'s timing, even when Whisper mishears or drops a word',()=>{
 const whisper=[{text:'Merge',start:0,end:0.5},{text:'your',start:0.5,end:0.68},{text:'bendy,',start:0.68,end:1.2},{text:'veg',start:1.3,end:1.8},{text:'in',start:1.8,end:2}];
 const words=alignScript('Submerge your bendy, limp vegetables in',whisper);
 assert.deepEqual(words.map(w=>w.text),['Submerge','your','bendy,','limp','vegetables','in']);
 assert.equal(words[0].start,0);assert.equal(words[1].start,0.5);assert.ok(words[3].start>=1.2&&words[3].end<=words[4].end,'an unmatched word gets a time between its neighbours');
 for(let i=1;i<words.length;i++)assert.ok(words[i].start>=words[i-1].start,'times never go backwards');
});

test('each shot starts when its voiceover line starts; clips are trimmed or slowed (never below 0.7x) to fit',()=>{
 const lines=[{shot:'s1',start:0,end:4.5},{shot:'s2',start:4.6,end:9},{shot:'s3',start:9.1,end:15},{shot:'s3',start:15,end:17}];
 const t=shotTimeline([{id:'s1',seconds:6},{id:'s2',seconds:5},{id:'s3',seconds:5}],lines,{endCard:2.5});
 assert.deepEqual(t.clips.map(c=>c.start),[0,4.6,9.1]);
 assert.equal(t.clips[0].duration,4.6);assert.equal(t.clips[0].playbackRate,1,'longer clip is trimmed');
 assert.equal(t.clips[2].duration,10.4,'the last shot runs through the end card');assert.equal(t.clips[2].playbackRate,0.7,'slowed, but not below 0.7x');
 assert.equal(t.total,19.5);assert.equal(t.endCardStart,17);
});

import {checkRender} from '../lib/render-reel.mjs';
import {mkdtemp as mk,rm as rmd} from 'node:fs/promises';import {tmpdir as tmp} from 'node:os';import {join as j} from 'node:path';import {execFile as ef} from 'node:child_process';import {promisify as pf} from 'node:util';
test('every render checks itself: black frames or missing sound fail loudly',async()=>{
 const dir=await mk(j(tmp(),'cl-chk-'));const x=pf(ef);
 try{const good=j(dir,'good.mp4'),bad=j(dir,'bad.mp4');
  await x('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=180x320:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2','-shortest','-pix_fmt','yuv420p',good]);
  await x('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=180x320:rate=30:duration=1','-f','lavfi','-i','color=c=black:size=180x320:rate=30:duration=0.1','-f','lavfi','-i','testsrc2=size=180x320:rate=30:duration=1','-filter_complex','[0][1][2]concat=n=3:v=1:a=0','-pix_fmt','yuv420p',bad]);
  const ok=await checkRender(good,2);assert.equal(ok.black,0);assert.equal(ok.audio,true);
  await assert.rejects(checkRender(bad,2.1),/black frame|no sound/);
 }finally{await rmd(dir,{recursive:true,force:true});}
});

test('a line the audio never says is caught; a transcriber missing one word is not',async()=>{
 const {alignScript,linesHeard}=await import('../lib/captions.mjs');
 const lines=['Silver gets dull over time.','The aluminum pulls the tarnish right off.'];
 const whisper=['silver','gets','dull','over','time','the','aluminium'].map((text,i)=>({text,start:i*0.4,end:i*0.4+0.3}));
 const r=linesHeard(lines,alignScript(lines.join(' '),whisper));
 assert.equal(r.lines[0].heard,true);assert.equal(r.lines[1].heard,false);assert.deepEqual(r.missing,['The aluminum pulls the tarnish right off.']);assert.equal(r.all,false);
 const most=['silver','gets','dull','over','time','the','aluminum','pulls','tarnish','right','off'].map((text,i)=>({text,start:i*0.4,end:i*0.4+0.3}));
 assert.equal(linesHeard(lines,alignScript(lines.join(' '),most)).all,true);
});

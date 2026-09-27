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

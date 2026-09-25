import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordCtas} from '../public/money/1.0.mjs';
const k=c=>keywordCtas(c).keyword;
test('positives: quoted, curly, mixed-case quoted, capitals, after emoji and line breaks',()=>{
 assert.equal(k('Comment “HAIR” and I’ll send you the routine 🌿👇'),'HAIR');
 assert.equal(k('Still bloated? 👀\n\nComment “Lime” and I’ll send you the recipe.'),'LIME');
 assert.equal(k('Want the plan? Comment YES below'),'YES');
 assert.equal(k('👉 comment "guide" for the full list'),'GUIDE');
 assert.equal(k('Type PLAN and I will DM you'),'PLAN');
 assert.equal(k('Recipe inside. Just comment TEA'),'TEA');
 assert.equal(k('Comment the word MORINGA for the routine'),'MORINGA');
 assert.equal(k('- Reply "7DAYS" to get it'),'7DAYS');
 assert.equal(k('Comment ‘ŞİFA’ ve gönderelim'),'ŞİFA');
});
test('negatives: ordinary sentences, stoplist, negation, narrative, overlong',()=>{
 for(const c of ['Comment your thoughts below','What type of business are you?','comment below if you agree','Comment BELOW','Don’t comment GUIDE yet','people keep asking me to comment LIME','Comment "ABCDEFGHIJKLMNOPQRSTU" now','I would comment YES','Comment A','Please don’t just comment TEA'])assert.equal(k(c),null,c);
});
test('DM channel, multiple CTAs, evidence',()=>{
 const dm=keywordCtas('DM me "START" for the plan');assert.deepEqual([dm.keyword,dm.channel],['START','dm']);
 const both=keywordCtas('DM me "START" for the plan.\nComment “TEA” for the recipe.');assert.equal(both.keyword,'TEA');assert.equal(both.channel,'comment');assert.equal(both.matches.length,2);
 assert.match(both.evidence,/Comment “TEA”/);
 assert.deepEqual(keywordCtas(''),{keyword:null,channel:null,evidence:null,matches:[]});
});
import {scoreRun} from '../public/money/1.0.mjs';
test('every reel score carries its keyword, even when it has no x normal',()=>{
 const {results}=scoreRun({posts:[{id:'a',publishedAt:'2026-09-24T00:00:00Z',plays:500,comments:1,caption:'Comment "LIME" now'}],observedAt:'2026-09-25T00:00:00Z'});
 assert.equal(results.a.bucket,'too_new');assert.equal(results.a.keyword,'LIME');assert.equal(results.a.keywordChannel,'comment');assert.match(results.a.keywordEvidence,/LIME/);
});
test('real-caption patterns found on ken.remedie: "Or comment", ellipsis, "and comment"; open answers are not keywords',()=>{
 assert.equal(k('this is the one we recommend. 🔥\n\nOr comment “MORINGA” and we’ll send it'),'MORINGA');
 assert.equal(k('Your gut will thank you…comment “Helpful” and we will send it to you privately'),'HELPFUL');
 assert.equal(k('Save this and comment YES'),'YES');
 // The viewer types their own state: a comment CTA, but no fixed keyword.
 assert.equal(k('👇 Comment the STATE you live in and I’ll send you the routine'),null);
 assert.equal(k('Please don’t like or comment TEA'),null);
});

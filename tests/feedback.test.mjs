import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSummary,validFeedback,lessonsFrom,lessonsText,REASONS} from '../lib/feedback.mjs';
const s=(n,o={})=>({stops_scroll:n,visuals:n,sound:n,voice:n,payoff:n,pace:n,looks_real:n,keep_watching:n,fix:'f',...o});
test('score summary: share of the winners, the weakest part (not the overall one), the fix',()=>{
 const r=scoreSummary(s(6,{voice:3}),[7,7]);assert.equal(r.total,5.6);assert.equal(r.share,80);assert.equal(r.weakest,'voice');assert.equal(r.fix,'f');
});
test('feedback is one tap: up or down with known reasons only',()=>{
 assert.deepEqual(validFeedback({verdict:'down',reasons:['voice','voice']}).reasons,['voice']);
 assert.throws(()=>validFeedback({verdict:'meh'}),/Tap/);assert.throws(()=>validFeedback({verdict:'down',reasons:['hacked']}),/Unknown reason: hacked/);
 assert.equal(Object.keys(REASONS).length,6);
});
test('lessons: Kaan\'s reasons count double, a weak score part once, most frequent first; liked reels named',()=>{
 const reels=[{title:'Fizz',feedback:{verdict:'up',reasons:[]},score:{weakest:'stops_scroll',parts:{stops_scroll:5}}},
  {title:'Egg',feedback:{verdict:'down',reasons:['boring_start','voice']},score:{weakest:'voice',parts:{voice:4}}},{title:'Rice',score:{weakest:'payoff',parts:{payoff:7}}}];
 const l=lessonsFrom(reels);assert.deepEqual(l.lessons.map(x=>[x.reason,x.weight]),[['boring_start',3],['voice',3]]);assert.deepEqual(l.liked,['Fizz']);
 assert.match(lessonsText(l),/^Lessons from the reels made so far.*Open on the most striking.*weight 3.*Reels the owner liked: Fizz\./);
 assert.equal(lessonsText(lessonsFrom([])),'');
});

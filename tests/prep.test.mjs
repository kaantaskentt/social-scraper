import test from 'node:test';
import assert from 'node:assert/strict';
import {Prep} from '../lib/prep.mjs';

// After a scan, the next steps' cheap analysis runs in the background (about $0.30 per account, 2026-09-29): the Secret
// (needed by the Look), the Look's study of the three best reels, and the copy candidates' breakdowns.
test('prep runs the Secret, then the look study and the copy breakdowns side by side, once per run',async()=>{
 const order=[];let release;const gate=new Promise(r=>{release=r;});
 const prep=new Prep({keys:()=>({gemini:'g',jev:'j'}),ensureSecret:async j=>{order.push('secret');return {picked:[]};},
  kits:{study:async(j,saved)=>{order.push('study');await gate;}},copies:{prepare:async j=>{order.push('copies');return {candidates:3,ready:3};}}});
 const job={id:'r1'};const first=prep.run(job);await new Promise(r=>setTimeout(r,5));
 assert.equal(prep.status('r1').state,'working');prep.run(job);release();await first;
 assert.deepEqual(order,['secret','study','copies']);assert.equal(prep.status('r1').state,'done');
 await prep.run(job);assert.equal(order.length,3); // done once, never paid twice
});
test('a prep failure is shown, never thrown into the scan; missing keys skip it quietly',async()=>{
 const prep=new Prep({keys:()=>({gemini:'g',jev:'j'}),ensureSecret:async()=>{throw new Error('Gemini is out of credit');},kits:{study:async()=>{}},copies:{prepare:async()=>({})}});
 await prep.run({id:'r2'});assert.deepEqual(prep.status('r2'),{state:'failed',stage:null,error:'Gemini is out of credit'});
 const none=new Prep({keys:()=>({}),ensureSecret:async()=>{throw new Error('should not run');},kits:{},copies:{}});await none.run({id:'r3'});assert.equal(none.status('r3').state,'none');
});

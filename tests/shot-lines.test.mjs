import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineStore} from '../public/shot-lines.mjs';
const later=()=>{let resolve;const p=new Promise(r=>{resolve=r;});return {p,resolve};};

test('saves for one reel go out one after another, so the newest text always lands last',async()=>{
 const sent=[];const gates=[];const store=createLineStore({post:async(key,lines)=>{const g=later();gates.push(g);sent.push([key,lines.join('|')]);await g.p;}});
 store.edit('r/a',['one']);const s1=store.save('r/a');store.edit('r/a',['one two']);const s2=store.save('r/a');
 await new Promise(r=>setTimeout(r,5));assert.equal(sent.length,1,'the second save waits for the first');
 gates[0].resolve();await new Promise(r=>setTimeout(r,5));assert.deepEqual(sent.map(x=>x[1]),['one','one two']);gates[1].resolve();await Promise.all([s1,s2]);
});

test('lines typed this session win over an older copy from the server (switch away and back before the save finished)',()=>{
 const store=createLineStore({post:async()=>{}});
 store.edit('r/a',['fresh','']);
 assert.deepEqual(store.merge('r/a',['stale','old']),['fresh','']);
 assert.deepEqual(store.merge('r/b',['server','copy']),['server','copy']);
});

test('a save that fails is reported and the next save still runs',async()=>{
 let n=0;const store=createLineStore({post:async()=>{if(++n===1)throw new Error('offline');}});
 store.edit('r/a',['x']);await assert.rejects(store.save('r/a'),/offline/);await store.save('r/a');assert.equal(n,2);
});

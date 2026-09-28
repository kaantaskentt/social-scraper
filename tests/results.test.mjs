import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captionKey,matchReels,snapshot,atAge,ResultsTracker} from '../lib/results.mjs';

const reels=[{id:'egg',caption:'Spot bad eggs in seconds with this easy trick! #EggTest\n\nOur hosts are AI.'},{id:'soda',caption:'Is your pantry staple actually doing its job? When did you buy yours? #BakingSoda'}];
const post=(id,caption,publishedAt,extra={})=>({id,url:`https://www.instagram.com/reel/${id}/`,caption,publishedAt,plays:1000,likes:50,comments:4,shares:12,...extra});

test('a reel is found by its opening words, even with emoji or hashtags changed; short captions never match',()=>{
 assert.equal(captionKey('Spot bad eggs in seconds!! 🥚 #x'),'spot bad eggs in seconds');
 const m=matchReels(reels,[post('A','Spot bad eggs in seconds with this easy trick 🥚 #food','2026-09-29T10:00:00Z'),post('B','Hi','2026-09-29T11:00:00Z'),post('C','Something else entirely here today','2026-09-29T12:00:00Z')]);
 assert.deepEqual(m.map(x=>[x.reel.id,x.post.id]),[['egg','A']]);
 assert.deepEqual(matchReels([{id:'x',caption:'Hi'}],[post('B','Hi','2026-09-29T11:00:00Z')]),[]);
});

test('a snapshot has the age and rates per 1,000 plays; unknown numbers stay unknown',()=>{
 const s=snapshot(post('A','x','2026-09-29T10:00:00Z'),'2026-09-30T10:00:00Z');
 assert.deepEqual(s,{at:'2026-09-30T10:00:00Z',ageHours:24,plays:1000,likes:50,comments:4,shares:12,likesPer1k:50,sharesPer1k:12});
 const blind=snapshot(post('A','x','2026-09-29T10:00:00Z',{plays:null,shares:null}),'2026-09-30T10:00:00Z');assert.equal(blind.likesPer1k,null);assert.equal(blind.sharesPer1k,null);
});

test('reels are compared at the same age: the reading nearest 24 h, none if no reading is close',()=>{
 const snaps=[{ageHours:5},{ageHours:22},{ageHours:70}];assert.equal(atAge(snaps,24).ageHours,22);assert.equal(atAge(snaps,72).ageHours,70);assert.equal(atAge([{ageHours:5}],168),null);
});

test('tracking: needs a handle, adds a dated snapshot per check, keeps every check',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-res-'));
 try{
  let plays=1000;const t=new ResultsTracker(root,()=>({}),{scrape:async h=>{assert.equal(h,'kaan.tests');plays+=500;return [post('A','Spot bad eggs in seconds with this easy trick','2026-09-29T10:00:00Z',{plays})];}});
  await assert.rejects(t.check('run1',reels),/handle first/);await assert.rejects(t.setHandle('run1','bad handle!'),/Enter your Instagram handle/);
  await t.setHandle('run1','@kaan.tests');await t.check('run1',reels);const r=await t.check('run1',reels);
  assert.equal(r.checks.length,2);assert.deepEqual(r.reels.egg.snapshots.map(s=>s.plays),[1500,2000]);assert.equal(r.reels.egg.url,'https://www.instagram.com/reel/A/');assert.equal(r.reels.soda,undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});

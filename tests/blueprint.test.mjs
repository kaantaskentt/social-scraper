import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {detectShots,alignShots,extractKeyframes} from '../lib/blueprint.mjs';
const exec=promisify(execFile);

// A 4.5 s test video with hard cuts at 1.0 s and 2.5 s (red → blue → green, with moving test patterns).
async function testVideo(dir){
 const file=join(dir,'cuts.mp4');
 await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc=size=320x240:rate=25:duration=1','-f','lavfi','-i','smptebars=size=320x240:rate=25:duration=1.5','-f','lavfi','-i','mandelbrot=size=320x240:rate=25','-filter_complex','[2:v]trim=duration=2,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1:a=0,format=yuv420p[v]','-map','[v]',file]);
 return file;
}

test('finds the hard cuts and returns shots that cover the whole video',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cl-bp-'));
 try{const file=await testVideo(dir);const {duration,shots}=await detectShots(file);
  assert.ok(Math.abs(duration-4.5)<0.1,String(duration));assert.equal(shots.length,3,JSON.stringify(shots));
  assert.ok(Math.abs(shots[1].start-1.0)<0.1&&Math.abs(shots[2].start-2.5)<0.1,JSON.stringify(shots));
  assert.equal(shots[0].start,0);assert.ok(Math.abs(shots.at(-1).end-duration)<1e-6);
  for(let i=1;i<shots.length;i++)assert.equal(shots[i].start,shots[i-1].end);
  const frames=await extractKeyframes(file,shots,dir);assert.equal(frames.length,3);for(const f of frames)assert.ok((await stat(f)).size>1000);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('very short shots merge into their neighbour (min 0.4 s)',async()=>{
 const {shots}=await detectShots(null,{cuts:[1.0,1.2,3.0],duration:4});
 assert.deepEqual(shots.map(s=>[s.start,s.end]),[[0,1],[1,3],[3,4]]);
});

test('aligns transcript parts and Jev roles to shots by overlap',()=>{
 const shots=[{start:0,end:2},{start:2,end:5}];
 const anatomy=[{start:0,end:1.5,text:'Put lime on blueberries.',value:'hook'},{start:1.5,end:3,text:'Pharmacies hate this.',value:'setup'},{start:3,end:5,text:'Add cinnamon.',value:'advice'}];
 const out=alignShots(shots,anatomy);
 assert.deepEqual(out[0].words,['Put lime on blueberries.']);assert.deepEqual(out[0].roles,['hook']);
 assert.deepEqual(out[1].words,['Pharmacies hate this.','Add cinnamon.']);assert.deepEqual(out[1].roles,['setup','advice']);
 assert.equal(out[1].duration,3);
});

import {pickCuts,CUTS_VERSION} from '../lib/blueprint.mjs';
const frames=(scores,fps=25)=>scores.map((s,i)=>[i/fps,s]);
test('cuts are spikes against the frames around them: steady motion is not a cut, a jump cut in the same room is',()=>{
 const steady=frames(Array(100).fill(0.2));assert.deepEqual(pickCuts(steady),[],'constant heavy motion (an animated zoom) gives no cuts');
 const jump=frames(Array(100).fill(0.01).map((s,i)=>i===50?0.16:s));assert.deepEqual(pickCuts(jump),[2],'a small but sudden change in a still room is a cut');
 const hard=frames(Array(100).fill(0.03).map((s,i)=>i===25||i===75?0.6:s));assert.deepEqual(pickCuts(hard),[1,3]);
 const wobble=frames(Array(100).fill(0.01).map((s,i)=>i===50?0.08:s));assert.deepEqual(pickCuts(wobble),[],'below the floor: a hand move, not a cut');
 const burst=frames(Array(100).fill(0.02).map((s,i)=>i>=40&&i<=45?0.7:s));assert.ok(pickCuts(burst).length<=1,'a flash of several frames counts at most once (cuts at least 0.4 s apart)');
 assert.equal(typeof CUTS_VERSION,'number');
});
test('review round 2: a spike too close to the start does not hide the next real cut; missing scores are ignored',()=>{
 const rows=frames(Array(40).fill(0.01).map((s,i)=>i===3||i===11?0.5:s));assert.deepEqual(pickCuts(rows),[0.44]);
 const withNaN=frames(Array(60).fill(0.01).map((s,i)=>i===29?NaN:i===30?0.5:s));assert.deepEqual(pickCuts(withNaN),[1.2]);
});

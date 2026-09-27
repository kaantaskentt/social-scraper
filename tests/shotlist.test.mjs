import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildParts,pace,shotListText,TIPS,buildShotList,saveLines} from '../lib/shotlist.mjs';
const exec=promisify(execFile);
const anatomy=[{start:0,end:3.9,text:'Your socks should not leave marks.',value:'hook'},{start:4,end:7.3,text:'This is not a sock problem.',value:'problem'},
 {start:7.7,end:9.8,text:'You drink more water.',value:'problem'},{start:10,end:14,text:'Do this instead.',value:'advice'},{start:14.2,end:16,text:'Comment SOCKS.',value:'cta'}];
const shots=[{index:0,start:0,end:2},{index:1,start:2,end:5},{index:2,start:5,end:11},{index:3,start:11,end:16}];

test('parts: consecutive parts with the same role merge; each part lists the shots it overlaps',()=>{
 const parts=buildParts(anatomy,shots);
 assert.deepEqual(parts.map(p=>p.role),['hook','problem','advice','cta']);
 assert.equal(parts[1].said,'This is not a sock problem. You drink more water.');
 assert.deepEqual([parts[1].start,parts[1].end],[4,9.8]);
 assert.deepEqual(parts[0].shots,[0,1]);assert.deepEqual(parts[1].shots,[1,2]);assert.deepEqual(parts[3].shots,[3]);
 for(const p of parts)assert.ok(TIPS[p.role],p.role);
});

test('parts: a reel without speech gets one visual part per shot, merged down to at most 8',()=>{
 const many=Array.from({length:20},(_,i)=>({index:i,start:i,end:i+1}));
 const parts=buildParts([],many);assert.equal(parts.length,8);assert.equal(parts[0].role,'visual');assert.equal(parts[0].said,'');
 assert.equal(parts[0].start,0);assert.equal(parts.at(-1).end,20);assert.deepEqual(parts.flatMap(p=>p.shots),many.map(s=>s.index));
 assert.equal(buildParts([],shots).length,4);
 assert.deepEqual(buildParts([{start:null,end:null,text:'x',value:'hook'}],shots).map(p=>p.role),['visual','visual','visual','visual'],'untimed speech falls back to shots');
});

test('pace in plain words',()=>{
 assert.deepEqual(pace(shots,16),{shots:4,cuts:3,secondsPerShot:4});
 assert.deepEqual(pace([{index:0,start:0,end:9}],9),{shots:1,cuts:0,secondsPerShot:9});
});

test('text export: numbered parts, what they said, your line, ready to paste into Notes',()=>{
 const parts=buildParts(anatomy,shots);
 const text=shotListText({account:'ken.remedie',url:'https://www.instagram.com/reel/X/',duration:16,pace:pace(shots,16),parts},['Your laptop should not be this slow.','','','']);
 assert.match(text,/^Shot list: @ken\.remedie/);assert.match(text,/16 s · 4 shots/);
 assert.match(text,/1\. HOOK · 0–4 s\n/);assert.match(text,/They said: Your socks should not leave marks\./);
 assert.match(text,/Your line: Your laptop should not be this slow\./);assert.match(text,/Your line: ___/);
});

async function video(file){ // 4 colour blocks of 1 s: 3 hard cuts
 await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=90x160:d=1','-f','lavfi','-i','color=c=blue:s=90x160:d=1','-f','lavfi','-i','color=c=white:s=90x160:d=1','-f','lavfi','-i','color=c=black:s=90x160:d=1',
  '-filter_complex','[0][1][2][3]concat=n=4:v=1:a=0','-pix_fmt','yuv420p',file]);
}

test('shot list from a real video: cuts found, one frame per shot, cached, and your lines saved',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-shot-'));
 try{await mkdir(join(root,'videos','run1'),{recursive:true});await video(join(root,'videos','run1','reel1.mp4'));
  const job={id:'run1',creator:'tester',posts:[{id:'reel1',url:'https://www.instagram.com/reel/reel1/',analysis:{anatomy:[{start:0,end:1.5,text:'Hook line here.',value:'hook'},{start:2,end:3.8,text:'Comment AI.',value:'cta'}]}}]};
  const list=await buildShotList(root,job,'reel1');
  assert.equal(list.pace.shots,4);assert.deepEqual(list.parts.map(p=>p.role),['hook','cta']);
  assert.equal(list.frames.length,4);assert.match(list.frames[0],/^\/shotlists\/run1\/reel1\/shot-0\.jpg$/);
  assert.deepEqual((await readdir(join(root,'shotlists','run1','reel1'))).filter(n=>n.endsWith('.jpg')).sort(),['shot-0.jpg','shot-1.jpg','shot-2.jpg','shot-3.jpg']);
  assert.deepEqual(list.lines,['','']);
  await saveLines(root,job,'reel1',['My hook','My call to action']);
  const again=await buildShotList(root,job,'reel1');assert.deepEqual(again.lines,['My hook','My call to action']);
  await assert.rejects(saveLines(root,job,'reel1','nope'),/list/);await assert.rejects(saveLines(root,job,'nope',[]),/not found/);
  await assert.rejects(buildShotList(root,{...job,posts:[{id:'novideo'}]},'novideo'),/no video/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('parts: a choppy script merges down to at most 7 parts; hook stays first, call to action stays last, no words lost',()=>{
 const roles=['hook','setup','payoff','setup','payoff','example','advice','setup','payoff','example','advice','setup','advice','payoff','setup','cta'];
 const choppy=roles.map((value,i)=>({start:i*2,end:i*2+1.8,text:`w${i}.`,value}));
 const shots=[{index:0,start:0,end:10},{index:1,start:10,end:20},{index:2,start:20,end:32}];
 const parts=buildParts(choppy,shots);
 assert.ok(parts.length<=7,`${parts.length} parts`);assert.equal(parts[0].role,'hook');assert.equal(parts[0].said,'w0.');assert.equal(parts.at(-1).role,'cta');
 assert.equal(parts.map(p=>p.said).join(' '),roles.map((_,i)=>`w${i}.`).join(' '));
 for(let i=1;i<parts.length;i++)assert.ok(parts[i].start>=parts[i-1].end-1e-9,'in order');
 assert.equal(buildParts(anatomy,shots).length,4,'short scripts are left alone');
});

test('part 1 always gets the hook tip, because the first seconds decide if people stay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-shot-'));
 try{await mkdir(join(root,'videos','run1'),{recursive:true});await video(join(root,'videos','run1','reel1.mp4'));
  const job={id:'run1',creator:'tester',posts:[{id:'reel1',analysis:{anatomy:[{start:0,end:1.5,text:'Pour water on it.',value:'setup'},{start:2,end:3.8,text:'Comment AI.',value:'cta'}]}}]};
  const list=await buildShotList(root,job,'reel1');assert.equal(list.parts[0].role,'setup');assert.equal(list.parts[0].tip,TIPS.hook);assert.equal(list.parts[1].tip,TIPS.cta);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('lines stay with their part when the script analysis changes; lines that no longer fit are kept aside, not lost',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-shot-'));
 try{await mkdir(join(root,'videos','run1'),{recursive:true});await video(join(root,'videos','run1','reel1.mp4'));
  const post={id:'reel1',analysis:{anatomy:[{start:0,end:1.5,text:'Hook.',value:'hook'},{start:2,end:3.8,text:'Comment AI.',value:'cta'}]}};const job={id:'run1',creator:'t',posts:[post]};
  await buildShotList(root,job,'reel1');await saveLines(root,job,'reel1',['my hook','my cta']);
  post.analysis.anatomy=[{start:0,end:1,text:'New opening.',value:'hook'},{start:1,end:1.9,text:'Middle.',value:'setup'},{start:2,end:3.8,text:'Comment AI.',value:'cta'}];
  const list=await buildShotList(root,job,'reel1');assert.deepEqual(list.lines,['my hook','','my cta']);assert.deepEqual(list.unplaced,[]);
  post.analysis.anatomy=[{start:0.5,end:3.8,text:'All one part.',value:'advice'}];
  const moved=await buildShotList(root,job,'reel1');assert.deepEqual(moved.lines,['']);assert.deepEqual(moved.unplaced,['my hook','my cta']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a replaced video gets new cuts and frames instead of the old cached ones',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-shot-'));
 try{const dir=join(root,'videos','run1');await mkdir(dir,{recursive:true});await video(join(dir,'reel1.mp4'));
  const job={id:'run1',creator:'t',posts:[{id:'reel1'}]};assert.equal((await buildShotList(root,job,'reel1')).pace.shots,4);
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=90x160:d=3','-pix_fmt','yuv420p',join(dir,'reel1.mp4')]);
  assert.equal((await buildShotList(root,job,'reel1')).pace.shots,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('two saves at once for one reel are written in the order they arrived',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-shot-'));
 try{await mkdir(join(root,'videos','run1'),{recursive:true});await video(join(root,'videos','run1','reel1.mp4'));
  const job={id:'run1',creator:'t',posts:[{id:'reel1'}]};await buildShotList(root,job,'reel1');
  await Promise.all(Array.from({length:12},(_,i)=>saveLines(root,job,'reel1',[`v${i}`])));
  assert.equal((await buildShotList(root,job,'reel1')).lines[0],'v11');
 }finally{await rm(root,{recursive:true,force:true});}
});

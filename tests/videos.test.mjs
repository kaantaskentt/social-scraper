import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveVideos,deleteVideos,videoInfo,videoPath,parseRange,linkExpired} from '../lib/videos.mjs';
import {byPriority} from '../lib/data.mjs';

const job=(id,ids)=>({id,posts:ids.map(p=>({id:p,videoUrl:`https://scontent.cdninstagram.com/${p}.mp4?oe=FFFFFFFF`}))});
const fake=calls=>async url=>{calls.push(url);if(url.includes('bad'))throw new Error('Media download failed (403)');if(url.includes('html'))return {bytes:Buffer.from('<html>'),type:'text/html'};return {bytes:Buffer.from('video:'+url),type:'video/mp4'};};

test('saves each reel once into its own run folder; skips saved ones; records failures',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-v-'));
 try{const calls=[];const j=job('run1',['a','b','bad','html']);
  const first=await saveVideos(root,j,{downloader:fake(calls)});
  assert.equal(first.saved,2);assert.deepEqual(first.failed.map(f=>f.id).sort(),['bad','html']);
  assert.match(first.failed.find(f=>f.id==='html').error,/not a video/);
  assert.equal(String(await readFile(videoPath(root,'run1','a'))),'video:https://scontent.cdninstagram.com/a.mp4?oe=FFFFFFFF');
  const second=await saveVideos(root,j,{downloader:fake(calls)});assert.equal(second.skipped,2);assert.equal(calls.filter(u=>u.includes('/a.mp4')).length,1);
  const info=await videoInfo(root,j);assert.deepEqual(info.saved,['a','b']);assert.ok(info.bytes>0);assert.equal(info.total,4);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('expired links are not downloaded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-v-'));
 try{const calls=[];const j={id:'run1',posts:[{id:'old',videoUrl:'https://scontent.cdninstagram.com/old.mp4?oe=00000001'},{id:'new',videoUrl:'https://scontent.cdninstagram.com/new.mp4?oe=FFFFFFFF'}]};
  const r=await saveVideos(root,j,{downloader:fake(calls)});assert.equal(r.saved,1);assert.deepEqual(r.expired,['old']);assert.equal(calls.length,1);
  assert.equal(linkExpired('https://x.cdninstagram.com/v.mp4?oe=00000001'),true);assert.equal(linkExpired('https://x.cdninstagram.com/v.mp4'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('deleting one run\'s videos leaves other runs\' videos and all run data untouched',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-v-'));
 try{await mkdir(join(root,'runs'),{recursive:true});await writeFile(join(root,'runs','run1.json'),'{"keep":true}');
  const a=job('run1',['a','b']),b=job('run2',['a']);await saveVideos(root,a,{downloader:fake([])});await saveVideos(root,b,{downloader:fake([])});
  const d=await deleteVideos(root,a);assert.equal(d.deleted,2);assert.ok(d.bytes>0);
  assert.deepEqual((await videoInfo(root,a)).saved,[]);assert.deepEqual((await videoInfo(root,b)).saved,['a']);
  assert.equal(String(await readFile(join(root,'runs','run1.json'))),'{"keep":true}');
  assert.deepEqual(await readdir(join(root,'videos')),['run2']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('ids with path tricks are refused',()=>{
 for(const bad of ['../x','a/b','','x'.repeat(91)])assert.throws(()=>videoPath('/tmp/r','run1',bad),/Invalid/);
 assert.throws(()=>videoPath('/tmp/r','../runs','a'),/Invalid/);
});

test('range header parsing for video seeking',()=>{
 assert.deepEqual(parseRange('bytes=0-99',1000),{start:0,end:99});
 assert.deepEqual(parseRange('bytes=900-',1000),{start:900,end:999});
 assert.deepEqual(parseRange('bytes=-100',1000),{start:900,end:999});
 assert.deepEqual(parseRange('bytes=0-5000',1000),{start:0,end:999});
 for(const bad of ['bytes=1000-','bytes=5-2','items=0-1','bytes=0-1,5-6','bytes=-0'])assert.equal(parseRange(bad,1000),null,bad);
});

// Winners (and the weakest, for contrast) are what the next steps look at first, so they are fetched first
// (2026-09-29: videos used to download only after the whole scan finished).
test('the reels furthest from the account\'s usual plays come first: the winners, then the weakest',async()=>{
 const posts=[{id:'mid',plays:10000},{id:'huge',plays:5000000},{id:'none'},{id:'tiny',plays:600},{id:'big',plays:300000},{id:'m2',plays:12000}];
 assert.deepEqual(byPriority(posts).map(p=>p.id),['huge','big','tiny','mid','m2','none']);
 const root=await mkdtemp(join(tmpdir(),'cl-v-'));
 try{const calls=[];const j={id:'run2',posts:posts.filter(p=>p.plays).map(p=>({...p,videoUrl:`https://scontent.cdninstagram.com/${p.id}.mp4?oe=FFFFFFFF`}))};
  await saveVideos(root,j,{downloader:fake(calls),concurrency:1});assert.deepEqual(calls.map(u=>u.split('/').pop().split('.')[0]),['huge','big','tiny','mid','m2']);
 }finally{await rm(root,{recursive:true,force:true});}
});

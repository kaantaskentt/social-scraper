import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {saveReference,publicRep,sourceFor} from '../lib/replicate-http.mjs';
import {streamFile} from '../lib/videos.mjs';

const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),JPG=Buffer.from('ffd8ffe000104a464946','hex'),WEBP=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 ')]);
const url=(type,bytes)=>`data:${type};base64,${bytes.toString('base64')}`;

test('reference uploads must really be the image type they claim',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-http-'));
 try{for(const [type,bytes] of [['image/png',PNG],['image/jpeg',JPG],['image/webp',WEBP]])assert.match((await saveReference(root,{dataUrl:url(type,bytes)})).url,/^\/references\//);
  await assert.rejects(saveReference(root,{dataUrl:url('image/png',Buffer.from('not an image at all'))}),/PNG, JPG or WebP/);
  await assert.rejects(saveReference(root,{dataUrl:url('image/png',JPG)}),/PNG, JPG or WebP/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('the app shows the Higgsfield job id, so an uncertain job can be looked up',()=>{
 assert.equal(publicRep({id:'a',status:'uncertain',jobId:'job-3'}).jobId,'job-3');
 assert.equal(publicRep({id:'a',status:'done'}).video,'/replicas/a.mp4');
});

test('a file that disappears mid-stream closes the response instead of crashing the server',async()=>{
 const res=new PassThrough();const closed=new Promise(r=>res.on('close',r));
 streamFile(res,'/nonexistent/definitely/missing.mp4');await closed;assert.equal(res.destroyed,true);
});

test('the source reel is downloaded once, even for two requests at the same time, and never left half written',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-http-'));let downloads=0;
 const download=async()=>{downloads++;await new Promise(r=>setTimeout(r,10));return {bytes:Buffer.from('video'),type:'video/mp4'};};
 const job={id:'run-1',posts:[{id:'reel1',videoUrl:'https://cdn.example/v.mp4'}]};
 try{const [a,b]=await Promise.all([sourceFor(root,job,'reel1',{download}),sourceFor(root,job,'reel1',{download})]);
  assert.equal(a,b);assert.equal(downloads,1);assert.equal(String(await readFile(a)),'video');
  assert.deepEqual((await readdir(join(root,'replicas'))).filter(n=>n.endsWith('.tmp')),[]);
  await assert.rejects(sourceFor(root,job,'reel1',{download:async()=>({bytes:Buffer.from('<html>'),type:'text/html'})}).then(()=>sourceFor(root,{...job,id:'run-2'},'reel1',{download:async()=>({bytes:Buffer.from('<html>'),type:'text/html'})})),/not a video/);
 }finally{await rm(root,{recursive:true,force:true});}
});

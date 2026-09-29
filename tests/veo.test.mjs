import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VeoJobs,veoSegments,veoPrice,veoRequest,VEO,chainStarts,VEO_MAX} from '../lib/veo.mjs';

// A fake Google: POST starts an operation, GET says not done once, then done with a download link.
function google({refuse=false,filtered=false}={}){
 const calls={post:[],get:0};
 const fetchImpl=async(url,o={})=>{
  if(o.method==='POST'){calls.post.push({url,body:JSON.parse(o.body)});if(refuse)return new Response(JSON.stringify({error:{message:'Request blocked due to prohibited content guidelines.'}}),{status:400});return Response.json({name:`models/x/operations/op${calls.post.length}`});}
  if(url.includes(':download'))return new Response('VEOBYTES');
  calls.get++;if(calls.get===1)return Response.json({done:false});
  return Response.json(filtered?{done:true,response:{generateVideoResponse:{raiMediaFilteredReasons:['celebrity likeness']}}}:{done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/v1:download?alt=media'}}]}}});};
 return {calls,fetchImpl};
}
const opts=g=>({key:'k',fetchImpl:g.fetchImpl,sleep:async()=>{},pollMs:0});

test('segments: 8 s, then 7 s at a time until the original is covered; price per second of the tier',()=>{
 assert.deepEqual(veoSegments(8),[8]);assert.deepEqual(veoSegments(36),[8,7,7,7,7]);assert.deepEqual(veoSegments(37.4),[8,7,7,7,7,7]); // 36 s would cut the last 1.4 s of a 37.4 s originalassert.deepEqual(veoSegments(43),[8,7,7,7,7,7]);
 assert.equal(veoPrice([8,7,7,7,7]),3.6);assert.equal(veoPrice([8,7,7,7,7],'standard'),14.4);assert.equal(VEO.fast.usdPerSecond,0.10);
});
// Kaan, 2026-09-29: "ignore the caps for seconds". Veo extends one video up to 148 s; a longer reel starts a fresh 8 s
// clip (a new chain, with the hosts' pictures again) and the chains are joined.
test('no length cap: past 148 s a new chain starts with a fresh 8 s clip, and the chains cover the whole reel',()=>{
 const s=veoSegments(160);assert.equal(s.reduce((a,b)=>a+b,0)>=159.5,true);assert.equal(s[21],8);assert.equal(s.slice(0,21).reduce((a,b)=>a+b,0),VEO_MAX);
 const c=chainStarts(s,VEO_MAX);assert.deepEqual(c.map((f,i)=>f?i:-1).filter(i=>i>=0),[0,21]);
 assert.deepEqual(chainStarts([10,10,10,10,10,10,10,10,10],40).map((f,i)=>f?i:-1).filter(i=>i>=0),[0,4,8]); // Omni: 4 parts of 10 s per chain
 assert.deepEqual(veoSegments(36),[8,7,7,7,7]);
});
test('the first clip carries up to 3 reference pictures (allow_adult, 8 s); an extension carries the previous video',()=>{
 const first=veoRequest({prompt:'p',refs:[Buffer.from('a'),Buffer.from('b'),Buffer.from('c'),Buffer.from('d')]});
 assert.equal(first.instances[0].referenceImages.length,3);assert.equal(first.instances[0].referenceImages[0].referenceType,'asset');
 assert.deepEqual(first.parameters,{aspectRatio:'9:16',resolution:'720p',personGeneration:'allow_adult',durationSeconds:8}); // numberOfVideos is refused by the API (2026-09-29)
 const ext=veoRequest({prompt:'p',refs:[Buffer.from('a')],previous:Buffer.from('mp4')});
 assert.equal(ext.instances[0].referenceImages,undefined);assert.equal(ext.instances[0].video.mimeType,'video/mp4');assert.ok(ext.instances[0].video.bytesBase64Encoded);assert.ok(first.instances[0].referenceImages[0].image.bytesBase64Encoded);assert.equal(ext.parameters.durationSeconds,undefined);assert.equal(ext.parameters.personGeneration,'allow_all');
});
test('a job is sent to the tier\'s model, saved before waiting, polled, downloaded and priced by the seconds it adds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'veo-')),g=google(),jobs=new VeoJobs(dir,opts(g));
 try{
  const r=await jobs.run('part-2',{prompt:'continue',previous:Buffer.from('x'),seconds:7});
  assert.match(g.calls.post[0].url,/veo-3\.1-fast-generate-preview:predictLongRunning$/);assert.equal(r.status,'done');assert.equal(r.costUsd,0.7);assert.equal(await readFile(r.file,'utf8'),'VEOBYTES');
  const again=await jobs.run('part-2',{prompt:'continue',seconds:7});assert.equal(g.calls.post.length,1);assert.equal(again.fresh,undefined); // never paid twice
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a refused prompt or a filtered video fails with the reason and costs nothing; a lost reply stays uncertain',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'veo-'));
 try{
  await assert.rejects(new VeoJobs(dir,opts(google({refuse:true}))).run('part-1',{prompt:'p',seconds:8}),/prohibited content/);
  const rec=JSON.parse(await readFile(join(dir,'jobs','part-1.json'),'utf8'));assert.equal(rec.status,'failed');assert.equal(rec.prompt,'p');
  await assert.rejects(new VeoJobs(dir,opts(google({filtered:true}))).run('part-3',{prompt:'p',seconds:7}),/Veo stopped: celebrity likeness/);
  let hang=true;const g=google(),lost={...opts(g),fetchImpl:async(u,o={})=>{if(o.method==='POST'&&hang){hang=false;throw new Error('socket hang up');}return g.fetchImpl(u,o);}};
  await assert.rejects(new VeoJobs(dir,lost).run('part-4',{prompt:'p',seconds:7}),/socket hang up/);
  await assert.rejects(new VeoJobs(dir,lost).run('part-4',{prompt:'p',seconds:7}),/may already be paid/);assert.equal(g.calls.post.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

// A visual copy's printed line: Veo garbled "DON'T TALK TO ME..." into "LASTIA IULRD WEGS" when asked to write it
// (2026-09-29), so the first frame is drawn with the exact line and Veo animates from it.
test('a first frame is sent as the starting image, without reference pictures',()=>{
 const r=veoRequest({prompt:'p',image:Buffer.from('frame'),refs:[Buffer.from('a')]});
 assert.equal(Buffer.from(r.instances[0].image.bytesBase64Encoded,'base64').toString(),'frame');assert.equal(r.instances[0].image.mimeType,'image/jpeg');
 assert.equal(r.instances[0].referenceImages,undefined);assert.equal(r.parameters.durationSeconds,8);assert.equal(r.parameters.personGeneration,'allow_adult');
});

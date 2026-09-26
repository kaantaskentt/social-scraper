// Fixes from the 2026-09-26 review: song lyrics, silent reels, Apify rejections, resume while pausing, cut-short scrapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pipeline} from '../lib/pipeline.mjs';
import {normalize} from '../lib/data.mjs';
import {parseHandles} from '../public/handles.mjs';
const keys=()=>({apify:'a',groq:'g',jev:'j'});
const settle=async p=>{while(p.active.size)await new Promise(r=>setTimeout(r,5));};
const jevAnswer=(req,lyricsP)=>({model:req.model,answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,q.type==='noul'?{type:'noul',noul:lyricsP}:{type:'choice',choice:Object.keys(q.criteria)[0],confidence:.9,probabilities:{}}])),usage:{input_tokens:10}});
const words='Why keep waiting when you can pick one task and finish it today';
const song={musicInfo:{song_name:'Black Beatles',artist_name:'Rae Sremmurd',uses_original_audio:false}};
async function withPipeline(fetchImpl,fn){const root=await mkdtemp(join(tmpdir(),'cl-fix-'));const real=global.fetch;global.fetch=fetchImpl;
 try{await fn(await new Pipeline(root,keys).init(),root);}finally{global.fetch=real;await rm(root,{recursive:true,force:true});}}

test('the reel records which song it uses',()=>{
 assert.deepEqual(normalize({id:'a',...song}).music,{song:'Black Beatles',artist:'Rae Sremmurd',original:false});
 assert.equal(normalize({id:'a',musicInfo:{song_name:'Original audio',uses_original_audio:true}}).music.original,true);
 assert.equal(normalize({id:'a'}).music,null);
});

test('song reels whose words are lyrics are tagged as music and never labelled as a script; talk over a song is kept',async()=>{
 const lyricsFor={lyric:0.82,talk:0.13};let classify=0,checks=0;
 await withPipeline(async(url,opts)=>{const req=JSON.parse(opts.body);
  if(req.questions.lyrics){checks++;return Response.json(jevAnswer(req,lyricsFor[req.state.transcript.includes('Beatles')?'lyric':'talk']));}
  classify++;return Response.json(jevAnswer(req));},async p=>{
  const j=await p.create({creator:'tester'},[{id:'lyric',ownerUsername:'tester',transcript:'Black Beatles in the city be back immediately to confiscate the money',...song},
   {id:'talk',ownerUsername:'tester',transcript:words,...song},{id:'own',ownerUsername:'tester',transcript:words+' with my own voice'}]);
  await p.run(j.id);await settle(p);
  const by=Object.fromEntries(j.posts.map(x=>[x.id,x]));
  assert.equal(by.lyric.status,'music');assert.match(by.lyric.excludedReason,/lyrics/);assert.equal(by.lyric.analysis,null);
  assert.equal(by.talk.status,'complete');assert.equal(by.own.status,'complete');
  assert.equal(checks,2,'only song reels get the lyrics check');assert.equal(classify,2);
  await p.run(j.id);await settle(p);assert.equal(checks,2,'the check is not paid for again');
 });
});

test('runs scanned before the fix get the lyrics check on resume, without paying for labels again',async()=>{
 let checks=0,classify=0;
 await withPipeline(async(url,opts)=>{const req=JSON.parse(opts.body);if(req.questions.lyrics){checks++;return Response.json(jevAnswer(req,0.8));}classify++;return Response.json(jevAnswer(req));},async(p,root)=>{
  const j=await p.create({creator:'tester'},[{id:'lyric',ownerUsername:'tester',transcript:'Black Beatles in the city be back immediately to confiscate the money',...song}]);
  const post=j.posts[0];delete post.music;await p.run(j.id);await settle(p);assert.equal(post.status,'complete');assert.equal(classify,1);assert.equal(checks,0);
  await p.persist(j);const again=await new Pipeline(root,keys).init();const old=again.jobs.get(j.id);assert.equal(old.posts[0].music.original,false,'backfilled from the raw rows');
  await again.run(j.id);await settle(again);assert.equal(old.posts[0].status,'music');assert.equal(checks,1);assert.equal(classify,1);
 });
});

test('a silent reel is transcribed once, cached, and excluded; the run still completes',async()=>{
 let groq=0;
 await withPipeline(async url=>{if(String(url).includes('groq.com')){groq++;return Response.json({text:'',segments:[],duration:8});}throw new Error('unexpected '+url);},async p=>{
  const j=await p.create({creator:'tester'},[{id:'quiet',ownerUsername:'tester',videoUrl:'https://scontent.cdninstagram.com/v.mp4',videoDuration:8}]);
  await p.run(j.id);await settle(p);assert.equal(j.status,'complete');assert.equal(j.posts[0].status,'no_speech');
  j.posts[0].transcript=null;j.posts[0].excludedReason=null;await p.run(j.id);await settle(p);assert.equal(groq,1,'second pass reads the cache');
 });
});

test('a clear Apify rejection (no run started) does not block the next try; a reply without a run id does',async()=>{
 await withPipeline(async url=>{if(String(url).includes('/acts/'))return Response.json({error:{message:'Not enough credit'}},{status:402});throw new Error('unexpected');},async p=>{
  const j=await p.create({creator:'tester',limit:5});await p.run(j.id);await settle(p);assert.equal(j.status,'failed');assert.equal(j.scrapeUncertain,false);assert.match(j.error,/402/);
 });
 await withPipeline(async url=>{if(String(url).includes('/acts/'))return Response.json({data:null});throw new Error('unexpected');},async p=>{
  const j=await p.create({creator:'tester',limit:5});await p.run(j.id);await settle(p);assert.equal(j.status,'failed');assert.equal(j.scrapeUncertain,true);
 });
});

test('pressing Resume while a pause is still finishing says so instead of silently doing nothing',async()=>{
 let release;const gate=new Promise(r=>{release=r;});
 await withPipeline(async(url,opts)=>{await gate;return Response.json(jevAnswer(JSON.parse(opts.body)));},async p=>{
  const j=await p.create({creator:'tester'},[{id:'a',ownerUsername:'tester',transcript:words}]);
  await p.run(j.id);await p.pause(j.id);await assert.rejects(p.run(j.id),/still pausing/i);release();await settle(p);
 });
});

test('an Apify scrape that stopped early says so on the run',async()=>{
 await withPipeline(async url=>{const u=String(url);
  if(u.includes('/acts/'))return Response.json({data:{id:'run1',status:'RUNNING',defaultDatasetId:'ds'}});
  if(u.includes('/actor-runs/'))return Response.json({data:{id:'run1',status:'TIMED-OUT',defaultDatasetId:'ds',usageTotalUsd:0.1}});
  if(u.includes('/datasets/'))return Response.json([{id:'r1',ownerUsername:'tester',transcript:words}]);
  return Response.json(jevAnswer(JSON.parse('{"questions":{}}')));},async p=>{
  const j=await p.create({creator:'tester',limit:50});await p.run(j.id);await settle(p);
  assert.match(j.warning||'',/stopped early.*TIMED-OUT.*1 of up to 50/);
 });
});

test('pasted post or reel links are refused instead of scanning an account called "reel"',()=>{
 for(const link of ['https://www.instagram.com/reel/DdF123/','https://instagram.com/p/abc','instagram.com/reels/xyz','https://www.instagram.com/stories/brand/1'])
  assert.match(parseHandles(link).error,/post or reel link/,link);
 assert.deepEqual(parseHandles('instagram.com/ken.remedie www.instagram.com/brand_a/').handles,['ken.remedie','brand_a']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {freePort} from './free-port.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('server: the kit needs a confirm and a Secret, serves only kit pictures, and says what it costs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cl-srv-kit-'));const port=await freePort();
 await mkdir(join(root,'runs'),{recursive:true});await writeFile(join(root,'runs','run1.json'),JSON.stringify({id:'run1',creator:'tester',status:'complete',createdAt:'2026-09-25T00:00:00Z',posts:[],events:[]}));
 await mkdir(join(root,'channels','run1','kit'),{recursive:true});await writeFile(join(root,'channels','run1','kit','face0-0123456789ab.jpg'),'JPEG');await writeFile(join(root,'channels','run1','kit','study.json'),'{}');
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),LAB_DATA_DIR:root,GEMINI_API_KEY:'g',TYPESAFE_API_KEY:'j'},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,fail)=>{child.stdout.on('data',d=>String(d).includes('ready')&&ok());child.on('exit',c=>fail(new Error('server exited '+c)));setTimeout(()=>fail(new Error('timeout')),8000).unref();});
  const base=`http://127.0.0.1:${port}`;const s=await (await fetch(`${base}/api/runs/run1/kit`)).json();
  assert.equal(s.state,'none');assert.ok(s.estimate.usd>0);assert.deepEqual(Object.keys(s.formats),['ai_host','hands_pov','visuals','animated']);
  const {token}=await (await fetch(`${base}/api/bootstrap`)).json();
  const post=(p,b)=>fetch(`${base}/api/runs/run1/kit${p}`,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(b)});
  assert.match((await (await post('',{})).json()).error,/Confirm/);
  // Without a Secret, Look studies the winners first instead of refusing (the page goes Winners → Look, 2026-09-29).
  const started=await (await post('',{confirm:true})).json();assert.ok(!started.error,started.error);assert.equal(started.stage,'Studying their winners');
  assert.match((await (await post('/approve',{confirm:true})).json()).error,/Build the kit first/);
  assert.match((await (await post('/voices',{confirm:true})).json()).error,/Draw your look first/);
  assert.match((await (await post('/choose',{confirm:true})).json()).error,/no options to choose from/);
  assert.equal((await fetch(`${base}/api/runs/run1/kit`,{method:'POST',body:'{"confirm":true}'})).status,403);
  const pic=await fetch(`${base}/channels/run1/kit/face0-0123456789ab.jpg`);assert.equal(pic.status,200);assert.equal(pic.headers.get('content-type'),'image/jpeg');assert.equal(await pic.text(),'JPEG');
  await writeFile(join(root,'channels','run1','kit','voice-leo.wav'),'RIFF');const wav=await fetch(`${base}/channels/run1/kit/voice-leo.wav`);assert.equal(wav.headers.get('content-type'),'audio/wav');
  const opt=join(root,'channels','run1','kit','opt2-face0-0123456789ab.jpg');await writeFile(opt,'J');assert.equal((await fetch(`${base}/channels/run1/kit/opt2-face0-0123456789ab.jpg`)).status,200);
  assert.equal((await fetch(`${base}/channels/run1/kit/study.json`)).status,404);
  assert.equal((await fetch(`${base}/channels/run1/kit/..%2Fspend.json`)).status,404);
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});

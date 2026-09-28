import test from 'node:test';
import assert from 'node:assert/strict';
import {designVoice,speak,voiceDescription,lineTimes,ttsCost,fitTempo} from '../lib/voices.mjs';
test('voice design sends permanent traits and returns the id and a sample; a 500 is retried',async()=>{
 let calls=0,sent;const f=async(url,o)=>{calls++;sent=JSON.parse(o.body);return calls<2?new Response('x',{status:500}):Response.json({id:'voice_1',expire_time:'2027',sample_audio:{data:Buffer.from('WAV').toString('base64')},usage:{total_input_tokens:200,total_output_tokens:2000}});};
 const v=await designVoice({key:'k',name:'Leo',description:'A warm man',gender:'male',fetchImpl:f,sleep:async()=>{}});
 assert.equal(calls,2);assert.equal(sent.store,true);assert.equal(sent.voice.type,'prompted');assert.equal(sent.voice.prompted.input,'A warm man');
 assert.equal(v.id,'voice_1');assert.equal(v.sample.toString(),'WAV');assert.equal(v.costUsd,ttsCost({total_input_tokens:200,total_output_tokens:2000}));
 await assert.rejects(designVoice({key:'k',name:'x',description:'d',fetchImpl:async()=>Response.json({error:{message:'bad'}},{status:400})}),/HTTP 400.*bad/);
});
test('a line is spoken with the voice and an acting note; missing audio fails loudly',async()=>{
 let sent;const f=async(url,o)=>{sent=JSON.parse(o.body);return Response.json({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.from('A').toString('base64')}]}],usage:{}});};
 const r=await speak({key:'k',voice:'voice_1',text:'Hi',style:'calm',fetchImpl:f});assert.equal(r.wav.toString(),'A');
 assert.equal(sent.model,'gemini-3.8-flash-tts');assert.deepEqual(sent.generation_config.speech_config,[{voice:'voice_1'}]);assert.equal(sent.input[0].content[0].annotations[0].style,'calm');
 await assert.rejects(speak({key:'k',voice:'v',text:'x',fetchImpl:async()=>Response.json({steps:[]})}),/No audio/);
});
test('voice descriptions come from the kit; lines never overlap',()=>{
 const d=voiceDescription({look:'Female, 30s, athletic',voice:'Bright, clear.'});assert.equal(d.gender,'female');assert.equal(d.description,'A woman in her 30s with a bright, clear voice and a neutral American accent, speaking naturally and close to the mic.');
 const h=voiceDescription({look:'Older adult male, broad build',voice:'Resonant, smooth, mid-tempo male voiceover with a calm delivery.'});
 assert.equal(h.description,'An older man with a resonant, smooth, mid-tempo, calm voice and a neutral American accent, speaking naturally and close to the mic.');assert.equal(h.simple,'An older man with a resonant voice.');
 assert.equal(voiceDescription({look:'Male, 40s',voice:'deep'}).gender,'male');
 assert.deepEqual(lineTimes([{at:0,seconds:4},{at:3,seconds:1},{at:10,seconds:1}]).map(l=>l.start),[0,4.15,10]);
});

test('one speed for the reel: just enough for every line to fit before the next beat, never above 1.35x',()=>{
 assert.equal(fitTempo([{at:0,seconds:2},{at:3,seconds:2}],10),1);
 assert.equal(fitTempo([{at:0,seconds:4},{at:3,seconds:2}],10),1.33);
 assert.equal(fitTempo([{at:0,seconds:9},{at:2,seconds:1}],10),1.35);
 assert.equal(fitTempo([{at:8,seconds:3}],10),1.35);
});

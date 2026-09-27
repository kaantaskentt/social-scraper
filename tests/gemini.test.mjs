import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,costOf} from '../lib/gemini.mjs';
const ok=(json,usage={promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:50})=>async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(json)}]},finishReason:'STOP'}],usageMetadata:usage});

test('generate sends the video inline with a JSON schema and returns parsed JSON, token usage and cost',async()=>{
 let sent;const fetchImpl=async(url,opts)=>{sent={url,body:JSON.parse(opts.body),key:opts.headers['x-goog-api-key']};return ok({a:1})();};
 const r=await generate({key:'k',model:'gemini-3.8-flash',parts:[{video:Buffer.from('vid')},{text:'hi'}],schema:{type:'object'},fetchImpl});
 assert.deepEqual(r.json,{a:1});assert.equal(sent.key,'k');assert.match(sent.url,/models\/gemini-3\.8-flash:generateContent$/);
 assert.deepEqual(sent.body.contents[0].parts[0],{inline_data:{mime_type:'video/mp4',data:Buffer.from('vid').toString('base64')}});
 assert.equal(sent.body.generationConfig.responseMimeType,'application/json');assert.equal(sent.body.generationConfig.thinkingConfig.thinkingLevel,'low');
 assert.deepEqual(r.usage,{input:1000,output:150});assert.equal(r.costUsd,costOf('gemini-3.8-flash',1000,150));
});

test('cost uses the per-model price and fails loudly for a model without a known price',()=>{
 assert.equal(costOf('gemini-3.8-flash',1e6,1e6),0.75+3.75);assert.equal(costOf('gemini-3.1-pro-preview',1e6,0),2);
 assert.throws(()=>costOf('mystery-model',1,1),/price/);
});

test('errors are loud: bad key, blocked answer, cut-off answer, unreadable JSON',async()=>{
 await assert.rejects(generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:async()=>Response.json({error:{message:'API key not valid'}},{status:400})}),/Gemini: HTTP 400.*API key not valid/);
 await assert.rejects(generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:async()=>Response.json({promptFeedback:{blockReason:'SAFETY'}})}),/blocked.*SAFETY/);
 await assert.rejects(generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:async()=>Response.json({candidates:[{content:{parts:[{text:'{"a":'}]},finishReason:'MAX_TOKENS'}]})}),/cut off/);
 await assert.rejects(generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:async()=>Response.json({candidates:[{content:{parts:[{text:'not json'}]},finishReason:'STOP'}]})}),/not valid JSON/);
 await assert.rejects(generate({key:'',model:'gemini-3.8-flash',parts:[]}),/GEMINI_API_KEY/);
});

test('busy or failing servers are retried a few times; a bad request is not',async()=>{
 let calls=0;const flaky=async()=>{calls++;return calls<3?new Response('busy',{status:503}):ok({done:true})();};
 const r=await generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:flaky,sleep:async()=>{}});assert.deepEqual(r.json,{done:true});assert.equal(calls,3);
 calls=0;await assert.rejects(generate({key:'k',model:'gemini-3.8-flash',parts:[],fetchImpl:async()=>{calls++;return new Response('bad',{status:400});},sleep:async()=>{}}),/400/);assert.equal(calls,1);
});

test('a key on the free tier (no billing) gets a plain message and is not retried',async()=>{
 let calls=0;const freeTier=async()=>{calls++;return Response.json({error:{message:'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro'}},{status:429});};
 await assert.rejects(generate({key:'k',model:'gemini-3.1-pro-preview',parts:[],fetchImpl:freeTier,sleep:async()=>{}}),/free tier.*billing/i);assert.equal(calls,1);
});

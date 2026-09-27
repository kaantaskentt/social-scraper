import test from 'node:test';
import assert from 'node:assert/strict';
import {interact,makeImage,mediaCost} from '../lib/gemini-media.mjs';

const usage={total_input_tokens:1000,total_output_tokens:1171,output_tokens_by_modality:[{modality:'image',tokens:747}],total_thought_tokens:0};
const answer=(content,extra={})=>async()=>Response.json({id:'v1_x',status:'completed',usage,steps:[{type:'user_input'},{type:'model_output',content}],...extra});

test('cost: image tokens at the image price, the rest at the text price, input at the input price',()=>{
 const c=mediaCost('gemini-3.1-flash-image',usage);
 assert.equal(Math.round(c*1e6)/1e6,Math.round((1000*0.5+747*60+424*3)/1e6*1e6)/1e6);
 assert.equal(mediaCost('gemini-omni-1.1-flash',{total_input_tokens:0,total_output_tokens:5792,output_tokens_by_modality:[{modality:'video',tokens:5792}]}),5792*17.5/1e6);
 assert.throws(()=>mediaCost('mystery',usage),/price/);
});

test('makeImage sends the references first, then the prompt, with the picture format, and returns the bytes',async()=>{
 let sent;const fetchImpl=async(url,opts)=>{sent={url,body:JSON.parse(opts.body),key:opts.headers['x-goog-api-key']};return answer([{type:'image',mime_type:'image/jpeg',data:Buffer.from('JPEG').toString('base64')}])();};
 const r=await makeImage({key:'k',prompt:'a face',refs:[{data:Buffer.from('ref'),mime:'image/png'}],fetchImpl});
 assert.match(sent.url,/v1beta\/interactions$/);assert.equal(sent.key,'k');assert.equal(sent.body.model,'gemini-3.1-flash-image');
 assert.deepEqual(sent.body.input[0],{type:'image',mime_type:'image/png',data:Buffer.from('ref').toString('base64')});
 assert.deepEqual(sent.body.input[1],{type:'text',text:'a face'});
 assert.deepEqual(sent.body.response_format,{type:'image',mime_type:'image/jpeg',aspect_ratio:'9:16',image_size:'1K'});
 assert.equal(r.data.toString(),'JPEG');assert.ok(r.costUsd>0.04&&r.costUsd<0.05);
});

test('no picture, an unfinished answer, or an HTTP error fail loudly; paid answers carry their cost',async()=>{
 const noImage=await makeImage({key:'k',prompt:'x',fetchImpl:answer([{type:'text',text:'I cannot draw that.'}])}).catch(e=>e);
 assert.match(noImage.message,/No picture.*cannot draw/);assert.ok(noImage.costUsd>0);
 const failed=await interact({key:'k',model:'gemini-3.1-flash-image',input:[],fetchImpl:answer([],{status:'failed'})}).catch(e=>e);
 assert.match(failed.message,/did not finish \(failed\)/);assert.ok(failed.costUsd>=0);
 await assert.rejects(interact({key:'k',model:'gemini-3.1-flash-image',input:[],fetchImpl:async()=>Response.json({error:{message:'bad'}},{status:400})}),/HTTP 400.*bad/);
 await assert.rejects(interact({key:'',model:'gemini-3.1-flash-image',input:[]}),/GEMINI_API_KEY/);
});

test('busy servers are retried twice, a free-tier key is not retried',async()=>{
 let calls=0;const r=await interact({key:'k',model:'gemini-3.1-flash-image',input:[],sleep:async()=>{},fetchImpl:async()=>{calls++;return calls<3?new Response('busy',{status:503}):answer([])();}});
 assert.equal(calls,3);assert.equal(r.id,'v1_x');
 calls=0;await assert.rejects(interact({key:'k',model:'gemini-3.1-flash-image',input:[],sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('generate_content_free_tier_requests',{status:429});}}),/free tier/);assert.equal(calls,1);
});

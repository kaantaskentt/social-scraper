import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeCheck,checkVerdict,checkPrompt,DEFECTS,CHECK_TOOL} from '../lib/claude-check.mjs';

test('the verdict is code: broken kinds or a contradiction never post; a result only not shown is weak',()=>{
 const silver=checkVerdict({defects:[{second:16,kind:'missing_result',what:'spoon still black',severe:true,contradicts:true}],swipe_second:-1});
 assert.equal(silver.level,'broken');assert.equal(silver.pass,false);assert.deepEqual(silver.problems,['16s missing_result: spoon still black']);
 const egg=checkVerdict({defects:[{second:6,kind:'missing_result',what:'no floating egg',severe:true,contradicts:false}],swipe_second:-1});assert.equal(egg.level,'weak');assert.equal(egg.pass,true);
 assert.equal(checkVerdict({defects:[{second:20,kind:'cut_line',what:'cut',severe:true,contradicts:false}],swipe_second:-1}).level,'broken');
 assert.equal(checkVerdict({defects:[{second:9,kind:'glitch',what:'tiny',severe:false,contradicts:false}],swipe_second:12}).level,'good');
 assert.equal(checkVerdict({defects:[],swipe_second:1,swipe_reason:'nothing happens'}).level,'weak');
});
test('claims are never judged: no false-claim defect, and the prompt tells the checker so',()=>{
 assert.equal(DEFECTS.false_claim,undefined);assert.match(checkPrompt({transcript:[]}),/whether a claim is true is not your job/);
});
test('the request forces the report tool, sends every frame, and fails loudly on an API error',async()=>{
 let sent;const ok=async(url,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({content:[{type:'tool_use',input:{defects:[],swipe_second:-1,swipe_reason:'r',strongest_moment:'m'}}],usage:{input_tokens:10}})};};
 const r=await claudeCheck({key:'k',images:[Buffer.from('a'),Buffer.from('b')],transcript:[],fetchImpl:ok});
 assert.equal(sent.tool_choice.name,'report');assert.equal(sent.messages[0].content.filter(c=>c.type==='image').length,2);assert.deepEqual(r.report.defects,[]);
 await assert.rejects(claudeCheck({key:'k',images:[],transcript:[],fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'bad key'}})})}),/Claude check failed \(401\): bad key/);
 assert.deepEqual(CHECK_TOOL.input_schema.properties.defects.items.properties.kind.enum,Object.keys(DEFECTS));assert.match(checkPrompt({transcript:[]}),/line by line/);
});

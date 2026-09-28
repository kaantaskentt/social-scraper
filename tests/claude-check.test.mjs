import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeCheck,checkVerdict,checkPrompt,confirmClaims,DEFECTS,CHECK_TOOL} from '../lib/claude-check.mjs';

test('the verdict is code: broken kinds or a contradiction never post; a result only not shown is weak',()=>{
 const silver=checkVerdict({defects:[{second:16,kind:'missing_result',what:'spoon still black',severe:true,contradicts:true}],swipe_second:-1});
 assert.equal(silver.level,'broken');assert.equal(silver.pass,false);assert.deepEqual(silver.problems,['16s missing_result: spoon still black']);
 const egg=checkVerdict({defects:[{second:6,kind:'missing_result',what:'no floating egg',severe:true,contradicts:false}],swipe_second:-1});assert.equal(egg.level,'weak');assert.equal(egg.pass,true);
 assert.equal(checkVerdict({defects:[{second:20,kind:'cut_line',what:'cut',severe:true,contradicts:false}],swipe_second:-1}).level,'broken');
 assert.equal(checkVerdict({defects:[{second:9,kind:'glitch',what:'tiny',severe:false,contradicts:false}],swipe_second:12}).level,'good');
 assert.equal(checkVerdict({defects:[],swipe_second:1,swipe_reason:'nothing happens'}).level,'weak');
});
test('Jev must confirm a false claim, or the flag is dropped',async()=>{
 const report={defects:[{kind:'false_claim',claim:'Sinking means fresh',what:'x',severe:true},{kind:'cut_line',what:'y',severe:true}]};
 const kept=await confirmClaims(report,{key:'k',jev:async()=>({answers:{wrong:{noul:0.1}}})});assert.deepEqual(kept.defects.map(d=>d.kind),['cut_line']);
 const bad=await confirmClaims(report,{key:'k',jev:async()=>({answers:{wrong:{noul:0.9}}})});assert.equal(bad.defects.length,2);
});
test('a Jev reply with no number keeps the false-claim flag, and every Jev call goes into the ledger',async()=>{
 const report={defects:[{kind:'false_claim',claim:'Sinking means fresh',what:'x',severe:true}]},spent=[];
 const kept=await confirmClaims(report,{key:'k',jev:async()=>({answers:{},usage:{input_tokens:1000}}),ledger:async e=>{spent.push(e);}});
 assert.equal(kept.defects.length,1);assert.equal(kept.defects[0].jev,null);assert.equal(checkVerdict(kept).level,'broken');
 assert.deepEqual(spent,[{step:'final check claim',usd:0.000042}]);
});
test('the request forces the report tool, sends every frame, and fails loudly on an API error',async()=>{
 let sent;const ok=async(url,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({content:[{type:'tool_use',input:{defects:[],swipe_second:-1,swipe_reason:'r',strongest_moment:'m'}}],usage:{input_tokens:10}})};};
 const r=await claudeCheck({key:'k',images:[Buffer.from('a'),Buffer.from('b')],transcript:[],fetchImpl:ok});
 assert.equal(sent.tool_choice.name,'report');assert.equal(sent.messages[0].content.filter(c=>c.type==='image').length,2);assert.deepEqual(r.report.defects,[]);
 await assert.rejects(claudeCheck({key:'k',images:[],transcript:[],fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'bad key'}})})}),/Claude check failed \(401\): bad key/);
 assert.deepEqual(CHECK_TOOL.input_schema.properties.defects.items.properties.kind.enum,Object.keys(DEFECTS));assert.match(checkPrompt({transcript:[]}),/line by line/);
});

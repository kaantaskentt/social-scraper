import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCopyStudio,copyLive,copyShape} from '../public/copy-view.mjs';

const kit={kit:{name:'Food Fact Check',promise:'We test food'},pictures:[{role:'face0',url:'/f.jpg'}]};
const picks={createdAt:'P',skipped:2,picks:[{id:'a',xNormal:104,seconds:37,plays:5813460,why:'104x their normal · this format won 4 times',opening:'Pour boiling water',parts:4,usd:4.43},{id:'b',xNormal:72,seconds:39,plays:3174129,why:'72x',opening:'Pour on salmon',parts:4,usd:4.43}]};
const item=(o)=>({postId:'a',state:'working',stage:'Filming part 2 of 4',pct:42,left:95,total:300,original:'/videos/r/a',originalImage:'/media/r/a',reel:null,fidelity:null,...o});

test('first: one clear button to find the five; picking shows what is happening',()=>{
 assert.match(renderCopyStudio({copy:{}}),/data-act="copy-pick"[^>]*>Find the 5 to copy · a few cents/);
 assert.match(renderCopyStudio({copy:{picking:{state:'working',stage:'Studying 8 winners shot by shot'}}}),/Studying 8 winners shot by shot/);
});
test('picks: each original with why and price; the total follows what is ticked',()=>{
 const html=renderCopyStudio({copy:{runId:'r',picks},unpicked:new Set(['b'])});
 assert.match(html,/5\.8M plays · 104× their normal/);assert.match(html,/this format won 4 times/);assert.match(html,/2 other winners skipped/);
 assert.match(html,/data-act="copy-start" data-usd="4.43" data-ids="a"[^>]*>Copy this one · \$4\.43/);assert.match(html,/src="\/media\/r\/a"/);
});
test('making: the profile with a ring per copy at its real percent, one bar with time left; done copies show the reel and how close they are',()=>{
 const copy={batch:{id:'B',usd:8.86,pct:37,left:130,items:[item(),item({postId:'b',state:'done',pct:100,reel:{url:'/channels/r/x/reel.mp4',cover:'/c.jpg'},fidelity:{score:88,faithful:true,shots:85,words:98,length:95,beats:[{from:0,to:3,happens:'pours',match:3,differs:'nothing'}]}})]}};
 const html=renderCopyStudio({copy,kit});
 assert.match(html,/style="--p:42;--i:0"/);assert.match(html,/data-live="pct">42%/);assert.match(html,/1 min 35 s left/);assert.match(html,/37% · about 2 min 10 s left/);
 assert.match(html,/<video src="\/channels\/r\/x\/reel.mp4#t=1" poster="\/c.jpg"/);assert.match(html,/88% same/);assert.match(html,/@food\.fact\.check/);
 const open=renderCopyStudio({copy,kit,compareOpen:true});assert.match(open,/data-orig="b"/);assert.match(open,/88% the same/);assert.match(open,/data-act="copy-sync" data-post="b"/);assert.match(open,/A faithful copy\./);
 assert.deepEqual(copyLive(copy).items[0],{postId:'a',pct:42,stage:'Filming part 2 of 4',eta:'1 min 35 s left',state:'working'});
});
test('the page redraws when the shape changes (a copy finishes), not when only numbers move',()=>{
 const a={batch:{id:'B',items:[item()]}},b={batch:{id:'B',items:[item({pct:80})]}},c={batch:{id:'B',items:[item({state:'done',reel:{url:'/r.mp4'}})]}};
 assert.equal(copyShape(a),copyShape(b));assert.notEqual(copyShape(a),copyShape(c));
});
test('a failed copy says why on its tile',()=>{assert.match(renderCopyStudio({copy:{batch:{id:'B',usd:1,pct:0,left:0,items:[item({state:'failed',error:'Part 1 failed its check twice'})]}}}),/Part 1 failed its check twice/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCopyStudio,copyLive,copyShape} from '../public/copy-view.mjs';

const kit={kit:{name:'Food Fact Check',promise:'We test food'},pictures:[{role:'face0',url:'/f.jpg'}]};
const picks={createdAt:'P',skipped:2,picks:[{id:'a',xNormal:104,seconds:37,plays:5813460,why:'4 of their winners open with the same four words. Jev rates it 2.6 of 3 for copying.',opening:'Pour boiling water',parts:4,usd:4.43},{id:'b',xNormal:72,seconds:39,plays:3174129,why:'72x',opening:'Pour on salmon',parts:4,usd:4.43}]};
const item=(o)=>({postId:'a',state:'working',stage:'Filming part 2 of 4',pct:42,left:95,total:300,original:'/videos/r/a',originalImage:'/media/r/a',reel:null,fidelity:null,...o});

test('first: one clear button to find the five; picking shows what is happening',()=>{
 assert.match(renderCopyStudio({copy:{}}),/data-act="copy-pick"[^>]*>Find the 5 to copy · a few cents/);
 assert.match(renderCopyStudio({copy:{picking:{state:'working',stage:'Studying 8 winners shot by shot'}}}),/Studying 8 winners shot by shot/);
});
test('picks: each original with why and price; the total follows what is ticked',()=>{
 const html=renderCopyStudio({copy:{runId:'r',picks},unpicked:new Set(['b']),engine:'omni'});
 assert.match(html,/5\.8M plays · 104× their normal/);assert.match(html,/4 of their winners open with the same four words/);assert.match(html,/2 other winners skipped/);
 assert.match(html,/data-act="copy-start" data-usd="4.43" data-engines="omni" data-ids="a"[^>]*>Copy this one · \$4\.43/);
 // Both models: each winner once with each, priced with each model's own price.
 const both=renderCopyStudio({copy:{runId:'r',picks:{...picks,picks:picks.picks.map(p=>({...p,veo:{parts:6,usd:4.3}}))}},unpicked:new Set(['b']),engine:'both'});
 assert.match(both,/data-usd="8.73" data-engines="omni,veo-fast"/);assert.match(both,/with both models · \$8\.73/);assert.match(both,/data-copy-engine="veo-fast" aria-pressed="false">Veo 3\.1 Fast · \$4\.3/);assert.match(html,/src="\/media\/r\/a"/);
});
test('making: the profile with a ring per copy at its real percent, one bar with time left; done copies show the reel and how close they are',()=>{
 const copy={batch:{id:'B',usd:8.86,pct:37,left:130,items:[item(),item({postId:'b',state:'done',pct:100,reel:{url:'/channels/r/x/reel.mp4',cover:'/c.jpg'},fidelity:{score:88,faithful:true,shots:85,words:98,length:95,beats:[{from:0,to:3,happens:'pours',match:3,differs:'nothing'}]}})]}};
 const html=renderCopyStudio({copy,kit});
 assert.match(html,/style="--p:42;--i:0"/);assert.match(html,/data-live="pct">42%/);assert.match(html,/1 min 35 s left/);assert.match(html,/37% · about 2 min 10 s left/);
 assert.match(html,/<video src="\/channels\/r\/x\/reel.mp4#t=1" poster="\/c.jpg"/);assert.match(html,/88\/100 match/);assert.doesNotMatch(html,/% same/);assert.match(html,/@food\.fact\.check/);
 const open=renderCopyStudio({copy,kit,compareOpen:true});assert.match(open,/data-orig="b"/);assert.match(open,/Gemini Omni · match score 88 of 100/);assert.match(open,/Gemini watched both/);assert.match(open,/data-act="copy-sync" data-post="b"/);assert.match(open,/A faithful copy\./);
 assert.deepEqual(copyLive(copy).items[0],{key:'a',postId:'a',pct:42,stage:'Filming part 2 of 4',eta:'1 min 35 s left',state:'working'});
});
test('the page redraws when the shape changes (a copy finishes), not when only numbers move',()=>{
 const a={batch:{id:'B',items:[item()]}},b={batch:{id:'B',items:[item({pct:80})]}},c={batch:{id:'B',items:[item({state:'done',reel:{url:'/r.mp4'}})]}};
 assert.equal(copyShape(a),copyShape(b));assert.notEqual(copyShape(a),copyShape(c));
});
test('a failed copy says why on its tile',()=>{assert.match(renderCopyStudio({copy:{batch:{id:'B',usd:1,pct:0,left:0,items:[item({state:'failed',error:'Part 1 failed its check twice'})]}}}),/Part 1 failed its check twice/);});

// Audit 2026-09-29: once a batch existed, picking again showed nothing; the finished studio had no way to Ready to post.
const batch=(o={})=>({id:'B',createdAt:'2026-09-29T10:00:00.000Z',usd:4.43,pct:100,left:0,items:[item({state:'done',pct:100,reel:{url:'/r.mp4'},fidelity:{score:88,faithful:true}})],...o});
test('after a batch, picking again shows its progress, its error or the new picks above the last copies',()=>{
 const working=renderCopyStudio({copy:{runId:'r',picks,batch:batch(),picking:{state:'working',stage:'Studying 8 winners shot by shot',at:'2026-09-29T11:00:00.000Z'}}});
 assert.match(working,/Studying 8 winners shot by shot/);assert.match(working,/Your last copies/);assert.doesNotMatch(working,/data-act="copy-new"/);
 assert.match(renderCopyStudio({copy:{runId:'r',picks,batch:batch(),picking:{state:'failed',error:'BOOM',at:'2026-09-29T11:00:00.000Z'}}}),/Picking failed: BOOM/);
 const fresh=renderCopyStudio({copy:{runId:'r',picks:{...picks,createdAt:'2026-09-29T11:00:00.000Z'},batch:batch()}});
 assert.match(fresh,/data-act="copy-start"/);assert.ok(fresh.indexOf('copy-start')<fresh.indexOf('copy-grid'),'new picks come first');
 // Picks older than the batch are the ones it was made from: only the batch shows.
 const old=renderCopyStudio({copy:{runId:'r',picks:{...picks,createdAt:'2026-09-29T09:00:00.000Z'},batch:batch(),picking:{state:'done',at:'2026-09-29T09:00:00.000Z'}}});
 assert.doesNotMatch(old,/copy-start/);assert.match(old,/data-act="copy-new"/);
 assert.notEqual(copyShape({picks,batch:batch()}),copyShape({picks:{...picks,createdAt:'2026-09-29T11:00:00.000Z'},batch:batch()}));
});
test('a finished batch leads to Ready to post; not while copies are still being made',()=>{
 assert.match(renderCopyStudio({copy:{batch:batch()}}),/data-step="ready"[^>]*>Open Ready to post/);
 assert.doesNotMatch(renderCopyStudio({copy:{batch:batch({items:[item(),item({postId:'b',state:'done',reel:{url:'/r.mp4'}})]})}}),/data-step="ready"/);
});
test('a failed comparison says so and offers to compare again, with nothing to film',()=>{
 const copy={batch:batch({items:[item({state:'done',pct:100,reel:{url:'/r.mp4'},fidelity:{error:'Request payload size exceeds the limit'},retryUsd:0})]})};
 const html=renderCopyStudio({copy});assert.match(html,/data-act="copy-retry" data-post="a" data-usd="0">Compare again/);assert.doesNotMatch(html,/undefined/);
 assert.match(renderCopyStudio({copy,compareOpen:true}),/not compared: Request payload size exceeds the limit/);
});
test('a stopped copy points to its Try again button',()=>{
 const html=renderCopyStudio({copy:{batch:batch({items:[item({state:'stopped',error:'The app restarted while this copy was being made. Parts already made are kept: press Try again to pay only for the rest.',retryUsd:1.13})]})}});
 assert.match(html,/press Try again/);assert.match(html,/data-act="copy-retry" data-post="a" data-usd="1.13">Try again · \$1\.13/);
});

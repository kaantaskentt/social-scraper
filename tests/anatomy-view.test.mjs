import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentAt,isUncertain,partRow,barPart} from '../public/anatomy-view.mjs';
const parts=[{start:0,end:3.3,text:'Put an ice cube here.',value:'advice',confidence:.9},{start:3.3,end:5,text:'Hold it.',value:'advice',confidence:.4},{start:6,end:8,text:'Liver One.',value:'setup',confidence:.7},{start:null,end:null,text:'Untimed.',value:'other',confidence:.9}];
test('segmentAt: inside, exact boundary goes to the later part, gaps, before and after, untimed, empty',()=>{
 assert.equal(segmentAt(parts,0),0);assert.equal(segmentAt(parts,1.5),0);assert.equal(segmentAt(parts,3.3),1);assert.equal(segmentAt(parts,5.5),-1);
 assert.equal(segmentAt(parts,7.99),2);assert.equal(segmentAt(parts,8),-1);assert.equal(segmentAt(parts,-1),-1);assert.equal(segmentAt([],2),-1);assert.equal(segmentAt(parts,NaN),-1);
});
test('isUncertain below 0.65 only, and missing confidence is not uncertain',()=>{
 assert.equal(isUncertain(parts[1]),true);assert.equal(isUncertain(parts[0]),false);assert.equal(isUncertain({confidence:.65}),false);assert.equal(isUncertain({}),false);
});
test('rows are buttons with time, role and a "?" plus "Jev is N% sure" when unsure; untimed rows say so',()=>{
 const sure=partRow(parts[0],0,{role:'Advice',color:'#889f70'}),unsure=partRow(parts[1],1,{role:'Advice',color:'#889f70'}),untimed=partRow(parts[3],3,{role:'Other',color:'#bcc2b4'});
 assert.match(sure,/^<button type="button" class="segment" data-segment="0"/);assert.match(sure,/0\.0s · Advice/);assert.doesNotMatch(sure,/uncertain|%/);
 assert.match(unsure,/class="segment uncertain"/);assert.match(unsure,/Advice \?/);assert.match(unsure,/title="Jev is 40% sure"/);assert.match(unsure,/aria-label="Play from 3\.3 seconds: Advice, Jev is 40% sure"/);
 assert.match(untimed,/aria-label="No timing for this part: Other"/);assert.doesNotMatch(untimed,/s ·/);
});
test('row and bar text are escaped',()=>{
 const evil={start:0,end:1,text:'<script>alert(1)</script>" onclick="x',value:'hook',confidence:.9};
 for(const html of [partRow(evil,0,{role:'<b>Hook</b>',color:'#fff'}),barPart(evil,0,{role:'Hook',color:'#fff'})]){assert.doesNotMatch(html,/<script>|<b>| onclick="x/);assert.match(html,/&lt;script&gt;/);}
 assert.match(barPart(parts[1],1,{role:'Advice',color:'#889f70'}),/class="uncertain"/);
});

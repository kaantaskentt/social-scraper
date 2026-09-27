import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSecret} from '../public/secret-view.mjs';
const img=id=>`/media/run1/${id}`;

test('before building: what it does, the price on the button, and nothing is spent until pressed',()=>{
 const html=renderSecret({state:'none',plan:{usd:0.284,reels:30,seconds:1260,winners:15,flops:15}},{account:'ken.remedie',imageFor:img});
 assert.match(html,/Why @ken\.remedie wins/);assert.match(html,/data-secret="build"[^>]*>Build the Secret · about \$0\.28/);assert.match(html,/15 best and 15 weakest/);assert.match(html,/Nothing is spent until you press/);
 assert.match(renderSecret({state:'none',plan:{error:'needs at least 8'}},{account:'x',imageFor:img}),/needs at least 8/);
 assert.doesNotMatch(renderSecret({state:'none',plan:{error:'e'}},{account:'x',imageFor:img}),/data-secret="build"/);
});

test('while building: the step and progress; after a failure: the reason and a cheap retry',()=>{
 const b=renderSecret({state:'building',stage:'Watching reels',done:12,total:30},{account:'k',imageFor:img});
 assert.match(b,/Watching reels/);assert.match(b,/12 of 30/);assert.match(b,/value="12" max="30"/);
 const f=renderSecret({state:'failed',error:'Gemini: HTTP 500 <b>',plan:{usd:0.2,reels:30}},{account:'k',imageFor:img});
 assert.match(f,/HTTP 500 &lt;b&gt;/);assert.match(f,/data-secret="build"/);assert.match(f,/already watched are not paid again/);
});

const saved={account:'ken.remedie',createdAt:'2026-09-27T10:00:00Z',costUsd:0.27,dropped:['setting'],picked:Array.from({length:30},(_,i)=>({id:`r${i}`,group:i<15?'winner':'flop'})),
 stats:{house:[{question:'look',value:'doctor_or_expert',count:27,total:30}],differences:[{question:'opening',value:'bold_claim',winners:9,flops:3,perSide:15,evidence:['r1']}],numbers:{seconds:{winners:38,flops:61},secondsPerShot:{winners:2.1,flops:4.5}}},
 secret:{headline:'A doctor <i>look</i> and a bold first line.',person:{text:'Looks like a doctor',evidence:['r1','r2']},setting:null,format:{text:'Demonstration',evidence:['r3']},script:{text:'Claim first',evidence:['r1']},sound:{text:'Voice',evidence:['r1']},pace:{text:'Fast',evidence:['r1']},
  differences:[{claim:'Bold first line: 9 of 15 best, 3 of 15 weakest',evidence:['r1','r4']}],recipe:[{step:'Wear a white coat',evidence:['r2']}]}};

test('the finished page: headline, formula cards with playable proof, house style and differences with counts, the recipe',()=>{
 const html=renderSecret({state:'done',saved},{account:'ken.remedie',imageFor:img});
 assert.match(html,/A doctor &lt;i&gt;look&lt;\/i&gt; and a bold first line\./);
 assert.match(html,/The person[\s\S]*Looks like a doctor[\s\S]*data-secret-play="r1"[\s\S]*data-secret-play="r2"/);
 assert.doesNotMatch(html,/The setting/,'a part without proof is not shown');assert.match(html,/1 part removed because it had no proof/);
 assert.match(html,/Like a doctor, scientist or expert[\s\S]*27 of 30 reels/);
 assert.match(html,/A bold or surprising statement[\s\S]*9 of 15 best[\s\S]*3 of 15 weakest/);
 assert.match(html,/Length[\s\S]*38 s[\s\S]*61 s/);assert.match(html,/New shot every[\s\S]*2\.1 s[\s\S]*4\.5 s/);
 assert.match(html,/<ol class="secret-recipe">[\s\S]*Wear a white coat/);
 assert.match(html,/src="\/media\/run1\/r1"/);assert.match(html,/data-secret="rewrite"[^>]*>Write it again/);
 assert.match(renderSecret({state:'done',saved:{...saved,spentAllTime:0.33}},{account:'k',imageFor:img}),/cost \$0\.27 \(all builds \$0\.33\)/);
 assert.match(renderSecret({state:'done',saved:{...saved,secret:{...saved.secret,headline:null}}},{account:'k',imageFor:img}),/<h2>Why @ken\.remedie wins<\/h2>/);
});

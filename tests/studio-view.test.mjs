import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWinners,renderPicks,renderJobs} from '../public/studio-view.mjs';

const posts=[{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'e'},{id:'f'}];
const results={a:{quadrant:'billboard',xNormal:8.6,reach:4.7e6},b:{quadrant:'star',xNormal:3.1,reach:9e5},c:{quadrant:'dud',xNormal:9.9},
 d:{quadrant:'closer',xNormal:5},e:{quadrant:'star',xNormal:12,reach:2e6},f:{quadrant:'billboard',xNormal:null}};

test('winners: only high-reach boxes (Star, Billboard) with a video, best "x normal" first, capped',()=>{
 const w=pickWinners(posts,results,{hasVideo:p=>p.id!=='e'});
 assert.deepEqual(w.map(x=>x.id),['a','b']);
 assert.deepEqual(pickWinners(posts,results,{hasVideo:()=>true,limit:1}).map(x=>x.id),['e']);
 assert.equal(w[0].box,'Billboard');assert.equal(w[0].xNormal,8.6);
 assert.deepEqual(pickWinners(posts,{},{hasVideo:()=>true}),[]);
});

test('picks: cards with multiple and box, the selected one marked, empty state explains why',()=>{
 const html=renderPicks([{id:'a',image:'/media/r/a',xNormal:8.6,box:'Billboard',reach:4.7e6}],'a');
 assert.match(html,/data-studio-pick="a"/);assert.match(html,/8\.6×/);assert.match(html,/Billboard/);assert.match(html,/aria-pressed="true"/);
 assert.match(renderPicks([],null),/No winners/);
});

test('jobs tray: progress, done with video, failures, and escaping',()=>{
 const html=renderJobs([{id:'1',postId:'a',status:'generating',credits:84},{id:'2',postId:'b',status:'done',video:'/replicas/2.mp4'},{id:'3',postId:'c',status:'failed',error:'<b>x</b>'}],id=>`/media/r/${id}`);
 assert.match(html,/Generating/);assert.match(html,/src="\/replicas\/2.mp4#t=0.5"/);assert.match(html,/&lt;b&gt;x/);assert.doesNotMatch(html,/<b>x/);
 assert.match(renderJobs([],()=>''),/Nothing generating yet/);
});

test('picks: loading and error say what is happening instead of "no winners"; broken covers get a fallback',()=>{
 assert.match(renderPicks([],null,{loading:true}),/Scoring/);assert.match(renderPicks([],null,{error:'boom <b>'}),/boom &lt;b&gt;/);
 assert.match(renderPicks([{id:'a',image:'/media/r/a',xNormal:2,box:'Star'}],'a'),/onerror=/);
 assert.doesNotMatch(renderJobs([{id:'1',postId:'x',status:'generating'}],()=>''),/src=""/);
 assert.match(renderJobs([{id:'1',postId:'x',status:'uncertain',jobId:'job-9',error:'Lost'}],()=>''),/job-9[\s\S]*data-dismiss-rep="1"/);
});

import {renderShotList,renderModeSwitch,renderShotSide} from '../public/studio-view.mjs';
const list={account:'ken.remedie',duration:16.2,pace:{shots:4,cuts:3,secondsPerShot:4},frames:['/f0.jpg','/f1.jpg','/f2.jpg','/f3.jpg'],
 parts:[{role:'hook',start:0,end:3.9,said:'Your socks <b>',tip:'First 2 seconds.',shots:[0,1]},{role:'cta',start:14,end:16,said:'',tip:'Ask for one action only.',shots:[3]},{role:'visual',start:0,end:1,said:'',tip:'Copy the shot.',shots:[]}],
 lines:['My hook "quoted"','','']};
test('shot list: summary, numbered parts with frames, what they said (escaped), tip, and an editable line per part',()=>{
 const html=renderShotList(list),side=renderShotSide(list);
 assert.match(side,/Copy it to your phone and film/);assert.match(side,/16 s<\/strong> · 4 shots · a new shot every 4 s · 3 parts/);assert.match(side,/data-shot="copy"/);assert.match(side,/data-shot="print"/);assert.equal(renderShotSide(null),'');assert.match(renderShotSide({...list,unplaced:['old <i>line</i>']}),/earlier version[\s\S]*old &lt;i&gt;line/);
 assert.equal((html.match(/data-shot-line="/g)||[]).length,3);
 assert.match(html,/Hook<\/strong>/);assert.match(html,/Call to action<\/strong>/);assert.match(html,/0–4 s/);
 assert.match(html,/src="\/f0\.jpg"[\s\S]*src="\/f1\.jpg"/);assert.match(html,/Your socks &lt;b&gt;/);assert.doesNotMatch(html,/<b>/);
 assert.match(html,/>My hook &quot;quoted&quot;<\/textarea>/);
 assert.match(html,/data-shot-print="0">My hook &quot;quoted&quot;</);assert.match(html,/Shot list · @ken\.remedie · 16 s · 3 parts/);
 assert.match(renderShotList(null,{loading:true}),/Cutting the reel/);assert.match(renderShotList(null,{error:'no <video>'}),/no &lt;video&gt;[\s\S]*data-shot="retry"/);
});
test('mode switch: filming, AI recreation, and original faceless reel; only current mode pressed',()=>{
 const html=renderModeSwitch('film');
 assert.match(html,/data-studio-mode="film"[^>]*aria-pressed="true"[^>]*>[\s\S]*Film it yourself/);assert.match(html,/data-studio-mode="ai"[^>]*aria-pressed="false"/);
 assert.ok(html.indexOf('film')<html.indexOf('"ai"'));
 assert.match(html,/data-studio-mode="new"[^>]*aria-pressed="false"/);assert.equal((html.match(/<button /g)||[]).length,3);
 const fresh=renderModeSwitch('new');assert.match(fresh,/data-studio-mode="new"[^>]*aria-pressed="true"/);assert.equal((fresh.match(/aria-pressed="true"/g)||[]).length,1);assert.match(fresh,/New faceless reel/);assert.match(fresh,/An original reel in this channel's style · AI makes it/);
});

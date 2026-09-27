import test from 'node:test';
import assert from 'node:assert/strict';
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderMake,renderReady,renderPrice} from '../public/flow-views.mjs';
const img=id=>`/media/r/${id}`;

test('steps open in order: winners and secret need a scored scan, make needs the secret, ready needs a reel',()=>{
 assert.deepEqual(reachable({}),{scan:true,winners:false,secret:false,make:false,ready:false});
 assert.deepEqual(reachable({scanned:true,scored:true,secret:true,reels:1}),{scan:true,winners:true,secret:true,make:true,ready:true});
 const html=renderStepper('secret',reachable({scanned:true,scored:true}),{scan:true,winners:true});
 assert.match(html,/data-step="secret"[^>]*aria-current="step"/);assert.match(html,/data-step="make"[^>]*disabled/);assert.match(html,/✓/);
});

test('scan: one input, the price on the button, earlier accounts to reopen, and a next step once scanned',()=>{
 const html=renderScan({runs:[{id:'a',creator:'ken.remedie',count:100,status:'complete'}],run:{id:'a',creator:'ken.remedie',count:100}});
 assert.match(html,/name="handle"/);assert.match(html,/Scan 100 reels · about \$0\.35/);assert.match(html,/data-run="a"[\s\S]*@ken\.remedie/);assert.match(html,/data-step="winners"/);
 assert.match(renderScan({run:{id:'a',creator:'x'},progress:{state:'running',done:3,total:10,label:'Listening'}}),/<progress value="3" max="10">/);
});

test('winners: big reel tiles with how many times their normal, weakest for contrast',()=>{
 const html=renderWinners({account:'ken',winners:[{id:'w1',image:'/i/w1',xNormal:104.1,reach:5.8e6}],weakest:[{id:'f1',image:'/i/f1',xNormal:0.3,reach:1e4}]});
 assert.match(html,/104\.1× normal/);assert.match(html,/5\.8M views/);assert.match(html,/data-play="w1"/);assert.match(html,/weakest/);assert.match(html,/data-step="secret"/);
});

const saved={account:'ken',secret:{headline:'Kitchen tests <b>',person:{text:'Two casual people',evidence:['r1']},setting:{text:'Bright kitchen',evidence:['r2']},format:{text:'A food test',evidence:['r3']},why:[{mechanism:'curiosity_gap',pattern:'x',evidence:['r1']}],critique:[{kind:'risk',point:'Check health claims',evidence:['r1']}]},
 stats:{house:[{question:'setting',value:'kitchen',count:22,total:30}],differences:[{question:'said_structure',value:'steps',winners:12,flops:5,perSide:15,evidence:['r1','r2']},{question:'opening',value:'action_in_progress',winners:9,flops:3,perSide:15,evidence:['r3']},{question:'said_structure',value:'problem_solution',winners:3,flops:9,perSide:15,evidence:['r4']}],numbers:{}}};
test('secret: 3 things to do with dots and proof, 1 to avoid, what every reel has, why, a risk, and a did-we-get-it-right check',()=>{
 const html=renderSecret({account:'ken',status:{state:'done',saved},imageFor:img});
 assert.match(html,/Kitchen tests &lt;b&gt;/);assert.doesNotMatch(html,/<b>Kitchen/);
 assert.match(html,/Do these[\s\S]*Step by step[\s\S]*12 of 15[\s\S]*5 of 15[\s\S]*Starts mid-action/);
 assert.equal((html.match(/class="on"/g)||[]).length>=12+5,true,'dots are drawn');
 assert.match(html,/Avoid[\s\S]*Problem, then fix/);assert.match(html,/Every reel has[\s\S]*Kitchen/);
 assert.match(html,/A question you want answered/);assert.match(html,/Before you copy[\s\S]*Check health claims/);
 assert.match(html,/data-feedback="yes"/);assert.match(html,/data-step="make"/);assert.doesNotMatch(html,/\d+\.\d+ s/,'no numbers soup');
 assert.match(renderSecret({account:'ken',status:{state:'none',plan:{usd:0.336,reels:30}},imageFor:img}),/Find the secret · about \$0\.34/);
});

test('make: the ideas button first; then ideas with three meters; script with shots and checks; two prices and the balance',()=>{
 assert.match(renderMake({account:'ken',plan:{state:'none'}}),/data-act="ideas"/);
 const plan={state:'ready',plan:{chosen:0,picked:[{idea:{title:'Celery <i>',hook_line:'Limp?'},scores:{fit:2,ai_ready:3,hook:2.5}}],rejected:[{idea:{title:'Honey'},reason:'the demo may not be true'}],
  script:{hook_title:'Revive celery',keyword:'CRISP',voiceover:[{line:'Drop it in.',shot:'s1'}],shots:[{id:'s1',seconds:6,visual:'Hands drop celery'}]},check:{pass:true,problems:[]},price:{total:105,withOneRetryEach:204,fastTotal:61,fastWithOneRetryEach:116,kit:3.5}}};
 const html=renderMake({account:'ken',plan,balance:44.77,mode:'fast'});
 assert.match(html,/Celery &lt;i&gt;/);assert.match(html,/Easy for AI/);assert.match(html,/Jev removed 1 idea: Honey/);assert.match(html,/Comment CRISP/);assert.match(html,/“Drop it in\.”/);assert.match(html,/✓ No health claim/);
 assert.match(html,/data-act="make" data-credits="61"[^>]*disabled/,'61 credits but only 44.77: the button is off');assert.match(html,/Not enough credits/);
 assert.match(renderPrice(plan.plan.price,{mode:'fast',balance:100}),/data-act="make" data-credits="61" data-max="116">/);
 assert.match(renderMake({account:'ken',plan,make:{state:'working',stage:'Shot 2 of 4',progress:{done:3,total:7}}}),/Shot 2 of 4[\s\S]*<progress value="3" max="7">/);
});

test('ready to post: video, download, copy caption; nothing yet says so',()=>{
 const html=renderReady({reels:[{id:'0-celery',url:'/channels/a/0-celery/reel.mp4',title:'Celery',caption:'Try it #kitchen',seconds:30.1,spent:76}]});
 assert.match(html,/<video src="\/channels\/a\/0-celery\/reel\.mp4#t=0\.5"/);assert.match(html,/download>Download/);assert.match(html,/data-copy="cap-0-celery"/);assert.match(html,/30 s · 76 credits/);
 assert.match(renderReady({reels:[]}),/Nothing ready yet/);
});

import {PLAIN,LABELS as L} from '../public/secret-labels.mjs';
test('every answer Jev can give has a plain sentence, and the cards show it',()=>{
 for(const [q,[,criteria]] of Object.entries(L))for(const v of Object.keys(criteria))if(!['unclear','other'].includes(v))assert.ok(PLAIN[q]?.[v],`${q}.${v}`);
 const html=renderSecret({account:'ken',status:{state:'done',saved},imageFor:img});assert.match(html,/It goes step by step, like a recipe\./);assert.match(html,/The action is already happening in the first second\./);
});

import {latestRuns,madeIdeas} from '../public/flow-views.mjs';
test('one card per account (the fullest scan); made ideas are marked and show their video instead of a price',()=>{
 assert.deepEqual(latestRuns([{id:'a',creator:'ken',count:20,createdAt:'1'},{id:'b',creator:'ken',count:100,createdAt:'0'},{id:'c',creator:'nude',count:5,createdAt:'2'}]).map(r=>r.id),['b','c']);
 assert.deepEqual([...madeIdeas([{id:'0-celery'},{id:'2-eggs'}])],[0,2]);
 const plan={state:'ready',plan:{chosen:0,picked:[{idea:{title:'Celery',hook_line:'x'},scores:{}}],script:{hook_title:'h',keyword:'K',voiceover:[],shots:[]},check:{pass:true,problems:[]},price:{total:1,fastTotal:1,kit:3.5}}};
 const html=renderMake({account:'k',plan,make:{state:'none',reels:[{id:'0-celery',url:'/channels/a/0-celery/reel.mp4',title:'Celery'}]}});
 assert.match(html,/Made ✓/);assert.match(html,/0-celery\/reel\.mp4#t=0\.5/);assert.doesNotMatch(html,/data-act="make"/);
 assert.match(renderMake({account:'k',plan:{...plan,plan:{...plan.plan,price:{total:1}}}}),/Checking the price/,'an old price is refreshed before it is shown');
});

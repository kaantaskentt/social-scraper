import test from 'node:test';
import assert from 'node:assert/strict';
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderKit,renderMake,renderReady,renderPrice} from '../public/flow-views.mjs';
const img=id=>`/media/r/${id}`;

test('steps open in order: winners and secret need a scored scan, make needs the secret, ready needs a reel',()=>{
 assert.deepEqual(reachable({}),{scan:true,winners:false,secret:false,kit:false,make:false,ready:false});
 assert.deepEqual(reachable({scanned:true,scored:true,secret:true,reels:1}),{scan:true,winners:true,secret:true,kit:true,make:true,ready:true});
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
 assert.match(html,/Their weakest reels do this more[\s\S]*Problem, then fix/);assert.match(html,/Every reel has[\s\S]*Kitchen/);
 assert.match(html,/When you want to know the answer, you keep watching\.[\s\S]*Backed by research/);assert.match(html,/Before you copy[\s\S]*Check health claims/);
 assert.match(html,/data-feedback="yes"/);assert.match(html,/data-step="kit"[^>]*>Build the look/);assert.doesNotMatch(html,/\d+\.\d+ s/,'no numbers soup');
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

import {latestRuns,madeIdeas,renderKitScript} from '../public/flow-views.mjs';
test('one card per account (the fullest scan); made ideas are marked and show their video instead of a price',()=>{
 assert.deepEqual(latestRuns([{id:'a',creator:'ken',count:20,createdAt:'1'},{id:'b',creator:'ken',count:100,createdAt:'0'},{id:'c',creator:'nude',count:5,createdAt:'2'}]).map(r=>r.id),['b','c']);
 assert.deepEqual([...madeIdeas([{id:'0-celery'},{id:'2-eggs'}])],[0,2]);
 const plan={state:'ready',plan:{chosen:0,picked:[{idea:{title:'Celery',hook_line:'x'},scores:{}}],script:{hook_title:'h',keyword:'K',voiceover:[],shots:[]},check:{pass:true,problems:[]},price:{total:1,fastTotal:1,kit:3.5}}};
 const html=renderMake({account:'k',plan,make:{state:'none',reels:[{id:'0-celery',url:'/channels/a/0-celery/reel.mp4',title:'Celery'}]}});
 assert.match(html,/Made ✓/);assert.match(html,/0-celery\/reel\.mp4#t=0\.5/);assert.doesNotMatch(html,/data-act="make"/);
 assert.match(renderMake({account:'k',plan:{...plan,plan:{...plan.plan,price:{total:1}}}}),/Checking the price/,'an old price is refreshed before it is shown');
});

test('nothing is said twice: a difference is not repeated under "every reel has"',()=>{
 const st={...saved.stats,house:[{question:'said_structure',value:'steps',count:25,total:30},{question:'setting',value:'kitchen',count:22,total:30}]};
 const html=renderSecret({account:'ken',status:{state:'done',saved:{...saved,stats:st}},imageFor:img});
 const every=html.slice(html.indexOf('Every reel has'));assert.doesNotMatch(every,/Step by step/);assert.match(every,/Kitchen/);
});

test('"did we get it right?" shows the short labels the system understood, with a picture, not long paragraphs',()=>{
 const st={...saved.stats,house:[{question:'presenter',value:'two_or_more',count:23,total:30},{question:'look',value:'casual_creator',count:25,total:30},{question:'setting',value:'kitchen',count:22,total:30},{question:'format',value:'demonstration',count:26,total:30}]};
 const html=renderSecret({account:'ken',status:{state:'done',saved:{...saved,stats:st}},imageFor:img});
 const check=html.slice(html.indexOf('Did we understand it right?'));
 assert.match(check,/Who<\/span><p>Two or more people · Casual creator/);assert.match(check,/Where<\/span><p>Kitchen/);assert.match(check,/What happens<\/span><p>Demonstration/);assert.match(check,/src="\/media\/r\/r1"/);
});

const pic=(role,label,pass=true)=>({role,label,file:`${role}.jpg`,url:`/channels/r/kit/${role}-aaaaaaaaaaaa.jpg`,attempts:1,check:{pass,problems:pass?[]:['letters or a logo are visible']}});
const kitSaved=(o={})=>({format:'ai_host',byJev:true,formatWhy:'In 15 of their 15 best reels, people are on camera.',cast:1,costUsd:0.57,approved:false,
 kit:{name:'Kitchen Check',promise:'Two hosts test food tricks.',cast:[{name:'Rhea',role:'tests the trick',look:'x',outfit:'a navy tee',voice:'warm and quick',manner:'calm'}],place:'A white kitchen',palette:[{name:'Navy',hex:'#1f2a44'},{name:'Bad',hex:'red;background:url(x)'}],sound:{voice:'fast',music:'none',natural:'pouring'},assets:[{what:'glass mugs',kind:'object',how:'every test'},{what:'Big white text',kind:'words',how:'on screen'}],dont:[]},
 pictures:[pic('face0','Rhea: face'),pic('turn0','Rhea: every angle'),pic('body0','Rhea: full outfit'),pic('place','The place'),pic('scene','A frame from a reel',false)],...o});

test('kit: before building it says what it does and the price; while building it shows progress',()=>{
 const none=renderKit({account:'ken',status:{state:'none',estimate:{usd:0.66}}});
 assert.match(none,/Your look, in @ken&#39;s style/);assert.match(none,/data-act="kit-build"[^>]*>Build my look · up to \$0\.66/);
 const working=renderKit({account:'ken',status:{state:'working',stage:'Drawing Rhea: face',progress:{done:2,total:5}}});
 assert.match(working,/Drawing Rhea: face/);assert.match(working,/value="2" max="5"/);assert.match(working,/Picture 3 of 5/);
});

test('kit: shows the format and why, the host pictures, the place, signature things, sound; flags a failed check',()=>{
 const html=renderKit({account:'ken',status:{state:'done',saved:kitSaved(),estimate:{usd:0.66}}});
 assert.match(html,/<h1>Kitchen Check<\/h1>/);assert.match(html,/AI host<\/h3>/);assert.match(html,/picked by Jev/);assert.match(html,/In 15 of their 15 best reels/);
 for(const f of ['hands_pov','visuals','animated'])assert.match(html,new RegExp(`data-kit-format="${f}"`));assert.doesNotMatch(html,/data-kit-format="ai_host"/);
 assert.match(html,/Rhea<\/h3>/);assert.match(html,/a navy tee/);assert.match(html,/src="\/channels\/r\/kit\/face0-aaaaaaaaaaaa\.jpg"/);
 assert.match(html,/Check: letters or a logo are visible/);assert.match(html,/data-act="kit-pictures"[^>]*>Draw the 1 flagged again/);
 assert.match(html,/Prop<\/span><div><b>glass mugs/);assert.match(html,/Words<\/span>/);
 assert.match(html,/background:#1f2a44/);assert.doesNotMatch(html,/url\(x\)/); // colours are checked before use
 assert.doesNotMatch(html,/<dt>Music<\/dt>/);assert.match(html,/<dt>Real sounds<\/dt><dd>pouring/);
 assert.match(html,/data-act="kit-approve"/);assert.match(html,/data-act="kit-character"[^>]*>New host · about \$0\.66/);assert.match(html,/Every caption says they are AI/);
 assert.doesNotMatch(html,/data-step="make"/); // Make opens from here only once the look is chosen
});

test('kit: once used, it says so and leads on to Make; hands-only kits have no host buttons',()=>{
 const used=renderKit({account:'ken',status:{state:'done',saved:kitSaved({approved:true}),estimate:{usd:0.66}}});
 assert.match(used,/In use ✓/);assert.match(used,/data-step="make"[^>]*>Make a reel with this look/);
 const hands=renderKit({account:'ken',status:{state:'done',saved:kitSaved({format:'hands_pov',kit:{...kitSaved().kit,cast:[],hands:'slim hands, grey sleeves'},pictures:[pic('hands','The hands'),pic('place','The place'),pic('scene','A frame from a reel')]}),estimate:{usd:0.3}}});
 assert.doesNotMatch(hands,/kit-character/);assert.match(hands,/The hands<\/h3>/);assert.doesNotMatch(hands,/flagged/);
});

const kbeat=(from,to,who,does,says='')=>({from,to,who,does,says});
const kitPlan=(o={})=>({mode:'kit',kitAt:'K1',createdAt:'P1',chosen:0,picked:[{idea:{title:'Revive celery',hook_line:'Floppy?'},scores:{fit:3,ai_ready:3,hook:2}}],rejected:[],
 script:{hook_title:'Floppy celery?',keyword:'CRISP',caption:'c',parts:[{beats:[kbeat(0,3,'Leo','holds celery','Floppy?'),kbeat(3,10,'Mia','drops it in ice water')]},{beats:[kbeat(0,10,'Mia','smiles','Comment CRISP.')]}]},
 check:{pass:true,problems:[]},price:{usd:2.08,maxUsd:4.16,parts:2,partSeconds:10},...o});
const usedKit={approved:true,createdAt:'K1',kit:{cast:[{name:'Leo'},{name:'Mia'}]}};

test('make with a look: the script shows two timed parts, the price is in dollars on the Gemini key',()=>{
 const html=renderMake({account:'ken',plan:{state:'ready',plan:kitPlan()},make:{reels:[]},kit:usedKit});
 assert.match(html,/Made from your look: Leo and Mia/);assert.match(html,/Part 1 · 0–10 s/);assert.match(html,/Part 2 · 10–20 s/);assert.match(html,/<b>Mia<\/b> drops it in ice water/);
 assert.match(html,/13–20 s|10–20 s/);assert.match(html,/data-act="make" data-usd="2.08" data-max="4.16"/);assert.match(html,/Make the reel · \$2\.08/);assert.doesNotMatch(html,/credits/);
 assert.match(html,/✓ True/);
});

test('make with a look: an old hands-only plan asks for new ideas; made badges only count this plan\'s reels',()=>{
 const old=renderMake({account:'ken',plan:{state:'ready',plan:{...kitPlan(),mode:undefined,script:null}},make:{reels:[]},kit:usedKit});
 assert.match(old,/data-act="ideas"/);assert.match(old,/ideas for your look/);
 const reels=[{id:'0-revive-limp-celery',url:'/a.mp4'},{id:'0-revive-celery-abc123',idea:0,planAt:'P1',url:'/b.mp4',title:'Revive celery'}];
 assert.deepEqual([...madeIdeas(reels,kitPlan())],[0]);assert.deepEqual([...madeIdeas([reels[0]],kitPlan())],[]);assert.deepEqual([...madeIdeas([reels[0]],null)],[0]);
 const done=renderMake({account:'ken',plan:{state:'ready',plan:kitPlan()},make:{reels},kit:usedKit});assert.match(done,/src="\/b\.mp4#t=0\.5"/);
 const flagged=renderKitScript(kitPlan({check:{pass:false,problems:['Part 2 is risky for AI video','Says something that may not be true']}}));
 assert.match(flagged,/! True/);assert.match(flagged,/! Easy for AI video/);
});

test('ready: kit reels show dollars, older reels show credits',()=>{
 const html=renderReady({reels:[{id:'a',url:'/a.mp4',seconds:22.4,spentUsd:2.07,caption:'x'},{id:'b',url:'/b.mp4',seconds:30,spent:76,caption:'y'}]});
 assert.match(html,/22 s · \$2\.07/);assert.match(html,/30 s · 76 credits/);
});

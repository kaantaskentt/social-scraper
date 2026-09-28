import test from 'node:test';
import assert from 'node:assert/strict';
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderKit,renderMake,renderReady,renderPrice,renderIdeas} from '../public/flow-views.mjs';
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
 assert.match(html,/<video src="\/channels\/a\/0-celery\/reel\.mp4#t=0\.5"/);assert.match(html,/download>1 · Download the reel/);assert.match(html,/data-copy="cap-0-celery"/);assert.match(html,/30 s · 76 credits/);
 assert.match(renderReady({reels:[]}),/Nothing ready yet/);
});

import {PLAIN,LABELS as L} from '../public/secret-labels.mjs';
test('every answer Jev can give has a plain sentence, and the cards show it',()=>{
 for(const [q,[,criteria]] of Object.entries(L))for(const v of Object.keys(criteria))if(!['unclear','other'].includes(v))assert.ok(PLAIN[q]?.[v],`${q}.${v}`);
 const html=renderSecret({account:'ken',status:{state:'done',saved},imageFor:img});assert.match(html,/It goes step by step, like a recipe\./);assert.match(html,/The action is already happening in the first second\./);
});

import {latestRuns,madeIdeas,renderKitScript,compareSentence,renderChannelPreview,handleOf,renderReelScore,renderLearned,FB_REASONS,renderConfirmLook,renderDna} from '../public/flow-views.mjs';
import {REASONS} from '../lib/feedback.mjs';
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

test('secret comparison reads as one plain sentence, never as numbers soup',()=>{
 assert.equal(compareSentence({winners:12,flops:5,perSide:15}),'12 of their 15 best reels do this, but only 5 of their 15 weakest.');
 assert.equal(compareSentence({winners:3,flops:9,perSide:15}),'Only 3 of their 15 best reels do this, but 9 of their 15 weakest do.');
});

test('kit choosing: 3 host and place options, Jev\'s pick marked and preselected, a tap only marks, one button draws',()=>{
 const opt=(name,score,pass=true)=>({hosts:[{name,outfit:`${name}'s navy tee`,picture:{url:`/channels/r/kit/opt0-face0-${'a'.repeat(12)}.jpg`,check:{pass,problems:pass?[]:['letters or a logo are visible']}}}],score});
 const saved={stage:'choose',format:'ai_host',cast:1,costUsd:0.45,kit:{name:'Kitchen Check',promise:'Tricks.'},options:{casts:[opt('Mira',2.1),opt('Ada',2.8),opt('Bo',1.5,false)],places:[{text:'White kitchen',score:2.6,picture:{url:'/p0.jpg',check:{pass:true}}},{text:'Green kitchen',score:2,picture:{url:'/p1.jpg',check:{pass:true}}}],
  pick:{cast:{index:1,score:2.8,why:"Jev's pick: the best fit for the channel (2.8 of 3; next best 2.1)."},place:{index:0,score:2.6,why:"Jev's pick: the best fit for the channel (2.6 of 3; next best 2.0)."}}}};
 const html=renderKit({account:'ken',status:{state:'done',saved}});
 assert.match(html,/1 · Pick your host/);assert.match(html,/2 · Pick the place/);assert.match(html,/2\.8 of 3; next best 2\.1/);
 assert.match(html,/data-kit-cast="1" aria-pressed="true"><span class="pill pill-ok opt-pick">Jev's pick/);assert.match(html,/data-kit-place="0" aria-pressed="true">/);
 assert.match(html,/Check: letters or a logo are visible/);assert.match(html,/data-act="kit-choose"[^>]*>Draw my look · about \$0\.21/);assert.match(html,/locked: the same face in every reel/);
 assert.doesNotMatch(html,/kit-approve/);
 const mine=renderKit({account:'ken',status:{state:'done',saved},pick:{cast:2,place:1}});assert.match(mine,/data-kit-cast="2" aria-pressed="true"/);assert.match(mine,/data-kit-place="1" aria-pressed="true"/);
 const hands=renderKit({account:'ken',status:{state:'done',saved:{...saved,options:{...saved.options,casts:[],pick:{cast:null,place:saved.options.pick.place}}}}});
 assert.doesNotMatch(hands,/Pick your host/);assert.match(hands,/1 · Pick the place/);assert.match(hands,/Draw my look · about \$0\.14/);
});

test('channel preview: a profile with the host as avatar, the promise, AI disclosed, made reels then upcoming frames, voices',()=>{
 const k={kit:{name:'Food Fact Check!',promise:'Real tricks, tested.',cast:[{name:'Felix'}],assets:[{what:'Clear glass mugs'},{what:'Shocked point'}],palette:[{hex:'#112233'},{hex:'bad'}]},
  pictures:[{role:'face0',url:'/f.jpg'},{role:'scene',url:'/s.jpg'},{role:'place',url:'/p.jpg'}]};
 const html=renderChannelPreview(k,{reels:[{url:'/r1.mp4'}],voices:[{name:'Felix',url:'/v.wav'}]});
 assert.equal(handleOf('Food Fact Check!'),'food.fact.check');assert.match(html,/@food\.fact\.check/);assert.match(html,/class="ig-avatar" src="\/f\.jpg"/);
 assert.match(html,/Real tricks, tested\. · Our hosts are AI/);assert.match(html,/<b>1<\/b> posts/);assert.doesNotMatch(html,/followers/);
 assert.ok(html.indexOf('/r1.mp4')<html.indexOf('/s.jpg'));assert.match(html,/data-voice="\/v\.wav"[^>]*>▶ Hear Felix/);
 assert.match(html,/background:#112233/);assert.match(html,/background:#ddd/);
 assert.match(renderChannelPreview(k,{}),/data-act="kit-voices"/);
 const gap=renderChannelPreview({...k,pictures:[...k.pictures,{role:'body0',url:null}]},{});assert.doesNotMatch(gap,/src="null"|src=""/);assert.match(renderChannelPreview({...k,kit:{...k.kit,assets:[{what:'A transparent glass'}]}},{}),/<span>transparent glass<\/span>/);
});

test('feedback loop on screen: the score against the winners, one-tap verdict, reasons after 👎, what was learned',()=>{
 assert.deepEqual(FB_REASONS,REASONS); // the page and the engine use the same reasons
 const r={id:'0-fizz-abc',mode:'kit',score:{share:96,weakest:'stops_scroll'}};
 const html=renderReelScore(r);assert.match(html,/<b>96%<\/b> of their winners' score · weakest: the first second/);assert.match(html,/data-fb="up"[^>]*>👍 Post it/);assert.doesNotMatch(html,/data-fb-reason/);
 const down=renderReelScore({...r,feedback:{verdict:'down',reasons:['voice']}});assert.match(down,/data-fb-reason="voice" data-reel="0-fizz-abc">The voice/);assert.match(down,/chip chip-btn is-on" data-fb-reason="voice"/);
 assert.match(renderReelScore(r,{open:true}),/data-fb-reason="boring_start"/);
 assert.match(renderReelScore({...r,score:null,scoreError:'Gemini busy'}),/Not scored: Gemini busy/);assert.doesNotMatch(renderReelScore({id:'x',score:null}),/data-fb/);
 const learned=renderLearned([{feedback:{verdict:'up'}},{feedback:{verdict:'down',reasons:['voice','too_slow']}},{feedback:{verdict:'down',reasons:['voice']}}]);
 assert.match(learned,/1 reel you liked\. The next scripts fix: The voice \(2×\), Too slow \(1×\)\./);assert.equal(renderLearned([]),'');
});

test('the confirm pop-up shows the hosts, their voices and the place the video will use',()=>{
 const k={kit:{cast:[{name:'Felix'},{name:'Stella'}]},voices:{Felix:{sample:'/v.wav'}},pictures:[{role:'face0',url:'/f0.jpg'},{role:'face1',url:'/f1.jpg'},{role:'place',url:'/p.jpg'},{role:'scene',url:'/s.jpg'}]};
 const html=renderConfirmLook(k);assert.match(html,/src="\/f0\.jpg".*Felix <button[^>]*data-voice="\/v\.wav"/s);assert.match(html,/src="\/f1\.jpg".*Stella<\/figcaption>/s);assert.match(html,/src="\/p\.jpg".*The place/s);assert.doesNotMatch(html,/s\.jpg/);
 assert.equal(renderConfirmLook(null),'');
});

test('ideas: 6 shown with why each is true and how big its payoff is; the rest one tap away',()=>{
 const picked=Array.from({length:12},(_,i)=>({idea:{title:`Idea ${i}`,hook_line:'h',why_true:`Reason ${i}`},scores:{fit:2,ai_ready:2,hook:2,payoff:2.5}}));
 const plan={picked,rejected:[],chosen:null};
 const html=renderIdeas(plan,{busy:false});assert.equal((html.match(/class="card idea/g)||[]).length,6);assert.match(html,/Why it's true:<\/b> Reason 0/);assert.match(html,/Big payoff/);assert.match(html,/data-act="ideas-all">Show all 12 ideas/);
 const all=renderIdeas(plan,{busy:false,showAll:true});assert.equal((all.match(/class="card idea/g)||[]).length,12);assert.doesNotMatch(all,/ideas-all/);
});

test('Winner DNA on the Secret page: the honest verdict first, details with numbers, no-effect list, spot check',()=>{
 const imageFor=id=>`/media/r/${id}`;
 assert.match(renderDna({state:'none',estimate:{reels:79,usd:0.47}},{imageFor}),/data-act="dna-build">Find the Winner DNA · about \$0\.47/);
 assert.match(renderDna({state:'working',stage:'Watching the reels',done:10,total:79},{imageFor}),/value="10" max="79"/);
 const saved={reels:79,validation:{verdict:'luck',rho:0.02},labels:[{id:'a',xNormal:9.1,labels:{pair:'one_man',glasses:'no',hook:'mid_action',voice:'calm',payoffs:'3+'}}]};
 const view={shown:[{plain:'Three or more payoffs',rho:0.33,withX:4.74,withoutX:1.2,n:11,evidence:'hint'},{plain:'An energetic voice',rho:-0.28,withX:1.2,withoutX:2.89,n:37,evidence:'hint'}],noEffect:['glasses','humor']};
 const html=renderDna({state:'done',saved,view},{imageFor});
 assert.match(html,/Winner DNA · 79 reels tested/);assert.match(html,/Their wins look mostly like luck and timing/);assert.match(html,/tie-breakers, not rules/);
 assert.match(html,/▲<\/span><div><b>Three or more payoffs<\/b>.*<b>4\.74×<\/b>.*<b>1\.2×<\/b>.*11 of 79 reels · a hint/s);assert.match(html,/▼<\/span><div><b>An energetic voice/);
 assert.match(html,/No effect either way: glasses, humor\./);assert.match(html,/src="\/media\/r\/a".*9\.1× normal.*one man · mid action · calm voice · 3\+ payoffs/s);
 assert.match(renderDna({state:'done',saved:{...saved,validation:{verdict:'predictable',rho:0.34}},view},{imageFor}),/Their wins follow a pattern.*Follow them/s);
 assert.equal(renderDna(null,{imageFor}),'');
});

test('the script shows whether hosts talk or a voice explains, why, and a one-tap switch',()=>{
 const plan={script:{hook_title:'H',caption:'c',parts:[{beats:[{from:0,to:10,who:'Leo',does:'d',says:'s'}]}]},check:{problems:[]},voice:{mode:'talking',why:'In 63 of 79 of their reels a host speaks first, to the camera.'}};
 const html=renderKitScript(plan);assert.match(html,/🗣 Hosts talk on camera<\/span><span class="hint">In 63 of 79/);assert.match(html,/data-voice-mode="voiceover">Use a voice-over instead/);
 assert.match(renderKitScript({...plan,voice:{mode:'voiceover',why:'You chose this.'}}),/data-voice-mode="talking">Let the hosts talk instead/);
});

test('ready to post: cover, reel and caption, each with one numbered button; a free cover button for older reels',()=>{
 const html=renderReady({reels:[{id:'0-fizz',url:'/channels/a/0-fizz/reel.mp4',cover:'/channels/a/0-fizz/cover.jpg',title:'Fizz',caption:'Try it #kitchen',seconds:22,spentUsd:2.15}]});
 assert.match(html,/<img class="ready-cover" src="\/channels\/a\/0-fizz\/cover\.jpg"/);assert.match(html,/href="\/channels\/a\/0-fizz\/reel\.mp4" download>1 · Download the reel/);
 assert.match(html,/href="\/channels\/a\/0-fizz\/cover\.jpg" download>2 · Download the cover/);assert.match(html,/data-copy="cap-0-fizz">3 · Copy the caption/);
 const old=renderReady({reels:[{id:'0-egg',url:'/e.mp4',title:'Egg',caption:'c',seconds:22}]});assert.match(old,/data-act="make-cover" data-reel="0-egg">Make the cover · free/);assert.match(old,/2 · Copy the caption/);
});

test('a blocked script is never a dead end: try the next idea or write it again',()=>{
 const plan={mode:'kit',kitAt:'K1',createdAt:'P1',chosen:0,picked:[{idea:{title:'Soda test',hook_line:'h'},scores:{fit:2,ai_ready:2,hook:2}},{idea:{title:'Egg float',hook_line:'h'},scores:{fit:2,ai_ready:2,hook:2}}],rejected:[],
  script:{hook_title:'H',caption:'c',parts:[{beats:[{from:0,to:10,who:'Leo',does:'d',says:'s'}]}]},check:{pass:false,problems:['The method or an ingredient is wrong: the result shown would not really happen']},price:{usd:2.17,maxUsd:4.34,parts:2,partSeconds:10}};
 const html=renderMake({account:'ken',plan:{state:'ready',plan},make:{reels:[]},kit:{approved:true,createdAt:'K1',kit:{cast:[]}}});
 assert.match(html,/Jev stopped this script before any money was spent: The method or an ingredient is wrong/);assert.match(html,/data-idea="1">Try the next idea: Egg float/);assert.match(html,/data-idea="0">Write this one again/);
 assert.match(html,/Write the script again/);assert.doesNotMatch(html,/data-act="make"/);
});

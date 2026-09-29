import test from 'node:test';
import assert from 'node:assert/strict';
import {reachable,renderStepper,renderScan,renderWinners,renderSecret,renderKit,renderMake,renderReady,renderPrice,renderIdeas} from '../public/flow-views.mjs';
const img=id=>`/media/r/${id}`;

test('steps open in order: winners and look need a scored scan, copy needs a finished look, ready needs a reel',()=>{
 assert.deepEqual(reachable({}),{scan:true,winners:false,secret:false,kit:false,make:false,ready:false});
 assert.deepEqual(reachable({scanned:true,scored:true,kit:true,reels:1}),{scan:true,winners:true,secret:true,kit:true,make:true,ready:true});
 // Look opens right after Winners (it builds the Secret itself); Copy needs a finished look (2026-09-29).
 assert.deepEqual(reachable({scanned:true,scored:true}),{scan:true,winners:true,secret:true,kit:true,make:false,ready:false});
 const html=renderStepper('secret',reachable({scanned:true,scored:true}),{scan:true,winners:true});
 assert.match(html,/data-step="winners"[^>]*aria-current="step"/);assert.doesNotMatch(html,/data-step="secret"/);assert.match(html,/data-step="make"[^>]*disabled/);assert.match(html,/✓/);
});

test('scan: an open account shows its map and next step, with no inline analysis form',()=>{
 const html=renderScan({runs:[{id:'a',creator:'ken.remedie',count:100,status:'complete'}],run:{id:'a',creator:'ken.remedie',count:100},scored:true});
 assert.doesNotMatch(html,/name="handle"|acct-list/);assert.match(html,/@ken\.remedie is scanned/);assert.match(html,/data-step="winners"/);
 assert.match(renderScan({run:{id:'a',creator:'x'},progress:{state:'running',done:3,total:10,label:'Listening'}}),/<progress value="3" max="10">/);
});

test('winners: big reel tiles with how many times their normal, weakest for contrast',()=>{
 const html=renderWinners({account:'ken',winners:[{id:'w1',image:'/i/w1',xNormal:104.1,reach:5.8e6}],weakest:[{id:'f1',image:'/i/f1',xNormal:0.3,reach:1e4}]});
 assert.match(html,/104\.1× their usual/);assert.match(html,/5\.8M <span>plays/);assert.match(html,/data-preview="w1"/);assert.match(html,/weakest/);assert.match(html,/data-step="secret"/);
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
 assert.match(html,/data-feedback="yes"/);assert.match(html,/data-step="kit"[^>]*>Make your look/);assert.doesNotMatch(html,/\d+\.\d+ s/,'no numbers soup');
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
 assert.match(html,/<video src="\/channels\/a\/0-celery\/reel\.mp4#t=0\.5"/);assert.match(html,/data-download="0-celery">Download reel and cover/);assert.match(html,/data-copy="cap-0-celery"/);assert.match(html,/30 s · 76 credits/);
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
 assert.match(none,/Your look, in @ken&#39;s style/);assert.match(none,/data-act="kit-build"[^>]*>Build my look · about \$0\.66/); // .usd is the expected cost, not a cap (audit #17)
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
 assert.match(used,/In use ✓/);assert.match(used,/data-step="make"[^>]*>Copy their winners with this look/); // Make opens the copy studio (audit #63)
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
 assert.match(html,/Made from your look: Leo and Mia/);assert.match(html,/Part 1 · 0–10 s/);assert.match(html,/Part 2 · 10–20 s/);assert.match(html,/Ready to make · Jev passed it/);assert.match(html,/drops it in ice water/);
 assert.match(html,/13–20 s|10–20 s/);assert.match(html,/data-act="make" data-usd="2.08" data-max="4.16"/);assert.match(html,/Make the reel · \$2\.08/);assert.doesNotMatch(html,/credits/);
 assert.match(html,/Why this script/);
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
 assert.match(html,/22 s · video \$2\.07, checks extra/);assert.match(html,/30 s · 76 credits/); // spentUsd counts only the video parts (audit #46)
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

test('feedback loop on screen: the judge note with its measured record, one-tap verdict, reasons after 👎, what was learned',()=>{
 assert.deepEqual(FB_REASONS,REASONS); // the page and the engine use the same reasons
 const r={id:'0-fizz-abc',mode:'kit',score:{weakest:'stops_scroll',fix:'Open on the fizz.'}};
 const html=renderReelScore(r,{judge:{reels:79,auc:0.532}});assert.match(html,/Judge's note: weakest part is the first second/);assert.match(html,/Fix: Open on the fizz\. An opinion, not a forecast\. On 79 of this channel's past reels it picked the winner 53% of the time \(50% is a coin flip\)/);assert.doesNotMatch(html,/%<\/b>/);assert.match(html,/data-fb="up"[^>]*>👍 Post it/);assert.doesNotMatch(html,/data-fb-reason/);
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
 const html=renderIdeas(plan,{busy:false});assert.equal((html.match(/class="card idea/g)||[]).length,6);assert.match(html,/Why it's true:<\/b> Reason 0/);assert.match(html,/Big payoff/);assert.match(html,/data-act="ideas-all">Show 6 more ideas/);
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

test('ready to post: reel and cover download together; older reels can create a cover in Details',()=>{
 const html=renderReady({reels:[{id:'0-fizz',url:'/channels/a/0-fizz/reel.mp4',cover:'/channels/a/0-fizz/cover.jpg',title:'Fizz',caption:'Try it #kitchen',seconds:22,spentUsd:2.15}]});
 assert.match(html,/poster="\/channels\/a\/0-fizz\/cover\.jpg"/);assert.match(html,/data-download="0-fizz">Download reel and cover/);
 assert.match(html,/href="\/channels\/a\/0-fizz\/cover\.jpg" download/);assert.match(html,/data-copy="cap-0-fizz">Copy caption/);
 const old=renderReady({reels:[{id:'0-egg',url:'/e.mp4',title:'Egg',caption:'c',seconds:22}]});assert.match(old,/data-act="make-cover" data-reel="0-egg">Make the cover · free/);assert.match(old,/Copy caption/);
});

test('when nothing passes: one clear next step (new ideas), the reasons folded under Why',()=>{
 const plan={mode:'kit',kitAt:'K1',createdAt:'P1',chosen:0,picked:[{idea:{title:'Soda test',hook_line:'h'},scores:{fit:2,ai_ready:2,hook:2}},{idea:{title:'Egg float',hook_line:'h'},scores:{fit:2,ai_ready:2,hook:2}}],rejected:[],
  script:{hook_title:'H',caption:'c',parts:[{beats:[{from:0,to:10,who:'Leo',does:'d',says:'s'}]}]},check:{pass:false,problems:['The method or an ingredient is wrong: the result shown would not really happen']},price:{usd:2.17,maxUsd:4.34,parts:2,partSeconds:10}};
 const html=renderMake({account:'ken',plan:{state:'ready',plan},make:{reels:[]},kit:{approved:true,createdAt:'K1',kit:{cast:[]}}});
 assert.match(html,/Jev did not pass this idea/);assert.match(html,/nothing spent on video/);assert.match(html,/data-act="ideas"[^>]*>Get new ideas/);
 assert.match(html,/<b>Soda test<\/b>: The method or an ingredient is wrong/);assert.doesNotMatch(html,/data-act="make"/);
 assert.match(html,/data-idea="1">Use this idea/); // any other idea is one tap away
});

test('the Ready step leads straight to the next reel',()=>{
 const html=renderReady({reels:[{id:'a',url:'/r.mp4',title:'T',caption:'c',seconds:20,spentUsd:2}]});
 assert.match(html,/data-step="make">Make another reel →/);
});

test('a reel with a line cut off says so on its card',()=>{
 const base={id:'a',url:'/r.mp4',title:'T',caption:'c',seconds:20,spentUsd:2};
 assert.match(renderReady({reels:[{...base,heard:{all:false,missing:['Follow for the next test.']}}]}),/Not ready: review the issues in Details[\s\S]*Missing speech: Follow for the next test/);
 assert.doesNotMatch(renderReady({reels:[{...base,heard:{all:true,missing:[]}}]}),/Not ready/);
});

test('ideas Jev stopped go last and say so; fresh ideas come first',()=>{
 const picked=['A','B','C'].map(t=>({idea:{title:t,hook_line:'h'},scores:{fit:2,ai_ready:2,hook:2,payoff:2}}));
 const html=renderIdeas({picked,chosen:null,blocked:[{index:0,title:'A',problems:['x']}]},{busy:false});
 assert.ok(html.indexOf('<h3>B</h3>')<html.indexOf('<h3>A</h3>'));assert.match(html,/Jev stopped it<\/span><h3>A<\/h3>/);assert.match(html,/data-idea="0">Try it again/);assert.match(html,/data-idea="1">Use this idea/);
});

test('a reel reviewed as not postable says why on its card',()=>{
 assert.match(renderReady({reels:[{id:'s',url:'/r.mp4',title:'Silver',caption:'c',seconds:20,spentUsd:2,review:{postable:false,why:'The spoon never turns shiny.'}}]}),/Not ready: review the issues in Details[\s\S]*The spoon never turns shiny\./);
});

test('real results: ask for the handle once, then one check button; each posted reel shows its real numbers',async()=>{
 const {renderResultsCard,renderReelResult}=await import('../public/flow-views.mjs');
 assert.match(renderResultsCard({handle:null,checks:[],reels:{}}),/data-form="track"/);
 const card=renderResultsCard({handle:'kaan.tests',checks:[{at:'2026-09-30T10:00:00Z',posts:12,matched:2}],reels:{}});assert.match(card,/Real results · @kaan\.tests/);assert.match(card,/2 of our reels found in your last 12 posts/);assert.match(card,/data-act="results-check"/);
 const row=renderReelResult({url:'https://www.instagram.com/reel/A/',snapshots:[{ageHours:24,plays:1500,likes:50,comments:4,shares:null}]});
 assert.match(row,/<b>1,500<\/b> plays/);assert.match(row,/24 h after posting/);assert.doesNotMatch(row,/↗/); // unknown shares are not shown as 0
 assert.equal(renderReelResult(undefined),'');
});

test('the gate and the rank show on the reel card',()=>{
 const base={id:'a',url:'/r.mp4',title:'T',caption:'c',seconds:20,spentUsd:2};
 const opinion=renderReady({reels:[{...base,check:{level:'broken',problems:['16s missing_result: spoon still black'],weaknesses:[]}}]});
 assert.match(opinion,/Second opinion: 16s missing_result: spoon still black/);assert.doesNotMatch(opinion,/Not ready/); // advice, not a gate: it flips between runs
 const weak=renderReady({reels:[{...base,check:{level:'weak',problems:[],weaknesses:['6s missing_result: no floating egg']},rank:{sentence:'Beat 3 of 5 of their typical reels in a side-by-side watch.'}}]});
 assert.match(weak,/Second opinion: 6s missing_result: no floating egg/);assert.match(weak,/Beat 3 of 5 of their typical reels/);assert.doesNotMatch(weak,/Not ready/);
});

import {REEL_COUNTS,renderAnalysisSheet,renderAccounts,winnersFinished,scanSummary,dockActions} from '../public/flow-views.mjs';
test('new analysis offers the three measured sizes and a fresh start by default',()=>{
 const html=renderAnalysisSheet();
 assert.deepEqual(REEL_COUNTS,[{limit:30,time:3,usd:0.12},{limit:60,time:4,usd:0.22},{limit:100,time:6,usd:0.35}]);
 for(const {limit,time,usd} of REEL_COUNTS){assert.match(html,new RegExp(`name="limit" value="${limit}"`));assert.ok(html.includes(`About ${time} min`));assert.ok(html.includes(`About $${usd.toFixed(2)}`));}
 assert.match(html,/name="fresh" checked/);assert.match(html,/type="submit" data-start>Start · about \$0\.52</);assert.match(html,/instagram.com/);
 assert.match(renderAccounts([{id:'a',creator:'alpha',count:30}],{id:'a',creator:'alpha'}),/new-analysis[\s\S]*data-run="a"[\s\S]*30 reels/);
});
test('scored reels unlock Winners immediately; Secret waits; Look and Copy wait for the top winners',()=>{
 const results=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),{label:'winner',xNormal:10-i,reach:1000}]));
 const posts=Object.keys(results).map((id,i)=>({id,status:i===6?'queued':['complete','no_speech','music','no_audio','failed','complete'][i]}));
 assert.equal(winnersFinished(posts,results),true,'the seventh winner does not hold up the first six');
 assert.equal(winnersFinished([{...posts[0],status:'transcribed'},...posts.slice(1)],results),false);
 assert.equal(winnersFinished([],{}),false);
 const early=reachable({scored:true,kit:true});assert.equal(early.winners,true);assert.equal(early.secret,false);assert.equal(early.kit,false);assert.equal(early.make,false);
 const ready=reachable({scored:true,winnersReady:true,kit:true});assert.equal(ready.kit,true);assert.equal(ready.make,true);assert.equal(ready.secret,false);
 assert.equal(reachable({scanned:true,scored:true}).kit,true);
});
test('scan summary: reels, winners (at least 2x their usual), best reel and the usual plays',()=>{
 assert.deepEqual(scanSummary([{plays:100},{plays:200},{plays:900}],{a:{reach:900,xNormal:3}}),[['Reels',3],['Winners',1],['Best reel',900],['Usual plays',300]]);
 assert.equal(scanSummary([])[1][1],null);
});
test('winner metrics put plays before relative reach and engagement, with inline muted preview',()=>{
 const html=renderWinners({account:'a',winners:[{id:'w',image:'/w.jpg',video:'/w.mp4',reach:14.3e6,xNormal:397,engagement:22}],secretOpen:false,lookOpen:false});
 assert.match(html,/14.3M <span>plays[\s\S]*397× their usual[\s\S]*Engagement 22 per 1K plays/);
 assert.match(html,/data-src="\/w.mp4" muted playsinline loop/);assert.match(html,/data-step="secret" disabled/);assert.match(html,/data-step="kit" disabled/);
});
test('one primary action is docked with its hooks, cost, disabled state and optional secondary',()=>{
 const html=renderWinners({account:'a',winners:[{id:'w',reach:10,xNormal:3}]});
 const dock=dockActions(html,{step:'winners',open:{kit:true}});
 assert.equal((dock.bar.match(/btn-primary/g)||[]).length,1);assert.doesNotMatch(dock.html,/btn-primary|data-step="kit"/);assert.match(dock.bar,/data-step="secret"[\s\S]*data-step="kit"/);
 const build=dockActions(renderKit({account:'a',status:{estimate:{usd:1.01}}}),{step:'kit',open:{}});
 assert.match(build.bar,/data-act="kit-build"[^>]*>Build my look · about \$1.01/);
 const live=dockActions(renderScan({run:{id:'a',creator:'a'},progress:{state:'running',done:2,total:30,label:'Listening'},scored:true}),{step:'scan',open:{winners:true}});
 assert.match(live.bar,/See the winners/);assert.match(live.html,/Still listening: 2 of 30/);
 const waiting=dockActions('',{step:'make',open:{}});assert.match(waiting.bar,/disabled>Making your copies/);
});
test('Ready keeps the two actions outside Details and all diagnostics inside',()=>{
 const html=renderReady({reels:[{id:'r',url:'/r.mp4',cover:'/r.jpg',caption:'line one\nline two\nline three',check:{level:'weak',problems:['Opinion']},review:{postable:false,why:'Issue'},rank:{sentence:'Score'},spentUsd:3,seconds:20}]});
 const card=html.split('<article')[1].split('</article>')[0],before=card.split('<details')[0],details=card.split('<details')[1];
 assert.match(before,/data-download="r"/);assert.match(before,/data-copy="cap-r"/);assert.match(before,/aria-expanded="false"/);assert.match(before,/Not ready:/);
 assert.doesNotMatch(before,/Opinion|Score|\$3.00/);assert.match(details,/Details[\s\S]*Opinion[\s\S]*Score[\s\S]*Issue[\s\S]*\$3.00/);
});

import {reelDownloadBundle} from '../public/flow-views.mjs';
test('download bundle contains both intact files and standard ZIP checksums',async()=>{
 const encoder=new TextEncoder(),blob=reelDownloadBundle([{name:'reel.mp4',bytes:encoder.encode('123456789')},{name:'cover.jpg',bytes:new Uint8Array([0,255,12])}]);
 assert.equal(blob.type,'application/zip');const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0xcbf43926,'standard CRC32 test vector');
 assert.equal(new TextDecoder().decode(bytes.slice(30,38)),'reel.mp4');assert.equal(new TextDecoder().decode(bytes.slice(38,47)),'123456789');
 assert.equal(v.getUint32(47,true),0x04034b50);assert.deepEqual([...bytes.slice(47+30+9,47+30+9+3)],[0,255,12]);
 assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.equal(v.getUint16(bytes.length-12,true),2);
 assert.equal(v.getUint32(v.getUint32(bytes.length-6,true),true),0x02014b50,'central directory points to the entries');
});
test('prep ahead shows one quiet line on the Winners step: working, ready, or why it could not',async()=>{
 const {prepLine,renderWinners}=await import('../public/flow-views.mjs');
 assert.equal(prepLine(null),'');assert.equal(prepLine({state:'none'}),'');
 assert.match(prepLine({state:'working'}),/Getting your Look and Copy ready/);assert.match(prepLine({state:'done'}),/ready to start/);
 assert.match(prepLine({state:'failed',error:'Gemini <out>'}),/Gemini &lt;out&gt;.*still work/);
 assert.match(renderWinners({account:'a',winners:[{id:'w',image:'/w.jpg',reach:1e6,xNormal:9}],prep:{state:'working'}}),/winners<\/h1>[\s\S]*prep-line is-working[\s\S]*reel-grid/);
});

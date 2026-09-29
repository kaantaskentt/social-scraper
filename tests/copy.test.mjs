import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_USD,EXTEND_USD} from '../lib/kit-reel.mjs';
import {fidelityPrompt,copyableRequest,copyMode,visualScript,formatKey,copyCandidates,pickCopies,timedWords,copyScript,wordsKept,copyPrice,stageKey,plannedStages,progressOf,learnStage,fidelityScore,fidelityVerdict,hasTimedWords,COPY_MAX_PARTS} from '../lib/copy.mjs';

const reel=(id,xNormal,seconds,text,timed=true,plays=null,engagement=null)=>({id,xNormal,seconds,text,timed,plays,engagement});

// Kaan, 2026-09-29: "suggest their best high engagement viral videos, don't suggest bad ones". On natural.solutions the
// old picker offered two 60K-play reels (one an ad for their book) and skipped the 14.3M, 5.4M and 2.0M ones, because
// it only took reels up to 41 s (Gemini Omni's limit); Veo 3.1 extends up to 148 s.
test('candidates: the most-played winners first, any length (Kaan: no caps on seconds), with speech and word times',()=>{
 const c=copyCandidates([reel('mid',3.8,38,'Did you know that if you add peanut butter to chickpeas and mix',true,64787,20),reel('viral',425,68,'You cannot eat apples spinach chicken yogurt and it will not clear',true,14256715,14),
  reel('toes',46,54,'Stand on your toes twenty times after dinner tonight and watch your blood sugar',true,1556012,49),reel('toolong',60,160,'A very long talk about many different things for a long time here',true,900000,20),
  reel('weak',1.2,30,'Something that did about their normal number of views today on this',true,20000,18)]);
 assert.deepEqual(c.map(x=>x.id),['viral','toes','toolong','mid']); // 160 s is filmed as two joined videos
 assert.equal(copyCandidates([reel('a',9,30,'one two three four five six seven eight nine',false,50000,20)]).length,0); // no word times: cannot be copied word for word
 assert.equal(copyCandidates([reel('a',9,300,'one two three four five six seven eight nine',true,50000,20)]).length,1);
 assert.equal(formatKey('Pour boiling water, over raw chicken'),'pour boiling water over');
});
test('candidates: an ad for their own product and a low-engagement reel are never suggested',()=>{
 const c=copyCandidates([reel('book',3.7,40,'For everyone asking about the book, I have been researching natural remedies for over forty years',true,61069,5.5),
  reel('bio',5,30,'Grab the full recipe with the link in my bio right now before it goes',true,90000,20),
  reel('boosted',8,30,'Here is a quick tip that everyone should know about keeping bananas fresh',true,300000,4),
  reel('good',6,30,'Here is why your bananas go brown so fast and the one thing that stops it',true,200000,19),
  reel('ok',4,30,'Put a spoon of honey in warm water and watch what happens to it next',true,150000,17)]);
 assert.deepEqual(c.map(x=>x.id),['good','ok']); // 4 per 1,000 is under half the channel's usual (17 to 19)
});
test('candidates: near-identical scripts count once (the most-played), and how often they won is kept',()=>{
 const c=copyCandidates([reel('b',60,59,'You can eat apples chicken spinach yogurt and it will not clear what has been sitting in your gut',true,5389958,21),
  reel('a',425,68,'You cannot eat apples spinach chicken yogurt and it will not clear what has been sitting in your gut',true,14256715,14),
  reel('c',20,72,'You can eat fruit meat vegetables milk anything you want and it still will not clear out your gut',true,2023884,17),
  reel('d',9,55,'Stand on your toes twenty times after dinner tonight and watch your blood sugar spikes vanish',true,1556012,49)]);
 assert.deepEqual(c.map(x=>x.id),['a','c','d']);assert.equal(c[0].repeats,2);
});
test('the five: Jev drops reels that will not copy or need people we do not have, and each says why',()=>{
 const cands=[{id:'a',xNormal:104,repeats:4},{id:'b',xNormal:72,repeats:1},{id:'c',xNormal:43,repeats:1}];
 const j=(s,r)=>({answers:{copyable:{score:s},roles_fit:{noul:r}}});
 const p=pickCopies(cands,[j(2.6,0.9),j(1.2,0.9),j(2.2,0.2)]);assert.deepEqual(p.map(x=>x.id),['a']);assert.equal(p[0].why,'4 of their winners use this script. Jev rates it 2.6 of 3 for copying.'); // the card shows plays and x-normal already
});
test('an Omni copy has no length cap: every 4 parts a fresh chain starts, priced like a first part',()=>{
 assert.equal(copyPrice(8),Math.round((2*PART_USD+6*EXTEND_USD)*100)/100);assert.equal(copyPrice(4),Math.round((PART_USD+3*EXTEND_USD)*100)/100);
});
test('timed words share a segment\'s time by word length, in order, inside the segment',()=>{
 const w=timedWords([{start:0,end:2.68,text:' Pour boiling water over raw chicken.'}]);
 assert.equal(w.length,6);assert.equal(w[0].start,0);assert.ok(Math.abs(w.at(-1).end-2.68)<1e-9);assert.ok(w.every((x,i)=>!i||x.start>=w[i-1].end-1e-9));
});
test('the copy script keeps every original word on its original seconds, cut into 10-second parts',()=>{
 const breakdown={beats:[{from:0,to:3,shot:'close-up of chicken',happens:'a man pours boiling water',says:'x',sound:'pour'},{from:3,to:12,shot:'close-up of foam',happens:'white foam rises',says:'x',sound:'sizzle'},{from:12,to:37,shot:'medium of the couple',happens:'they react',says:'x',sound:''}]};
 const segments=[{start:0,end:2.7,text:'Pour boiling water over raw chicken.'},{start:3,end:11,text:'If thick white clumps and slimy foam come oozing out, that is what they pumped into it.'},{start:12,end:36,text:'If it holds firm and just changes color, that is clean. Number two, raw ground beef.'}];
 const cast=[{who:'Felix',does:'Felix pours boiling water over raw chicken'},{who:'Felix',does:'white foam rises'},{who:'Stella',does:'Felix and Stella react'}];
 const s=copyScript({breakdown,segments,seconds:37,cast,hook:'POUR BOILING WATER',caption:'c'});
 assert.equal(s.parts.length,4); // 37 s → four 10-second parts
 for(const p of s.parts){assert.equal(p.beats[0].from,0);assert.equal(p.beats.at(-1).to,10);p.beats.forEach((b,i)=>{assert.ok(b.to>b.from);if(i)assert.equal(b.from,p.beats[i-1].to);});}
 const said=s.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ');assert.equal(wordsKept(segments.map(x=>x.text).join(' '),said),1);
 assert.equal(s.parts[0].beats[0].who,'Felix');assert.match(s.parts[0].beats[0].says,/^Pour boiling water over raw chicken\./);assert.equal(s.parts[1].beats[0].shot,'close-up of foam'); // the foam beat crosses into part 2
 assert.equal(copyScript({breakdown,segments,seconds:37,cast:cast,hook:'h',caption:'c'}).parts.length,4);
});
test('words kept: in order, over the original\'s words; a paraphrase scores low, a copy scores 1',()=>{
 const o='Pour boiling water over raw chicken. If white foam comes out, that is what they pumped into it.';
 assert.equal(wordsKept(o,o),1);assert.equal(wordsKept(o,'pour boiling water over raw chicken if white foam comes out that is what they pumped into it'),1);
 assert.ok(wordsKept(o,'Heat some water and see what your poultry releases when it cooks.')<0.3);assert.equal(wordsKept('',''),1);
});
test('price: first part and each extension',()=>{assert.equal(copyPrice(4),4.43);assert.equal(copyPrice(1),1.04);});
test('progress: stages from the maker\'s own words, a stage never shows done early, the ETA learns from real runs',()=>{
 assert.equal(stageKey('Filming part 1 of 4'),'film_first');assert.equal(stageKey('Filming part 3 of 4 (retry)'),'film_next');assert.equal(stageKey('Checking part 2'),'check');assert.equal(stageKey('Comparing with the original'),'compare');assert.equal(stageKey('whatever'),null);
 const st=plannedStages(2,'native');assert.deepEqual(st.map(s=>s.key),['study','script','film_first','check','film_next','check','edit','cover','compare']);
 assert.deepEqual(progressOf(st,0,0),{pct:0,left:st.reduce((a,s)=>a+s.seconds,0)});
 const stuck=progressOf(st,2,999);assert.ok(stuck.pct<progressOf(st,3,0).pct+1);assert.ok(stuck.left>0); // a slow stage caps below its end
 assert.equal(progressOf(st,st.length,0).pct,100);
 let l={};for(const s of [60,80,70])l=learnStage(l,'film_first',s);assert.equal(l.film_first,70);assert.equal(plannedStages(1,'native',l)[2].seconds,70);
});
test('fidelity: shots matter most, then words, then length; missing parts are left out, not guessed',()=>{
 assert.deepEqual(fidelityScore({wordsKept:1,lengthRatio:1,beats:[{match:3},{match:3}]}),{score:100,shots:100,words:100,length:100});
 assert.equal(fidelityScore({wordsKept:0.9,lengthRatio:1.1,beats:[{match:3},{match:1}]}).score,Math.round((2/3*0.6+0.9*0.3+0.9*0.1)*100));
 assert.deepEqual(fidelityScore({wordsKept:0.5}),{score:50,shots:null,words:50,length:null});
});
test('the comparison: Gemini is told other people are expected; code decides faithful and the part to redo',async()=>{
 const {fidelityPrompt,fidelityVerdict}=await import('../lib/copy.mjs');
 const beats=[{from:0,to:3,shot:'close-up',happens:'pours water',says:'Pour boiling water',sound:'pour'},{from:3,to:12,shot:'foam',happens:'foam rises',says:'',sound:''},{from:12,to:25,shot:'medium',happens:'react',says:'',sound:''}];
 assert.match(fidelityPrompt(beats),/Different people, clothes and room are expected/);assert.match(fidelityPrompt(beats),/1\. 0-3 s: close-up; pours water; says "Pour boiling water"; sound: pour/);
 const seen=m=>({beats:m.map((match,i)=>({beat:i+1,match})),same_feel:2});
 assert.deepEqual(fidelityVerdict(90,seen([3,3,3]),beats),{faithful:true,redo:null,resultMissing:[]});
 assert.deepEqual(fidelityVerdict(60,seen([3,3,1]),beats),{faithful:false,redo:'part_2',resultMissing:[]}); // beat 3 starts at 12 s: part 2
 assert.equal(fidelityVerdict(90,{...seen([3,3,3]),same_feel:1},beats).faithful,false);
});

test('plain errors for the tiles',async()=>{const {plainError}=await import('../lib/copy.mjs');
 assert.equal(plainError('Gemini: HTTP 400. event: error\ndata: {"error":{"message":"Videos longer than 30s are not supported for extension."}}'),'Google cannot make a video longer than 40 seconds.');
 assert.match(plainError('Gemini: HTTP 429. Rate limit exceeded'),/Google was busy/);assert.match(plainError('Gemini: HTTP 400. Request blocked due to prohibited content guidelines.'),/refused/);
 assert.equal(plainError('Gemini: HTTP 500. Internal'),'Internal');});

// Audit 2026-09-29: the pick text said "This format won 4 times" and "Jev: copies 2.6 of 3"; it now says what code counts.
test('word times: every segment with words needs a start and an end',()=>{
 assert.equal(hasTimedWords([{start:0,end:2,text:'a b'},{start:2,end:3,text:' '}]),true);assert.equal(hasTimedWords([]),false);
 assert.equal(hasTimedWords([{text:'a b'}]),false);assert.equal(hasTimedWords(undefined),false);assert.equal(hasTimedWords([{start:0,end:2,text:'a'},{start:2,text:'b'}]),false);
});
test('a beat too short for a whole second keeps its words (audit, 2026-09-29)',()=>{
 const cast=n=>Array.from({length:n},(_,i)=>({who:'Felix',does:`beat ${i+1}`})),check=s=>{for(const p of s.parts){assert.equal(p.beats[0].from,0);assert.equal(p.beats.at(-1).to,10);p.beats.forEach((b,i)=>{assert.ok(b.to>b.from);if(i)assert.equal(b.from,p.beats[i-1].to);});}};
 // A 2.6 to 3.4 s beat rounds to 3-3: its "seven eight" was dropped with it.
 const b1={beats:[0,2.6,3.4,8].map(from=>({from,shot:'s',happens:'h'}))},seg1=[{start:0,end:2.6,text:'one two three four five six'},{start:2.6,end:3.4,text:'seven eight'},{start:3.4,end:8,text:'nine ten eleven twelve'},{start:8,end:10,text:'thirteen fourteen'}];
 const s1=copyScript({breakdown:b1,segments:seg1,seconds:10,cast:cast(4),hook:'h',caption:'c'});check(s1);
 assert.equal(wordsKept(seg1.map(x=>x.text).join(' '),s1.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ')),1);
 // A 9.85 to 10 s slice at the end of part 1 was skipped, and its word "zz" belonged to neither part.
 const b2={beats:[0,9.85,15].map(from=>({from,shot:'s',happens:'h'}))},seg2=[{start:0,end:9.85,text:'aa bb cc'},{start:9.85,end:10.1,text:'zz'},{start:10.1,end:15,text:'dd'},{start:15,end:20,text:'ee ff'}];
 const s2=copyScript({breakdown:b2,segments:seg2,seconds:20,cast:cast(3),hook:'h',caption:'c'});check(s2);
 assert.equal(wordsKept(seg2.map(x=>x.text).join(' '),s2.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ')),1);
 // A beat under 0.2 s left a gap between its neighbours, and a word in the gap was lost.
 const b3={beats:[0,4,4.1].map(from=>({from,shot:'s',happens:'h'}))},seg3=[{start:0,end:3.9,text:'one two'},{start:3.95,end:4.1,text:'gap'},{start:4.1,end:10,text:'three four'}];
 const s3=copyScript({breakdown:b3,segments:seg3,seconds:10,cast:cast(3),hook:'h',caption:'c'});check(s3);
 assert.equal(wordsKept(seg3.map(x=>x.text).join(' '),s3.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ')),1);
});
test('fidelity counts every beat of the original once; a beat the watch left out scores 0 (audit, 2026-09-29)',()=>{
 const five=[1,2,3,4,5].map(beat=>({beat,match:3}));
 assert.equal(fidelityScore({wordsKept:0.8,lengthRatio:1,beats:five,count:9}).shots,Math.round(15/27*100));
 // Duplicates count once: the first entry for a beat is its score.
 assert.equal(fidelityScore({beats:[{beat:1,match:3},{beat:1,match:3},{beat:2,match:0}],count:2}).shots,50);
 const beats=[0,5,12,15,22].map(from=>({from,to:from+3}));
 // Beats 3 to 5 (parts 2 and 3) were never judged: not faithful, and a part with missing beats is filmed again.
 const seen={beats:[{beat:1,match:3},{beat:2,match:3}],same_feel:3},f=fidelityScore({wordsKept:1,lengthRatio:1,beats:seen.beats,count:5});
 assert.ok(f.score<75,`score ${f.score}`);assert.deepEqual(fidelityVerdict(f.score,seen,beats),{faithful:false,redo:'part_2',resultMissing:[]});
});

test('Veo lengths: the same words cut into an 8 s clip and 7 s extensions, every part ending at its own length',()=>{
 const breakdown={beats:[{from:0,to:5,shot:'close',happens:'pour',says:'',sound:''},{from:5,to:20,shot:'foam',happens:'foam',says:'',sound:''}]};
 const segments=[{start:0,end:4,text:'Pour boiling water over raw chicken.'},{start:6,end:14,text:'If white foam comes out, that is what they pumped into it.'},{start:15,end:21,text:'If it holds firm it is clean.'}];
 const s=copyScript({breakdown,segments,seconds:22,cast:[{who:'Felix',does:'pours'},{who:'Felix',does:'foam'}],hook:'h',caption:'c',lengths:[8,7,7]});
 assert.deepEqual(s.parts.map(p=>p.seconds),[8,7,7]);assert.deepEqual(s.parts.map(p=>p.beats.at(-1).to),[8,7,7]);
 assert.equal(wordsKept(segments.map(x=>x.text).join(' '),s.parts.flatMap(p=>p.beats.map(b=>b.says)).join(' ')),1);
});

test('stricter comparison: a wide shot of the right action scores its framing; a result not visible is never faithful',async()=>{
 const {fidelityScore,fidelityVerdict,matchByBeat}=await import('../lib/copy.mjs');
 const beats=[{from:0,to:4,happens:'pour'},{from:4,to:8,happens:'foam'},{from:12,to:20,happens:'react'}];
 const seen={beats:[{beat:1,match:3,framing:1,result_visible:'no_result'},{beat:2,match:3,framing:3,result_visible:'no'},{beat:3,match:3,framing:3,result_visible:'no_result'}],same_feel:3};
 assert.deepEqual(matchByBeat(seen.beats,3),[1,3,3]);
 const f=fidelityScore({wordsKept:1,lengthRatio:1,beats:seen.beats,count:3});assert.equal(f.shots,78);
 const v=fidelityVerdict(95,seen,beats);assert.equal(v.faithful,false);assert.deepEqual(v.resultMissing,[2]);assert.equal(v.redo,'part_1');
 assert.equal(fidelityVerdict(95,{...seen,beats:seen.beats.map(b=>({...b,result_visible:'yes'}))},beats).faithful,true);
});

// Kaan, 2026-09-29, @saywaybrand: every winner is a person seen from behind in a store, wearing a shirt with a funny
// printed line, over a song. The transcript held the song's lyrics, and the picker would have had our host speak them.
test('visual copy: a winner whose sound is a song (or that has no speech) is copied by its shots and printed line',()=>{
 const sung={voice:{delivery:'Rhythmic, confident hip-hop singing/rapping over a heavy beat.'},hook_words:"DON'T TALK TO ME I HAVE A CRAZY GIRLFRIEND",beats:[{from:0,to:5.4,shot:'Medium shot from behind',happens:'He stands showing the print on his hoodie',says:'All I need in this life is me and my girlfriend',sound:'Hip-hop beat'}]};
 assert.equal(copyMode({post:{status:'complete'},breakdown:sung}),'visual');
 assert.equal(copyMode({post:{status:'music'},breakdown:{voice:{delivery:'Calm, close voice'},beats:[]}}),'visual');
 assert.equal(copyMode({post:{status:'no_speech'},breakdown:{beats:[]}}),'visual');
 assert.equal(copyMode({post:{status:'complete'},breakdown:{voice:{delivery:'Warm, fast narration to camera'},beats:[]}}),'spoken');
 const s=visualScript({breakdown:sung,seconds:6,lengths:[8],cast:[{who:'Leo',does:'Leo stands in a store aisle, back to the camera'}],caption:'c'});
 assert.equal(s.visual,true);assert.equal(s.still,true); // 'He stands showing the print on his hoodie'; a walking original is not still:
 assert.equal(visualScript({breakdown:{...sung,beats:[{...sung.beats[0],happens:'A man walks down the hall'}]},seconds:6,lengths:[8],cast:[{who:'Leo',does:'x'}],caption:'c'}).still,false);assert.equal(s.print,"DON'T TALK TO ME I HAVE A CRAZY GIRLFRIEND");assert.equal(s.hook_title,'');
 assert.deepEqual(s.parts.flatMap(p=>p.beats.map(b=>b.says)),['']);assert.deepEqual(s.parts.flatMap(p=>p.beats.map(b=>[b.shot,b.sound])),[['','']]); // the original's place and song stay outassert.equal(s.parts[0].beats[0].who,'Leo');assert.equal(s.parts[0].seconds,8);
});
test('candidates: a silent or song-only winner is offered too, most played first',()=>{
 const c=copyCandidates([{id:'song',xNormal:113,seconds:6,text:'',timed:false,silent:true,plays:750412,engagement:57},{id:'talk',xNormal:5,seconds:30,text:'Here is why your bananas go brown so fast and what stops it',timed:true,plays:40000,engagement:20}]);
 assert.deepEqual(c.map(x=>x.id),['song','talk']);
});

test('a look without hosts offers a faceless person to Jev, so a reel shown from behind can be copied',()=>{
 const r=copyableRequest({beats:[{shot:'from behind'}],payoff:{},first_second:'x'},{cast:[],place:'a store aisle'});
 assert.equal(r.state.our_hosts.length,1);assert.match(r.state.our_hosts[0].look,/face is never shown/);assert.match(r.questions.roles_fit.instructions,/only from behind/);
 assert.equal(copyableRequest({beats:[]},{cast:[{name:'Leo',look:'a man',role:'host'}],place:'p'}).state.our_hosts[0].name,'Leo');
});

test('the comparison of a visual copy ignores the place and the song, and needs the printed words exact',()=>{
 const b=[{from:0,to:5,shot:'from behind',happens:'hoodie print',says:'',sound:'beat'}];
 assert.match(fidelityPrompt(b,{visual:true}),/music \(added when the reel is posted\)[\s\S]*garbled or different words mean that result is not visible/);
 assert.doesNotMatch(fidelityPrompt(b),/garbled/);
});

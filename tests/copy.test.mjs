import test from 'node:test';
import assert from 'node:assert/strict';
import {formatKey,copyCandidates,pickCopies,timedWords,copyScript,wordsKept,copyPrice,stageKey,plannedStages,progressOf,learnStage,fidelityScore,COPY_MAX_PARTS} from '../lib/copy.mjs';

const reel=(id,xNormal,seconds,text)=>({id,xNormal,seconds,text});

test('candidates: winners short enough to film, strongest first, a format that won more than once is counted',()=>{
 const c=copyCandidates([reel('chicken',104,37,'Pour boiling water over raw chicken. If thick white clumps come out'),reel('salmon',72,39,'Pour boiling water over raw salmon. If thick white clumps come out'),
  reel('long',52,138,'Did you know that this simple drink has been used for years by many'),reel('lime',43,43,'Put lime on blueberries and watch what happens. Pharmacies do not like this'),reel('weak',1.2,30,'Something that did about their normal number of views today')]);
 assert.deepEqual(c.map(x=>x.id),['chicken','salmon']);assert.equal(c[0].repeats,2); // lime is 43 s: longer than the 41 s a 40-second copy can holdassert.equal(formatKey('Pour boiling water, over raw chicken'),'pour boiling water over');
 assert.equal(copyCandidates([reel('a',9,COPY_MAX_PARTS*10+2,'one two three four five six seven eight nine')]).length,0);assert.equal(copyCandidates([reel('a',9,COPY_MAX_PARTS*10+1,'one two three four five six seven eight nine')]).length,1);
});
test('the five: Jev drops reels that will not copy or need people we do not have, and each says why',()=>{
 const cands=[{id:'a',xNormal:104,repeats:4},{id:'b',xNormal:72,repeats:1},{id:'c',xNormal:43,repeats:1}];
 const j=(s,r)=>({answers:{copyable:{score:s},roles_fit:{noul:r}}});
 const p=pickCopies(cands,[j(2.6,0.9),j(1.2,0.9),j(2.2,0.2)]);assert.deepEqual(p.map(x=>x.id),['a']);assert.equal(p[0].why,'This format won 4 times. Jev: copies 2.6 of 3.'); // the card shows the x-normal already
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
 assert.deepEqual(fidelityVerdict(90,seen([3,3,3]),beats),{faithful:true,redo:null});
 assert.deepEqual(fidelityVerdict(60,seen([3,3,1]),beats),{faithful:false,redo:'part_2'}); // beat 3 starts at 12 s: part 2
 assert.equal(fidelityVerdict(90,{...seen([3,3,3]),same_feel:1},beats).faithful,false);
});

test('plain errors for the tiles',async()=>{const {plainError}=await import('../lib/copy.mjs');
 assert.equal(plainError('Gemini: HTTP 400. event: error\ndata: {"error":{"message":"Videos longer than 30s are not supported for extension."}}'),'Google cannot make a video longer than 40 seconds.');
 assert.match(plainError('Gemini: HTTP 429. Rate limit exceeded'),/Google was busy/);assert.match(plainError('Gemini: HTTP 400. Request blocked due to prohibited content guidelines.'),/refused/);
 assert.equal(plainError('Gemini: HTTP 500. Internal'),'Internal');});

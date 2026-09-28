import test from 'node:test';
import assert from 'node:assert/strict';
import {lengthBand,DETAILS,DNA_SCHEMA,dnaPrompt,ranks,spearman,permutationP,bootstrapCI,bh,indicators,analyse,validate,dnaBrief,dnaDetails,dnaVoice,rng} from '../lib/dna.mjs';

// Synthetic channels with a known answer.
function channel({n=80,effect=1.2,seed=1}={}){
 const r=rng(seed),items=[];
 for(let i=0;i<n;i++){
  const glasses=r()<0.4,story=r()<0.5,music=r()<0.5;
  // glasses really help (by `effect` in log terms); story and music are pure noise
  const logx=(glasses?effect:0)+(r()-0.5)*1.2;
  const labels=Object.fromEntries(Object.entries(DETAILS).map(([k,d])=>[k,d.values[0]]));
  Object.assign(labels,{glasses:glasses?'yes':'no',arc:story?'story':'steps',music:music?'song':'none'});
  items.push({id:`r${i}`,xNormal:Math.exp(logx),labels});
 }
 return items;
}

test('the schema asks every detail with its fixed answers, and never about origin',()=>{
 assert.deepEqual(DNA_SCHEMA.required,Object.keys(DETAILS).filter(k=>!DETAILS[k].code));assert.ok(!DNA_SCHEMA.properties.length);assert.deepEqual(DNA_SCHEMA.properties.glasses.enum,['yes','no','no_person']);
 assert.match(dnaPrompt('hi'),/never skin colour, ethnicity/);
 for(const [k,d] of Object.entries(DETAILS))for(const v of d.values)assert.ok(d.plain[v],`${k}=${v} has a plain sentence`);
});

test('ranks handle ties; spearman is 1 for a perfect order and -1 reversed',()=>{
 assert.deepEqual(ranks([10,20,20,5]),[2,3.5,3.5,1]);
 assert.equal(spearman([1,2,3,4],[10,20,30,40]),1);assert.equal(spearman([1,2,3,4],[4,3,2,1]),-1);
});

test('permutation p is small for a real link and large for noise; the interval covers the truth',()=>{
 const x=Array.from({length:60},(_,i)=>i%2),r=rng(2),y=x.map(v=>v*2+r()),noise=x.map(()=>r());
 assert.ok(permutationP(x,y,{n:500})<0.01);assert.ok(permutationP(x,noise,{n:500})>0.05);
 const [lo,hi]=bootstrapCI(x,y,{n:300});assert.ok(lo>0.5&&hi<=1);
});

test('Benjamini-Hochberg: q-values are never below p and keep the order',()=>{
 const q=bh([0.01,0.04,0.03,0.5]);assert.deepEqual(q.map(v=>Math.round(v*1000)/1000),[0.04,0.053,0.053,0.5]); // worked by hand: 0.04*4/3 carries down to p=0.03
});

test('indicators only keep values that at least 5 reels have and 5 do not',()=>{
 const items=channel({n:40});const keys=indicators(items).map(f=>f.key);
 assert.ok(keys.includes('glasses=yes'));assert.ok(!keys.includes('people=1')); // every reel has people=0 here
});

test('analyse finds the real detail (glasses) as a signal and calls the noise "none"',()=>{
 const rows=analyse(channel({n:80}),{perms:500,boots:300});
 const g=rows.find(r=>r.key==='glasses=yes'),s=rows.find(r=>r.key==='arc=story'),m=rows.find(r=>r.key==='music=song');
 assert.equal(g.evidence,'signal');assert.ok(g.rho>0.4);assert.ok(g.withX>g.withoutX);assert.equal(g.plain,'The host wears glasses');
 assert.equal(s.evidence,'none');assert.equal(m.evidence,'none');
 assert.equal(rows[0].detail,'glasses'); // strongest first
});

test('validation: a real detail predicts unseen reels; a channel of pure luck is called luck; too few reels are refused',()=>{
 const real=validate(channel({n:80}),{perms:300});assert.equal(real.verdict,'predictable');assert.ok(real.rho>0.3);
 const luck=validate(channel({n:80,effect:0,seed:9}),{perms:300});assert.notEqual(luck.verdict,'predictable');
 assert.equal(validate(channel({n:20})).verdict,'too_few');
});

test('the brief for writers lists only details with evidence, split into do more and do less, with numbers',()=>{
 const details=[{plain:'The host wears glasses',rho:0.5,withX:2.1,withoutX:1.1,n:30,evidence:'signal'},{plain:'A song',rho:-0.3,withX:0.8,withoutX:1.6,n:20,evidence:'hint'},{plain:'Noise',rho:0.1,withX:1,withoutX:1,n:40,evidence:'none'}];
 const b=dnaBrief({details,validation:{verdict:'predictable'}});
 assert.deepEqual(b.do_more,['The host wears glasses (2.1x their normal with it, 1.1x without; 30 reels; proven for this channel)']);assert.equal(b.do_less.length,1);assert.equal(b.verdict,'predictable');assert.match(b.note,/predicted unseen reels/);
 assert.match(dnaBrief({details,validation:{verdict:'luck'}}).note,/tie-breakers, not rules/);
 assert.equal(dnaBrief(null),null);
});

test('a channel of pure luck with every detail random: at most one false signal across all details',()=>{
 let falseSignals=0,tested=0;
 for(const seed of [21,22,23]){const r=rng(seed),items=Array.from({length:80},(_,i)=>({id:`n${i}`,xNormal:Math.exp((r()-0.5)*2),labels:Object.fromEntries(Object.entries(DETAILS).map(([k,d])=>[k,d.values[Math.floor(r()*d.values.length)]]))}));
  const rows=analyse(items,{perms:400,boots:200});tested+=rows.length;falseSignals+=rows.filter(x=>x.evidence==='signal').length;}
 assert.ok(tested>150,`${tested} tests`);assert.ok(falseSignals<=1,`${falseSignals} false signals in ${tested} tests`);
});

test('reel length bands are measured by code',()=>{assert.deepEqual([lengthBand(9),lengthBand(22),lengthBand(45),lengthBand(90),lengthBand(null)],['under_15','15_to_30','30_to_60','over_60',null]);});

test('mirror halves of yes/no details are dropped; the voice hint becomes an acting note',()=>{
 const details=[{detail:'real_sounds',value:'yes',plain:'Real sounds are clearly featured',rho:0.28,evidence:'hint'},{detail:'real_sounds',value:'no',plain:'Real sounds are not featured',rho:-0.28,evidence:'hint'},
  {detail:'voice',value:'energetic',plain:'An energetic voice',rho:-0.28,evidence:'hint'},{detail:'voice',value:'calm',plain:'A calm voice',rho:0.27,evidence:'hint'}];
 assert.deepEqual(dnaDetails({details}).map(d=>`${d.detail}=${d.value}`),['real_sounds=yes','voice=energetic','voice=calm']);
 assert.equal(dnaVoice({details}),'calm, warm and steady');assert.equal(dnaVoice({details:[]}),null);
});

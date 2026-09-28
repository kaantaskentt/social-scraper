// Winner DNA: which small details of a channel's reels go with doing better than that channel's own normal, and whether
// they predict reels the model has not seen. Evidence and rules: research library playbook short-video-replication
// (creator-history-dominates, validate-predictor-holdout, popularity-partly-unpredictable). Spec:
// docs/superpowers/specs/2026-09-28-winner-dna.md. Gemini describes each reel; everything here is code.
const text=d=>({type:'string',description:d});
const one=(values,d)=>({type:'string',enum:values,description:d});
const NO_ORIGIN='Describe people only by role, clothing, grooming, expression and manner: never skin colour, ethnicity, race or nationality.';

// The details, with a plain sentence for every value (what the Secret page shows).
export const DETAILS={
 people:{q:'How many people are on camera (faces or bodies, not only hands)?',type:'count',values:['0','1','2','3+'],plain:{0:'Nobody is on camera',1:'One person is on camera',2:'Two people are on camera','3+':'Three or more people are on camera'}},
 pair:{q:'Who is on camera?',values:['nobody','one_man','one_woman','man_and_woman','two_men','two_women','group'],plain:{nobody:'Nobody is on camera',one_man:'One man',one_woman:'One woman',man_and_woman:'A man and a woman',two_men:'Two men',two_women:'Two women',group:'A group'}},
 age:{q:'Age band of the main person',values:['none','under_25','25_to_40','40_to_60','over_60'],plain:{none:'No person',under_25:'The host looks under 25',
  '25_to_40':'The host looks 25 to 40','40_to_60':'The host looks 40 to 60',over_60:'The host looks over 60'}},
 glasses:{q:'Does the main person wear glasses?',values:['yes','no','no_person'],plain:{yes:'The host wears glasses',no:'The host wears no glasses',no_person:'No host'}},
 facial_hair:{q:'Does the main person have a beard or moustache?',values:['yes','no','no_person'],plain:{yes:'The host has a beard or moustache',no:'The host is clean-shaven or has no facial hair',no_person:'No host'}},
 polish:{q:'How polished is the main person\'s styling and grooming?',values:['no_person','casual','neat','very_polished'],plain:{no_person:'No host',casual:'The host looks casual and unstyled',neat:'The host looks neat',very_polished:'The host looks very polished and styled'}},
 first_frame:{q:'What fills the very first frame?',values:['face','action','result','object','text','scene'],plain:{face:'The first frame is a face',action:'The first frame shows an action already happening',result:'The first frame shows the end result',object:'The first frame is an object up close',text:'The first frame is mostly text',scene:'The first frame is a wide scene'}},
 first_expression:{q:'Facial expression in the first second, if a face is visible',values:['none','neutral','smile','surprise','disgust','serious'],plain:{none:'No face in the first second',neutral:'A neutral face in the first second',smile:'A smile in the first second',surprise:'A surprised face in the first second',disgust:'A disgusted face in the first second',serious:'A serious face in the first second'}},
 gaze:{q:'Where does the host mostly look?',values:['no_person','camera','action','mixed'],plain:{no_person:'No host',camera:'The host talks straight to the camera',action:'The host looks at the action, not the camera',mixed:'The host looks both at the camera and the action'}},
 first_speaker:{q:'Who speaks first?',values:['nobody','man','woman','voiceover'],plain:{nobody:'Nobody speaks',man:'A man speaks first',woman:'A woman speaks first',voiceover:'A voiceover speaks first'}},
 reaction:{q:'Is there a reaction shot (someone visibly reacting: shock, disgust, delight)?',values:['yes','no'],plain:{yes:'Someone visibly reacts on camera',no:'No reaction shot'}},
 hook:{q:'How does it hook in the first 2 seconds?',values:['result_first','question','instruction','bold_claim','story','mid_action','none'],plain:{result_first:'It opens on the result',question:'It opens with a question',instruction:'It opens by telling you to do something',bold_claim:'It opens with a bold claim',story:'It opens with a story',mid_action:'It opens in the middle of an action',none:'No clear hook'}},
 arc:{q:'How is it built?',values:['story','steps','list','single_demo','talk'],plain:{story:'It tells a story with a turn',steps:'It goes step by step',list:'It lists several tips or tests',single_demo:'It shows one demonstration',talk:'Mostly talking'}},
 payoffs:{q:'How many visible payoffs or reveals are there?',type:'count',values:['0','1','2','3+'],plain:{0:'No visible payoff',1:'One payoff',2:'Two payoffs','3+':'Three or more payoffs'}},
 payoff_closeup:{q:'Is the main result shown in a close-up?',values:['yes','no','no_payoff'],plain:{yes:'The result is shown up close',no:'The result is not shown up close',no_payoff:'No visible result'}},
 humor:{q:'Is it meant to be funny?',values:['yes','no'],plain:{yes:'It is funny',no:'It is not played for laughs'}},
 twist:{q:'Is there a surprise or twist near the end?',values:['yes','no'],plain:{yes:'There is a twist near the end',no:'No twist'}},
 emotion:{q:'Main feeling for the viewer',values:['curiosity','surprise','disgust','satisfaction','amusement','fear','aspiration','calm'],plain:{curiosity:'It makes you curious',surprise:'It surprises you',disgust:'It makes you go "ew"',satisfaction:'It is satisfying to watch',amusement:'It is funny',fear:'It worries you',aspiration:'It makes you want to be better',calm:'It is calm'}},
 voice:{q:'What is the voice like?',values:['none','calm','energetic','whisper','dramatic'],plain:{none:'No voice',calm:'A calm voice',energetic:'An energetic voice',whisper:'A soft, close voice',dramatic:'A dramatic voice'}},
 music:{q:'Music',values:['none','background','song'],plain:{none:'No music',background:'Quiet background music',song:'A recognisable or trending song'}},
 real_sounds:{q:'Are real sounds clearly featured (pour, fizz, crunch, sizzle)?',values:['yes','no'],plain:{yes:'Real sounds are clearly featured',no:'Real sounds are not featured'}},
 text:{q:'Text on screen',values:['none','captions','title','both'],plain:{none:'No text on screen',captions:'Captions of what is said',title:'A title or hook text',both:'Captions and a title'}},
 intensity:{q:'How intense is it overall (cuts, motion, sound, text together)?',values:['low','medium','high'],plain:{low:'It feels calm and slow',medium:'It feels lively',high:'It feels very intense and busy'}},
 setting:{q:'Where is it?',values:['kitchen','home','outdoors','studio','digital','public','other'],plain:{kitchen:'In a kitchen',home:'In a home',outdoors:'Outdoors',studio:'In a plain studio',digital:'In a digital or animated space',public:'In a public place',other:'Somewhere else'}},
 // Measured by code, not asked: the reel's length.
 length:{code:true,values:['under_15','15_to_30','30_to_60','over_60'],plain:{under_15:'Under 15 seconds',  '15_to_30':'15 to 30 seconds','30_to_60':'30 to 60 seconds',over_60:'Over a minute'}}};
export const lengthBand=s=>!Number.isFinite(s)?null:s<15?'under_15':s<30?'15_to_30':s<60?'30_to_60':'over_60';
export const DNA_VERSION=1;
const ASKED=Object.entries(DETAILS).filter(([,d])=>!d.code);
export const DNA_SCHEMA={type:'object',required:ASKED.map(([k])=>k),properties:Object.fromEntries(ASKED.map(([k,d])=>[k,one(d.values,d.q)]))};
export const dnaPrompt=transcript=>`Watch this reel and describe it on every field, exactly as it is. ${NO_ORIGIN} "Main person" is the person who is on camera most.${transcript?`\nWhat is said (for reference): "${String(transcript).slice(0,600)}"`:''}`;

// Statistics. A seeded random source so every result can be reproduced.
export function rng(seed=1){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export function ranks(v){const idx=v.map((x,i)=>[x,i]).sort((a,b)=>a[0]-b[0]),r=new Array(v.length);let i=0;
 while(i<idx.length){let j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;const avg=(i+j)/2+1;for(let k=i;k<=j;k++)r[idx[k][1]]=avg;i=j+1;}return r;}
export function pearson(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0,syy=0;
 for(let i=0;i<n;i++){const a=x[i]-mx,b=y[i]-my;sxy+=a*b;sxx+=a*a;syy+=b*b;}return sxx&&syy?sxy/Math.sqrt(sxx*syy):0;}
export const spearman=(x,y)=>pearson(ranks(x),ranks(y));
function shuffle(a,rand){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
// Two-sided permutation p-value for a Spearman correlation.
export function permutationP(x,y,{n=2000,rand=rng(7)}={}){const obs=Math.abs(spearman(x,y));let hit=0;for(let i=0;i<n;i++)if(Math.abs(spearman(x,shuffle(y,rand)))>=obs-1e-12)hit++;return (hit+1)/(n+1);}
export function bootstrapCI(x,y,{n=1000,rand=rng(11)}={}){const m=x.length,v=[];for(let i=0;i<n;i++){const xs=[],ys=[];for(let k=0;k<m;k++){const j=Math.floor(rand()*m);xs.push(x[j]);ys.push(y[j]);}v.push(spearman(xs,ys));}
 v.sort((a,b)=>a-b);return [v[Math.floor(n*0.025)],v[Math.floor(n*0.975)]];}
// Benjamini-Hochberg: q-values for many tests at once (35 details tested on 80 reels would give false hits otherwise).
export function bh(ps){const m=ps.length,o=ps.map((p,i)=>[p,i]).sort((a,b)=>a[0]-b[0]),q=new Array(m);let min=1;
 for(let k=m-1;k>=0;k--){min=Math.min(min,o[k][0]*m/(k+1));q[o[k][1]]=min;}return q;}
const median=v=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b),h=s.length>>1;return s.length%2?s[h]:(s[h-1]+s[h])/2;};

// One indicator per detail value (1 when the reel has it), kept only when at least `min` reels have it and don't.
export function indicators(items,min=5){
 const out=[];
 for(const [k,d] of Object.entries(DETAILS))for(const v of d.values){const x=items.map(it=>it.labels[k]===v?1:0),on=x.reduce((a,b)=>a+b,0);
  if(on>=min&&items.length-on>=min)out.push({key:`${k}=${v}`,detail:k,value:v,plain:d.plain[v],x,n:on});}
 return out;
}
// Each detail against log(times the creator's normal): direction, strength, interval, and the corrected q-value.
export function analyse(items,{perms=2000,boots=1000,seed=3}={}){
 const y=items.map(it=>Math.log(it.xNormal)),feats=indicators(items);
 const rows=feats.map((f,i)=>{const rho=spearman(f.x,y),p=permutationP(f.x,y,{n:perms,rand:rng(seed+i)}),ci=bootstrapCI(f.x,y,{n:boots,rand:rng(seed+1000+i)});
  const withX=items.filter((_,j)=>f.x[j]).map(it=>it.xNormal),without=items.filter((_,j)=>!f.x[j]).map(it=>it.xNormal);
  return {key:f.key,detail:f.detail,value:f.value,plain:f.plain,n:f.n,rho:round(rho),p:round(p,4),ci:ci.map(v=>round(v)),withX:round(median(withX)),withoutX:round(median(without))};});
 const q=bh(rows.map(r=>r.p));rows.forEach((r,i)=>{r.q=round(q[i],4);r.evidence=r.q<=0.1?'signal':(r.ci[0]>0||r.ci[1]<0)?'hint':'none';});
 return rows.sort((a,b)=>Math.abs(b.rho)-Math.abs(a.rho));
}
const round=(v,d=2)=>v===null?null:Math.round(v*10**d)/10**d;

// The honesty test: learn on 4/5 of the reels, score the other 1/5, repeat; do the scores rank the unseen reels?
export function validate(items,{folds=5,seed=5,maxFeatures=8,perms=1000}={}){
 if(items.length<30)return {rho:null,p:null,verdict:'too_few',n:items.length};
 const order=shuffle(items.map((_,i)=>i),rng(seed)),fold=i=>order.indexOf(i)%folds,y=items.map(it=>Math.log(it.xNormal)),pred=new Array(items.length).fill(0);
 const feats=indicators(items,3);
 for(let f=0;f<folds;f++){
  const train=items.map((_,i)=>i).filter(i=>fold(i)!==f),test=items.map((_,i)=>i).filter(i=>fold(i)===f),ty=train.map(i=>y[i]);
  const chosen=feats.map(ft=>({ft,rho:spearman(train.map(i=>ft.x[i]),ty)})).filter(c=>Math.abs(c.rho)>=0.15).sort((a,b)=>Math.abs(b.rho)-Math.abs(a.rho)).slice(0,maxFeatures);
  for(const i of test)pred[i]=chosen.reduce((s,c)=>s+c.rho*c.ft.x[i],0);
 }
 if(new Set(pred).size<2)return {rho:0,p:1,verdict:'luck',n:items.length};
 const rho=spearman(pred,y),p=permutationP(pred,y,{n:perms,rand:rng(seed+99)});
 return {rho:round(rho),p:round(p,4),n:items.length,verdict:rho>=0.2&&p<0.05?'predictable':rho>=0.1&&p<0.2?'weak':'luck'};
}
// What the writers and Jev get: details with evidence, the mirror half of a yes/no pair dropped (\"real sounds featured\"
// and \"not featured\" say the same thing), each marked signal (proven for this channel) or hint (lean towards it).
export function dnaDetails(dna){
 if(!dna?.details)return [];const use=dna.details.filter(d=>d.evidence!=='none'),seen=new Set(),out=[];
 for(const d of use){const pair=DETAILS[d.detail]?.values.length===2||['glasses','facial_hair','payoff_closeup'].includes(d.detail);
  if(pair&&seen.has(d.detail))continue;if(pair&&d.rho<0&&use.some(o=>o.detail===d.detail&&o.rho>0))continue;seen.add(d.detail);out.push(d);}
 return out.slice(0,8);
}
export function dnaBrief(dna){
 if(!dna?.details)return null;const use=dnaDetails(dna),line=d=>`${d.plain} (${d.withX}x their normal with it, ${d.withoutX}x without; ${d.n} reels; ${d.evidence==='signal'?'proven for this channel':'a hint, lean towards it'})`;
 return {verdict:dna.validation?.verdict,note:dna.validation?.verdict==='predictable'?'These details predicted unseen reels of this channel.':'These details did not predict unseen reels of this channel on their own: treat them as tie-breakers, not rules.',
  do_more:use.filter(d=>d.rho>0).map(line),do_less:use.filter(d=>d.rho<0).map(line)};
}
// The channel's voice, if its DNA has a voice hint (Ken's hinted \"calm\" over \"energetic\", 2026-09-28).
export function dnaVoice(dna){const d=dnaDetails(dna).find(x=>x.detail==='voice'&&x.rho>0);return d?{calm:'calm, warm and steady',energetic:'energetic and upbeat',whisper:'soft and close',dramatic:'dramatic and intense'}[d.value]||null:null;}

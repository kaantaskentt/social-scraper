// The real public/flow.js, run against a stand-in page and a fake server: account switching, stale errors, a channel
// that fails to load at start-up, the account list, and resuming a stopped scan (audit 2026-09-29).
import test from 'node:test';
import assert from 'node:assert/strict';

const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
const el=()=>({innerHTML:'',textContent:'',hidden:false,dataset:{},style:{setProperty(){}},returnValue:'',listeners:{},
 showModal(){},close(){},addEventListener(t,f){this.listeners[t]=f;},querySelector:()=>null,querySelectorAll:()=>[],pause(){},load(){},removeAttribute(){}});
let n=0;
// Starts flow.js on a fresh page. `routes(method,path,body)` answers the API: a value, or throws for a failed request.
async function boot({routes,stored={}}){
 const els={},doc={handlers:{},addEventListener(t,f){this.handlers[t]=f;},querySelector:s=>s.includes(' ')&&s!=='#player video'?null:(els[s]??=el())};
 const mem=new Map(Object.entries(stored)),calls=[];
 Object.assign(globalThis,{document:doc,addEventListener(){},scrollTo(){},scrollBy(){},innerHeight:800,CSS:{escape:s=>s},
  localStorage:{getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)},
  // Like a real server, routes ignore the query (the flow asks for ?view=flow); calls keep it.
  fetch:async(url,init={})=>{const body=init.body?JSON.parse(init.body):undefined,path=String(url).split('?')[0];calls.push({method:init.method||'GET',path,query:String(url).split('?')[1]||'',body,headers:init.headers});
   try{const v=await routes(init.method||'GET',path,body);return {ok:true,status:200,text:async()=>JSON.stringify(v)};}catch(e){return {ok:false,status:500,text:async()=>JSON.stringify({error:e.message})};}}});
 await import(`../public/flow.js?page=${++n}`);await settle();
 const click=async(data,text='')=>{const target={dataset:data,disabled:false,textContent:text,closest(){return this;}};await doc.handlers.click({target});await settle();};
 const submit=async(fields)=>{const old=globalThis.FormData;globalThis.FormData=class{get(name){return fields[name]??null;}};try{doc.handlers.submit({target:{dataset:{form:'scan'}},preventDefault(){}});await settle();}finally{globalThis.FormData=old;}};
 const approve=async()=>{els['#confirm'].returnValue='ok';els['#confirm'].listeners.close?.();await settle();};
 return {submit,approve,view:()=>els['#view'].innerHTML,accounts:()=>els['#acct-now'].innerHTML,actions:()=>els['#actions'].innerHTML,click,calls,mem,confirm:els['#confirm']};
}

const post=id=>({id,analysis:{}});
const job=(id,creator,o={})=>({id,creator,status:'complete',limit:100,posts:[post(`${id}1`)],error:null,...o});
const options=n=>({casts:Array.from({length:n},(_,i)=>({hosts:[{name:`Host${i}`,outfit:'tee',picture:{url:`/h${i}.jpg`,check:{pass:true}}}],score:2})),places:Array.from({length:n},(_,i)=>({text:`Place${i}`,score:2,picture:{url:`/p${i}.jpg`,check:{pass:true}}})),pick:{cast:{index:0,why:'w'},place:{index:0,why:'w'}}});
const choosing=n=>({state:'done',saved:{stage:'choose',format:'ai_host',cast:1,costUsd:0.4,kit:{name:'K',promise:'p'},options:options(n)},estimate:{usd:0.66,ceiling:1.3}});
// A channel with a scored scan and a Secret, so it opens on the Kit step.
function channel(jobs,{kit={},fail={}}={}){
 return (method,path,body)=>{
  if(path==='/api/bootstrap')return {token:'t',runs:Object.values(jobs).map(j=>({id:j.id,creator:j.creator,count:0,status:'running'}))};
  const m=path.match(/^\/api\/runs\/(\w+)(?:\/(.+))?$/),j=jobs[m[1]],action=m[2]||'';
  if(fail[`${method} ${action}`]&&(!fail.run||fail.run===m[1]))throw new Error(fail[`${method} ${action}`]);
  if(action==='')return j;if(action==='videos')return {saved:[]};if(action==='secret')return {state:'done',saved:{}};
  if(action==='kit')return kit[m[1]]||{state:'none',estimate:{usd:0.66,ceiling:1.3}};
  if(action==='money')return {results:{[`${m[1]}1`]:{quadrant:'star',xNormal:3,label:'winner',reach:9}}};
  if(action==='reel-plan')return {state:'none'};if(action==='reel-make')return {state:'none',reels:[]};
  if(action==='run'){j.status='complete';return j;}
  return {state:'none'};
 };
}

test('#33 a host picked on one account is not drawn for the next one',async()=>{
 const jobs={A:job('A','alpha'),B:job('B','beta')};
 const page=await boot({routes:channel(jobs,{kit:{A:choosing(3),B:choosing(1)}}),stored:{'flow.run':'A'}});
 assert.match(page.view(),/data-kit-cast="0" aria-pressed="true"/);
 await page.click({kitCast:'2'});assert.match(page.view(),/data-kit-cast="2" aria-pressed="true"/);
 await page.click({run:'B'});assert.match(page.view(),/data-kit-cast="0" aria-pressed="true"/,'B shows its own pick');
 await page.click({act:'kit-choose'});await page.approve();
 const sent=page.calls.find(c=>c.path==='/api/runs/B/kit/choose');assert.ok(sent);assert.equal(sent.body.cast,undefined,'B is drawn with its own pick, not host 3 of A');
});

test('#56 an error from one step is gone after moving to another step',async()=>{
 const jobs={A:job('A','alpha')};
 const page=await boot({routes:channel(jobs,{kit:{A:choosing(2)},fail:{'POST kit/choose':'Gemini is busy'}}),stored:{'flow.run':'A'}});
 await page.click({act:'kit-choose'});await page.approve();assert.match(page.view(),/Gemini is busy/);
 await page.click({step:'scan'});assert.doesNotMatch(page.view(),/Gemini is busy/);
});

test('#62 a remembered channel that fails at start-up shows the account list with the reason, and is forgotten',async()=>{
 const jobs={A:job('A','alpha'),B:job('B','beta')};
 const page=await boot({routes:channel(jobs,{fail:{'GET ':'The run file is damaged',run:'A'}}),stored:{'flow.run':'A'}});
 assert.doesNotMatch(page.view(),/Could not load the app/);assert.match(page.view(),/data-run="B"/);assert.match(page.view(),/The run file is damaged/);
 assert.equal(page.mem.has('flow.run'),false);
});

test('#55 once a channel is loaded, its card in the account list shows its real count and status',async()=>{
 const jobs={A:job('A','alpha',{posts:[post('A1'),post('A2')]})};
 const page=await boot({routes:channel(jobs),stored:{'flow.run':'A','flow.step.A':'scan'}});
 assert.match(page.accounts(),/data-run="A"><b>@alpha<\/b><span>2 reels/);assert.doesNotMatch(page.view(),/acct-list/);
});

test('#30 a stopped scan can be resumed from the page',async()=>{
 const jobs={A:job('A','alpha',{status:'paused',error:'Groq said: too many requests'})};
 const page=await boot({routes:channel(jobs),stored:{'flow.run':'A','flow.step.A':'scan'}});
 assert.match(page.view(),/The scan is paused: @alpha/);assert.match(page.view(),/Groq said: too many requests/);
 await page.click({act:'scan-resume'});await page.approve();
 assert.ok(page.calls.some(c=>c.method==='POST'&&c.path==='/api/runs/A/run'));assert.match(page.view(),/@alpha is scanned/);
});


// The sheet's Start button shows the whole price and is the confirmation (a second box on top was one click too many).
test('the analysis sheet posts the chosen limit and fresh flag when Start (with its price) is pressed',async()=>{
 for(const limit of [30,60,100]){
  const jobs={A:job('A','alpha')},base=channel(jobs);
  const page=await boot({routes:(method,path,body)=>{if(path==='/api/runs'&&method==='POST'){jobs.B=job('B',body.creator);return jobs.B;}return base(method,path,body);},stored:{'flow.run':'A'}});
  await page.submit({handle:'https://www.instagram.com/new.account/',limit:String(limit),fresh:limit===30?null:'on'});
  const request=page.calls.find(c=>c.path==='/api/runs'&&c.method==='POST');assert.ok(request);
  assert.equal(request.body.creator,'new.account');assert.equal(request.body.limit,limit);assert.equal(request.body.fresh,limit!==30);assert.equal(request.headers['X-Lab-Token'],'t');
  assert.equal(page.mem.get('flow.run'),'B');assert.match(page.view(),/new.account is scanned/);
 }
});
test('invalid account or unsupported count never creates a scan',async()=>{
 const page=await boot({routes:channel({A:job('A','alpha')}),stored:{'flow.run':'A'}});
 await page.submit({handle:'alpha',limit:'200'});await page.submit({handle:'',limit:'30'});
 assert.equal(page.calls.some(c=>c.method==='POST'),false);
});
test('a paid step waits for confirmation and cannot cross to another account',async()=>{
 const page=await boot({routes:channel({A:job('A','alpha'),B:job('B','beta')},{kit:{A:choosing(1),B:choosing(1)}}),stored:{'flow.run':'A'}});
 await page.click({act:'kit-choose'},'Draw my look · about $0.21');assert.equal(page.calls.some(c=>c.method==='POST'),false);
 await page.click({run:'B'});await page.approve();assert.equal(page.calls.some(c=>c.method==='POST'),false);
});

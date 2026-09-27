import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReelPlan,renderPlanIdeas,renderPlanScript,renderPlanChecks,renderPlanPrice} from '../public/reel-plan-view.mjs';
const idea={title:'The spoon trick',hook_line:'Watch this move',demo:'Hands turn a spoon',steps:['Turn it'],keyword:'SPOON'};
const plan={picked:[{idea,scores:{fit:2.1,ai_ready:3,hook:1.5},total:.8},{idea:{...idea,title:'Another idea'},scores:{fit:2,ai_ready:2,hook:2},total:.6}],rejected:[{idea:{...idea,title:'A cure'},reason:'health claim'}],chosen:1};
const script={hook_title:'Watch the spoon',keyword:'SPOON',caption:'Try it #spoon',shots:[{id:'s2',seconds:4,camera:'Top-down',visual:'Turn the spoon'},{id:'s1',seconds:6,camera:'Close-up',visual:'Lift the spoon'},{id:'s3',seconds:4,camera:'Static',visual:'Set it down'}],voiceover:[{shot:'s1',line:'Lift now'},{shot:'s2',line:'Watch closely'},{shot:'s2',line:'Then turn'}]};
const check={pass:true,problems:[],riskyShots:[],emotion:'curiosity',rewritten:false};
const price={total:30,withOneRetryEach:55,fastTotal:20,fastWithOneRetryEach:35};
test('empty: account, three short bullets, and an explicit paid button',()=>{
 const html=renderReelPlan({state:'none',plan:null},{account:'chef'});
 assert.match(html,/Make an original reel in @chef’s style/);assert.equal((html.match(/<li>/g)||[]).length,3);
 assert.match(html,/data-plan="ideas">Write ideas · a few cents/);assert.doesNotMatch(html,/data-plan-pick/);
});
test('working: stage and indeterminate progress, no paid actions',()=>{
 const html=renderReelPlan({state:'working',stage:'Jev is judging the ideas',plan});
 assert.match(html,/role="status"/);assert.match(html,/Jev is judging/);assert.match(html,/<progress[^>]*>/);assert.doesNotMatch(html,/<progress[^>]*value=|data-plan-pick|data-plan="ideas"/);
 assert.match(renderReelPlan(null,{loading:true}),/Loading your reel plan/);
});
test('ideas: preserves ranked indexes, three score bars per card and chosen highlight',()=>{
 const html=renderPlanIdeas(plan);
 assert.equal((html.match(/<meter /g)||[]).length,6);assert.match(html,/value="2.1"[^>]*>2.1\/3/);
 assert.match(html,/Fit to winners/);assert.match(html,/AI-ready/);assert.match(html,/aria-label="Hook"/);
 assert.ok(html.indexOf('The spoon trick')<html.indexOf('Another idea'));assert.match(html,/plan-idea plan-chosen"><h4>Another idea/);
 assert.match(html,/data-plan-pick="1" aria-pressed="true"/);assert.match(html,/“Watch this move”/);assert.match(html,/What the hands show/);
});
test('removed ideas are collapsed and include title and reason, even if none passed',()=>{
 const html=renderPlanIdeas({...plan,picked:[]});
 assert.match(html,/<details class="plan-removed"><summary>Removed by Jev \(1\)/);assert.match(html,/A cure<\/strong> · health claim/);
 assert.match(html,/No ideas passed/);assert.match(html,/data-plan="ideas"/);
});
test('script table: voiceover joins by shot ID, multiple lines kept, silent shot marked',()=>{
 const html=renderPlanScript(script,check),rows=[...html.matchAll(/<tr>(.*?)<\/tr>/gs)].slice(1).map(m=>m[1]);
 assert.equal(rows.length,3);assert.match(rows[0],/4 s[\s\S]*Top-down[\s\S]*Turn the spoon[\s\S]*Watch closely[\s\S]*Then turn/);assert.doesNotMatch(rows[0],/Lift now/);
 assert.match(rows[1],/Lift now/);assert.match(rows[2],/<td>—<\/td>/);assert.match(html,/<h2>Watch the spoon/);assert.match(html,/plan-pill">SPOON/);assert.match(html,/Try it #spoon/);
});
test('checks: four passing pills; failures map to their own pill and retain risky shots',()=>{
 assert.equal((renderPlanChecks(check).match(/plan-pass/g)||[]).length,4);
 const html=renderPlanChecks({...check,pass:false,rewritten:true,emotion:'mixed',riskyShots:['s2'],problems:['Does not start mid-action','No clear action for the viewer','States a health claim as fact','Feeling is mixed, not one clear feeling','Shot s2 is risky for AI video']});
 assert.equal((html.match(/plan-fail/g)||[]).length,5);assert.doesNotMatch(html,/plan-pass/);assert.match(html,/One feeling · mixed: Feeling is mixed/);assert.match(html,/Rewritten once after Jev’s review/);
 const mixed=renderPlanChecks({...check,pass:false,problems:['States a health claim as fact']});assert.equal((mixed.match(/plan-pass/g)||[]).length,3);assert.match(mixed,/plan-fail">! No health claim: States a health claim as fact/);
 assert.match(renderPlanChecks(null),/Waiting for Jev/);
});
test('price: both totals, retry allowances, radio choice, permanently disabled maker',()=>{
 const html=renderPlanPrice(price,{quality:'fast'});
 assert.match(html,/Standard quality · 30 credits/);assert.match(html,/Up to 55 if every shot needs one retry/);assert.match(html,/Fast mode · 20 credits/);assert.match(html,/Up to 35/);
 assert.match(html,/data-plan-quality="fast" value="fast" checked/);assert.doesNotMatch(html,/value="standard" checked/);
 assert.match(html,/data-plan="make" disabled/);assert.match(html,/Next step: the maker is being built. Nothing is spent until you press it./);
 assert.match(renderReelPlan({state:'ready',plan:{...plan,script,check,price}}),/plan-script[\s\S]*plan-price/);
});
test('failed action: exact server error, explicit retry, and Secret navigation',()=>{
 const html=renderReelPlan({state:'failed',error:'Build the Secret for this account first'},{lastAction:{action:'ideas'}});
 assert.match(html,/Build the Secret for this account first/);assert.match(html,/data-plan="retry">Try again/);assert.match(html,/data-plan="secret">Open 03 Secret/);
 const read=renderReelPlan({state:'working'},{error:'Could not read status'});assert.match(read,/Could not read status/);assert.match(read,/data-plan="refresh"/);assert.doesNotMatch(read,/data-plan="retry"/);
});
test('busy: paid buttons and quality choices disabled through repaint',()=>{
 const html=renderReelPlan({state:'ready',plan:{...plan,price}},{busy:true});
 assert.equal((html.match(/data-plan-pick="\d"[^>]* disabled/g)||[]).length,2);assert.equal((html.match(/data-plan-quality="[^"]+"[^>]* disabled/g)||[]).length,2);
 assert.match(renderReelPlan({state:'none'},{busy:true}),/data-plan="ideas" disabled/);
 assert.match(renderReelPlan({state:'failed',error:'Oops'},{busy:true,lastAction:{action:'script',index:1}}),/data-plan="retry" disabled/);
});
test('escapes model text and account names throughout every screen',()=>{
 const bad='<b>"hello" & bye</b>',escaped='&lt;b&gt;&quot;hello&quot; &amp; bye&lt;/b&gt;';
 const html=renderReelPlan({state:'ready',plan:{...plan,picked:[{idea:{title:bad,hook_line:bad,demo:bad},scores:{fit:bad}}],rejected:[{idea:{title:bad},reason:bad}],script:{...script,hook_title:bad,keyword:bad,caption:bad,shots:[{id:'s1',seconds:bad,camera:bad,visual:bad}],voiceover:[{shot:'s1',line:bad}]},check:{...check,pass:false,emotion:bad,problems:[bad]},price:{...price,total:bad}}});
 assert.doesNotMatch(html,/<b>"hello"/);assert.ok(html.split(escaped).length>12);assert.match(html,/value="0"/);
 assert.ok(renderReelPlan({state:'none'},{account:bad}).includes(escaped));assert.ok(renderReelPlan({state:'failed',error:bad}).includes(escaped));assert.ok(renderReelPlan({state:'working',stage:bad}).includes(escaped));
});

import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf('const reelPlans=new Map()'),app.indexOf('// Film it yourself:'));
function harness(){
 const requests=[],timers=new Map(),events={},node={html:'',addEventListener:(event,fn)=>events[event]=fn};let timer=0,secretClicks=0;
 const ctx=createContext({job:{id:'a',creator:'chef'},currentView:'studio',studioMode:'new',renderReelPlan,
  $:selector=>selector==='#secret-view-button'?{click:()=>secretClicks++}:node,paint:(el,html)=>el.html=html,toast:()=>{},
  setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),
  api:(path,data)=>new Promise((resolve,reject)=>requests.push({path,data,resolve,reject}))});
 runInContext(controller,ctx);
 return {ctx,node,requests,timers,events,secretClicks:()=>secretClicks,run:code=>runInContext(code,ctx),click:dataset=>events.click({target:{closest:()=>({dataset,disabled:false})}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('controller: opening only reads; double clicks cannot submit twice; polling is 2 seconds and stops on exit',async()=>{
 const h=harness();h.run('openReelPlan()');assert.equal(h.requests.length,1);assert.equal(h.requests[0].data,undefined);
 h.requests[0].resolve({state:'none'});await tick();const paid=h.click({plan:'ideas'});await h.click({plan:'ideas'});
 assert.equal(h.requests.length,2);assert.equal(h.requests[1].data.confirm,true);assert.match(h.node.html,/data-plan="ideas" disabled/);
 h.requests[1].resolve({state:'working',stage:'Writing ideas'});await paid;assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].ms,2000);
 h.run('stopReelPlan()');assert.equal(h.timers.size,0);
});
test('controller: leaving and returning drops an older GET; runs and quality stay independent',async()=>{
 const h=harness();h.run('openReelPlan(); stopReelPlan(); openReelPlan()');
 h.requests[1].resolve({state:'ready',plan:{...plan,price}});await tick();h.requests[0].resolve({state:'none'});await tick();assert.match(h.node.html,/Choose your idea/);
 h.events.change({target:{dataset:{planQuality:'fast'}}});h.run("job={id:'b',creator:'b'};openReelPlan()");
 h.requests[2].resolve({state:'none'});await tick();assert.match(h.node.html,/@b’s style/);assert.doesNotMatch(h.node.html,/Choose your idea/);
 h.run("job={id:'a',creator:'chef'};openReelPlan()");h.requests[3].resolve({state:'ready',plan:{...plan,price}});await tick();assert.match(h.node.html,/value="fast" checked/);
});
test('controller: late paid reply cannot repaint or poll a different run; retry remembers script index',async()=>{
 const h=harness();h.run('openReelPlan()');h.requests[0].resolve({state:'ready',plan});await tick();const paid=h.click({planPick:'1'});
 assert.equal(h.requests[1].data.index,1);h.run("job={id:'b',creator:'b'};openReelPlan()");h.requests[2].resolve({state:'none'});await tick();
 h.requests[1].resolve({state:'working',stage:'Writing the script'});await paid;assert.match(h.node.html,/@b’s style/);assert.equal(h.timers.size,0);
 h.run("job={id:'a',creator:'chef'};openReelPlan()");h.requests[3].resolve({state:'failed',stage:'Writing the script',error:'Script failed',plan});await tick();
 const retry=h.click({plan:'retry'});assert.match(h.requests[4].path,/\/a\/reel-plan\/script$/);assert.equal(h.requests[4].data.index,1);h.requests[4].resolve({state:'working'});await retry;
});
test('controller: failed status polling retries GET, never repeats a paid POST',async()=>{
 const h=harness();h.run('openReelPlan()');h.requests[0].resolve({state:'working',stage:'Writing ideas'});await tick();
 const timer=[...h.timers.values()][0];timer.fn();h.requests[1].reject(new Error('Connection lost'));await tick();assert.match(h.node.html,/Connection lost/);
 await h.click({plan:'refresh'});assert.equal(h.requests.length,3);assert.equal(h.requests[2].data,undefined);h.requests[2].resolve({state:'ready',plan});await tick();assert.match(h.node.html,/Choose your idea/);
});
test('controller: server prerequisite error survives repaint and Secret link uses existing tab button',async()=>{
 const h=harness();h.run('openReelPlan()');h.requests[0].resolve({state:'none'});await tick();const paid=h.click({plan:'ideas'});
 h.requests[1].reject(new Error('Build the Secret for this account first'));await paid;h.run('openReelPlan()');assert.match(h.node.html,/Build the Secret for this account first/);
 await h.click({plan:'secret'});assert.equal(h.secretClicks(),1);assert.equal(h.requests.length,2);
});

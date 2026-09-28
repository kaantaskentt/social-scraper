// The page fixes from the 2026-09-29 audit (finding numbers in each test's name): honest prices and labels, stopped
// scans, finished reels only, keyed redraws that keep a playing video, and the accessibility gaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderKit,renderScan,renderWinners,renderSecret,renderMake,renderReady,renderConfirmLook,renderChannelPreview,renderKitPrice,renderKitHero,
 kitEstimate,topWinners,whyTag,readyReels,scanState,syncRuns,morph,morphChildren,syncPlay,copyAnnouncement} from '../public/flow-views.mjs';
import {estimateKit,FORMATS} from '../lib/kit.mjs';
import {MECHANISMS} from '../public/secret-mechanisms.mjs';

const kitSaved=(o={})=>({format:'ai_host',byJev:true,formatWhy:'why',cast:1,costUsd:0.57,approved:true,
 kit:{name:'Kitchen Check',promise:'p',cast:[{name:'Rhea',role:'r',outfit:'o',voice:'v'}],place:'A kitchen',palette:[],sound:{},assets:[]},
 pictures:[{role:'face0',label:'Rhea: face',url:'/f.jpg',check:{pass:true,problems:[]}},{role:'place',label:'The place',url:'/p.jpg',check:{pass:true,problems:[]}}],...o});

test('#17 the build button says "about" for the expected cost and gives the real cap separately',()=>{
 const html=renderKit({account:'ken',status:{state:'none',estimate:estimateKit('ai_host',2)}});
 assert.match(html,/Build my look · about \$1\.01/);assert.doesNotMatch(html,/Build my look · up to/);assert.match(html,/Up to \$1\.98 if pictures fail their check/);
});

test('#32 every paid kit rebuild shows its price; the page price matches the engine for every format',()=>{
 for(const f of Object.keys(FORMATS))for(const cast of [1,2])assert.deepEqual(kitEstimate(f,cast),estimateKit(f,cast),`${f} ${cast}`);
 const html=renderKit({account:'ken',status:{state:'done',saved:kitSaved(),estimate:estimateKit('ai_host',1)}});
 assert.match(html,/data-kit-format="hands_pov" data-usd="0\.38">Hands only · about \$0\.38/);assert.match(html,/data-kit-format="animated" data-usd="0\.66">Animated · about \$0\.66/);
 assert.match(html,/data-act="kit-character" data-usd="0\.66">New host · about \$0\.66/);
 // From a hands-only look the host count is not known yet: the price assumes two hosts, never fewer.
 const hands=renderKit({account:'ken',status:{state:'done',saved:kitSaved({format:'hands_pov',kit:{...kitSaved().kit,cast:[]}}),estimate:estimateKit('hands_pov',1)}});
 assert.match(hands,new RegExp(`AI host · about \\$${estimateKit('ai_host',2).usd.toFixed(2)}`));
 const choose={stage:'choose',format:'ai_host',cast:1,costUsd:0.45,kit:{name:'K',promise:'p'},options:{casts:[{hosts:[{name:'Mira',outfit:'x',picture:{url:'/a.jpg',check:{pass:true}}}],score:2}],places:[{text:'Kitchen',score:2,picture:{url:'/p.jpg',check:{pass:true}}}],pick:{cast:{index:0,why:'w'},place:{index:0,why:'w'}}}};
 assert.match(renderKit({account:'ken',status:{state:'done',saved:choose,estimate:estimateKit('ai_host',1)}}),/data-act="kit-character">Show me other options · about \$0\.66/);
});

test('#18 winners are reels labelled winner (at least 2x), not every reel above 1x; none says so plainly',()=>{
 const posts=['a','b','c','d'].map(id=>({id}));
 const results={a:{quadrant:'star',xNormal:1.1,label:'normal',reach:10},b:{quadrant:'billboard',xNormal:2.4,label:'winner',reach:20},c:{quadrant:'insufficient',xNormal:6,label:'big_winner',reach:30},d:{quadrant:'star',xNormal:3,label:'normal',reach:5}};
 assert.deepEqual(topWinners(posts,results,{hasVideo:()=>true}).map(w=>w.id),['c','b']);
 assert.deepEqual(topWinners(posts,results,{hasVideo:p=>p.id!=='c'}).map(w=>w.id),['b']);
 const html=renderWinners({account:'ken',winners:[{id:'b',image:'/i',xNormal:2.4,reach:20}]});assert.match(html,/at least 2× the views/);assert.doesNotMatch(html,/many more views/);
 assert.match(renderWinners({account:'ken',winners:[]}),/No reel with a saved video got at least 2×/);
});

test('#20 an Instagram statement is tagged "Instagram says", never "Proven by research", and says only what the source says',()=>{
 assert.deepEqual(whyTag('stop_in_3_seconds',MECHANISMS.stop_in_3_seconds),{line:'Instagram counts who leaves in the first 3 seconds.',tag:'Instagram says',cls:'platform'});
 assert.equal(whyTag('watch_time',MECHANISMS.watch_time).tag,'Instagram says');
 assert.equal(whyTag('story_transport',MECHANISMS.story_transport).tag,'Proven by research');assert.equal(whyTag('curiosity_gap',MECHANISMS.curiosity_gap).tag,'Backed by research');
 const saved={secret:{headline:'H',why:[{mechanism:'stop_in_3_seconds'}],critique:[]},stats:{house:[],differences:[],numbers:{}}};
 const html=renderSecret({account:'ken',status:{state:'done',saved},imageFor:id=>id});
 assert.match(html,/Instagram counts who leaves in the first 3 seconds\.<\/p><span class="tag tag-platform">Instagram says/);assert.doesNotMatch(html,/Proven by research|decide in 3 seconds/);
});

test('#29 Ready to post lists only finished reels; one still being made (no video yet) is left out',()=>{
 const reels=[{id:'done',url:'/d.mp4',title:'Done',caption:'c',seconds:20,spentUsd:2},{id:'making',title:'Making',spentUsd:0.8}];
 assert.deepEqual(readyReels(reels).map(r=>r.id),['done']);assert.deepEqual(readyReels(undefined),[]);
 const html=renderReady({reels});assert.doesNotMatch(html,/href="" download|src="#t=|data-reel="making"/);assert.match(html,/data-reel="done"/);
 assert.match(renderReady({reels:[reels[1]]}),/Nothing ready yet/);
});

test('#30 a failed, paused, cut-off or never-started scan says why and offers to resume, instead of "Scanning…" forever',()=>{
 const job=(status,o={})=>({id:'a',creator:'x',status,limit:100,posts:[{id:'1',analysis:{}},{id:'2'}],error:null,...o});
 assert.deepEqual(scanState(job('complete')),{state:'done'});assert.equal(scanState(job('running')).state,'running');assert.equal(scanState(null),null);
 for(const s of ['failed','paused','interrupted','ready'])assert.equal(scanState(job(s)).state,'stopped',s);
 const p=scanState(job('failed',{error:'Connect Apify in Connections first'}));assert.equal(p.done,1);assert.equal(p.total,2);
 const html=renderScan({run:{id:'a',creator:'x',count:2},progress:p});
 assert.match(html,/The scan stopped: @x/);assert.match(html,/Connect Apify in Connections first/);assert.match(html,/data-act="scan-resume">Resume the scan/);
 assert.doesNotMatch(html,/Scanning @x|data-step="winners"/);
});

// A small stand-in for the DOM: elements with attributes and children, enough for morph.
class Text{constructor(v){this.nodeType=3;this.nodeName='#text';this.nodeValue=v;this.parentNode=null;}isEqualNode(o){return o.nodeType===3&&o.nodeValue===this.nodeValue;}replaceWith(n){swap(this,n);}remove(){detach(this);}}
class El{
 constructor(tag,attrs={},kids=[]){this.nodeType=1;this.nodeName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.childNodes=[];this.parentNode=null;this.checked=this.attrs.has('checked');for(const k of kids)this.appendChild(typeof k==='string'?new Text(k):k);}
 get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
 getAttribute(n){return this.attrs.has(n)?this.attrs.get(n):null;}setAttribute(n,v){this.attrs.set(n,String(v));}removeAttribute(n){this.attrs.delete(n);}hasAttribute(n){return this.attrs.has(n);}
 appendChild(n){detach(n);n.parentNode=this;this.childNodes.push(n);return n;}replaceWith(n){swap(this,n);}remove(){detach(this);}isEqualNode(o){return out(this)===out(o);}
}
const detach=n=>{const p=n.parentNode;if(p){p.childNodes.splice(p.childNodes.indexOf(n),1);n.parentNode=null;}};
const swap=(a,b)=>{detach(b);const p=a.parentNode;p.childNodes[p.childNodes.indexOf(a)]=b;b.parentNode=p;a.parentNode=null;};
const out=n=>n.nodeType===3?n.nodeValue:`<${n.nodeName}${[...n.attrs].map(([k,v])=>` ${k}="${v}"`).join('')}>${n.childNodes.map(out).join('')}</${n.nodeName}>`;
const h=(tag,attrs,...kids)=>new El(tag,attrs,kids);
const done=id=>h('div',{class:'ig-cell copy-tile is-done','data-tile':id},h('video',{src:`/${id}.mp4#t=1`,controls:''}));
const working=(id,pct)=>h('div',{class:'ig-cell copy-tile is-working','data-tile':id,style:`--p:${pct}`},h('img',{src:`/${id}.jpg`}),h('b',{'data-live':'pct'},`${pct}%`));
const studio=(tiles,{compare=false,busy=false}={})=>h('main',{},h('section',{class:'block'},h('div',{class:'card ig rise'},h('div',{class:'ig-grid copy-grid'},...tiles)),'\n',
 h('div',{class:'hero-cta'},h('button',busy?{'data-act':'copy-compare',disabled:''}:{'data-act':'copy-compare'},'Compare')),...(compare?[h('div',{class:'cmp-grid'},h('div',{class:'cmp-col'},h('video',{'data-orig':'a',src:'/o.mp4'})))]:[])));

test('#31 #52 a tile that changes is swapped alone: a playing copy video and the animated card are kept as they are',()=>{
 const page=studio([done('a'),working('b',40)]),card=page.childNodes[0].childNodes[0],playing=card.childNodes[0].childNodes[0].childNodes[0];
 morphChildren(page,studio([done('a'),done('b')],{busy:true}));
 assert.equal(page.childNodes[0].childNodes[0],card,'the rising card is the same element, so it does not animate again');
 assert.equal(card.childNodes[0].childNodes[0].childNodes[0],playing,'the video being watched is the same element');
 assert.equal(out(page),out(studio([done('a'),done('b')],{busy:true})),'and the page now matches the new HTML');
 // Opening the compare panel adds it below; the originals are then kept too while tiles change.
 morphChildren(page,studio([done('a'),done('b')],{compare:true}));const orig=page.childNodes[0].childNodes[3].childNodes[0].childNodes[0];
 assert.equal(card.childNodes[0].childNodes[0].childNodes[0],playing);assert.equal(orig.getAttribute('data-orig'),'a');
 morphChildren(page,studio([done('a'),working('b',10)],{compare:true}));assert.equal(page.childNodes[0].childNodes[3].childNodes[0].childNodes[0],orig);
 // Keys never cross: tile "a" is not turned into tile "c".
 const before=page.childNodes[0].childNodes[0].childNodes[0].childNodes[0];morph(before,done('c'));assert.equal(before.parentNode,null);
});

test('#52 ticking a pick keeps the checkbox element (and so its focus), and only its state changes',()=>{
 const pick=(id,on)=>h('label',{class:`card pick rise${on?'':' is-off'}`},h('input',on?{type:'checkbox','data-copy-pick':id,checked:''}:{type:'checkbox','data-copy-pick':id}));
 const page=h('main',{},h('div',{class:'pick-grid'},pick('a',true),pick('b',true))),box=page.childNodes[0].childNodes[0].childNodes[0];
 morphChildren(page,h('main',{},h('div',{class:'pick-grid'},pick('a',false),pick('b',true))));
 assert.equal(page.childNodes[0].childNodes[0].childNodes[0],box);assert.equal(box.checked,false);assert.equal(page.childNodes[0].childNodes[0].getAttribute('class'),'card pick rise is-off');
});

test('#34 the page is no longer one big live region; a small status says only real changes',()=>{
 const html=readFileSync(new URL('../public/flow.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/<main[^>]*aria-live/);assert.match(html,/id="live"[^>]*role="status"/);
 const batch=(pct,states,left=90)=>({batch:{pct,left,items:states.map((state,i)=>({postId:String(i),state,left}))}});
 assert.equal(copyAnnouncement(batch(12,['working','waiting'])),'Making 2 copies: 0 made, about 0% done.');
 assert.equal(copyAnnouncement(batch(20,['working','waiting'],30)),copyAnnouncement(batch(12,['working','waiting'])),'a ticking ETA is not announced');
 assert.equal(copyAnnouncement(batch(55,['done','working'])),'Making 2 copies: 1 made, about 50% done.');
 assert.equal(copyAnnouncement(batch(100,['done','failed'])),'1 of 2 copies made. 1 stopped.');
 assert.equal(copyAnnouncement({picking:{state:'working',stage:'Studying 3 of 5'}}),'Picking the winners to copy.');assert.equal(copyAnnouncement(null),'');
});

test('#46 the reel price is labelled as the video only; the checks and voices are said to cost extra',()=>{
 assert.match(renderReady({reels:[{id:'a',url:'/a.mp4',seconds:22,spentUsd:2.17}]}),/22 s · video \$2\.17, checks extra/);
 const price={usd:2.08,maxUsd:4.16,parts:2,partSeconds:10};
 assert.match(renderKitPrice(price,{busy:false}),/checks and voices cost a little extra/);
 const plan={picked:[{idea:{title:'T'}}],chosen:0,script:{hook_title:'H',parts:[{beats:[]}]},price,check:{}};
 assert.match(renderKitHero(plan),/For the video\. Up to \$4\.16 if a part is redone[\s\S]*checks and voices cost a little extra/);
});

test('#47 #60 the ideas card promises what the engine makes: up to 12 ideas for a look, up to 8 without',()=>{
 assert.match(renderMake({account:'k',plan:{state:'none'},kit:{approved:true,createdAt:'K',kit:{cast:[]}}}),/Up to 12 ideas for your look/);
 const hands=renderMake({account:'k',plan:{state:'none'}});assert.match(hands,/Up to 8 ideas in the winners&#39;|Up to 8 ideas in the winners' style/);assert.doesNotMatch(hands,/4 ideas/);
});

test('#54 a finished scan with nothing scored says why instead of a "See the winners" button that does nothing',()=>{
 const run={id:'a',creator:'x',count:100};
 assert.match(renderScan({run,progress:{state:'done'},scored:true}),/data-step="winners"/);
 const none=renderScan({run,progress:{state:'done'},scored:false});assert.doesNotMatch(none,/data-step="winners"/);assert.match(none,/Not enough reels with view and comment counts to find winners/);
 assert.match(renderScan({run,progress:{state:'done'},scored:false,scoreError:'Server busy'}),/Could not score the reels: Server busy/);
});

test('#55 the account list follows the loaded run',()=>{
 const runs=[{id:'a',creator:'x',count:0,status:'running'},{id:'b',creator:'y',count:5,status:'complete'}];
 assert.deepEqual(syncRuns(runs,{id:'a',status:'complete',posts:[{},{}]}),[{id:'a',creator:'x',count:2,status:'complete'},runs[1]]);assert.equal(syncRuns(runs,null),runs);
});

test('#57 "Play both together" plays the copy with sound, and pausing or ending one stops both, restores the sound and unlinks them',async()=>{
 const video=()=>({muted:false,currentTime:7,paused:true,onpause:null,onended:null,play(){this.paused=false;return Promise.resolve();},pause(){if(this.paused)return;this.paused=true;queueMicrotask(()=>this.onpause?.());}});
 const orig=video(),copy=video(),pair=syncPlay(orig,copy);await pair.started;
 assert.equal(orig.currentTime,0);assert.equal(orig.muted,true);assert.equal(copy.muted,false);assert.equal(copy.paused,false);
 copy.pause();await new Promise(r=>setTimeout(r,0));
 assert.equal(orig.paused,true,'pausing one pauses the other');assert.equal(orig.muted,false,'the original has its sound back');assert.equal(orig.onpause,null);assert.equal(copy.onpause,null);
 await orig.play();orig.pause();await new Promise(r=>setTimeout(r,0));await copy.play();assert.equal(copy.paused,false,'no longer linked');
});

test('#58 on phones the step names are hidden only visually, so each step button keeps its name',()=>{
 const css=readFileSync(new URL('../public/flow.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\.step-label\{display:none\}/);assert.match(css,/\.step-label\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/);
});

test('#59 icon-only controls have names: the voice button and the reel links',()=>{
 const k={kit:{cast:[{name:'Felix'}]},voices:{Felix:{sample:'/v.wav'}},pictures:[{role:'face0',url:'/f.jpg'}]};
 assert.match(renderConfirmLook(k),/data-voice="\/v\.wav" aria-label="Hear Felix">▶/);
 assert.match(renderChannelPreview({kit:{name:'N',promise:'p',cast:[]},pictures:[]},{reels:[{url:'/r.mp4'}]}),/class="ig-cell"[^>]*aria-label="Open reel"/);
});

test('#61 at phone width long buttons may wrap, the track field can shrink and a long handle is cut, not the page widened',()=>{
 const css=readFileSync(new URL('../public/flow.css',import.meta.url),'utf8');
 assert.match(css,/\.track-row input\{[^}]*min-width:0;flex:1\}/);assert.doesNotMatch(css,/min-width:200px/);
 assert.match(css,/\.acct-now\{[^}]*min-width:0;overflow:hidden;text-overflow:ellipsis/);assert.match(css,/@media\(max-width:600px\)\{\.kit-actions \.btn,\.hero-cta \.btn\{white-space:normal/);
});

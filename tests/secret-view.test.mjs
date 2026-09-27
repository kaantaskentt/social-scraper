import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSecret} from '../public/secret-view.mjs';
const img=id=>`/media/run1/${id}`;

test('before building: what it does, the price on the button, and nothing is spent until pressed',()=>{
 const html=renderSecret({state:'none',plan:{usd:0.284,reels:30,seconds:1260,winners:15,flops:15}},{account:'ken.remedie',imageFor:img});
 assert.match(html,/Why @ken\.remedie wins/);assert.match(html,/data-secret="build"[^>]*>Build the Secret · about \$0\.28/);assert.match(html,/15 best and 15 weakest/);assert.match(html,/Nothing is spent until you press/);
 assert.match(renderSecret({state:'none',plan:{error:'needs at least 8'}},{account:'x',imageFor:img}),/needs at least 8/);
 assert.doesNotMatch(renderSecret({state:'none',plan:{error:'e'}},{account:'x',imageFor:img}),/data-secret="build"/);
});

test('while building: the step and progress; after a failure: the reason and a cheap retry',()=>{
 const b=renderSecret({state:'building',stage:'Watching reels',done:12,total:30},{account:'k',imageFor:img});
 assert.match(b,/Watching reels/);assert.match(b,/12 of 30/);assert.match(b,/value="12" max="30"/);
 const f=renderSecret({state:'failed',error:'Gemini: HTTP 500 <b>',plan:{usd:0.2,reels:30}},{account:'k',imageFor:img});
 assert.match(f,/HTTP 500 &lt;b&gt;/);assert.match(f,/data-secret="build"/);assert.match(f,/already watched are not paid again/);
});

const saved={account:'ken.remedie',createdAt:'2026-09-27T10:00:00Z',costUsd:0.27,dropped:['setting'],picked:Array.from({length:30},(_,i)=>({id:`r${i}`,group:i<15?'winner':'flop'})),
 stats:{house:[{question:'look',value:'doctor_or_expert',count:27,total:30}],differences:[{question:'opening',value:'bold_claim',winners:9,flops:3,perSide:15,evidence:['r1']}],numbers:{seconds:{winners:38,flops:61},secondsPerShot:{winners:2.1,flops:4.5}}},
 secret:{headline:'A doctor <i>look</i> and a bold first line.',person:{text:'Looks like a doctor',evidence:['r1','r2']},setting:null,format:{text:'Demonstration',evidence:['r3']},script:{text:'Claim first',evidence:['r1']},sound:{text:'Voice',evidence:['r1']},pace:{text:'Fast',evidence:['r1']},
  differences:[{claim:'Bold first line: 9 of 15 best, 3 of 15 weakest',evidence:['r1','r4']}],recipe:[{step:'Wear a white coat',evidence:['r2']}],
  why:[{mechanism:'disgust_memory',pattern:'Gross foam <b> first',evidence:['r1']}],critique:[{point:'Check the health claims before copying',kind:'risk',evidence:['r2']}]}};

test('the finished page: headline, formula cards with playable proof, house style and differences with counts, the recipe',()=>{
 const html=renderSecret({state:'done',saved},{account:'ken.remedie',imageFor:img});
 assert.match(html,/A doctor &lt;i&gt;look&lt;\/i&gt; and a bold first line\./);
 assert.match(html,/Person[\s\S]*Looks like a doctor[\s\S]*data-secret-play="r1"[\s\S]*data-secret-play="r2"/);
 assert.doesNotMatch(html,/class="secret-card-label">Setting</,'a part without proof is not shown');
 assert.match(renderSecret({state:'done',saved:{...saved,droppedWhy:[{part:'person',text:'An <i>x</i>',reason:'ethnicity or race'}]}},{account:'k',imageFor:img}),/1 part removed by the honesty check[\s\S]*ethnicity or race<\/b>: An &lt;i&gt;x/);assert.match(html,/1 part removed because it had no proof/);
 assert.match(html,/Like a doctor, scientist or expert[\s\S]*27 of 30 reels/);
 const named=renderSecret({state:'done',saved:{...saved,stats:{...saved.stats,house:[{question:'said_cta',value:'comment',count:25,total:30}],names:{said_cta:{title:'Words: Spoken CTA',values:{comment:'Comment or reply'}}}}}},{account:'k',imageFor:img});assert.match(named,/Comment or reply[\s\S]*25 of 30 reels/);
 assert.match(html,/A bold or surprising statement[\s\S]*9 of 15 best[\s\S]*3 of 15 weakest/);
 assert.match(html,/Length[\s\S]*38 s[\s\S]*61 s/);
 assert.match(renderSecret({state:'done',saved:{...saved,stats:{...saved.stats,numbers:{seconds:{winners:40,flops:42,clear:false},secondsPerShot:{winners:2,flops:4,clear:true}}}}},{account:'k',imageFor:img}),/Length <small>no clear gap<\/small>/);assert.match(html,/New shot every[\s\S]*2\.1 s[\s\S]*4\.5 s/);
 assert.match(html,/<ol class="secret-recipe" role="list">[\s\S]*Wear a white coat/);
 assert.match(html,/src="\/media\/run1\/r1"/);assert.match(html,/data-secret="rewrite"[^>]*>Write it again/);
 assert.match(renderSecret({state:'done',saved:{...saved,spentAllTime:0.33}},{account:'k',imageFor:img}),/cost \$0\.27 \(all builds \$0\.33\)/);
 assert.match(renderSecret({state:'done',saved:{...saved,secret:{...saved.secret,headline:null}}},{account:'k',imageFor:img}),/<h2>Why @ken\.remedie wins<\/h2>/);
});

test('why it works shows the mechanism, its evidence strength and source; the critique shows its kind',()=>{
 const html=renderSecret({state:'done',saved},{account:'ken.remedie',imageFor:img});
 assert.match(html,/Why it works on people[\s\S]*Disgust sticks[\s\S]*Moderate evidence[\s\S]*Gross foam &lt;b&gt; first[\s\S]*Chapman 2013/);
 assert.match(html,/Before you copy[\s\S]*Risk[\s\S]*Check the health claims before copying/);
});

const render=value=>renderSecret({state:'done',saved:value},{account:'ken.remedie',imageFor:img});
const block=(html,tag,className)=>html.match(new RegExp(`<${tag} class="${className}"[^>]*>[\\s\\S]*?</${tag}>`))?.[0];

test('three KPI tiles show the largest absolute gap, clear likes and the actual watched sample',()=>{
 const differences=[...saved.stats.differences,{question:'opening',value:'question',winners:2,flops:12,perSide:15}];
 const snapshot=JSON.stringify(differences);
 const html=render({...saved,stats:{...saved.stats,differences,numbers:{...saved.stats.numbers,likesPer1k:{winners:30.6,flops:18.6,clear:true}}}});
 const tiles=[...html.matchAll(/<article class="secret-kpi">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
 assert.equal(tiles.length,3);
 assert.match(tiles[0],/Biggest difference[\s\S]*2 vs 12[\s\S]*A question[\s\S]*of 15 best \/ of 15 weakest/);
 assert.match(tiles[1],/Likes per 1,000 views[\s\S]*30\.6 vs 18\.6[\s\S]*Best vs weakest/);
 assert.match(tiles[2],/15 best \+ 15 weakest[\s\S]*reels watched/);
 const comparison=block(html,'ul','secret-diffs');
 assert.ok(comparison.indexOf('A question')<comparison.indexOf('A bold or surprising statement'));
 assert.match(comparison,/2 of 15 best[\s\S]*12 of 15 weakest[\s\S]*\+10 weakest/);
 assert.match(comparison,/9 of 15 best[\s\S]*3 of 15 weakest[\s\S]*\+6 best/);
 assert.equal(JSON.stringify(differences),snapshot,'rendering does not reorder saved data');
});

test('KPI fallback picks the most common house-style fact when likes have no clear gap',()=>{
 const html=render({...saved,stats:{...saved.stats,house:[{question:'setting',value:'kitchen',count:22,total:30},...saved.stats.house],numbers:{...saved.stats.numbers,likesPer1k:{winners:20,flops:21,clear:false}}}});
 const tiles=[...html.matchAll(/<article class="secret-kpi">([\s\S]*?)<\/article>/g)];
 assert.match(tiles[1][1],/Most common pattern[\s\S]*27 of 30[\s\S]*Like a doctor/);
 assert.match(html,/Likes per 1,000 views <small>no clear gap<\/small>[\s\S]*20 best[\s\S]*21 weakest/);
 assert.match(render({...saved,stats:{...saved.stats,numbers:{seconds:{winners:40,flops:42,clear:false},secondsPerShot:{winners:6,flops:5,clear:false}}}}),/New shot every <small>no clear gap<\/small>/);
});

test('Before you copy follows the tiles; risks are not repeated in Watch-outs',()=>{
 const html=render({...saved,secret:{...saved.secret,critique:[...saved.secret.critique,{kind:'risk',point:'Another <risk>',evidence:['r2']},{kind:'weakness',point:'Too many pitches',evidence:['r1']},{kind:'opportunity',point:'Try clearer steps',evidence:['r2']}]}});
 const risk=block(html,'aside','secret-risk');
 assert.match(risk,/Before you copy[\s\S]*Check the health claims before copying[\s\S]*Another &lt;risk&gt;/);
 assert.ok(html.indexOf('class="secret-kpis"')<html.indexOf('class="secret-risk"'));
 assert.ok(html.indexOf('class="secret-risk"')<html.indexOf('class="secret-nav"'));
 const watchouts=html.match(/<section id="secret-watchouts"[\s\S]*?<\/section>/)[0];
 assert.match(watchouts,/Weak spot[\s\S]*Too many pitches[\s\S]*Opportunity[\s\S]*Try clearer steps/);
 assert.doesNotMatch(watchouts,/Check the health claims|Another &lt;risk&gt;/);
 assert.equal(html.split('Check the health claims before copying').length-1,1);
 assert.doesNotMatch(render({...saved,secret:{...saved.secret,critique:[]}}),/Before you copy/);
});

test('navigation follows the requested hierarchy, with valid section targets and footer honesty details',()=>{
 const html=render({...saved,droppedWhy:[{reason:'No support',text:'Unsupported claim'}]});
 const anchors=[...html.matchAll(/href="#([a-z-]+)"/g)].map(m=>m[1]);
 assert.deepEqual(anchors,['secret-formula','secret-why','secret-comparison','secret-recipe','secret-watchouts']);
 const positions=anchors.map(id=>html.indexOf(`<section id="${id}"`));
 assert.ok(positions.every((p,i)=>p>=0&&(!i||p>positions[i-1])));
 assert.ok(html.indexOf('class="secret-dropped"')>html.indexOf('data-secret="rewrite"'));
 assert.match(block(html,'ul','secret-diffs'),/How does it open\?[\s\S]*A bold or surprising statement/);
});

test('formula requires proof, caps thumbnails at four, and escapes text and attribute values',()=>{
 const html=render({...saved,secret:{...saved.secret,person:{text:'A <script> & person',evidence:['r" onclick="bad','r2','r3','r4','r5']},setting:{text:'Unsupported setting',evidence:[]},recipe:[{step:'Do <this>',evidence:['r1']}]},stats:{...saved.stats,names:{opening:{title:'A <question>',values:{bold_claim:'A <label>'}}}}});
 const formula=html.match(/<section id="secret-formula"[\s\S]*?<\/section>/)[0];
 const person=block(formula,'article','secret-card');
 assert.match(person,/A &lt;script&gt; &amp; person/);
 assert.match(person,/data-secret-play="r&quot; onclick=&quot;bad"/);
 assert.match(person,/src="\/media\/run1\/r&quot; onclick=&quot;bad"/);
 assert.equal((person.match(/data-secret-play=/g)||[]).length,4);
 assert.match(person,/secret-proof-label">Proof/);
 assert.doesNotMatch(formula,/Unsupported setting|data-secret-play="r5"/);
 assert.match(html,/A &lt;question&gt;/);assert.match(html,/A &lt;label&gt;/);assert.match(html,/Do &lt;this&gt;/);
});

test('missing comparison data has honest fallbacks and all navigation targets remain available',()=>{
 const html=render({...saved,stats:{house:[],differences:[],numbers:{}},secret:{headline:null,why:[],recipe:[],critique:[]}});
 assert.match(html,/No clear gap/);assert.match(html,/No shared pattern/);
 assert.match(html,/No comparable numbers available/);
 assert.match(html,/Nothing shared by 70% of reels/);
 assert.doesNotMatch(html,/NaN|undefined/);
 for(const id of ['secret-formula','secret-why','secret-comparison','secret-recipe','secret-watchouts'])assert.ok(html.includes(`id="${id}"`));
});

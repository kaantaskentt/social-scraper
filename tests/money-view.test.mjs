import test from 'node:test';
import assert from 'node:assert/strict';
import {reasonText,renderMoneyInspector,renderMoneyView} from '../public/money-view.mjs';

const reel=(id,quadrant='star',xNormal=12.1)=>({id,quadrant,xNormal,rate:8.8,label:'big_winner',ageDays:16,windowSize:30,windowMedianAgeDays:40,rateKind:'shrunk',keyword:'LIME',keywordChannel:'comment',keywordEvidence:'Comment LIME'});
const report=(results={})=>({manifest:{formula:'money-1.0',runId:'run1',observedAt:'2026-09-25T12:00:00Z'},versions:['money-1.0'],summary:{reels:100,reelsScored:79,winners:31,bigWinners:21,ctaShare:.99,reelsPerWeek:7.2,topKeywords:[{keyword:'LIME',reels:3,comments:520}]},results});

test('all bucket and quadrant reasons replace numbers with the specified plain explanation',()=>{
 const reasons={too_new:'Under 7 days old: still collecting plays.',short_history:'Needs at least 10 earlier reels to compare with. Pull more reels (30 or more).',too_few_plays:'Under 1,000 plays: too few to judge comments.',no_reach:'Plays are missing for this reel.',no_comments:'Comment count is missing.',unknown_observation:"Imported without a scrape time, so age can't be judged.",no_date:'Publish date is missing.'};
 for(const [code,text]of Object.entries(reasons)){
  assert.equal(reasonText(code),text);
  // A reel-level bucket means there is no score at all (as the API returns it).
  const html=renderMoneyInspector({...reel('a'),xNormal:null,rate:null,label:null,quadrant:'insufficient',bucket:code,rateBucket:code,quadrantReason:code});
  assert.ok(html.includes(text.replaceAll("'",'&#39;')));
  assert.doesNotMatch(html,/12\.1x|8\.8|NaN|undefined/);
 }
});

test('inspector shows API values, age context, label, keyword evidence, channel and box meaning',()=>{
 const html=renderMoneyInspector(reel('a'));
 for(const text of ['12.1x','its previous posts','Big winner','16 days old','30 earlier reels (median age 40 days)','8.8','comments per 1,000 plays','comment rate, keyword CTA present','LIME','comment','Comment LIME','Star','Lots of views and lots of comments. Copy these.'])assert.ok(html.includes(text),text);
 assert.match(renderMoneyInspector({...reel('a'),keywordChannel:'dm'}),/>DM</);
 for(const [label,text]of [['winner','Winner'],['normal','Normal'],['flop','Flop']])assert.ok(renderMoneyInspector({...reel('a'),label}).includes(text));
});

test('pooling, growth and reach disagreement are explained without changing the values',()=>{
 const html=renderMoneyInspector({...reel('a'),rateKind:'pooled',growth:{flag:'growing'},reachDisagree:true});
 assert.match(html,/not enough variation in earlier reels: this is the account's typical rate, not this reel's own/);
 assert.match(html,/This account is growing fast, so x numbers run high\./);
 assert.match(html,/Plays and views differ by more than 5%; plays are used\./);
 assert.match(html,/8\.8/);
 assert.match(renderMoneyInspector({...reel('a'),growth:{flag:'shrinking'}}),/This account is shrinking fast, so x numbers run low\./);
});

test('box order is Billboard, Star, Dud, Closer; reels sort descending and are capped at twelve',()=>{
 const results=Object.fromEntries(Array.from({length:15},(_,i)=>[`s${i}`,reel(`s${i}`,'star',i+1)]));
 results.bill=reel('bill','billboard');results.dud=reel('dud','dud');results.close=reel('close','closer');
 const html=renderMoneyView(report(results),{selected:'s14'});
 assert.deepEqual([...html.matchAll(/data-money-box="([^"]+)"/g)].map(m=>m[1]),['billboard','star','dud','closer']);
 const star=html.split('data-money-box="star"')[1].split('</article>')[0];
 assert.deepEqual([...star.matchAll(/data-money-inspect="([^"]+)"/g)].map(m=>m[1]),Array.from({length:12},(_,i)=>`s${14-i}`));
 assert.match(star,/15 reels/);assert.match(star,/\+3 more/);
 assert.match(star,/data-money-inspect="s14"[^>]*aria-pressed="true"/);
 assert.match(star,/<button class="money-thumbnail/);assert.match(star,/src="\/media\/run1\/s14"/);
});

test('captions, evidence, keywords, ids, versions and errors cannot insert HTML or attributes',()=>{
 const attack='<script>alert("x")</script> & \' onclick="bad',r={...reel(attack),keyword:attack,keywordEvidence:attack};
 const data=report({a:r});data.summary.topKeywords[0].keyword=attack;data.manifest.formula=attack;data.versions.push(attack);
 const html=renderMoneyView(data,{posts:[{id:attack,caption:attack}],error:attack})+renderMoneyInspector(r);
 assert.doesNotMatch(html,/<script>| onclick="bad/);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39; onclick=&quot;bad/);
 assert.match(renderMoneyInspector(null,{error:attack}),/Could not load money metrics: &lt;script&gt;/);
});

test('empty and zero-scored reports show an actionable note and no fabricated numbers',()=>{
 const data=report();Object.assign(data.summary,{reels:0,reelsScored:0,winners:0,bigWinners:0,ctaShare:null,reelsPerWeek:null,topKeywords:[]});data.manifest.observedAt=null;
 const html=renderMoneyView(data);
 assert.match(html,/No reel has enough history yet\. Pull 30 or more reels to get scores\./);
 assert.equal((html.match(/No reels in this box yet\./g)||[]).length,4);
 assert.match(html,/Not scored \(0\)/);assert.match(html,/No keyword CTAs found\./);assert.match(html,/unknown scrape time/);
 assert.doesNotMatch(html,/NaN|Infinity|undefined|Invalid Date/);
});

test('summary uses reported counts and preserves keyword order; measurement and unscored rows start collapsed',()=>{
 const data=report();data.summary.topKeywords.push({keyword:'GINGER',reels:2,comments:100});
 const html=renderMoneyView(data);
 for(const text of ['<strong>79</strong>','of 100 reels','<strong>31</strong>','21 big winners','<strong>99%</strong>','<strong>7.2</strong>','formula money-1.0','How this is measured','A comment is not a sale.','Only earlier reels count'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('<td>LIME</td>')<html.indexOf('<td>GINGER</td>'));
 assert.doesNotMatch(html,/<details[^>]*\sopen/);
 assert.doesNotMatch(html,/id="money-version"/);
 data.versions.push('money-1.1');assert.match(renderMoneyView(data),/id="money-version"/);
});

test('insufficient reels are grouped by reason and each remains selectable',()=>{
 const data=report({a:{...reel('a','insufficient'),bucket:'too_new',quadrantReason:'too_new',rateBucket:'too_new'},b:{...reel('b','insufficient'),bucket:'too_new'},c:{...reel('c','insufficient'),quadrantReason:'no_comments'}});
 const html=renderMoneyView(data);
 assert.match(html,/Not scored \(3\)/);
 assert.equal((html.match(/Under 7 days old: still collecting plays\./g)||[]).length,1);
 assert.match(html,/still collecting plays\. <small>\(2\)<\/small>/);
 assert.match(html,/Comment count is missing\./);
 for(const id of ['a','b','c'])assert.ok(html.includes(`data-money-inspect="${id}"`));
});

test('demo, loading, failure and missing reel states are explicit',()=>{
 for(const html of [renderMoneyView(report(),{demo:true}),renderMoneyInspector(reel('a'),{demo:true})]){assert.match(html,/Run a real analysis to see money metrics\./);assert.doesNotMatch(html,/\/media\/|money-version|12\.1/);}
 assert.match(renderMoneyView(null,{loading:true}),/Loading money metrics/);
 assert.match(renderMoneyView(null,{error:'Offline'}),/Could not load money metrics: Offline/);
 assert.match(renderMoneyInspector(null),/No money score is available for this reel yet/);
});

test('a scored reel without a comment rate keeps its x and explains only the missing part',()=>{
 const html=renderMoneyInspector({...reel('a'),rate:null,rateKind:null,rateBucket:'too_few_plays',quadrant:'insufficient',quadrantReason:'too_few_plays'});
 assert.match(html,/12\.1x/);assert.match(html,/Big winner/);assert.match(html,/Under 1,000 plays: too few to judge comments\./);assert.doesNotMatch(html,/8\.8|NaN|undefined|Star ·/);
 const noBox=renderMoneyInspector({...reel('a'),quadrant:'insufficient',quadrantReason:'short_history'});
 assert.match(noBox,/12\.1x/);assert.match(noBox,/8\.8/);assert.match(noBox,/Needs at least 10 earlier reels/);
});
test('invalid counts have their own plain reason, and evidence is not double-quoted',()=>{
 assert.equal(reasonText('invalid_counts'),'The counts for this reel look invalid, so it is not scored.');
 const html=renderMoneyInspector({...reel('a'),keywordEvidence:'Comment “Lime”'});assert.doesNotMatch(html,/“Comment “Lime””/);assert.match(html,/Comment “Lime”/);
});

test('axis labels match box positions: top row has more views, right column more comments',()=>{
 const html=renderMoneyView(report());
 assert.match(html,/more comments than usual →/);assert.match(html,/more views than its previous posts ↑/);
 assert.doesNotMatch(html,/more views than its previous posts →|more comments than usual ↑/);
});
test('summary line shows median plays, scored comments with their dates, growth, and the approximate scrape time',()=>{
 const data=report();Object.assign(data.summary,{medianReach:90416,cumulativeComments:233882,scoredFirstPublishedAt:'2026-08-26T00:00:00Z',scoredLastPublishedAt:'2026-09-17T00:00:00Z',growth:'growing'});
 const html=renderMoneyView(data);
 for(const text of ['90,416','233,882 comments on scored reels','Aug 26, 2026','Sep 17, 2026','growing fast','approximate scrape time'])assert.ok(html.includes(text),text);
});
test('"+N more" is a button; an expanded box shows every reel and offers "Show fewer"',()=>{
 const results=Object.fromEntries(Array.from({length:15},(_,i)=>[`s${i}`,reel(`s${i}`,'star',i+1)]));
 const closed=renderMoneyView(report(results)).split('data-money-box="star"')[1].split('</article>')[0];
 assert.match(closed,/<button[^>]*data-money-more="star"[^>]*>\+3 more<\/button>/);assert.equal((closed.match(/data-money-inspect=/g)||[]).length,12);
 const open=renderMoneyView(report(results),{expanded:new Set(['star'])}).split('data-money-box="star"')[1].split('</article>')[0];
 assert.equal((open.match(/data-money-inspect=/g)||[]).length,15);assert.match(open,/<button[^>]*data-money-more="star"[^>]*aria-expanded="true"[^>]*>Show fewer<\/button>/);
});

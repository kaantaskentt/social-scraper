import {filterPosts,groupPosts,summarize,sortExamples,rate} from './research.mjs';
import {renderMoneyView,renderMoneyInspector} from './money-view.mjs';
import {segmentAt,partRow,barPart} from './anatomy-view.mjs';
import {parseHandles} from './handles.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const openingLine=p=>{const text=p.analysis?.opening||p.transcript?.text||'';const sentence=text.match(/^.*?[.!?](?:\s|$)/s)?.[0]?.trim();return sentence||((text.length>180?text.slice(0,177)+'…':text));};
const title=s=>String(s??'unknown').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const compact=n=>n===null||n===undefined?'Unknown':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const money=(n,d=4)=>n===null?'Unknown':`$${n.toFixed(d)}`;
const colors=['#899967','#c58e65','#8babc0','#bf8585','#a39dc0','#81aaa0','#c2b275','#929789','#849d65','#bb9279'];
const roleColors={hook:'#b3c966',setup:'#a8b9b0',problem:'#cd937d',example:'#87a9bd',advice:'#889f70',payoff:'#b1a4c5',cta:'#d2b266',other:'#bcc2b4',unclear:'#bcc2b4'};
let boot,job,selected,dimension='mechanism',category='all',plot=[],groups=[],visible=[],replaying=false,replayToken=0,replayRevealed=new Set(),refreshTimer,metricsInitialized=false;
let compareKeys=new Set(),comparisonOpen=false,examplePage=0;
let currentView='explorer',moneyState,moneyExpanded=new Set(),lastPart=-1;
// Saved local videos for the loaded run (they keep playing after Instagram links expire).
let videoState={runId:null,saved:new Set(),info:null,timer:null};
const moneyFetchedAt=new Map();
const api=async(path,data)=>{const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':boot.token},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw new Error(v.error||'Request failed');return v;};
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,5500);}
const median=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeLink=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const imageURL=p=>job.synthetic?p.thumbnailUrl:`/media/${job.id}/${p.id}`;
const colorFor=value=>colors[Math.max(0,Object.keys(boot.dimensions[dimension].criteria).indexOf(value))%colors.length];
const value=p=>p.excludedReason?(p.status==='no_audio'?'no_audio':'too_little_speech'):p.analysis?.labels[dimension]?.value||(p.status==='failed'?'needs_retry':'unclassified');
function readStats(){
 const ps=job.posts;const completed=ps.filter(p=>p.analysis);const transcribed=ps.filter(p=>p.transcript);const excluded=ps.filter(p=>p.excludedReason).length;const failed=ps.filter(p=>p.status==='failed').length;
 $('#stat-collected').textContent=compact(ps.length);$('#stat-transcribed').textContent=job.synthetic?'Demo':compact(transcribed.length);$('#stat-classified').textContent=job.synthetic?'Demo':compact(completed.length);
 const paid=completed.filter(p=>!p.analysis.reused);const jevUnknown=paid.some(p=>p.analysis.costUsd===null);const jev=paid.reduce((s,p)=>s+(p.analysis.costUsd||0),0);
 const audioCosts=['groq','fireworks'].map(provider=>{const audio=transcribed.filter(p=>p.transcript.source===provider&&!p.transcript.reused);return audio.length?`${title(provider)} ${audio.some(p=>p.transcript.costUsd==null)?'unknown':`~${money(audio.reduce((sum,p)=>sum+p.transcript.costUsd,0),3)}`}`:null;}).filter(Boolean).join(' · ')||'Transcription $0';
 $('#stat-cost').textContent=job.synthetic?'Demo':jevUnknown?'Unknown':money(jev);
 $('#pipeline-progress').style.width=`${ps.length?completed.length/ps.length*100:0}%`;
 $('#pipeline-label').textContent=job.synthetic?'DEMO':`${job.status.toUpperCase()} · ${completed.length}/${ps.length}`;
 $('#cost-detail').textContent=job.synthetic?'Synthetic data · no API calls':`${audioCosts} · Apify ${money(job.costs.apify,3)} · ${job.retries||0} retries`;
 $('#notice').textContent=job.synthetic?'Demo data: everything below is made up for practice.':`@${job.creator} · ${ps.length} retrieved Reels · ${completed.length} classified${excluded?` · ${excluded} excluded from speech analysis`:""}${failed?` · ${failed} need retry`:""} · Metrics are a collection-time snapshot${job.retries?' · Cost estimates may omit uncertain retry charges':''}`;
 $('#focus-title').textContent=job.synthetic?'DEMO · SAMPLE DATA':`@${job.creator.toUpperCase()} / ${ps.length} REELS / SOCIAL SCRAPER`;$('#intro-copy').textContent=job.synthetic?'Scrape any account. See which reels win, what they say, and what to copy.':`${ps.length} reels collected. See which ones win, and why.`;$('#notice').classList.toggle('real',!job.synthetic);$('#run-label').textContent=job.synthetic?'SOCIAL SCRAPER':`RESEARCHING @${job.creator.toUpperCase()}`;
 $('#run-state').textContent=job.status;$('#run-error').textContent=job.error||'';
 $('#attach-form').hidden=!job.scrapeUncertain;
 $('#events').textContent=(job.events||[]).slice().reverse().map(e=>`${new Date(e.at).toLocaleTimeString()}  ${e.message}`).join('\n');
 const running=['running','scraping'].includes(job.status);$('#resume').hidden=job.synthetic||running;$('#pause').hidden=job.synthetic||!running;$('#export').hidden=job.synthetic;
 $('#run-note').textContent=job.synthetic?'Start a new analysis to see real accounts.':`${(job.elapsedMs/1000).toFixed(1)}s recorded processing · ${completed.filter(p=>p.analysis.review).length} need label review`;
}
function calculate(){
 const metric=$('#metric').value;
 visible=filterPosts(job.posts,{topic:$('#topic-filter').value,hook:$('#hook-filter').value,dimension,minAgeDays:+$('#age').value,minConfidence:+$('#confidence').value,maxDuration:+$('#duration').value,dedupe:$('#dedupe').checked});
 groups=groupPosts(visible,dimension,metric);const sort=$('#research-sort').value;groups.sort((a,b)=>(b[sort]??-Infinity)-(a[sort]??-Infinity)||b.n-a.n||a.key.localeCompare(b.key));
 plot=visible.filter(p=>p.analysis&&!p.excludedReason&&p[metric]>0&&p.likes!==null&&(category==='all'||value(p)===category)).map(p=>({post:p,x:p[metric],y:rate(p,'likes',metric)}));
}
function renderLegend(){
 const counts=new Map();for(const p of visible)counts.set(value(p),(counts.get(value(p))||0)+1);
 $('#legend').innerHTML=`<button data-category="all" class="${category==='all'?'active':''}">All patterns <b>${visible.length}</b></button>`+[...counts].sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<button data-category="${escape(k)}" class="${category===k?'active':''}"><i class="swatch" style="--color:${colorFor(k)}"></i>${title(k)} <b>${n}</b></button>`).join('');
 $('#legend').querySelectorAll('button').forEach(b=>b.onclick=()=>{stopReplay();category=b.dataset.category;examplePage=0;render();});
}
function makeTile(p){
 const b=document.createElement('button');b.className='tile';b.dataset.id=p.id;b.dataset.initial=p.creator?.[0]?.toUpperCase()||'?';b.setAttribute('aria-label',`Inspect Reel ${p.id}`);const img=document.createElement('img');img.src=imageURL(p);img.alt='';img.decoding='async';img.onerror=()=>b.classList.add('missing');b.append(img);const bar=document.createElement('span');bar.className='tile-color';b.append(bar);b.onclick=()=>selectPost(p.id);return b;
}
function buildTiles(){
 for(const [selector,posts] of [['#tiles',job.posts],['#map-tiles',job.posts.filter(p=>p.analysis&&!p.excludedReason)]]){
  const node=$(selector),wanted=new Set(posts.map(p=>p.id));for(const tile of [...node.children])if(!wanted.has(tile.dataset.id))tile.remove();
  const current=new Set([...node.children].map(n=>n.dataset.id));for(const p of posts)if(!current.has(p.id))node.append(makeTile(p));
 }
}
function layout(){
 if(!job)return;if(currentView==='money'){$('.inspector').style.maxHeight='';return;}const stage=$('#stage');if(document.body.classList.contains('focused')&&!document.body.classList.contains('portrait')&&innerWidth>760){const height=Math.max(330,Math.floor(innerHeight-(stage.getBoundingClientRect().top+scrollY)-48));if(stage.style.height!==`${height}px`)stage.style.height=`${height}px`;$('.inspector').style.maxHeight=`${height+70}px`;}else{stage.style.height='';$('.inspector').style.maxHeight='';}const w=stage.clientWidth,h=stage.clientHeight,stacked=w<680;stage.classList.add('map','simultaneous');
 const wallW=stacked?w:Math.floor(w*.43)-15,wallH=stacked?Math.floor(h*.36):h;
 const mapX=stacked?0:wallW+30,mapY=stacked?wallH+25:0,mapW=w-mapX,mapH=h-mapY;
 $('#wall-label').style.cssText='left:0;top:0';$('#map-label').style.cssText=`left:${mapX}px;top:${mapY}px`;
 $('#panel-divider').style.cssText=stacked?`left:0;top:${wallH+9}px;width:${w}px;height:1px`:`left:${wallW+14}px;top:0;width:1px;height:${h}px`;
 const gap=3,columns=Math.max(5,Math.ceil(Math.sqrt(Math.max(1,visible.length)*wallW/Math.max(80,wallH-32)*1.2)));
 const cell=Math.min(70,(wallW-(columns-1)*gap)/columns),tileH=Math.min(cell*1.25,(wallH-35)/Math.max(1,Math.ceil(visible.length/columns))-gap);
 const domain=visible.filter(p=>p.analysis&&!p.excludedReason&&p[$('#metric').value]>0&&p.likes!==null).map(p=>({x:p[$('#metric').value],y:p.likes/p[$('#metric').value]*1000}));
 const lo=Math.floor(Math.log10(domain.length?Math.min(...domain.map(p=>p.x)):1000)),hi=Math.max(lo+1,Math.ceil(Math.log10(domain.length?Math.max(...domain.map(p=>p.x)):10000))),ymax=Math.max(10,Math.ceil(Math.max(...domain.map(p=>p.y),1)/10)*10);
 const left=mapX+38,right=18,top=mapY+48,bottom=42,pw=Math.max(1,mapW-38-right),ph=Math.max(1,mapH-48-bottom);
 const xy=p=>[left+(Math.log10(p.x)-lo)/(hi-lo)*pw,top+(1-p.y/ymax)*ph];
 const lookup=new Map(visible.map((p,i)=>[p.id,i])),posts=new Map(job.posts.map(p=>[p.id,p])),wallPositions=new Map();
 const styleTile=(b,p)=>{b.style.setProperty('--color',colorFor(value(p)));b.classList.toggle('selected',p.id===selected);b.title=`${p.analysis?.opening||p.id} · ${compact(p[$('#metric').value])} ${$('#metric').value}`;};
 const place=(b,x,y,tw,th)=>{b.style.width=`${Math.max(3,tw)}px`;b.style.height=`${Math.max(4,th)}px`;b.style.transform=`translate(${x}px,${y}px)`;};
 for(const b of $('#tiles').children){const p=posts.get(b.dataset.id),idx=lookup.get(p.id);b.hidden=idx===undefined;if(b.hidden)continue;styleTile(b,p);b.classList.toggle('dimmed',category!=='all'&&value(p)!==category);b.classList.toggle('unseen',replaying&&!replayRevealed.has(p.id));const x=(idx%columns)*(cell+gap),y=Math.floor(idx/columns)*(tileH+gap)+29;wallPositions.set(p.id,{x,y});place(b,x,y,cell,tileH);}
 const active=plot.filter(p=>!replaying||replayRevealed.has(p.post.id)),map=new Map(active.map(p=>[p.post.id,p]));
 for(const b of $('#map-tiles').children){const p=posts.get(b.dataset.id),point=map.get(p.id);styleTile(b,p);b.hidden=false;
  if(!point){b.dataset.plotted='false';b.style.opacity='0';b.style.pointerEvents='none';b.tabIndex=-1;b.setAttribute('aria-hidden','true');b.dataset.arrived='false';b.style.transition='none';const pos=wallPositions.get(p.id)||{x:0,y:29};place(b,pos.x,pos.y,cell,tileH);continue;}
  const [x,y]=xy(point),tw=plot.length>350?12:plot.length>150?16:21;
  const apply=()=>{b.style.transition='';b.style.opacity='1';b.style.pointerEvents='auto';b.tabIndex=0;b.removeAttribute('aria-hidden');place(b,x-tw/2,y-tw*.635,tw,tw*1.27);};
  b.dataset.plotted='true';if(b.dataset.arrived!=='true'){const pos=wallPositions.get(p.id)||{x:0,y:29};b.style.transition='none';place(b,pos.x,pos.y,cell,tileH);b.style.opacity='0';void b.offsetWidth;b.dataset.arrived='true';apply();}else apply();
 }
 const mx=median(active.map(p=>p.x)),my=median(active.map(p=>p.y));let svg='';
 for(let i=0;i<=4;i++){const val=ymax*i/4,y=top+ph*(1-i/4);svg+=`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}"/><text x="${left-8}" y="${y+3}" text-anchor="end">${val.toFixed(0)}</text>`;}
 for(let i=lo;i<=hi;i++){const x=left+(i-lo)/(hi-lo)*pw;svg+=`<text x="${x}" y="${h-13}" text-anchor="middle">${compact(10**i)}</text>`;}
 if(mx!==null){const [x,y]=xy({x:mx,y:my});svg+=`<line class="median" x1="${x}" x2="${x}" y1="${top}" y2="${h-bottom}"/><line class="median" x1="${left}" x2="${w-right}" y1="${y}" y2="${y}"/>`;}
 svg+=`<text x="${left}" y="${mapY+32}">LIKES / 1K ${$('#metric').value.toUpperCase()} ↑</text>`;$('#axes').innerHTML=svg;
 $('#canvas-title').textContent='FROM SCRIPT TO PERFORMANCE';$('#canvas-note').textContent=replaying?'Saved analysis replay · both views stay visible':'Dashed lines = plotted sample medians';
 $('#plotted-count').textContent=`${visible.length} frames · ${active.length} / ${plot.length} plotted`;$('#axis-caption').textContent=`${$('#metric').value.toUpperCase()} · LOG SCALE →`;$('#empty').hidden=visible.length>0;
}
function selectPost(id){selected=id;const p=job.posts.find(p=>p.id===id);if(!p)return;$('#preview-video').pause();$('#preview-video').hidden=true;$('#preview-video').removeAttribute('src');delete $('#preview-video').dataset.post;lastPart=-1;$('.preview-media').classList.remove('playing');$('#preview-image').hidden=false;$('#preview-image').src=imageURL(p);$('#preview-play').hidden=!videoSource(p);$('#post-creator').textContent=`@${p.creator}`;$('#post-date').textContent=p.publishedAt?new Date(p.publishedAt).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):'Date unavailable';$('#post-index').textContent=`${job.posts.indexOf(p)+1} / ${job.posts.length}`;
 $('#original').hidden=!safeLink(p.url);$('#original').href=safeLink(p.url);$('#opening').textContent=openingLine(p)||'Waiting for the spoken transcript.';
 $('#post-tags').innerHTML=[p.analysis?.labels.mechanism?.value,p.analysis?.labels.structure?.value].filter(Boolean).map(t=>`<span class="tag">${title(t)}</span>`).join('');const metric=$('#metric').value;
 $('#post-views').textContent=compact(p[metric]);$('#post-view-label').textContent=title(metric);$('#post-likes').textContent=compact(p.likes);$('#post-rate').textContent=p[metric]>0&&p.likes!==null?(p.likes/p[metric]*1000).toFixed(1):'Unknown';
 const anatomy=p.analysis?.anatomy||[];$('#anatomy-note').textContent=anatomy.some(s=>s.start!==null)?'Timed transcript excerpts':'Text excerpts · no timing';
 const part=s=>({role:title(s.value),color:roleColors[s.value]||roleColors.other});
 $('#anatomy-bar').innerHTML=anatomy.map((s,i)=>barPart(s,i,part(s))).join('');
 $('#anatomy-legend').innerHTML=[...new Set(anatomy.map(s=>s.value))].map(r=>`<span><i class="swatch" style="--color:${roleColors[r]||roleColors.other}"></i>${title(r)}</span>`).join('');
 $('#transcript').innerHTML=anatomy.length?anatomy.map((s,i)=>partRow(s,i,part(s))).join(''):`<p>${escape(p.transcript?.text||'The transcript will appear here as the pipeline completes.')}</p>`;
 for(const b of [...$('#anatomy-bar').querySelectorAll('button'),...$('#transcript').querySelectorAll('button.segment')])b.onclick=()=>playPart(anatomy,+b.dataset.segment);
 $('#all-labels').innerHTML=Object.entries(p.analysis?.labels||{}).map(([key,a])=>`<div class="label-line"><span>${escape(boot.dimensions[key]?.title||key)}</span><span>${title(a.value)}</span><span>${Math.round(a.confidence*100)}%</span></div>`).join('');
 $('#post-error').textContent=p.excludedReason||((p.error||p.analysis?.review)?'Review: '+(p.error||'Some labels are uncertain. Check the spoken source.'):'');
 for(const tile of $$('.tile'))tile.classList.toggle('selected',tile.dataset.id===selected);
 renderMoneySelection();
}
const formatRate=(n,digits=1)=>n===null?'Unknown':n.toFixed(digits);
function researchPosts(){return visible.filter(p=>p.analysis&&!p.excludedReason&&(category==='all'||value(p)===category));}
function renderGroups(){
 const metric=$('#metric').value,sort=$('#research-sort').value;const valid=new Set(groups.map(g=>g.key));compareKeys=new Set([...compareKeys].filter(key=>valid.has(key)));if(compareKeys.size!==2)comparisonOpen=false;
 $('#group-title').textContent=boot.dimensions[dimension].title;$('#median-heading').textContent=`Median ${metric}`;
 const topic=$('#topic-filter').value,hook=$('#hook-filter').value;$('#clear-research').hidden=topic==='all'&&hook==='all';
 const context=[topic==='all'?'All topics':title(topic),hook==='all'?'All hooks':title(hook)];$('#research-context').textContent=`${context.join(' · ')} · Comparing ${boot.dimensions[dimension].title.toLowerCase()} · ${groups.reduce((n,g)=>n+g.n,0)} classified Reels`;
 const summary=summarize(researchPosts(),metric);
 $('#research-summary').innerHTML=[['Matching Reels',summary.n,`${visible.length} pass the filters`],[`Median ${metric}`,compact(summary.reach),`${summary.counts.reach} with counts`],['Median likes / 1k',formatRate(summary.likeRate),`${summary.counts.likeRate} with counts`],['Median comments / 1k',formatRate(summary.commentRate,2),`${summary.counts.commentRate} with counts`]].map(([label,val,note])=>`<div><span>${label}</span><strong>${val}</strong><small>${note}</small></div>`).join('');
 $('#group-table').innerHTML=groups.length?groups.map(g=>`<tr data-pattern="${escape(g.key)}" class="${compareKeys.has(g.key)?'comparing':''}"><td><i class="swatch" style="--color:${colorFor(g.key)}"></i>${title(g.key)}</td><td>${g.n}${g.n<5?'<small class="sample-warning">Small sample</small>':''}</td><td class="${sort==='reach'?'ranked-metric':''}">${compact(g.reach)}<small class="metric-count">n=${g.counts.reach}</small></td><td class="${sort==='likeRate'?'ranked-metric':''}">${formatRate(g.likeRate)}<small class="metric-count">n=${g.counts.likeRate}</small></td><td class="${sort==='commentRate'?'ranked-metric':''}">${formatRate(g.commentRate,2)}<small class="metric-count">n=${g.counts.commentRate}</small></td><td><button data-group="${escape(g.key)}">See Reels ↗</button></td><td><input type="checkbox" data-compare="${escape(g.key)}" aria-label="Compare ${escape(title(g.key))}" ${compareKeys.has(g.key)?'checked':''} ${compareKeys.size===2&&!compareKeys.has(g.key)?'disabled':''}></td></tr>`).join(''):'<tr><td colspan="7">No classified Reels match these filters. Try another topic or hook.</td></tr>';
 $('#group-table').querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{stopReplay();category=b.dataset.group;examplePage=0;render();$('#example-grid').scrollIntoView({behavior:'smooth',block:'start'});});
 $('#group-table').querySelectorAll('[data-compare]').forEach(b=>b.onchange=()=>{if(b.checked)compareKeys.add(b.dataset.compare);else compareKeys.delete(b.dataset.compare);comparisonOpen=false;renderGroups();});
 $('#compare-selected').disabled=compareKeys.size!==2;$('#compare-selected').textContent=`Compare ${compareKeys.size} / 2`;
 renderComparison();renderExamples();
}
function renderComparison(){
 const selectedGroups=[...compareKeys].map(key=>groups.find(g=>g.key===key)).filter(Boolean);$('#comparison').hidden=!comparisonOpen||selectedGroups.length!==2;if($('#comparison').hidden){$('#comparison').innerHTML='';return;}
 const metric=$('#metric').value,[a,b]=selectedGroups;const delta=a.likeRate>0&&b.likeRate!==null?`${title(b.key)} has ${Math.abs((b.likeRate/a.likeRate-1)*100).toFixed(0)}% ${b.likeRate>=a.likeRate?'higher':'lower'} median likes per 1,000 ${metric} than ${title(a.key).toLowerCase()} in this filtered sample.`:'A relative comparison needs known rates and a nonzero baseline.';
 $('#comparison').innerHTML=`<div class="comparison-heading"><span class="eyebrow">SIDE BY SIDE / SAME FILTERS</span><button id="comparison-close" class="quiet" aria-label="Close comparison">×</button></div>`+selectedGroups.map(g=>`<article><small>${g.n} REELS${g.n<5?' · SMALL SAMPLE':''}</small><h3>${title(g.key)}</h3><dl><div><dt>Median ${metric}</dt><dd>${compact(g.reach)} <small>n=${g.counts.reach}</small></dd></div><div><dt>Median likes</dt><dd>${compact(g.likes)} <small>n=${g.counts.likes}</small></dd></div><div><dt>Likes / 1k ${metric}</dt><dd>${formatRate(g.likeRate)} <small>n=${g.counts.likeRate}</small></dd></div><div><dt>Comments / 1k ${metric}</dt><dd>${formatRate(g.commentRate,2)} <small>n=${g.counts.commentRate}</small></dd></div></dl><button data-evidence="${escape(g.key)}">See the Reels ↗</button></article>`).join('')+`<p>${delta} This is an observed association, not evidence that the hook caused the result.</p>`;
 $('#comparison-close').onclick=()=>{comparisonOpen=false;renderComparison();};$('#comparison').querySelectorAll('[data-evidence]').forEach(b=>b.onclick=()=>{stopReplay();category=b.dataset.evidence;examplePage=0;render();$('#example-grid').scrollIntoView({behavior:'smooth',block:'start'});});
}
function renderExamples(){
 const metric=$('#metric').value,sort=$('#research-sort').value;const sorted=sortExamples(researchPosts(),sort,metric),pages=Math.max(1,Math.ceil(sorted.length/6));examplePage=Math.min(examplePage,pages-1);const shown=sorted.slice(examplePage*6,examplePage*6+6);
 $('#examples-title').textContent=category==='all'?`All matching patterns · ${sorted.length} Reels`:`${title(category)} · ${sorted.length} Reels`;
 $('#examples-all').hidden=category==='all';$('#examples-page').textContent=sorted.length?`${examplePage*6+1}–${Math.min((examplePage+1)*6,sorted.length)} of ${sorted.length} · Highest ${sort==='reach'?metric:sort==='likeRate'?'likes / 1k':'comments / 1k'} first`:'No matching examples';$('#examples-prev').disabled=examplePage===0;$('#examples-next').disabled=examplePage>=pages-1;
 $('#example-grid').innerHTML=shown.length?shown.map(p=>`<article class="example-card" data-post="${escape(p.id)}"><button class="example-thumbnail" data-inspect="${escape(p.id)}" aria-label="Inspect Reel ${escape(p.id)}"><img src="${escape(imageURL(p))}" loading="lazy" alt="Reel thumbnail"><span>Inspect script ↗</span></button><div class="example-copy"><small>${title(p.analysis.labels.topic?.value)} · ${title(p.analysis.labels.mechanism?.value)}</small><h4>${escape(openingLine(p))}</h4><div class="example-metrics"><span><b>${compact(p[metric])}</b> ${metric}</span><span><b>${compact(p.likes)}</b> likes</span><span><b>${formatRate(rate(p,'likes',metric))}</b> likes / 1k</span><span><b>${formatRate(rate(p,'comments',metric),2)}</b> comments / 1k</span></div><div class="example-links"><button class="quiet" data-inspect="${escape(p.id)}">Read script ↗</button>${!job.synthetic&&safeLink(p.url)?`<a href="${escape(safeLink(p.url))}" target="_blank" rel="noopener noreferrer">Original Reel ↗</a>`:'<span>Synthetic example</span>'}</div></div></article>`).join(''):'<p class="examples-empty">No examples for this combination. Clear a filter to explore more Reels.</p>';
 $('#example-grid').querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>{selectPost(b.dataset.inspect);$('.inspector').scrollIntoView({behavior:'smooth',block:'center'});});
}
function render(){if(!metricsInitialized&&job.posts.length){if(!job.posts.some(p=>p.views>0)&&job.posts.some(p=>p.plays>0))$('#metric').value='plays';else $('#metric').value='views';if(job.posts.length<100||!job.posts.some(p=>p.publishedAt&&(Date.now()-Date.parse(p.publishedAt))/864e5>=7))$('#age').value='0';else $('#age').value='7';metricsInitialized=true;}readStats();calculate();$('.inspector').classList.toggle('no-matches',currentView==='explorer'&&!visible.length);$('#inspector-empty').hidden=currentView==='money'||visible.length>0;renderLegend();buildTiles();layout();renderGroups();if(!selected&&job.posts.length)selectPost((job.posts.find(p=>p.analysis&&!p.excludedReason)||job.posts[0]).id);}
let loadGeneration=0; // a response for a run the user has left is dropped
async function loadJob(id){stopReplay();const generation=++loadGeneration;const loaded=await api(id==='demo'?'/api/demo':`/api/runs/${id}`);if(generation!==loadGeneration)return;job=loaded;resetMoney();selected=(job.posts.find(p=>p.analysis&&!p.excludedReason)||job.posts[0])?.id;metricsInitialized=false;category='all';compareKeys.clear();comparisonOpen=false;examplePage=0;$('#topic-filter').value='all';$('#hook-filter').value='all';$('#tiles').innerHTML='';$('#map-tiles').innerHTML='';$('#comparison').hidden=true;render();renderMoney();scheduleMoney();refreshVideos();if(selected)selectPost(selected);else{$('#opening').textContent='Collecting the archive. The first spoken opening will appear here.';$('#post-creator').textContent=`@${job.creator}`;$('#preview-image').hidden=true;$('#preview-play').hidden=true;$('#original').hidden=true;$('#transcript').textContent='';$('#anatomy-bar').innerHTML='';$('#anatomy-legend').innerHTML='';$('#all-labels').innerHTML='';$('#post-tags').innerHTML='';$('#post-date').textContent='';$('#post-views').textContent='Unknown';$('#post-likes').textContent='Unknown';$('#post-rate').textContent='Unknown';}}
// A context belongs to one loaded run/version; late responses cannot replace another view.
function resetMoney(version=''){
 if(moneyState)clearTimeout(moneyState.timer);if(!version)moneyExpanded.clear();
 moneyState={runId:job.id,version,report:null,error:'',loading:false,inFlight:false,pending:false,timer:null};
}
function renderMoneySelection(){
 const demo=job.id==='demo'||job.synthetic;
 $('#money-inspector').innerHTML=renderMoneyInspector(moneyState?.report?.results?.[selected],{demo,error:moneyState?.error,loading:moneyState?.loading});
 for(const b of $$('#money-view [data-money-inspect]')){const active=b.dataset.moneyInspect===selected;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));}
}
function renderMoney(){
 const node=$('#money-view'),open=[...node.querySelectorAll('details[open]')].map(d=>d.dataset.moneyDetails),focus=document.activeElement;
 const focusedId=node.contains(focus)?focus.dataset.moneyInspect:null,focusedVersion=focus.id==='money-version',focusedDetails=node.contains(focus)&&focus.tagName==='SUMMARY'?focus.parentElement.dataset.moneyDetails:null;
 node.innerHTML=renderMoneyView(moneyState?.report,{demo:job.id==='demo'||job.synthetic,error:moneyState?.error,loading:moneyState?.loading,posts:job.posts,selected,expanded:moneyExpanded});
 node.querySelectorAll('[data-money-more]').forEach(b=>b.onclick=()=>{const key=b.dataset.moneyMore;if(moneyExpanded.has(key))moneyExpanded.delete(key);else moneyExpanded.add(key);renderMoney();node.querySelector(`[data-money-more="${key}"]`)?.focus({preventScroll:true});});
 for(const d of node.querySelectorAll('details'))d.open=open.includes(d.dataset.moneyDetails);
 node.querySelectorAll('[data-money-inspect]').forEach(b=>b.onclick=()=>{selectPost(b.dataset.moneyInspect);if(innerWidth<=760||document.body.classList.contains('portrait'))$('.inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
 node.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;img.parentElement.classList.add('missing');});
 if($('#money-version'))$('#money-version').onchange=e=>{resetMoney(e.target.value);renderMoney();scheduleMoney();};
 if(focusedId)[...node.querySelectorAll('[data-money-inspect]')].find(b=>b.dataset.moneyInspect===focusedId)?.focus({preventScroll:true});
 else if(focusedVersion)$('#money-version')?.focus({preventScroll:true});
 else if(focusedDetails)node.querySelector(`details[data-money-details="${focusedDetails}"] > summary`)?.focus({preventScroll:true});
 renderMoneySelection();
}
function scheduleMoney(){
 if(!moneyState||job.id==='demo'||job.synthetic)return;
 const state=moneyState;state.pending=true;
 if(state.inFlight||state.timer)return;
 const wait=Math.max(0,2000-(Date.now()-(moneyFetchedAt.get(state.runId)||0)));
 if(wait){state.loading=true;if(!state.report)renderMoney();state.timer=setTimeout(()=>{state.timer=null;fetchMoney(state);},wait);return;}
 fetchMoney(state);
}
async function fetchMoney(state){
 if(state!==moneyState)return;
 state.pending=false;state.inFlight=true;state.loading=true;state.error='';moneyFetchedAt.set(state.runId,Date.now());if(!state.report)renderMoney();
 try{const report=await api(`/api/runs/${encodeURIComponent(state.runId)}/money${state.version?'?version='+encodeURIComponent(state.version):''}`);if(state===moneyState)state.report=report;}
 catch(e){if(state===moneyState)state.error=e.message;}
 finally{state.inFlight=false;state.loading=false;if(state===moneyState){renderMoney();if(state.pending)scheduleMoney();}}
}
function setView(view){
 stopReplay();currentView=view;const money=view==='money';
 $('#explorer-controls').hidden=money;$('#explorer-canvas').hidden=money;$('#findings').hidden=money;$('#money-view').hidden=!money;$('.explorer').classList.toggle('money-active',money);
 for(const [id,active]of [['explorer-view-button',!money],['money-view-button',money]]){$('#'+id).classList.toggle('active',active);$('#'+id).setAttribute('aria-pressed',String(active));}
 $('.inspector').classList.toggle('no-matches',!money&&!visible.length);$('#inspector-empty').hidden=money||visible.length>0;layout();
}
$('#explorer-view-button').onclick=()=>setView('explorer');
$('#money-view-button').onclick=()=>setView('money');
async function refresh(){boot=await api('/api/bootstrap');const current=job?.id||'demo';$('#run-select').innerHTML='<option value="demo">Demo · sample data</option>'+boot.runs.map(r=>`<option value="${r.id}">@${escape(r.creator)} · ${r.completed}/${r.count} · ${r.status}</option>`).join('');$('#run-select').value=current;renderConnections();}
function renderConnections(){const active=['apify',boot.transcriptionProvider||'groq','jev'];const count=active.filter(k=>boot.connections[k]?.configured).length;$('#connection-status').textContent=`${count}/3 keys configured`;for(const k of ['apify','groq','fireworks','jev'])$(`#${k}-status`).textContent=boot.connections[k]?.verified?'· key verified':boot.connections[k]?.configured?'· configured':active.includes(k)?'· needed':'· optional';$('#transcription-provider').textContent=title(boot.transcriptionProvider||'groq');}

function stopReplay(){replayToken++;replaying=false;replayRevealed.clear();$('#replay').innerHTML='<span>▶</span> Replay analysis';$('#replay-status').textContent='';$$('.tile').forEach(t=>t.classList.remove('processing','unseen'));if(job)layout();}
async function replay(){
 if(replaying){stopReplay();return;}const ready=visible.filter(p=>p.analysis&&!p.excludedReason&&(category==='all'||value(p)===category));if(!ready.length){toast('Classify a few Reels before replaying their analysis.');return;}
 replaying=true;replayRevealed.clear();const token=++replayToken;layout();$('#replay').textContent='■ Stop replay';$('#replay-status').textContent=`REPLAY · 0 / ${ready.length}`;await sleep(450);const chunk=Math.max(1,Math.ceil(ready.length/48));
 for(let i=0;i<ready.length;i+=chunk){if(token!==replayToken)return;for(const p of ready.slice(i,i+chunk)){replayRevealed.add(p.id);const b=$(`#tiles [data-id="${p.id}"]`);b?.classList.add('processing');setTimeout(()=>b?.classList.remove('processing'),450);}layout();selectPost(ready[Math.min(i+chunk-1,ready.length-1)].id);$('#replay-status').textContent=`REPLAY · ${Math.min(i+chunk,ready.length)} / ${ready.length}`;await sleep(125);}
 await sleep(1800);if(token!==replayToken)return;stopReplay();$('#replay-status').textContent='REPLAY COMPLETE';
}
async function start(){boot=await api('/api/bootstrap');$('#dimension').innerHTML=Object.entries(boot.dimensions).map(([key,v])=>`<option value="${key}">${v.title}</option>`).join('');$('#dimension').value=dimension;for(const [id,key,label]of [['topic-filter','topic','topics'],['hook-filter','mechanism','hooks']])$(`#${id}`).innerHTML=`<option value="all">All ${label}</option>`+Object.keys(boot.dimensions[key].criteria).map(k=>`<option value="${k}">${title(k)}</option>`).join('');$('#schema-content').innerHTML=Object.entries(boot.dimensions).map(([key,d])=>`<article><h3>${escape(d.title)}</h3><div class="schema-tags">${Object.keys(d.criteria).map(title).join(' / ')}</div><p>${Object.entries(d.criteria).map(([k,v])=>`<b>${title(k)}:</b> ${escape(v)}`).join('<br>')}</p></article>`).join('');await refresh();const params=new URLSearchParams(location.search);const requested=params.get('run');const id=requested==='demo'||boot.runs.some(r=>r.id===requested)?requested:boot.runs[0]?.id||'demo';await loadJob(id);$('#run-select').value=id;if(params.get('focus')==='1')focusDemo(true);
 new ResizeObserver(()=>layout()).observe($('#stage'));const events=new EventSource('/api/events');events.onmessage=e=>{const {id}=JSON.parse(e.data);if(id!==job.id)return;if(replaying){scheduleMoney();return;}if(refreshTimer)return;refreshTimer=setTimeout(async()=>{refreshTimer=null;try{const before=job.posts.find(p=>p.id===selected);const updated=await api(`/api/runs/${id}`);if(job.id!==id)return;job=updated;scheduleMoney();if(['complete','partial'].includes(job.status)&&!videoState.info?.saving)refreshVideos();const after=job.posts.find(p=>p.id===selected);render();if(selected&&$('#preview-video').hidden&&(before?.status!==after?.status||before?.analysis?.completedAt!==after?.analysis?.completedAt))selectPost(selected);await refresh();}catch(e){toast(e.message);}},220);};
}
$('#run-select').onchange=e=>loadJob(e.target.value).catch(e=>toast(e.message));
$('#dimension').onchange=e=>{stopReplay();dimension=e.target.value;category='all';compareKeys.clear();comparisonOpen=false;examplePage=0;render();};
for(const id of ['metric','age','confidence','duration','dedupe','topic-filter','hook-filter'])$(`#${id}`).onchange=()=>{stopReplay();category='all';examplePage=0;comparisonOpen=false;render();const first=researchPosts()[0]||visible[0];if(first&&!visible.some(p=>p.id===selected))selectPost(first.id);else if(selected)selectPost(selected);};
$('#clear-research').onclick=()=>{stopReplay();$('#topic-filter').value='all';$('#hook-filter').value='all';category='all';examplePage=0;render();};
$('#research-sort').onchange=()=>{examplePage=0;calculate();renderGroups();};
$('#compare-selected').onclick=()=>{comparisonOpen=true;renderComparison();$('#comparison').scrollIntoView({behavior:'smooth',block:'center'});};
$('#examples-all').onclick=()=>{stopReplay();category='all';examplePage=0;render();};
$('#examples-prev').onclick=()=>{examplePage=Math.max(0,examplePage-1);renderExamples();};
$('#examples-next').onclick=()=>{examplePage++;renderExamples();};
$('#replay').onclick=()=>{$('#demo-tools').open=false;if(currentView!=='explorer')setView('explorer');replay();};
$('#replay-status').onclick=()=>{if(replaying)stopReplay();};
$('#demo-tools').addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#demo-tools').open){e.stopPropagation();$('#demo-tools').open=false;$('#demo-tools > summary').focus();}});
$('.demo-menu').addEventListener('click',e=>{if(e.target.closest('button'))$('#demo-tools').open=false;});
document.addEventListener('click',e=>{if($('#demo-tools').open&&!$('#demo-tools').contains(e.target))$('#demo-tools').open=false;});
$('#preview-play').onclick=()=>{const v=openPlayer(job.posts.find(p=>p.id===selected));v?.play().catch(()=>toast('Preview could not play. Use the original Reel link or refresh its media URL.'));};
// Clickable script parts: open the player on the saved (or Instagram) video, jump to the part, and follow playback.
const videoSource=p=>p&&videoState.runId===job?.id&&videoState.saved.has(p.id)?`/videos/${encodeURIComponent(job.id)}/${encodeURIComponent(p.id)}`:safeLink(p?.videoUrl);
function openPlayer(p){const v=$('#preview-video'),src=p&&videoSource(p);if(!src)return null;if(v.hidden||v.dataset.post!==p.id){$('#preview-image').hidden=true;$('#preview-play').hidden=true;$('.preview-media').classList.add('playing');v.hidden=false;v.dataset.post=p.id;v.src=src;}return v;}
function highlightPart(i){for(const b of $$('#anatomy-bar button, #transcript button.segment'))b.classList.toggle('active',+b.dataset.segment===i);const row=$(`#segment-${i}`),panel=$('.inspector');if(!row||!panel||panel.scrollHeight<=panel.clientHeight+1)return;const r=row.getBoundingClientRect(),q=panel.getBoundingClientRect();if(r.top<q.top||r.bottom>q.bottom)panel.scrollTop+=r.top-q.top-60;}
function playPart(anatomy,i){const s=anatomy[i],p=job.posts.find(x=>x.id===selected);if(!s||!p)return;if(s.start==null){toast('No timing for this part.');return;}const v=openPlayer(p);if(!v){toast('No video for this reel. Use the original Reel link.');return;}const go=()=>{v.currentTime=+s.start;v.play().catch(()=>toast('Preview could not play. Use the original Reel link or refresh its media URL.'));};if(v.readyState>=1)go();else v.addEventListener('loadedmetadata',go,{once:true});lastPart=i;highlightPart(i);const box=$('.preview-media').getBoundingClientRect();if(box.top<0||box.bottom>innerHeight)$('.preview-media').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
$('#preview-video').addEventListener('timeupdate',()=>{const v=$('#preview-video'),p=job?.posts.find(x=>x.id===selected);if(!p||v.dataset.post!==p.id)return;const i=segmentAt(p.analysis?.anatomy||[],v.currentTime);if(i!==lastPart){lastPart=i;highlightPart(i);}});
// Saved videos line: progress while saving, size, delete (keeps every score, transcript and label), save missing.
const megabytes=b=>b>=1e9?`${(b/1e9).toFixed(1)} GB`:`${Math.round(b/1e6)} MB`;
async function refreshVideos(){clearTimeout(videoState.timer);if(!job||job.id==='demo'||job.synthetic){videoState={runId:null,saved:new Set(),info:null,timer:null};renderVideoLine();return;}const id=job.id;try{const info=await api(`/api/runs/${encodeURIComponent(id)}/videos`);if(job.id!==id)return;videoState={runId:id,saved:new Set(info.saved),info,timer:info.saving?setTimeout(refreshVideos,3000):null};renderVideoLine();const p=job.posts.find(x=>x.id===selected);if(p&&$('#preview-video').hidden)$('#preview-play').hidden=!videoSource(p);}catch(e){if(job.id===id){$('#video-line').hidden=false;$('#video-line').textContent=`Could not read saved videos: ${e.message}`;}}}
function renderVideoLine(){const el=$('#video-line'),i=videoState.info;if(!i||videoState.runId!==job?.id){el.hidden=true;el.innerHTML='';return;}el.hidden=false;
 const text=i.saving?`Saving videos… ${i.progress?`${i.progress.saved}/${i.progress.total}`:''}`:`Videos on this Mac: ${i.saved.length}/${i.total} · ${megabytes(i.bytes)}`;
 el.innerHTML=`<span>${escape(text)}</span>${!i.saving&&i.saved.length?'<button class="quiet" id="videos-delete">Delete saved videos</button>':''}${!i.saving&&i.saved.length<i.total?'<button class="quiet" id="videos-save">Save missing videos</button>':''}`;
 $('#videos-delete')&&($('#videos-delete').onclick=async()=>{if(!confirm(`Delete ${i.saved.length} saved videos (${megabytes(i.bytes)}) from this Mac? Scores, transcripts and labels stay. Reels will then play from Instagram while their links last.`))return;try{await api(`/api/runs/${encodeURIComponent(job.id)}/videos/delete`,{});}catch(e){toast(e.message);}await refreshVideos();if(selected)selectPost(selected);});
 $('#videos-save')&&($('#videos-save').onclick=async()=>{try{await api(`/api/runs/${encodeURIComponent(job.id)}/videos/save`,{});}catch(e){toast(e.message);}refreshVideos();});
}
function focusDemo(on){document.body.classList.toggle('focused',on);$('.focus-bar').hidden=!on;scrollTo({top:0});setTimeout(layout,20);}$('#focus').onclick=()=>focusDemo(true);$('#focus-exit').onclick=()=>focusDemo(false);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focused'))focusDemo(false);});
$('#portrait').onclick=()=>{document.body.classList.toggle('portrait');$('#portrait').textContent=document.body.classList.contains('portrait')?'Desktop view':'Portrait view';setTimeout(layout,30);};
for(const id of ['new','connections','schema'])$(`#${id}-open`).onclick=()=>$(`#${id}-dialog`).showModal();
$$('[data-close]').forEach(b=>b.onclick=()=>$(`#${b.dataset.close}`).close());
$('#resume').onclick=async()=>{const id=job.id,generation=loadGeneration;try{await api(`/api/runs/${id}/run`,{});const updated=await api(`/api/runs/${id}`);if(generation!==loadGeneration||job.id!==id)return;job=updated;render();scheduleMoney();}catch(e){toast(e.message);}};
$('#pause').onclick=async()=>{try{await api(`/api/runs/${job.id}/pause`,{});toast('Pausing after in-flight requests finish.');}catch(e){toast(e.message);}};
$('#export').onclick=()=>window.open(`/api/runs/${job.id}/export`,'_blank');
// Up to 3 handles become 3 runs that are started together; the first one opens on screen.
$('#new-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#new-error').textContent='';try{const data=Object.fromEntries(new FormData(e.target));const {handles,error}=parseHandles(data.creator);if(error)throw new Error(error);const file=$('#import-file').files[0];if(file&&handles.length>1)throw new Error('Import one JSON export for one handle at a time.');if(file)data.rows=JSON.parse(await file.text());const created=[];for(const creator of handles)created.push(await api('/api/runs',{...data,creator}));await refresh();await loadJob(created[0].id);const failed=[];for(const run of created){try{await api(`/api/runs/${run.id}/run`,{});}catch(err){failed.push(`@${run.creator}: ${err.message}`);}}await refresh();if(failed.length)toast(failed.join(' · '));else if(created.length>1)toast(`${created.length} analyses running in parallel. Switch between them under Your research.`);$('#new-dialog').close();}catch(err){$('#new-error').textContent=err.message;}finally{b.disabled=false;}};
$('#connections-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#connections-result').textContent='Checking provider access…';try{await api('/api/connections',Object.fromEntries(new FormData(e.target)));e.target.reset();const checks=await api('/api/connections/check',{});$('#connections-result').textContent=Object.entries(checks).map(([k,v])=>`${title(k)}: ${v.verified?'verified':v.error||'key needed'}`).join(' · ');await refresh();}catch(err){$('#connections-result').textContent=err.message;}finally{b.disabled=false;}};
$('#attach-form').onsubmit=async e=>{e.preventDefault();try{await api(`/api/runs/${job.id}/attach`,{runId:$('#attach-id').value.trim()});await loadJob(job.id);toast('Apify run attached. Resume to retrieve its results.');}catch(err){toast(err.message);}};
start().catch(e=>{toast(e.message);$('#notice').textContent='Could not load the local app. '+e.message;});

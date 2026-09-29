// The Scan step's live view (Kaan liked the lab's "thumbnail wall → performance map"): every collected reel sits on
// the wall; once it has been listened to and labelled it flies to the map (plays on a log scale → likes per 1,000
// plays ↑); the player on the right plays whichever tile is clicked. layout() is pure, so Node tests can check it.
export const reach=p=>Number.isFinite(p.plays)&&p.plays>0?p.plays:Number.isFinite(p.views)&&p.views>0?p.views:null;
export const analysed=p=>Boolean(p.analysis||p.excludedReason);
export const mappable=p=>analysed(p)&&reach(p)!==null&&Number.isFinite(p.likes)&&p.likes>=0;
const median=v=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

// Positions for a wall of `width` × `height` (left) and a map beside it. Returns tiles in wall order.
export function layout(posts,{wallW,wallH,mapX,mapW,mapH,top=0,pad={l:44,r:14,t:18,b:34}}){
 const n=Math.max(1,posts.length),cols=Math.max(5,Math.ceil(Math.sqrt(n*wallW/Math.max(1,wallH)*0.8))),gap=3;
 const tw=Math.max(8,(wallW-(cols-1)*gap)/cols),th=Math.max(10,Math.min(tw*1.3,(wallH-(Math.ceil(n/cols)-1)*gap)/Math.ceil(n/cols)));
 const points=posts.filter(mappable).map(p=>({id:p.id,x:reach(p),y:p.likes/reach(p)*1000}));
 const lo=points.length?Math.floor(Math.log10(Math.min(...points.map(p=>p.x)))):3,hi=Math.max(lo+1,points.length?Math.ceil(Math.log10(Math.max(...points.map(p=>p.x)))):5);
 const ymax=Math.max(10,Math.ceil(Math.max(1,...points.map(p=>p.y))/10)*10),pw=Math.max(1,mapW-pad.l-pad.r),ph=Math.max(1,mapH-pad.t-pad.b);
 const X=v=>mapX+pad.l+(Math.log10(v)-lo)/(hi-lo)*pw,Y=v=>pad.t+(1-v/ymax)*ph,byId=new Map(points.map(p=>[p.id,p])),mt=points.length>150?14:20;
 const tiles=posts.map((p,i)=>{const wall={x:(i%cols)*(tw+gap),y:top+Math.floor(i/cols)*(th+gap),w:tw,h:th},pt=byId.get(p.id);
  return {id:p.id,analysed:analysed(p),wall,map:pt?{x:X(pt.x)-mt/2,y:Y(pt.y)-mt*0.65,w:mt,h:mt*1.3}:null};});
 const mx=median(points.map(p=>p.x)),my=median(points.map(p=>p.y));
 return {tiles,cols,axes:{lo,hi,ymax,x:Array.from({length:hi-lo+1},(_,k)=>({v:10**(lo+k),at:X(10**(lo+k))})),y:[0,1,2,3,4].map(k=>({v:ymax*k/4,at:Y(ymax*k/4)})),median:mx===null?null:{x:X(mx),y:Y(my)},box:{l:mapX+pad.l,r:mapX+mapW-pad.r,t:pad.t,b:mapH-pad.b}},plotted:points.length};
}
export const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n):'–';

// Browser part: keeps the tile elements between refreshes so they animate from the wall to the map.
export function mountScanMap(root,{posts,imageFor,videoFor,selected,onSelect}){
 const stage=root.querySelector('.scan-stage');if(!stage)return;
 const w=stage.clientWidth,h=stage.clientHeight,stacked=w<640,wallW=stacked?w:Math.floor(w*0.42),wallH=stacked?Math.floor(h*0.42):h;
 // The wall starts under its label (the label covered the first row, 2026-09-29).
 const L=layout(posts,{wallW,wallH:wallH-22,top:22,mapX:stacked?0:wallW+24,mapW:stacked?w:w-wallW-24,mapH:stacked?h-wallH-16:h});
 const mapLabel=stage.querySelector('.scan-lab.right');if(mapLabel){mapLabel.style.top=stacked?`${wallH}px`:'0';mapLabel.style.right=stacked?'auto':'0';mapLabel.style.left=stacked?'0':'auto';}
 const offY=stacked?wallH+16:0,svg=stage.querySelector('svg');
 const a=L.axes;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 svg.innerHTML=`<g transform="translate(0,${offY})">${a.y.map(t=>`<line x1="${a.box.l}" x2="${a.box.r}" y1="${t.at}" y2="${t.at}" class="grid"/><text x="${a.box.l-6}" y="${t.at+4}" text-anchor="end">${t.v.toFixed(0)}</text>`).join('')}${a.x.map(t=>`<text x="${t.at}" y="${a.box.b+18}" text-anchor="middle">${compact(t.v)}</text>`).join('')}${a.median?`<line class="med" x1="${a.median.x}" x2="${a.median.x}" y1="${a.box.t}" y2="${a.box.b}"/><line class="med" x1="${a.box.l}" x2="${a.box.r}" y1="${a.median.y}" y2="${a.median.y}"/>`:''}<text class="ax" x="${a.box.l}" y="${a.box.t-4}">↑ likes per 1,000 plays</text><text class="ax" x="${a.box.r}" y="${a.box.b-6}" text-anchor="end">plays →</text></g>`;
 // Two tiles per reel, as in the lab: the wall keeps every reel (the archive), and a copy flies from its place on the
 // wall to the map once the reel is analysed (an empty wall after a finished scan looked broken, 2026-09-28).
 const tile=(cls,id)=>{const el=document.createElement('button');el.type='button';el.className=cls;el.dataset.id=id;const p=posts.find(p=>p.id===id);el.setAttribute('aria-label',`Play reel: ${compact(reach(p||{}))} plays`);el.innerHTML=`<img src="${imageFor(id)}" alt="" loading="lazy" onerror="this.remove()">`;el.onclick=()=>onSelect(id);stage.append(el);return el;};
 const place=(el,b)=>{const w=Math.max(40,b.w),h=Math.max(40,b.h);el.style.width=`${w}px`;el.style.height=`${h}px`;el.style.setProperty('--tile-w',`${b.w}px`);el.style.setProperty('--tile-h',`${b.h}px`);el.style.transform=`translate(${b.x-(w-b.w)/2}px,${b.y-(h-b.h)/2}px)`;};
 const walls=new Map([...stage.querySelectorAll('.st-wall')].map(el=>[el.dataset.id,el])),maps=new Map([...stage.querySelectorAll('.st-map')].map(el=>[el.dataset.id,el]));
 for(const t of L.tiles){
  const w=walls.get(t.id)||tile('st st-wall',t.id);walls.delete(t.id);place(w,t.wall);w.classList.toggle('waiting',!t.analysed);w.classList.toggle('is-sel',t.id===selected);
  if(!t.map)continue;let m=maps.get(t.id);maps.delete(t.id);const to={...t.map,y:t.map.y+offY};
  if(!m){m=tile('st st-map on-map',t.id);m.style.transition='none';place(m,t.wall);void m.offsetWidth;m.style.transition='';}
  place(m,to);m.classList.toggle('is-sel',t.id===selected);}
 for(const el of [...walls.values(),...maps.values()])el.remove();
 const done=posts.filter(analysed).length,label=root.querySelector('.scan-count');if(label)label.textContent=`${done} of ${posts.length} reels analysed · ${L.plotted} on the map`;
 const player=root.querySelector('.scan-player');if(player&&selected){const p=posts.find(x=>x.id===selected);if(p&&player.dataset.id!==p.id){player.dataset.id=p.id;const src=videoFor(p.id);
  player.innerHTML=`${src?`<video src="${src}#t=0.5" controls playsinline preload="metadata" poster="${imageFor(p.id)}"></video>`:`<img src="${imageFor(p.id)}" alt="">`}<div class="scan-facts"><b>${compact(reach(p))}</b> plays · <b>${compact(p.likes)}</b> likes${reach(p)?` · <b>${(p.likes/reach(p)*1000).toFixed(1)}</b> per 1,000`:''}</div><p class="hint">${(p.caption||'').slice(0,140).replace(/[<>&]/g,'')}</p>`;}}
}

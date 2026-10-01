// The README's pictures, in the app's own brand (public/flow.css): warm paper, white cards, ink, one prism accent.
// Writes a light and a dark version of the banner and the five-step strip to docs/assets/. Run: node docs/readme-art.mjs
import {writeFile} from 'node:fs/promises';

const PRISM=['#82bcff','#2483ff','#ff66f4','#ff3029','#fe7b02'];
const THEMES={
 light:{bg:'#f8f7f3',card:'#ffffff',ink:'#242622',muted:'#696b65',line:'#dedfd7'},
 dark:{bg:'#121311',card:'#1b1c1a',ink:'#f2f1ec',muted:'#a3a59e',line:'#30322e'},
};
const FONT=`font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const prismDef=(id,attrs='x1="0" y1="0" x2="1" y2="0"')=>`<linearGradient id="${id}" ${attrs}>${PRISM.map((c,i)=>`<stop offset="${i/(PRISM.length-1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;

// The six winner cards, as in the app's Winners step: a picture, the "× their usual" badge, the plays.
// The numbers are an illustration, not a real account.
const TILES=[['14×','4.2M','#c9d6e8','#9fb3d1'],['8.4×','1.9M','#ead7cf','#d3b2a3'],['6.1×','1.6M','#dcd6ea','#b8aed3'],
 ['4.8×','980K','#d5e3d6','#a9c2ab'],['3.5×','730K','#efe0c8','#d9bf95'],['2.9×','610K','#e6d2dc','#c9a6b7']];

function tile([badge,plays,top,bottom],i,x,y,w,h){
 const cx=x+w/2,id=`t${i}`,bw=badge.length*8.6+22;
 return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<clipPath id="${id}c"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath></defs>
<g clip-path="url(#${id}c)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>
<circle cx="${cx}" cy="${y+h*0.42}" r="${w*0.16}" fill="#000" opacity="0.13"/>
<rect x="${cx-w*0.33}" y="${y+h*0.6}" width="${w*0.66}" height="${h*0.5}" rx="${w*0.33}" fill="#000" opacity="0.13"/>
<rect x="${x}" y="${y+h*0.62}" width="${w}" height="${h*0.38}" fill="url(#shade)"/></g>
<rect x="${x+8}" y="${y+8}" width="${bw}" height="24" rx="12" fill="${i===0?'url(#prismBadge)':'#000'}" fill-opacity="${i===0?1:0.72}"/>
<text x="${x+8+bw/2}" y="${y+24.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${badge}</text>
<text x="${x+10}" y="${y+h-12}" font-size="13" font-weight="600" fill="#fff">${plays} plays</text>`;
}

function banner(t){
 const W=1280,H=520,w=118,h=210,gap=14,gx=W-72-(3*w+2*gap),gy=(H-(2*h+gap))/2;
 const pills=['Runs on your computer','Price before every step','Never posts for you'];
 let px=72;const pillSvg=pills.map(p=>{const pw=p.length*7.9+32,s=`<rect x="${px}" y="418" width="${pw}" height="36" rx="18" fill="${t.card}" stroke="${t.line}"/><text x="${px+pw/2}" y="441" text-anchor="middle" font-size="15" font-weight="500" fill="${t.ink}">${esc(p)}</text>`;px+=pw+10;return s;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<title>Social Scraper: find the reels that win, remake them with your own AI hosts</title>
<defs>${prismDef('prism')}${prismDef('prismBadge')}${prismDef('prismLogo','x1="0" y1="0" x2="1" y2="1"')}
<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="70"/></filter></defs>
<rect width="${W}" height="${H}" rx="28" fill="${t.bg}"/>
<ellipse cx="${gx+190}" cy="${H/2}" rx="260" ry="170" fill="url(#prism)" opacity="${t===THEMES.dark?0.22:0.16}" filter="url(#glow)"/>
<circle cx="92" cy="96" r="20" fill="url(#prismLogo)"/>
<text x="124" y="104" font-size="23" font-weight="600" fill="${t.ink}">Social Scraper</text>
<text x="72" y="196" font-size="52" font-weight="700" letter-spacing="-1.4" fill="${t.ink}">Find the reels that win.</text>
<text x="72" y="256" font-size="52" font-weight="700" letter-spacing="-1.4" fill="${t.ink}">Remake them with</text>
<text x="72" y="316" font-size="52" font-weight="700" letter-spacing="-1.4" fill="url(#prism)">your own AI hosts.</text>
<text x="72" y="368" font-size="20" fill="${t.muted}">Scan any Instagram account, see why its best reels win,</text>
<text x="72" y="396" font-size="20" fill="${t.muted}">and film new versions of them, shot by shot.</text>
${pillSvg}
${TILES.map((x,i)=>tile(x,i,gx+(i%3)*(w+gap),gy+Math.floor(i/3)*(h+gap),w,h)).join('\n')}
</svg>\n`;
}

// Five steps on one prism line, each with its own prism colour (the coloured step icons Kaan liked).
const ICONS=[
 '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
 '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
 '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4"/>',
 '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
];
const STEPS=[['Scan','Up to 100 reels,','transcribed and scored'],['Winners','Reels at 2x or more','of their usual plays'],
 ['Look','Your AI hosts, place','and voice, made once'],['Copy','Their winners, shot','by shot, your hosts'],['Ready to post','Video, cover and','caption to download']];

function steps(t){
 const W=1280,H=330,col=(W-144)/5,cw=col-18,top=124,ch=172;
 const cx=i=>72+col*i+col/2;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<title>The five steps: Scan, Winners, Look, Copy, Ready to post</title>
<defs>${prismDef('line')}</defs>
<rect width="${W}" height="${H}" rx="28" fill="${t.bg}"/>
<rect x="${cx(0)}" y="70" width="${cx(4)-cx(0)}" height="4" rx="2" fill="url(#line)"/>
${STEPS.map(([title,a,b],i)=>{const x=cx(i)-cw/2,c=PRISM[i];return `<circle cx="${cx(i)}" cy="72" r="19" fill="${t.ink}"/><text x="${cx(i)}" y="78" text-anchor="middle" font-size="16" font-weight="700" fill="${t.bg}">${i+1}</text>
<rect x="${x}" y="${top}" width="${cw}" height="${ch}" rx="18" fill="${t.card}" stroke="${t.line}"/>
<rect x="${x+20}" y="${top+20}" width="44" height="44" rx="12" fill="${c}" fill-opacity="${t===THEMES.dark?0.2:0.14}"/>
<g transform="translate(${x+30} ${top+30}) scale(1)" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[i]}</g>
<text x="${x+20}" y="${top+100}" font-size="21" font-weight="700" fill="${t.ink}">${esc(title)}</text>
<text x="${x+20}" y="${top+128}" font-size="15" fill="${t.muted}">${esc(a)}</text>
<text x="${x+20}" y="${top+149}" font-size="15" fill="${t.muted}">${esc(b)}</text>`;}).join('\n')}
</svg>\n`;
}

const out=new URL('./assets/',import.meta.url);
for(const [name,t] of Object.entries(THEMES)){
 await writeFile(new URL(`banner-${name}.svg`,out),banner(t));
 await writeFile(new URL(`steps-${name}.svg`,out),steps(t));
}
console.log('Wrote banner-light, banner-dark, steps-light and steps-dark to docs/assets/');

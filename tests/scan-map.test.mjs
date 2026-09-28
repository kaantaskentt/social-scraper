import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,reach,analysed,mappable} from '../public/scan-map.mjs';
const post=(id,o={})=>({id,plays:1000,likes:50,analysis:{},...o});
const box={wallW:400,wallH:400,mapX:424,mapW:500,mapH:400};

test('only analysed reels with plays and likes go on the map; others wait on the wall',()=>{
 assert.equal(reach({plays:0,views:500}),500);assert.equal(reach({plays:null,views:null}),null);
 assert.equal(analysed({excludedReason:'music'}),true);assert.equal(mappable(post('a',{likes:null})),false);
 const L=layout([post('a'),post('b',{analysis:null}),post('c',{plays:null,views:null})],box);
 assert.equal(L.plotted,1);assert.ok(L.tiles[0].map);assert.equal(L.tiles[1].map,null);assert.equal(L.tiles[1].analysed,false);assert.equal(L.tiles[2].map,null);
});

test('the wall is a grid in scan order and fits its box',()=>{
 const posts=Array.from({length:100},(_,i)=>post(`p${i}`));const L=layout(posts,box);
 for(const t of L.tiles){assert.ok(t.wall.x>=0&&t.wall.x+t.wall.w<=400+0.001,`x ${t.wall.x}`);assert.ok(t.wall.y+t.wall.h<=400+0.001,`y ${t.wall.y}`);}
 assert.ok(L.tiles[1].wall.x>L.tiles[0].wall.x);
});

test('the map: plays on a log scale left to right, likes per 1,000 plays bottom to top, inside the map box',()=>{
 const L=layout([post('low',{plays:1000,likes:10}),post('high',{plays:100000,likes:8000})],box);
 const [low,high]=L.tiles;assert.ok(high.map.x>low.map.x);assert.ok(high.map.y<low.map.y);
 assert.equal(L.axes.lo,3);assert.equal(L.axes.hi,5);assert.equal(L.axes.ymax,80);
 for(const t of L.tiles){assert.ok(t.map.x+t.map.w/2>=L.axes.box.l-0.001&&t.map.x+t.map.w/2<=L.axes.box.r+0.001);}
 assert.ok(L.axes.median);
});

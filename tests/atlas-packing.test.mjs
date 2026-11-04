import test from 'node:test';
import assert from 'node:assert/strict';
import {packAtlas} from '../dist/rendering/atlas-packing.js';
test('compact atlas retains every unrotated rectangle inside one page without overlaps',()=>{
 let seed=17;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let run=0;run<20;run++){
  const sizes=Array.from({length:160},()=>({w:10+Math.floor(random()*70),h:20+Math.floor(random()*90)}));
  const positions=packAtlas(sizes,1024,1024);assert.ok(positions);assert.deepEqual(packAtlas(sizes,1024,1024),positions);
  const rects=sizes.map((size,i)=>({...size,...positions[i]}));
  for(const [i,a]of rects.entries()){
   assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=1024&&a.y+a.h<=1024);
   for(const b of rects.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
  }
 }
});
test('atlas packing rejects oversized or impossible pages and accepts exact edges',()=>{
 assert.equal(packAtlas([{w:257,h:1}],256,256),null);
 assert.equal(packAtlas([{w:0,h:1}],256,256),null);
 assert.equal(packAtlas([{w:256,h:256},{w:1,h:1}],256,256),null);
 assert.deepEqual(packAtlas([{w:128,h:256},{w:128,h:256}],256,256),[{x:0,y:0},{x:128,y:0}]);
});

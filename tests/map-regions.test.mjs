import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMapRegions,MAP_REGIONS} from '../dist/rendering/map-regions.js';
import {SEAL_SITES} from '../dist/game/map-events.js';
import {unproject} from '../dist/shared/model.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();const {buildWorldMap}=await import('../dist/rendering/world-map.js');
const record=()=>{const calls=[];return {calls,g:Object.fromEntries(['drawPoly','drawLines'].map(name=>[name,(...args)=>calls.push({name,args})]))};};
test('four landmark families are deterministic, bounded, flat and consume no combat randomness',()=>{
 const random=Math.random;Math.random=()=>{throw Error('scenery consumed RNG');};
 try{
  const a=record(),b=record();drawMapRegions(a.g);drawMapRegions(b.g);assert.deepEqual(a.calls,b.calls);
  assert.deepEqual(MAP_REGIONS.map(r=>r.id),SEAL_SITES.map(s=>s.id));assert.equal(new Set(MAP_REGIONS.map(r=>r.base)).size,4);
  assert.ok(a.calls.length<220);
  for(const {args}of a.calls)for(let i=0;i<args[2].length;i+=2){const p=unproject(args[2][i],args[2][i+1]);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(Math.abs(p.x)<1000&&Math.abs(p.y)<1000);}
  for(const site of SEAL_SITES){const q=record();drawMapRegions(q.g);assert.ok(q.calls.some(c=>{const points=c.args[2];const center=unproject(points.reduce((n,v,i)=>n+(i%2?0:v),0)/(points.length/2),points.reduce((n,v,i)=>n+(i%2?v:0),0)/(points.length/2));return Math.hypot(center.x-site.x,center.y-site.y)<60;}));}
 }finally{Math.random=random;}
});
test('map dressing leaves the authored pillar collision positions and actor count unchanged',()=>{
 const ground=new Laya.Sprite(),actors=new Laya.Sprite(),pillars=Object.freeze([Object.freeze({x:-420,y:-380}),Object.freeze({x:440,y:-360})]);
 const result=buildWorldMap(ground,actors,pillars);assert.equal(result.nodes.length,2);assert.equal(childrenOf(actors).length,2);
 assert.ok(result.nodes.every(n=>n.name==='pillar'));assert.deepEqual(pillars,[{x:-420,y:-380},{x:440,y:-360}]);
});

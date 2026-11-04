import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {vfxAtlas,paintVfx,routeVfx} from '../dist/rendering/vfx-atlas.js';
import {drawBuffEffect} from '../dist/buffs/buff-visuals.js';
import {drawEvolutionBurst} from '../dist/buffs/buff-evolution-visuals.js';
import {project} from '../dist/shared/model.js';
function engine(){
 setupLayaStub();const images=[],uploads=[],slices=[];
 Laya.Browser={createElement:()=>{const i={src:'',width:512,height:512};images.push(i);return i;}};
 Laya.Texture2D=class{constructor(w,h){this.w=w;this.h=h;uploads.push(this);}loadImageSource(){}destroy(){this.dead=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;}destroy(){this.dead=true;}static createFromTexture(t,x,y,w,h){const slice=Object.assign(new this(t.bitmap),{x,y,w,h});slices.push(slice);return slice;}};
 Laya.Matrix=class{constructor(a,b,c,d,tx,ty){Object.assign(this,{a,b,c,d,tx,ty});}};
 return {images,uploads,slices};
}
function recorder(){
 const calls=[];return{calls,g:Object.fromEntries(['drawTexture','drawPoly','drawRect','drawLine','drawLines'].map(name=>[name,(...args)=>calls.push({name,args})]))};
}
test('one async elemental page serves all sixteen sprites across qualities without repeated uploads',()=>{
 const f=engine(),g=recorder().g;
 assert.equal(paintVfx(g,'impact','ice',0,0,24),false);assert.equal(f.images.length,1);assert.equal(f.images[0].src,'assets/vfx/elements.png');
 f.images[0].onload();assert.deepEqual(vfxAtlas().status,{ready:true,bytes:1048576,error:''});
 for(let i=0;i<10;i++)for(const part of ['projectile','impact','field','focus'])for(const element of ['fire','ice','lightning','force'])assert.equal(paintVfx(g,part,element,30,20,24,30,.8,.5),true);
 assert.equal(f.uploads.length,1);assert.equal(f.slices.length,16);assert.ok(f.uploads[0].lock);
 assert.ok(f.slices.every(t=>t.bitmap===f.uploads[0]&&t.x+t.w<=512&&t.y+t.h<=512));
});
test('failed, wrong-size and failed-upload VFX retain procedural rendering and release partial GPU resources',()=>{
 for(const failure of ['load','size','upload']){
  const f=engine();vfxAtlas();
  if(failure==='load')f.images[0].onerror();
  else{if(failure==='size')f.images[0].width=10;else Laya.Texture2D.prototype.loadImageSource=()=>{throw Error('upload rejected');};f.images[0].onload();}
  assert.equal(vfxAtlas().status.ready,false);assert.equal(vfxAtlas().status.bytes,0);assert.ok(vfxAtlas().status.error);
  const g=recorder(),floor=recorder();drawBuffEffect(g.g,floor.g,project,{kind:'blast',element:'ice',x:0,y:0,vx:0,vy:0,age:.08},5);
  assert.ok(g.calls.length+floor.calls.length>0);assert.ok([...g.calls,...floor.calls].every(c=>c.name!=='drawTexture'));
  if(failure==='upload')assert.equal(f.uploads[0].dead,true);
 }
});
test('painted Buffs retain distinct tiers, frozen snapshots and ground-only fields while sharing two raster passes',()=>{
 const f=engine();vfxAtlas();f.images[0].onload();
 const random=Math.random;Math.random=()=>{throw Error('visual consumed gameplay RNG');};
 try{for(const kind of ['bolt','blast','field','orbit'])for(const element of ['fire','ice','lightning','force'])for(const detail of [3,5,8]){
  const signatures=[];
  for(const level of [1,3,5]){
   const g=recorder(),floor=recorder(),art=recorder(),groundArt=recorder();routeVfx(g.g,art.g);routeVfx(floor.g,groundArt.g);
   const e=Object.freeze({kind,element,x:0,y:0,vx:480,vy:0,age:.08,level}),before=JSON.stringify(e);
   drawBuffEffect(g.g,floor.g,project,e,detail);
   assert.equal(JSON.stringify(e),before);assert.ok(art.calls.length+groundArt.calls.length>0);
   assert.ok(g.calls.every(c=>c.name!=='drawTexture')&&floor.calls.every(c=>c.name!=='drawTexture'));
   if(kind==='field')assert.equal(g.calls.length+art.calls.length,0);
   const all=[...g.calls,...floor.calls,...art.calls,...groundArt.calls];assert.ok(all.length<20);
   for(const c of all)for(const a of c.args.flat())if(typeof a==='number')assert.ok(Number.isFinite(a));
   for(const c of [...art.calls,...groundArt.calls]){assert.equal(c.args[0].bitmap,f.uploads[0]);assert.ok(c.args[6]>0&&c.args[6]<=1);}
   signatures.push(JSON.stringify(all));
  }
  assert.equal(new Set(signatures).size,3,`${kind}/${element}/${detail}`);
 }}finally{Math.random=random;}
 assert.equal(f.uploads.length,1);
});
test('painted evolution bursts fade out rather than leave a persistent opaque sprite',()=>{
 const f=engine();vfxAtlas();f.images[0].onload();
 for(const kind of ['detonate','shatter']){
  const early=recorder(),late=recorder(),floor=recorder();
  drawEvolutionBurst(early.g,floor.g,project,kind,0,0,.1,5,8);
  drawEvolutionBurst(late.g,floor.g,project,kind,0,0,1,5,8);
  assert.ok(early.calls.some(c=>c.name==='drawTexture'));assert.equal(late.calls.filter(c=>c.name==='drawTexture').length,0);
 }
});
test('normalized VFX package records sixteen alpha-checked sprites and no chroma-key leftovers',async()=>{
 const meta=JSON.parse(await readFile(new URL('../assets/vfx/elements.json',import.meta.url),'utf8'));
 assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.frames.length,16);assert.equal(meta.qa.keyPixels,0);
 assert.ok(meta.qa.transparentPixels>130000&&meta.qa.opaquePixels>20000);
 assert.equal(new Set(meta.frames.map(f=>`${f.row}:${f.column}`)).size,16);
 const png=await readFile(new URL('../assets/vfx/elements.png',import.meta.url));assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);assert.equal(png[25],6,'PNG uses RGBA');
});

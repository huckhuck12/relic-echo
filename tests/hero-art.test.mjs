import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {PlayerAtlas} from '../dist/rendering/player-atlas.js';
import {heroArt,heroFrame} from '../dist/rendering/hero-art.js';
import {emptyLoadout} from '../dist/shared/model.js';

function renderer(){
 setupLayaStub();const uploads=[],images=[],raster=[];
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},drawImage(...args){raster.push(args);}};
 Laya.Browser={createElement:type=>{if(type==='img'){const i={src:'',width:1024,height:1024,onload:null,onerror:null};images.push(i);return i;}return {width:0,height:0,getContext:()=>context};}};
 Laya.Texture2D=class{constructor(w,h){this.w=w;this.h=h;uploads.push(this);}loadImageSource(){}destroy(){this.dead=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;}destroy(){}static createFromTexture(t){return new this(t.bitmap);}};
 return {uploads,images,raster,g:{clear(){},drawTexture(){}}};
}
test('delayed hero load replaces fallback once, shares decoded image, and keeps pose changes on the GPU page',()=>{
 const r=renderer(),loadout=emptyLoadout('storm'),a=new PlayerAtlas(),p={direction:1,face:1,back:false};
 assert.equal(a.paint(r.g,loadout,p,0),true);assert.equal(a.revision,0);assert.equal(r.images.length,1);
 r.images[0].onload();assert.equal(a.revision,1);
 for(let dir=0;dir<8;dir++)for(let frame=0;frame<20;frame++)assert.equal(a.paint(r.g,loadout,{...p,direction:dir,castWeapon:'storm',castTime:frame<12?.28*(1-(frame+.5)/12):0},frame),true);
 assert.equal(r.uploads.length,2,'Fallback upload plus one painted replacement');assert.equal(r.uploads[0].dead,true);
 assert.equal(r.raster.length,128);assert.ok(a.bytes<=8*1048576);
 const preview=new PlayerAtlas(true);preview.paint(r.g,loadout,p,0);
 assert.equal(r.images.length,1,'One decoded source for all previews');assert.ok(preview.bytes<=65536,'One static preview is at most 128x128 RGBA');
 preview.destroy();assert.equal(preview.bytes,0);assert.equal(r.uploads.at(-1).dead,true);
});
test('failed or wrong-size hero asset keeps the procedural renderer usable',()=>{
 for(const failure of ['network','size']){
  const r=renderer(),a=new PlayerAtlas();a.paint(r.g,emptyLoadout('blade'),{direction:1,face:1,back:false},0);
  if(failure==='network')r.images[0].onerror();else{r.images[0].width=1;r.images[0].onload();}
  assert.equal(a.revision,0);assert.equal(a.artStatus.ready,false);assert.ok(a.artStatus.error);
  assert.equal(a.paint(r.g,emptyLoadout('blade'),{direction:1,face:1,back:false},1),true);
  assert.equal(r.uploads.length,1);assert.equal(heroArt().image,undefined);
 }
});
test('all 56 runtime frame rectangles match the normalized alpha atlas and stay within its bounds',async()=>{
 const meta=JSON.parse(await readFile(new URL('../assets/hero/ruin-apprentice.json',import.meta.url),'utf8'));
 assert.equal(meta.frames.length,56);assert.equal(meta.qa.keyPixels,0);assert.ok(meta.qa.transparentPixels>500000);assert.ok(meta.qa.opaquePixels>50000);
 for(const f of meta.frames){const q=heroFrame(f.direction,f.pose);assert.equal(q.sx,f.x);assert.equal(q.sy,f.y);assert.ok(q.sx+q.sw<=1024&&q.sy+q.sh<=1024);}
});

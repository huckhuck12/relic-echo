import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {equipmentLayers} from '../dist/rendering/equipment-art.js';
import {EQUIPMENT_ART_FRAMES} from '../dist/rendering/equipment-art-frames.js';
import {PlayerAtlas} from '../dist/rendering/player-atlas.js';
import {emptyLoadout} from '../dist/shared/model.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';

const heads=['visor','hood','helmet'],armors=['light','heavy','energy'],backs=['cape','pack','thorn'];
function outfit(head='helmet',armor='heavy',back='thorn',weapon='storm',quality=2){return {...emptyLoadout(weapon),head:{id:head,quality},armor:{id:armor,quality},back:{id:back,quality}};}
function engine(){
 setupLayaStub();const images=[],uploads=[],calls=[],clips=[];
 const context={save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},clip(){clips.push(calls.length);},drawImage(...args){calls.push(args);}};
 Laya.Browser={createElement:type=>{if(type==='img'){const i={src:'',width:1024,height:1024,onload:null,onerror:null};images.push(i);return i;}return {width:0,height:0,getContext:()=>context};}};
 Laya.Texture2D=class{constructor(w,h){this.w=w;this.h=h;uploads.push(this);}loadImageSource(){}destroy(){this.dead=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;}destroy(){}static createFromTexture(t){return new this(t.bitmap);}};
 return {images,uploads,calls,clips,g:{clear(){},drawTexture(){}}};
}

test('all 45 wearable rectangles occupy transparent body-sheet space without touching bodies, weapons or each other',async()=>{
 const meta=JSON.parse(await readFile(new URL('../assets/hero/equipment.json',import.meta.url),'utf8'));
 const weapons=JSON.parse(await readFile(new URL('../assets/hero/weapons.json',import.meta.url),'utf8'));
 assert.equal(meta.frames.length,45);assert.equal(meta.qa.keyPixels,0);assert.ok(meta.qa.transparentPixels>50000);assert.ok(meta.qa.opaquePixels>30000);
 const overlap=(a,b)=>a.sx<b.sx+b.sw&&a.sx+a.sw>b.sx&&a.sy<b.sy+b.sh&&a.sy+a.sh>b.sy;
 for(const [i,f]of meta.frames.entries()){
  assert.deepEqual(EQUIPMENT_ART_FRAMES[f.id][f.view],{sx:f.sx,sy:f.sy,sw:f.sw,sh:f.sh});
  assert.ok(f.sy>=768&&f.sx>=0&&f.sx+f.sw<=1024&&f.sy+f.sh<=1024,'Below all 56 body frames');
  assert.ok(f.sourcePixels>1200);assert.equal(weapons.some(w=>overlap(f,w)),false);
  assert.equal(meta.frames.slice(i+1).some(other=>overlap(f,other)),false);
 }
});

test('all mixed loadouts keep five authored views, mirrored left directions, finite grounded mounts and back ordering',()=>{
 for(const head of heads)for(const armor of armors)for(const back of backs)for(let direction=0;direction<8;direction++)for(const cast of [-1,0,5,11]){
  const r=equipmentLayers(outfit(head,armor,back),direction,cast<0?3:0,cast);
  assert.equal(r.underlays.length,direction<5?1:0);assert.equal(r.overlays.length,direction<5?2:3);
  const ids=direction<5?[armor,head]:[armor,back,head];
  for(const [index,layer]of r.overlays.entries()){
   assert.ok(EQUIPMENT_ART_FRAMES[ids[index]].some(f=>f.sx===layer.sx&&f.sy===layer.sy));
   assert.equal(layer.flip,direction>=3&&direction<=5);assert.ok([layer.x,layer.y,layer.width,layer.height,layer.offsetX,layer.offsetY,layer.angle].every(Number.isFinite));
   assert.ok(layer.y<0&&layer.y-layer.height>-95,'Equipment stays above the grounded feet');
  }
  assert.equal(!!r.bodyClip,head!=='visor');assert.ok(!r.bodyClip||r.bodyClip.every(Number.isFinite));
 }
});

test('wearables share one decoded body image and one current GPU page; casts do not upload and changing outfits destroys old pages',()=>{
 const r=engine(),atlas=new PlayerAtlas(),p={direction:1,face:1,back:false,moving:false};
 atlas.paint(r.g,outfit(),p,0);r.images[0].onload();atlas.paint(r.g,outfit(),p,0);
 assert.equal(r.images.length,1);assert.equal(r.uploads.length,2);assert.equal(r.uploads[0].dead,true);assert.ok(r.clips.length>0,'Old hair is clipped before headgear');
 const first=r.uploads.at(-1),count=r.uploads.length;
 for(let direction=0;direction<8;direction++)for(let frame=0;frame<12;frame++)atlas.paint(r.g,outfit(),{...p,direction,castWeapon:'storm',castTime:.28*(1-(frame+.5)/12)},0);
 assert.equal(r.uploads.length,count,'All 128 poses already baked');assert.ok(atlas.bytes<=8388608);
 atlas.paint(r.g,outfit('hood','energy','pack','flame'),p,0);assert.equal(first.dead,true);assert.equal(r.images.length,1);
 const equipmentDraws=r.calls.filter(args=>args[2]>=768&&args[1]!==640&&args[1]!==768&&args[1]!==896);
 assert.ok(equipmentDraws.length>=128*3,'Three wearables baked into every pose');
 for(const head of heads)for(const armor of armors)for(const back of backs)for(const weapon of ['storm','flame','blade']){
  assert.equal(atlas.paint(r.g,outfit(head,armor,back,weapon),p,0),true);assert.ok(atlas.bytes>0&&atlas.bytes<=8388608,'Every mixed full loadout stays within the page budget');
 }
 assert.ok(r.uploads.slice(0,-1).every(page=>page.dead),'Only the current outfit retains a GPU page');
 atlas.destroy();assert.equal(atlas.bytes,0);assert.equal(r.uploads.at(-1).dead,true);
});

test('every item preview and all three qualities retain the 256 KiB static budget and release their texture',()=>{
 const r=engine(),p={direction:1,face:1,back:false,moving:false};
 const seed=new PlayerAtlas();seed.paint(r.g,outfit(),p,0);r.images[0].onload();seed.destroy();
 for(const [slot,items]of [['head',heads],['armor',armors],['back',backs]])for(const id of items)for(const quality of [0,1,2])for(let direction=0;direction<8;direction++){
  const atlas=new PlayerAtlas(true),loadout=emptyLoadout('storm');loadout[slot]={id,quality};
  assert.equal(atlas.paint(r.g,loadout,{...p,direction},0),true);assert.ok(atlas.bytes>0&&atlas.bytes<=262144);atlas.destroy();assert.equal(r.uploads.at(-1).dead,true);
 }
 assert.equal(r.images.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {PlayerAtlas} from '../dist/rendering/player-atlas.js';
import {CAST_DURATION} from '../dist/rendering/player-pose.js';
import {emptyLoadout} from '../dist/shared/model.js';

test('player poses use one bounded upload per equipment set and release replaced native resources',()=>{
 setupLayaStub();
 const bitmaps=[],textures=[],canvases=[];
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 Laya.Browser={createElement:()=>{const c={width:0,height:0,getContext:()=>context};canvases.push(c);return c;}};
 Laya.Texture2D=class{constructor(w,h){this.width=w;this.height=h;bitmaps.push(this);}loadImageSource(){}destroy(){this.destroyed=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;textures.push(this);}destroy(){this.destroyed=true;}static createFromTexture(t){return new this(t.bitmap);}};
 const atlas=new PlayerAtlas(),draws=[],g={clear(){},drawTexture:(...a)=>draws.push(a)};
 for(const weapon of ['storm','flame','blade']){
  const loadout={...emptyLoadout(weapon),head:{id:'helmet',quality:2},armor:{id:'heavy',quality:2},back:{id:'pack',quality:2}};
  for(let direction=0;direction<8;direction++)for(let frame=0;frame<48;frame++){
   const p={direction,face:1,back:false,castWeapon:weapon,castTime:frame<12?CAST_DURATION[weapon]*(1-(frame+.5)/12):0};
   assert.equal(atlas.paint(g,loadout,p,frame/3),true);
  }
  assert.ok(atlas.bytes>0&&atlas.bytes<=8*1048576);
  assert.equal(bitmaps.filter(b=>!b.destroyed).length,1);
  assert.equal(textures.filter(t=>!t.destroyed).length,129,'128 poses and one parent texture');
 }
 assert.equal(bitmaps.length,3,'Pose changes never upload');
 assert.ok(canvases.every(c=>c.width===1&&c.height===1));
 assert.ok(draws.every(([,x,y,w,h])=>[x,y,w,h].every(Number.isFinite)&&w>0&&h>0));
});

test('unsupported player renderer leaves vector fallback intact',()=>{
 setupLayaStub();
 const atlas=new PlayerAtlas();
 assert.equal(atlas.paint({clear(){throw Error('fallback cleared');}},emptyLoadout('storm'),{face:1,back:false},0),false);
 assert.equal(atlas.bytes,0);
});

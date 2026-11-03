import {actorAtlasFrames} from '../dist/rendering/painted-world.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {EnemyAtlas,ordinaryAtlasFrames} from '../dist/rendering/enemy-atlas.js';
import {enemyArtPose,ENEMY_ACTION_SECONDS} from '../dist/enemies/enemy-actions.js';
function engine(){
 setupLayaStub();const canvases=[],bitmaps=[],textures=[];
 const context={setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 Laya.Browser={createElement:()=>{const c={width:0,height:0,getContext:()=>context};canvases.push(c);return c;}};
 Laya.Texture2D=class{constructor(w,h){this.width=w;this.height=h;this.destroyed=false;bitmaps.push(this);}loadImageSource(){}destroy(){this.destroyed=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;textures.push(this);}destroy(){this.destroyed=true;}static createFromTexture(texture,x,y,w,h){return Object.assign(new this(texture.bitmap),{x,y,w,h});}};
 return {canvases,bitmaps,textures};
}
test('ordinary atlas covers every real caster phase and palette with one bounded texture and no per-paint allocation',()=>{
 const f=engine(),atlas=new EnemyAtlas();assert.equal(atlas.bytes,4*1024*1024);assert.equal(f.bitmaps.length,1);assert.equal(f.bitmaps[0].lock,true);
 assert.deepEqual([f.canvases[0].width,f.canvases[0].height],[1,1]);assert.equal(new Set(ordinaryAtlasFrames().map(f=>f.key)).size,57);
 const draws=[],graphics={clear(){},drawTexture:(...a)=>draws.push(a)};
 for(const frame of actorAtlasFrames()) assert.equal(atlas.paintKey(graphics,frame.key),true,frame.key);
 for(let kind=0;kind<3;kind++)for(let i=0;i<100;i++)for(const [flash,ice]of [[false,false],[false,true],[true,false],[true,true]]){
  const pose=enemyArtPose({kind,wind:i%2?.45*(i+.5)/100:0,action:i%2?undefined:'cast',actionTime:ENEMY_ACTION_SECONDS.cast*(i+.5)/100});
  // Slime and boar geometry never depends on the action; caster includes idle, wind and cast.
  assert.equal(atlas.paint(graphics,kind,flash,ice,pose,false),true,`${kind}:${pose.key}`);
 }
 assert.ok(draws.every(([t,x,y,w,h])=>t.bitmap===f.bitmaps[0]&&[x,y,w,h].every(Number.isFinite)));
 assert.equal(f.bitmaps.length,1);assert.equal(f.textures.length,1+ordinaryAtlasFrames().length+actorAtlasFrames().length);
 assert.equal(atlas.paint(graphics,3,false,false,enemyArtPose({kind:3,wind:0}),false),false);
 assert.equal(atlas.paint(graphics,0,false,false,enemyArtPose({kind:0,wind:0}),true),true);
 assert.equal(f.bitmaps.length,2,'Detailed atlas is uploaded only when that quality is first used');
 assert.equal(atlas.bytes,8*1024*1024,'Both quality atlases remain bounded across quality changes');
 assert.ok(ordinaryAtlasFrames(true)[0].shapes.length>ordinaryAtlasFrames(false)[0].shapes.length,'Detailed art retains its extra shapes');
 for(const detail of [true,false,true,false])for(const frame of ordinaryAtlasFrames(detail)){
  const [kind,color,...pose]=frame.key.split(':'),key=pose.join(':');
  assert.equal(atlas.paint(graphics,Number(kind),color==='flash',color==='ice',{key},detail),true);
 }
 assert.equal(f.bitmaps.length,2,'Quality switching reuses the existing atlases');
});
test('atlas unavailable or failed upload safely leaves existing vector renderer available',()=>{
 setupLayaStub();assert.equal(new EnemyAtlas().bytes,0);
 const f=engine();Laya.Texture2D.prototype.loadImageSource=()=>{throw Error('unsupported source');};
 const atlas=new EnemyAtlas();assert.equal(atlas.bytes,0);assert.equal(f.bitmaps[0].destroyed,true);
 assert.equal(atlas.paint({clear(){throw Error('must not clear fallback');},drawTexture(){}},0,false,false,enemyArtPose({kind:0,wind:0}),false),false);
});

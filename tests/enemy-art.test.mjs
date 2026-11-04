import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {EnemyAtlas,ordinaryAtlasFrames,guardianAtlasFrames} from '../dist/rendering/enemy-atlas.js';
import {enemyArt,enemyRaster,enemyGaitFrame} from '../dist/rendering/enemy-art.js';
import {ENEMY_ART_FRAMES} from '../dist/rendering/enemy-art-frames.js';
import {enemyArtPose,ENEMY_ACTION_SECONDS} from '../dist/enemies/enemy-actions.js';
import {enemyPartPoint} from '../dist/rendering/voxel.js';
import {SceneRenderer} from '../dist/rendering/scene-renderer.js';
import {emptyLoadout} from '../dist/shared/model.js';
import {QUALITY_PRESETS} from '../dist/rendering/quality.js';

function engine(){
 setupLayaStub();const images=[],uploads=[],raster=[],transforms=[],draws=[];
 const context={save(){},restore(){},transform(...v){transforms.push(v);},translate(){},rotate(){},scale(){},setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},drawImage(...args){raster.push(args);}};
 Laya.Browser={createElement:type=>{if(type==='img'){const image={src:'',width:1024,height:1024,onload:null,onerror:null};images.push(image);return image;}return{width:0,height:0,getContext:()=>context};}};
 Laya.Texture2D=class{constructor(w,h){this.w=w;this.h=h;uploads.push(this);}loadImageSource(){if(this.fail)throw Error('upload');}destroy(){this.dead=true;}};
 Laya.Texture=class{constructor(bitmap){this.bitmap=bitmap;}destroy(){}static createFromTexture(t,x,y,w,h){return Object.assign(new this(t.bitmap),{x,y,w,h});}};
 Laya.Matrix=class{constructor(a,b,c,d,tx,ty){Object.assign(this,{a,b,c,d,tx,ty});}};
 return {images,uploads,raster,transforms,g:{clear(){},drawTexture(...v){draws.push(v);}},draws,load(){const i=images.find(i=>i.src.includes('ruin-creatures'));i.onload();}};
}

test('delayed enemy art replaces both fallback qualities with one page shared by every actor/gait/palette',()=>{
 const r=engine(),a=new EnemyAtlas();a.paint(r.g,0,false,false,enemyArtPose({kind:0,wind:0}),true);
 assert.equal(a.revision,0);assert.equal(r.uploads.length,2);r.load();assert.equal(a.revision,1);assert.equal(r.uploads[0].dead,true);
 const random=Math.random;Math.random=()=>{throw Error('visual RNG');};
 try{for(const detail of [false,true,false,true])for(let kind=0;kind<5;kind++)for(const action of [undefined,'cast','burst','slam'])for(const palette of ['normal','ice','flash'])for(let gait=0;gait<4;gait++){
  const pose=enemyArtPose({kind,wind:action?0:.12,action,actionTime:action?ENEMY_ACTION_SECONDS[action]*.8:0});
  if(kind===1&&action&&action!=='cast')continue;
  assert.equal(a.paint(r.g,kind,palette==='flash',palette==='ice',pose,detail,gait),true,JSON.stringify({kind,action,palette,detail,gait,snapshot:a.snapshot(detail)}));
 }}finally{Math.random=random;}
 assert.equal(r.uploads.length,3,'Two initial fallback pages replaced by one painted page');assert.equal(r.uploads[1].dead,true);
 assert.equal(a.bytes,4194304);assert.equal(r.images.length,1,'All qualities share one decoded source');
 assert.ok(r.raster.length>100);assert.ok(r.transforms.flat().every(Number.isFinite));
 assert.equal(ordinaryAtlasFrames(false,r.images[0]).length,75);assert.equal(guardianAtlasFrames(false,r.images[0]).length,18);
 const before=r.uploads.length;for(let i=0;i<100;i++)assert.equal(a.paintKey(r.g,'pillar'),true);assert.equal(r.uploads.length,before);
});

test('enemy load/size/upload failure keeps fallback usable without a rebuild retry loop',()=>{
 for(const failure of ['load','size','upload']){
  const r=engine(),a=new EnemyAtlas();
  if(failure==='load')r.images[0].onerror();
  else if(failure==='size'){r.images[0].width=7;r.load();}
  else{Laya.Texture2D.prototype.loadImageSource=()=>{throw Error('native upload rejected');};r.load();}
  assert.equal(a.revision,0);for(let i=0;i<30;i++)assert.equal(a.paint(r.g,0,false,false,enemyArtPose({kind:0,wind:0}),false),true);
  assert.equal(r.uploads.length,failure==='upload'?2:1);assert.equal(a.bytes,4194304);
  if(failure==='upload')assert.equal(r.uploads[1].dead,true);else assert.ok(enemyArt().error);
 }
});

test('mage raster hands and staff use the same affine socket transform through anticipation and recovery',()=>{
 for(const state of [{wind:.45},{wind:.01},{action:'cast',actionTime:.25},{action:'cast',actionTime:.01}]){
  const pose=enemyArtPose({kind:1,wind:0,...state}),r=enemyRaster({},1,false,false,pose);
  for(const [layer,part]of [[r.layers[1],'leftArm'],[r.layers[2],'staff'],[r.layers[3],'rightArm']])for(const p of [{x:22,y:-50},{x:22,y:-24},{x:16,y:-39}]){
   const m=layer.transform,q=enemyPartPoint(p.x,p.y,part,1,pose);assert.ok(Math.abs(m.a*p.x+m.c*p.y+m.tx-q.x)<1e-9);assert.ok(Math.abs(m.b*p.x+m.d*p.y+m.ty-q.y)<1e-9);
  }
 }
});

test('gait is deterministic, slows with frost, freezes at the same game time and never alters snapshots',()=>{
 for(const kind of [0,2]){
  const frames=new Set();for(let i=0;i<4;i++)frames.add(enemyGaitFrame(kind,i/6));assert.equal(frames.size,4);
  assert.equal(enemyGaitFrame(kind,.34),enemyGaitFrame(kind,.68,0,0,true));
  for(let i=0;i<100;i++){const f=enemyGaitFrame(kind,.4,-i,12);assert.ok(f>=0&&f<4);assert.equal(f,enemyGaitFrame(kind,.4,-i,12));}
 }
 assert.equal(enemyGaitFrame(1,99),0);
});

test('normalized enemy family has twenty alpha-safe slices and preserves all crop bounds',async()=>{
 const meta=JSON.parse(await readFile(new URL('../assets/enemies/ruin-creatures.json',import.meta.url),'utf8'));
 assert.equal(meta.frames.length,20);assert.equal(ENEMY_ART_FRAMES.length,20);assert.equal(meta.qa.keyPixels,0);assert.ok(meta.qa.transparentPixels>500000);assert.ok(meta.qa.opaquePixels>40000);
 for(const c of ENEMY_ART_FRAMES){assert.ok(c.sx>=0&&c.sy>=0&&c.sx+c.sw<=1024&&c.sy+c.sh<=1024);assert.ok(c.sw>20&&c.sh>20);}
 const png=await readFile(new URL('../assets/enemies/ruin-creatures.png',import.meta.url));assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);assert.equal(png[25],6);
});

test('source replacement refreshes stationary enemies and cached props once, while pause preserves gait',()=>{
 const r=engine();Laya.init();const scene=new SceneRenderer([{x:100,y:100}]);
 const enemy={kind:0,x:30,y:0,hp:28,max:28,flash:0,wind:0,node:new Laya.Sprite(),actionPaint:'idle'};scene.actors.addChild(enemy.node);
 const shot={node:new Laya.Sprite(),x:20,y:20,vx:1,vy:0,life:1,hostile:true,flame:false,color:'#c99bef'},drop={node:new Laya.Sprite(),x:30,y:30,xp:1};scene.actors.addChild(shot.node);scene.actors.addChild(drop.node);
 const commands=new Map();for(const node of [enemy.node,shot.node,drop.node,...scene.actors._children])node.graphics.drawTexture=(...args)=>commands.set(node,(commands.get(node)||0)+1);
 const state={player:{x:0,y:0,hp:100,inv:0,dash:0,dashTime:0,dx:0,dy:1,face:1,back:false},loadout:emptyLoadout('storm'),levels:{},enemies:[enemy],shots:[shot],drops:[drop],fields:[],fx:[],labels:[],buffs:{recipes:[],speedMultiplier:()=>1,render(){}},visuals:QUALITY_PRESETS.standard,time:0,walkPhase:0,mode:'battle',paused:true,shake:false,shakeTime:0,recoil:0};
 scene.render(state);const before=new Map(commands);r.load();scene.render(state);
 for(const [name,node]of [['enemy',enemy.node],['shot',shot.node],['drop',drop.node]])assert.ok((commands.get(node)||0)>(before.get(node)||0),'Cached '+name+' refreshes after source upload: '+before.get(node)+' -> '+commands.get(node));
 const held=commands.get(enemy.node);scene.render(state);assert.equal(commands.get(enemy.node),held,'Paused game time keeps cached frame');
 scene.render({...state,time:.3});assert.ok(commands.get(enemy.node)>held,'Advancing game time swaps gait texture');
});

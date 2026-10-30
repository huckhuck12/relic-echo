import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {SceneRenderer}=await import('../dist/rendering/scene-renderer.js');
const {emptyLoadout}=await import('../dist/shared/model.js');
const {QUALITY_PRESETS}=await import('../dist/rendering/quality.js');

function fixture(){
  Laya.init();const scene=new SceneRenderer([{x:100,y:100}]);
  const enemy={x:30,y:0,hp:28,max:28,kind:0,flash:0,node:new Laya.Sprite(),wind:0,cooldown:1,actionPaint:'idle'};
  scene.actors.addChild(enemy.node);
  const player=Object.freeze({x:0,y:0,hp:100,inv:0,dash:0,dashTime:0,dx:0,dy:1,face:1,back:false});
  const enemyBefore={...enemy};delete enemyBefore.node;
  const state={player,loadout:emptyLoadout('storm'),levels:Object.freeze({}),
    enemies:Object.freeze([enemy]),shots:Object.freeze([]),drops:Object.freeze([]),fields:Object.freeze([]),fx:Object.freeze([]),labels:Object.freeze([]),
    buffs:{recipes:[],speedMultiplier:()=>1,render(){}},visuals:QUALITY_PRESETS.standard,
    time:0,walkPhase:0,mode:'battle',paused:false,mouseTarget:null,shake:false,shakeTime:0,shakeStrength:0,recoil:0};
  return {scene,state,enemy,enemyBefore};
}

test('standalone renderer updates display nodes without changing frozen world state or combat fields',()=>{
  const {scene,state,enemy,enemyBefore}=fixture();
  scene.render(Object.freeze(state));scene.render(Object.freeze(state));
  const after={...enemy};delete after.node;delete after.flashPaint;delete after.icePaint;
  assert.deepEqual(after,enemyBefore);assert.equal(enemy.node.visible,true);
  assert.deepEqual(scene.world.children,[scene.ground,scene.groundEffects,scene.actors,scene.effects]);
});

test('renderer reuses its map across frames, reads replacement players and shares the live camera transform with input',()=>{
  const {scene,state}=fixture();const ground=scene.ground,children=[...ground.children];
  for(const [w,h]of [[390,844],[844,390],[1280,720]]){
    Laya.stage.width=w;Laya.stage.height=h;
    scene.render({...state,player:{...state.player,x:100,y:200}});
    const screen={x:scene.world.x+scene.playerNode.x*scene.world.scaleX,y:scene.world.y+scene.playerNode.y*scene.world.scaleY};
    const point=scene.screenToWorld(screen.x,screen.y);
    assert.ok(Math.abs(point.x-100)<1e-8);assert.ok(Math.abs(point.y-200)<1e-8);
  }
  assert.equal(scene.ground,ground);assert.deepEqual(ground.children,children);
});

test('animated enemies reuse cached graphics, freeze at paused run time, and reset charge rotation',()=>{
  const {scene,state,enemy}=fixture();
  Object.assign(enemy,{kind:2,charge:.3,dx:1,dy:0,flashPaint:false,icePaint:false});
  let repaints=0;const paint=scene.paintEnemy.bind(scene);
  scene.paintEnemy=(...args)=>{repaints++;paint(...args);};
  scene.render({...state,time:1});
  assert.equal(enemy.node.rotation,-5);assert.ok(enemy.node.scaleX>1);
  enemy.charge=0;
  scene.render({...state,time:1.2});
  assert.notEqual(enemy.node.rotation,-5);assert.equal(repaints,0);
  const frozen=[enemy.node.x,enemy.node.y,enemy.node.scaleX,enemy.node.scaleY,enemy.node.rotation];
  scene.render({...state,time:1.2,paused:true});
  assert.deepEqual([enemy.node.x,enemy.node.y,enemy.node.scaleX,enemy.node.scaleY,enemy.node.rotation],frozen);
});

test('danger telegraphs stay finite and deterministic for ranged, charge and Boss attacks',()=>{
 const {scene,state,enemy}=fixture(),commands=[];
 const g=Object.fromEntries(['drawRect','drawPoly','drawCircle','drawLine','drawLines'].map(name=>[name,(...a)=>commands.push([name,...a])]));
 const before=Math.random;Math.random=()=>{throw Error('visual consumed RNG');};
 try{for(const kind of [1,2,4]){
  commands.length=0;const e={...enemy,kind,radius:kind===4?58:26,wind:.2,charge:kind===4?1:0,dx:1,dy:0};
  scene.drawWarnings({...state,enemies:[e]},g,g);assert.ok(commands.length>=3);
  for(const command of commands)for(const value of command.flat(Infinity))if(typeof value==='number')assert.ok(Number.isFinite(value));
 }}finally{Math.random=before;}
});

test('170 drops reuse cached graphics, freeze their poses and bound special markers to 24',()=>{
 const {scene,state}=fixture();let paints=0;
 const drops=Array.from({length:170},(_,i)=>{const node=new Laya.Sprite();scene.actors.addChild(node);node.graphics.clear=()=>paints++;return {x:i%10*8,y:Math.floor(i/10)*8,xp:0,item:{id:'helmet',quality:1},node};});
 const frame={...state,drops,time:3};scene.render(frame);const pose=drops.map(d=>[d.node.x,d.node.y,d.node.scaleX]);scene.render({...frame,paused:true});assert.deepEqual(drops.map(d=>[d.node.x,d.node.y,d.node.scaleX]),pose);assert.equal(paints,0);
 let calls=0;const g=Object.fromEntries(['drawPoly','drawLine','drawRect'].map(k=>[k,()=>calls++]));
 scene.drawIndicators(frame,g);assert.equal(calls,24*4);
});

test('orange charger route and arrow render below actors while health bars remain above',()=>{
 const {scene,state,enemy}=fixture();
 Object.assign(enemy,{kind:2,radius:20,wind:.4,dx:1,dy:0,hp:14});
 const floor=[],overlay=[];
 for(const [graphics,commands]of [[scene.groundEffects.graphics,floor],[scene.effects.graphics,overlay]]){
  graphics.clear=()=>{commands.length=0;};
  for(const name of ['drawPoly','drawLine','drawRect','drawCircle'])graphics[name]=(...args)=>commands.push({name,args});
 }
 scene.render(state);
 const warningColors=['#8c664c','#bd865b','#e1aa75','#765c48','#d6b388','#ae8960','#ffe0a2'];
 const isRoute=c=>c.args.some(value=>warningColors.includes(value));
 assert.equal(floor.filter(isRoute).length,3);assert.equal(overlay.filter(isRoute).length,0);
 assert.equal(overlay.filter(c=>c.name==='drawRect').length,2);
 assert.ok(scene.world.children.indexOf(scene.groundEffects)<scene.world.children.indexOf(scene.actors));
 enemy.wind=0;scene.render(state);assert.equal(floor.filter(isRoute).length,0);
});

test('cast poses cache within a phase, advance when standing, and cancel visually on weapon change',()=>{
 const {scene,state}=fixture();const player={...state.player,castTime:.28,castWeapon:'storm'};
 let paints=0;scene.playerNode.graphics.clear=()=>paints++;
 scene.render({...state,player});const release=scene.avatarKey;
 scene.render({...state,player:{...player,castTime:.279}});assert.equal(paints,1);
 scene.render({...state,player:{...player,castTime:.14}});assert.notEqual(scene.avatarKey,release);assert.equal(paints,2);
 scene.render({...state,player:{...player,castTime:.14},paused:true});assert.equal(paints,2);
 scene.render({...state,player,loadout:emptyLoadout('flame')});assert.ok(scene.avatarKey.endsWith(':cast12'));
});

test('enemy local attack shapes repaint only on stage changes and stay cached when paused',()=>{
 const {scene,state,enemy}=fixture();Object.assign(enemy,{kind:1,wind:.4,dx:1,dy:0});
 let paints=0;const paint=scene.paintEnemy.bind(scene);scene.paintEnemy=(...a)=>{paints++;paint(...a);};
 scene.render(state);const key=enemy.actionPaint;scene.render(state);assert.equal(paints,1);
 enemy.wind=.399;scene.render(state);assert.equal(enemy.actionPaint,key);assert.equal(paints,1);
 enemy.wind=.1;scene.render(state);assert.equal(paints,2);scene.render({...state,paused:true});assert.equal(paints,2);
 enemy.wind=0;enemy.action='cast';enemy.actionTime=.26;scene.render(state);assert.equal(paints,3);
 enemy.actionTime=0;scene.render(state);assert.equal(paints,4);
});

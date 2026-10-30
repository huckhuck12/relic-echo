import test from 'node:test';
import assert from 'node:assert/strict';
import {CAST_DURATION,direction8,faceToward,weaponPoint,weaponSocket,bladeOrbit} from '../dist/rendering/player-pose.js';
import {avatarShapes} from '../dist/rendering/appearance.js';
import {emptyLoadout,unproject,project,SpatialGrid,resolveStats} from '../dist/shared/model.js';
import {attack} from '../dist/combat/weapon-combat.js';
import {experienceShapes,chestShapes} from '../dist/rendering/loot-presentation.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('guided blades release at the damage radius, retract within it and keep phase across recasts',()=>{
 for(const radius of [150,180,210]){
  const idle=bladeOrbit(3,0,radius,1.7),release=bladeOrbit(3,CAST_DURATION.blade,radius,1.7);
  near(release.radius,radius);assert.ok(release.speed>idle.speed);near(idle.radius,.68*radius);
  let last=release.radius;
  for(let i=1;i<=30;i++){const pose=bladeOrbit(3,CAST_DURATION.blade*(1-i/30),radius,1.7);assert.ok(pose.radius<=last+1e-8);assert.ok(pose.radius<=radius);near(pose.phase,idle.phase);last=pose.radius;}
 }
});

test('eight screen sectors wrap correctly and turning does not alter dash input',()=>{
 for(let d=0;d<8;d++)for(const delta of [-.39,0,.39]){
  const a=d*Math.PI/4+delta;assert.equal(direction8(Math.cos(a),Math.sin(a)),d);
 }
 const p={face:1,back:false,dx:4,dy:9};
 for(let d=0;d<8;d++){const q=unproject(Math.cos(d*Math.PI/4),Math.sin(d*Math.PI/4));faceToward(p,q.x,q.y);assert.equal(p.direction,d);assert.equal(p.back,d>=5);}
 faceToward(p,0,0);assert.equal(p.direction,7);assert.equal(p.dx,4);assert.equal(p.dy,9);
});

test('every weapon retains eight distinct finite equipped poses within the graphics budget',()=>{
 for(const w of ['storm','flame','blade']){
  const loadout={...emptyLoadout(w),head:{id:'helmet',quality:2},back:{id:'pack',quality:2},armor:{id:'heavy',quality:2}};
  const poses=Array.from({length:8},(_,d)=>avatarShapes(loadout,false,1,.7,d));
  assert.equal(new Set(poses.map(p=>JSON.stringify(p))).size,8);
  for(const shapes of poses){assert.ok(shapes.length<100);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));}
 }
});

test('socket follows held geometry and renderer nonuniform recoil in every direction',()=>{
 for(const weapon of ['storm','flame','blade'])for(let d=0;d<8;d++)for(const recoil of [0,.1]){
  const source=weapon==='storm'?{x:25,y:-63}:weapon==='flame'?{x:53,y:-31}:{x:23,y:-34};
  const q=weaponPoint(source,weapon,d),socket=weaponSocket(weapon,d,recoil);
  const a=recoil*18*(Math.cos(d*Math.PI/4)<-.01?-1:1)*Math.PI/180;
  near(socket.x,q.x*(1+recoil*.7)*Math.cos(a)-q.y*(1-recoil*.6)*Math.sin(a));
  near(socket.y,q.x*(1+recoil*.7)*Math.sin(a)+q.y*(1-recoil*.6)*Math.cos(a));
 }
});

test('attacks mount flashes and first lightning at the held weapon while flame collision stays on ground',()=>{
 for(const weapon of ['storm','flame'])for(let d=0;d<8;d++){
  const target={...unproject(Math.cos(d*Math.PI/4)*100,Math.sin(d*Math.PI/4)*100),dead:false,hp:100};
  const player={x:0,y:0,face:1,back:false,dx:0,dy:1};const loadout=emptyLoadout(weapon),grid=new SpatialGrid();grid.rebuild([target]);
  const state={player,loadout,stats:resolveStats(loadout,{}),levels:{},grid,shots:[],fields:[],pillars:[],time:0,overdrive:0,recoil:0};
  const lines=[],fx=[];attack(state,{hit(){},line:(...a)=>lines.push(a),effect:(...a)=>fx.push(a),acquire:()=>new Laya.Sprite(),beep(){}});
  assert.equal(player.direction,d);const socket=weaponSocket(weapon,d,.1,player.castTime),q=project(fx[0][1],fx[0][2]);near(q.x,socket.x);near(q.y,socket.y);
  if(weapon==='storm'){near(lines[0][0],fx[0][1]);near(lines[0][1],fx[0][2]);assert.equal(lines[0][5],0);}
  else{const shot=state.shots[0];assert.equal(shot.x,0);assert.equal(shot.y,0);near(shot.launchX,socket.x);near(shot.launchY-18,socket.y);}
 }
});

test('loot silhouettes stay small and distinguish healing, XP and chest quality',()=>{
 assert.notDeepEqual(experienceShapes(),experienceShapes(true));
 assert.notDeepEqual(chestShapes('#aaaaaa'),chestShapes('#ffcc66'));
 for(const shapes of [experienceShapes(),experienceShapes(true),chestShapes('#ffcc66')]){assert.ok(shapes.length<=15);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));}
});

test('casting arms reach the animated grip in all eight directions and return to idle geometry',()=>{
 for(const weapon of ['storm','flame','blade'])for(let d=0;d<8;d++){
  const loadout=emptyLoadout(weapon),idle=avatarShapes(loadout,false,1,0,d),poses=[];
  for(const f of [1,.7,.35]){
   const time=CAST_DURATION[weapon]*f,shapes=avatarShapes(loadout,false,1,0,d,time),grip=weaponPoint({x:23,y:-24},weapon,d,time);
   assert.ok(shapes.some(s=>s.type==='rect'&&s.fill==='#e4bb8b'&&Math.abs(s.p[0]+3-grip.x)<1e-8&&Math.abs(s.p[1]+3-grip.y)<1e-8));
   assert.ok(shapes.length<100);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));assert.notDeepEqual(shapes,idle);poses.push(JSON.stringify(shapes));
  }
  assert.equal(new Set(poses).size,3);assert.deepEqual(avatarShapes(loadout,false,1,0,d,0),idle);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTO_BUILDS,autoBuildProfile,buildTactics} from '../dist/game/auto-builds.js';
import {autoPlayIntent,AUTO_PLAY_KEY} from '../dist/game/auto-play.js';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const world={enemies:[],shots:[],drops:[],pillars:[]},player={x:0,y:0,hp:100};
const enemy=(x,y=0)=>({x,y,dead:false,kind:0,radius:16,wind:0,charge:0});
function runtime(build){const b=new BuffRuntime({player:{...player,dx:1,dy:0},query:()=>[],damage(){},knock(){}});b.chooseStarter(build);return b;}
test('eighteen automatic rounds cover every branch with all three weapons and repeat predictably',()=>{
 const covered=new Map();for(let i=1;i<=18;i++){const p=autoBuildProfile(i);const weapons=covered.get(p.branch)||new Set();weapons.add(['storm','flame','blade'][(i-1)%3]);covered.set(p.branch,weapons);}
 assert.equal(covered.size,6);assert.ok([...covered.values()].every(s=>s.size===3));assert.equal(autoBuildProfile(19),AUTO_BUILDS[0]);
});
test('build tactics read the installed recipes and select only valid cross-slot frost for a dash',()=>{
 const b=runtime('ice'),a=enemy(150),far=enemy(300);for(const t of [a,far])b.evolutions.hit(t,{kind:'orbit',element:'ice',damage:10,slot:0,branch:'prison'});
 const before=JSON.stringify([...b.evolutions.frost.values()]);const t=buildTactics(b,player,[far,a]);assert.equal(t.orbit,true);assert.equal(t.focus,a);assert.equal(t.dashTarget,a);assert.equal(JSON.stringify([...b.evolutions.frost.values()]),before);
 b.evolutions.frost.get(a).lock=1;assert.equal(buildTactics(b,player,[a,far]).dashTarget,undefined);
 b.evolutions.frost.get(a).lock=0;b.evolutions.frost.get(a).source.slot=1;assert.equal(buildTactics(b,player,[a]).dashTarget,undefined);
 b.install(0,'action','blast');assert.equal(buildTactics(b,player,[a]).orbit,false);
 b.cooldowns[1]=1;assert.equal(buildTactics(b,player,[a]).dashTarget,undefined);
});
test('field builds aim a safe dash at a nearby target and ignore dead enemies',()=>{
 const b=runtime('thunder'),t=enemy(220),dead={...enemy(10),dead:true};const tactics=buildTactics(b,player,[dead,t]);assert.equal(tactics.focus,t);assert.equal(tactics.dashTarget,t);
 const result=autoPlayIntent(player,{...world,enemies:[t]},0,tactics);assert.equal(result.dash,true);assert.ok(result.x>.99);
 assert.equal(buildTactics(b,player,[enemy(300)]).dashTarget,undefined);
});

test('frost dash candidates prefer stored layers, skip expiry before landing, stay bounded and read only',()=>{
 const b=runtime('ice'),near=enemy(100),high=enemy(170),expiring=enemy(120);
 for(const [e,n] of [[near,1],[high,4],[expiring,5]])for(let i=0;i<n;i++)b.evolutions.hit(e,{kind:'orbit',element:'ice',damage:20,slot:0,branch:'prison'});
 b.evolutions.frost.get(expiring).life=.1;
 const before=JSON.stringify([...b.evolutions.frost.values()]);
 const t=buildTactics(b,player,[near,high,expiring]);
 assert.deepEqual(t.dashTargets,[high,near]);assert.equal(t.dashTarget,high);assert.equal(t.dashPathRadius,56);
 assert.equal(JSON.stringify([...b.evolutions.frost.values()]),before);
 for(let i=0;i<20;i++)b.evolutions.hit(enemy(180+i),{kind:'orbit',element:'ice',damage:20,slot:0,branch:'prison'});
 assert.equal(buildTactics(b,player,[near,high]).dashTargets.length,8);
 b.cooldowns[1]=1;assert.equal(buildTactics(b,player,[near,high]).dashTargets,undefined);
});

test('automatic frost dash can harvest a safe path outside the landing radius without expanding field rules',()=>{
 const b=runtime('ice'),target=enemy(80),w={...world,enemies:[target],pillars:[{x:160,y:-60}]};
 b.evolutions.hit(target,{kind:'orbit',element:'ice',damage:20,slot:0,branch:'prison'});
 const tactics=buildTactics(b,player,[target]),a=autoPlayIntent(player,w,0,tactics);
 assert.equal(a.dash,true);assert.ok(a.y>0);
 assert.ok(Math.hypot(a.x*180-target.x,a.y*180-target.y)>110);
 assert.equal(autoPlayIntent(player,w,0,{orbit:true,dashTarget:target,dashRadius:110}).dash,false);
 const plain=runtime('thunder');assert.equal(buildTactics(plain,player,[target]).dashPathRadius,undefined);
});

test('blocked high-stack frost falls back to a reachable second target and still yields to projectile danger',()=>{
 const b=runtime('ice'),high=enemy(150),low=enemy(-100);
 for(const [e,n]of [[high,4],[low,1]])for(let i=0;i<n;i++)b.evolutions.hit(e,{kind:'orbit',element:'ice',damage:20,slot:0,branch:'prison'});
 const w={...world,enemies:[high,low],pillars:[{x:90,y:0}]},t=buildTactics(b,player,w.enemies);
 const a=autoPlayIntent(player,w,0,t);assert.equal(a.dash,true);assert.ok(a.x<-.99);
 const danger={...w,shots:[{x:40,y:0,vx:-200,vy:0,hostile:true}]};
 assert.deepEqual(autoPlayIntent(player,danger,0,t),autoPlayIntent(player,danger,0));
});

test('automatic path choice settles through actual Game movement with ice attribution at 30/60/120Hz',()=>{
 for(const hz of [30,60,120]){
  const g=new Game();g.start('storm',true);g.sound=false;g.buffs.chooseStarter('ice');g.enemies.length=0;g.pillars.length=0;
  Object.assign(g.player,{x:0,y:0});g.pillars.push({x:160,y:-60});g.spawnEnemy(0);
  const e=g.enemies[0];Object.assign(e,{x:80,y:0,hp:10000,speed:0});g.grid.rebuild(g.enemies);
  g.buffs.evolutions.hit(e,{kind:'orbit',element:'ice',damage:20,slot:0,branch:'prison'});g.buffs.cooldowns[0]=999;g.attackTimer=999;
  const a=autoPlayIntent(g.player,{...world,enemies:g.enemies,pillars:g.pillars},0,buildTactics(g.buffs,g.player,g.enemies));
  assert.equal(a.dash,true);g.player.dx=a.x;g.player.dy=a.y;g.dash();
  for(let i=0;i<Math.ceil(.2*hz);i++)g.update(1/hz);
  assert.equal(g.buffs.dashShatters,1);assert.ok(Math.hypot(g.player.x-e.x,g.player.y-e.y)>110);
  assert.ok(g.damageRanking.rows().some(r=>r.id==='orbit/ice'&&r.damage>0));
  assert.equal(g.damageRanking.rows().some(r=>r.id==='blast/force'),false);g.returnToTitle();
 }
});
test('ice steering approaches the contact band rather than continuously fleeing; generic steering is preserved',()=>{
 const e=enemy(180),w={...world,enemies:[e]},b=runtime('ice');assert.ok(autoPlayIntent(player,w,0,buildTactics(b,player,[e])).x>0);
 const near=enemy(20);assert.ok(autoPlayIntent(player,{...world,enemies:[near]},0).x<0);
});

test('combo dash chooses an offset safe landing inside the actual effect radius',()=>{
 const target=enemy(150),w={...world,enemies:[target]};
 const result=autoPlayIntent(player,w,0,{orbit:true,focus:target,dashTarget:target,dashRadius:110});
 assert.equal(result.dash,true);assert.ok(Math.abs(result.y)>.1);
 const landingDistance=Math.hypot(result.x*180-target.x,result.y*180-target.y);
 assert.ok(landingDistance>=target.radius+20&&landingDistance<=110);
 const unreachable=autoPlayIntent(player,world,0,{orbit:true,dashTarget:{x:300,y:0},dashRadius:110});assert.equal(unreachable.dash,false);
 const smallField=autoPlayIntent(player,w,0,{orbit:false,dashTarget:target,dashRadius:70});assert.equal(smallField.dash,false);
});
test('combo dash never overrides projectile danger or lands in a pillar, warning or outside the arena',()=>{
 const target=enemy(220),t={orbit:false,focus:target,dashTarget:target};
 const obstacle=autoPlayIntent(player,{...world,pillars:[{x:180,y:0}]},0,t);assert.equal(obstacle.dash,false);
 const warning={...enemy(180),kind:4,wind:1,charge:0};assert.equal(autoPlayIntent(player,{...world,enemies:[warning]},0,t).dash,false);
 const zone={...enemy(700),kind:4,wind:1,charge:1,dx:300,dy:0};assert.equal(autoPlayIntent(player,{...world,enemies:[zone]},0,t).dash,false);
 const bullet={x:40,y:0,vx:-200,vy:0,hostile:true};const flee=autoPlayIntent(player,{...world,shots:[bullet]},0,t);assert.equal(flee.dash,true);assert.deepEqual(flee,autoPlayIntent(player,{...world,shots:[bullet]},0));
 assert.equal(autoPlayIntent(player,{...world,shots:[{...bullet,x:180,vx:0}]},0,t).dash,false);
 const edge=autoPlayIntent({...player,x:1100},{...world},0,{orbit:false,dashTarget:{x:1300,y:0}});assert.equal(edge.dash,false);
});
test('automatic rewards select the current build and branch via real tokens, persist profile and never grant missing growth',()=>{
 setupLayaStub();const storage=new Map();localStorage.setItem=(k,v)=>storage.set(k,v);localStorage.getItem=k=>storage.get(k)||null;
 const g=new Game();g.sound=false;g.autoPlay.start('storm',true);g.addXP(10);g.autoPlay.frame(1000);g.autoPlay.frame(1700);
 assert.equal(g.buffs.recipes[0].element,'fire');assert.equal(g.buffs.levelOf(g.buffs.recipes[0]),1);
 g.buffs.receiveFragment('field');g.buffs.receiveFragment('field');g.update(1/60);g.autoPlay.frame(2000);g.autoPlay.frame(2700);
 assert.equal(g.buffs.branchOf(g.buffs.recipes[0]),'trail');assert.equal(g.buffs.levelOf(g.buffs.recipes[0]),3);
 g.autoPlay.stop();const report=JSON.parse(storage.get(AUTO_PLAY_KEY));assert.equal(report.schema,4);assert.equal(report.build.branch,'trail');assert.equal(report.equipped[0].branch,'trail');assert.equal(report.equipped[0].level,3);assert.equal(report.enabled,false);
});

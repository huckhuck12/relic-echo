import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const {autoPlayIntent,AUTO_PLAY_KEY}=await import('../dist/game/auto-play.js');
const {STORAGE}=await import('../dist/game/game-config.js');
const {UPGRADES}=await import('../dist/progression/config.js');
const find=(root,name)=>root.name===name?root:childrenOf(root).map(n=>find(n,name)).find(Boolean);

test('autoplay drives normal movement, pauses for user/background, claims real reward tokens and stops cleanly',()=>{
 setupLayaStub();const g=new Game();g.sound=false;g.toggleAutoPlay('storm');const a=g.autoPlay;
 assert.equal(g.training,false);assert.equal(a.enabled,true);assert.equal(g.showPerformance,true);
 a.frame(1000);assert.equal(a.decisions,1);assert.ok(Math.hypot(g.input.stick.x,g.input.stick.y)>.9);
 const before={x:g.player.x,y:g.player.y};g.update(1/60);assert.ok(Math.hypot(g.player.x-before.x,g.player.y-before.y)>0);
 a.frame(1010);assert.equal(a.decisions,1,'Decision rate is bounded');
 g.togglePause();a.frame(1300);a.frame(2300);assert.equal(g.dialog.type,'pause');assert.equal(a.decisions,1);
 g.close();document.hidden=true;a.frame(3000);document.hidden=false;assert.equal(a.decisions,1);
 g.gate.add('focus');a.frame(3200);assert.equal(a.decisions,1);g.gate.remove('focus');
 g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));g.player.hp=20;
 for(let i=0;i<3;i++)g.show({type:'upgrade',choices:[]});
 for(let i=0;i<3;i++){a.frame(4000+i*1000);assert.equal(g.dialog.type,'upgrade');a.frame(4700+i*1000);}
 assert.equal(g.dialog,null);assert.ok(g.player.hp>20);assert.equal(g.flow.pendingCount,0);
 g.show({type:'drop',item:{id:'heavy',quality:2}});a.frame(8000);a.frame(8700);
 assert.equal(g.dialog,null);assert.equal(g.loadout.armor.id,'heavy');
 g.toggleAutoPlay();assert.equal(a.enabled,false);assert.deepEqual(g.input.stick,{x:0,y:0});
 const decisions=a.decisions;a.frame(10000);assert.equal(a.decisions,decisions);
});

test('autoplay restarts with rotating weapons, excludes test scores and keeps bounded persistent diagnostics',()=>{
 setupLayaStub();const storage=new Map();localStorage.getItem=k=>storage.get(k)||null;localStorage.setItem=(k,v)=>storage.set(k,v);
 const g=new Game();g.sound=false;g.toggleAutoPlay('storm');const a=g.autoPlay;
 for(let i=0;i<22;i++){
  a.frame(i*4000);g.time=30+i;g.finish(false,'test death');a.frame(i*4000+200);a.frame(i*4000+2100);
 }
 assert.equal(a.rounds,23);assert.equal(g.loadout.weapon.id,'flame');
 assert.equal(storage.has(STORAGE.records),false);
 const report=JSON.parse(storage.get(AUTO_PLAY_KEY));assert.equal(report.results.length,18);assert.ok(report.actions.length<=24);assert.ok(storage.get(AUTO_PLAY_KEY).length<65536);
 a.stop();g.finish(false,'stopped test');assert.equal(storage.has(STORAGE.records),false,'Stopping does not turn an existing test run into a real score');
 const next=new Game();assert.equal(next.autoPlay.enabled,false,'Reopening never starts unattended play automatically');
 g.start('storm');g.finish(false,'normal');assert.equal(JSON.parse(storage.get(STORAGE.records)).length,1);
});

test('steering avoids enemies, projectiles, boss zones, pillars and world edges with finite directions',()=>{
 const p={x:0,y:0,hp:100},empty={enemies:[],shots:[],drops:[],pillars:[]};
 const enemy={x:20,y:0,kind:0,radius:16,dead:false};
 const flee=autoPlayIntent(p,{...empty,enemies:[enemy]},0);assert.ok(flee.x<0);assert.equal(flee.dash,true);
 const boss={...enemy,x:500,kind:4,wind:1,charge:1,dx:20,dy:0};assert.ok(autoPlayIntent(p,{...empty,enemies:[boss]},0).x<0);
 const bullet={x:80,y:0,vx:-200,vy:0,hostile:true};assert.equal(autoPlayIntent(p,{...empty,shots:[bullet]},0).dash,true);
 assert.equal(autoPlayIntent(p,{...empty,shots:[{...bullet,hostile:false}]},0).dash,false);
 assert.ok(autoPlayIntent(p,{...empty,pillars:[{x:20,y:0}]},0).x<0);
 assert.ok(autoPlayIntent({x:1100,y:0,hp:100},empty,0).x<0);
 const overlap=autoPlayIntent(p,{...empty,enemies:[{...enemy,x:0}]},0);assert.ok(Number.isFinite(overlap.x)&&Number.isFinite(overlap.y));
 const seek=autoPlayIntent(p,{...empty,drops:[{x:0,y:150,xp:1}]},0);assert.ok(seek.y>0);
});

test('rich source reports trim old history to fit diagnostics export while retaining the latest result',()=>{
 setupLayaStub();const storage=new Map();localStorage.setItem=(k,v)=>storage.set(k,v);localStorage.getItem=k=>storage.get(k)||null;
 const g=new Game();g.autoPlay.start('storm',true);const a=g.autoPlay;
 for(let i=0;i<22;i++){
  for(const kind of ['bolt','blast','field','orbit'])for(const element of ['fire','ice','lightning','force']){
   const source={kind,element};g.damageRanking.record(123456789.1234567,source);a.metrics.recordBossDamage(123456789.1234567,source);
  }
  a.frame(i*4000);g.finish(false,'bounded test');a.frame(i*4000+200);a.frame(i*4000+2100);
 }
 const serialized=storage.get(AUTO_PLAY_KEY),report=JSON.parse(serialized);
 assert.ok(serialized.length<=65536);assert.ok(report.results.length>0&&report.results.length<=18);
 assert.equal(report.results.at(-1).round,22);assert.equal(report.results.at(-1).balance.damage.sources.length,16);
 assert.equal(report.schema,4);
});

test('autoplay controls fit start and pause dialogs on portrait and landscape phones',()=>{
 for(const [w,h]of [[320,568],[393,852],[852,393],[568,320],[1280,720]]){
  setupLayaStub();const g=new Game(),ui=new GameUI(g);ui.mobile=w<1000;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const button=find(ui.root,'autoplay-start'),start=find(ui.root,'start');assert.ok(button&&button.y+button.height<=start.y);
  const card=find(ui.root,'select-blade');assert.ok(card.y+card.height<=button.y,'Weapon card must not overlap autoplay at '+w+'x'+h);
  button.emit('click');assert.equal(g.autoPlay.enabled,true);assert.equal(g.mode,'battle');
  assert.equal(g.autoPlay.stress,false);
  g.togglePause();const toggle=find(ui.root,'autoplay-toggle'),resume=find(ui.root,'resume');assert.ok(toggle.y+toggle.height<=resume.y);
  toggle.emit('click');assert.equal(g.autoPlay.enabled,false);assert.equal(g.dialog.type,'pause');
  g.toggleAutoPlay();g.returnToTitle();assert.equal(g.autoPlay.enabled,false);assert.equal(g.dialog.type,'start');
  const stress=find(ui.root,'autoplay-stress');assert.ok(stress.x>=button.x+button.width&&stress.y+stress.height<=start.y);
  stress.emit('click');assert.equal(g.autoPlay.stress,true);assert.equal(g.training,false);
  g.player.inv=0;g.player.hp=1;g.hurt(99999);assert.equal(g.player.hp,1);assert.equal(g.mode,'battle');
  g.toggleAutoPlay();g.player.inv=0;g.hurt(99999);assert.notEqual(g.mode,'battle','Stopping stress disables protection immediately');
 }
});

test('protected automatic runs survive the normal timeline through Boss and restart without scores',()=>{
 setupLayaStub();const storage=new Map();localStorage.getItem=k=>storage.get(k)||null;localStorage.setItem=(k,v)=>storage.set(k,v);
 const g=new Game();g.sound=false;g.toggleAutoPlay('storm',true);
 let reached=false,now=0;
 // Advance the actual gameplay systems and automatic reward choices, not a time jump or training scene.
 for(let step=0;step<50000&&g.dialog?.type!=='result';step++){
  now+=1000/60;g.autoPlay.frame(now);
  if(g.mode==='battle'&&!g.gate.paused){
   g.update(1/60);
   if(step%30===0){g.player.inv=0;g.hurt(99999);}
   if(g.snapshot().boss)reached=true;
  }
 }
 assert.equal(reached,true);assert.equal(g.dialog?.type,'result');assert.ok(g.time>=300);
 g.autoPlay.frame(now+200);
 const report=JSON.parse(storage.get(AUTO_PLAY_KEY)),result=report.results.at(-1);
 assert.equal(report.stress,true);assert.equal(result.stress,true);assert.equal(result.reachedBoss,true);assert.ok(result.bossSeconds>0);
 assert.equal(storage.has(STORAGE.records),false);
 g.autoPlay.frame(now+2200);assert.equal(g.autoPlay.rounds,2);assert.equal(g.autoPlay.stress,true);assert.equal(g.loadout.weapon.id,'flame');
 g.returnToTitle();g.start('storm');g.player.inv=0;g.hurt(99999);assert.notEqual(g.mode,'battle','Normal runs never inherit stress protection');
});

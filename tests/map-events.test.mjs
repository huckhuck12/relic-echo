import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {MapEvents,SEAL_SITES,sealRelayPoints,sealTarget,sealNavigationTarget,sealRule,sealProgressText} from '../dist/game/map-events.js';
import {RUN,RUNS,encounterBeat,progressionTime} from '../dist/game/pace.js';
import {difficultyAt} from '../dist/game/difficulty.js';
import {WORLD_RULES,WORLD_PILLARS} from '../dist/game/game-config.js';
import {childrenOf} from './helpers/laya-stub.mjs';
import {drawMapEvents} from '../dist/rendering/map-event-visuals.js';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);
const fixture=()=>{
 const map=new MapEvents();map.reset(RUNS.standard);const calls=[];
 const update=(time,player,dt=1/60)=>map.update(time,player,dt,RUNS.standard,{start:s=>calls.push('start:'+s.id),complete:s=>calls.push('complete:'+s.id),announce:()=>{}});
 return {map,calls,update};
};

test('court needs eight distinct real local deaths, never hold time, remote kills or duplicate credit',()=>{
 const f=fixture(),s=f.map.sites[1];f.update(210,s);f.update(211,s,18);assert.equal(s.progress,0);
 const killed=(extra={})=>({x:s.x,y:s.y,kind:0,dead:true,...extra});
 const e=killed();f.map.recordKill(e,s,211,RUNS.standard);f.map.recordKill(e,s,211,RUNS.standard);assert.equal(s.progress,1);
 for(const e of [killed({dead:false}),killed({kind:4}),killed({x:s.x+261})])f.map.recordKill(e,s,211,RUNS.standard);
 f.map.recordKill(killed(),{x:s.x+261,y:s.y},211,RUNS.standard);assert.equal(s.progress,1);
 for(let n=0;n<9;n++)f.map.recordKill(killed(),s,212,RUNS.standard);
 assert.equal(s.progress,8);f.update(212,s);assert.equal(s.state,'completed');
 f.update(213,s);assert.equal(f.calls.filter(c=>c==='complete:court').length,1);
 const late=fixture(),t=late.map.sites[1];late.update(210,t);
 late.map.recordKill({...e},t,255,RUNS.standard);assert.equal(t.progress,0);
});

test('spring requires ordered visits, retains partial hold and cannot skip nodes with a large delta',()=>{
 const f=fixture(),s=f.map.sites[2],points=sealRelayPoints(s);f.update(360,s);
 f.update(361,points[2],4);assert.equal(s.progress,0);
 f.update(362,points[0],2);assert.equal(s.progress,2);
 f.update(363,s,1);assert.equal(s.progress,2);
 f.update(364,points[0],20);assert.equal(s.progress,4);assert.deepEqual(sealTarget(s),points[1]);
 f.update(365,points[0],20);assert.equal(s.progress,4);
 f.update(366,points[1],4);assert.equal(s.progress,8);
 f.update(367,points[2],4);assert.equal(s.progress,12);assert.equal(s.state,'completed');
 assert.equal(f.calls.filter(c=>c==='complete:spring').length,1);
});

test('gate only counts its marked guardian, including a kill outside the activation ring',()=>{
 const f=fixture(),s=f.map.sites[3];f.update(480,s);
 for(const sealId of [undefined,'other'])f.map.recordKill({x:s.x,y:s.y,kind:3,dead:true,sealId},s,481,RUNS.standard);
 assert.equal(s.progress,0);
 const guard={x:0,y:0,kind:3,dead:false,sealId:s.id};assert.equal(sealNavigationTarget(s,[guard]),guard);
 guard.dead=true;f.map.recordKill(guard,{x:0,y:0},481,RUNS.standard);f.update(482,{x:0,y:0});assert.equal(s.state,'completed');
});

test('game connects marked guardian and actual damage death to the event reward transaction',()=>{
 const g=new Game();g.sound=false;g.start('storm',true,'standard');g.time=480;
 const site=g.mapEvents.sites[3];Object.assign(g.player,{x:site.x,y:site.y});
 g.mapEvents.update(g.time,g.player,0,g.run,g.mapEventHooks);
 const guard=g.enemies.find(e=>e.sealId===site.id);assert.ok(guard);assert.equal(guard.kind,3);
 assert.equal(g.mapEventTarget,guard);
 g.hit(guard,1e8,{canCrit:false,triggerBuffs:false});assert.equal(site.progress,1);
 g.mapEvents.update(481,g.player,0,g.run,g.mapEventHooks);assert.equal(site.state,'completed');
 assert.ok(g.flow.paused || g.gate.paused); // Real rewards may queue behind an elite fragment.
 const normal=g.enemies.find(e=>e.kind!==3);assert.ok(normal);assert.equal(normal.sealId,undefined);
});

test('all objective geometry is reachable and each objective has a distinct instruction and progress unit',()=>{
 const f=fixture();assert.equal(new Set(f.map.sites.map(s=>sealRule(s).instruction)).size,4);
 const relay=f.map.sites[2];
 for(const p of sealRelayPoints(relay)){
  assert.ok(Math.abs(p.x)+65<WORLD_RULES.limit&&Math.abs(p.y)+65<WORLD_RULES.limit);
  for(const pillar of WORLD_PILLARS)assert.ok(Math.hypot(p.x-pillar.x,p.y-pillar.y)>WORLD_RULES.playerPillarRadius+65);
 }
 for(const s of f.map.sites){assert.ok(sealProgressText(s).includes('/'));const snapshot=JSON.stringify(s);let n=0;drawMapEvents({drawPoly(){n++;},drawLine(){n++;}},[{...s,state:'active'}]);assert.ok(n<=60);assert.equal(JSON.stringify(s),snapshot);}
});

test('a full elite budget reuses an existing guardian instead of creating an impossible missing target',()=>{
 const g=new Game();g.sound=false;g.start('storm',true,'standard');g.time=480;
 for(const e of g.enemies)g.release(e.node);g.enemies=[];
 for(let i=0;i<240;i++)g.spawnEnemy(3,400,0);
 const count=g.enemies.length,s=g.mapEvents.sites[3];Object.assign(g.player,{x:s.x,y:s.y});
 g.mapEvents.update(g.time,g.player,0,g.run,g.mapEventHooks);
 assert.equal(g.enemies.length,count);assert.equal(g.enemies.filter(e=>e.sealId===s.id).length,1);
});

test('run modes preserve quick timing and map the same combat difficulty without global mutation',()=>{
 assert.equal(RUN.bossAt,300);assert.equal(RUN.duration,360);
 assert.equal(RUNS.standard.bossAt,600);assert.equal(RUNS.standard.duration,720);
 assert.equal(progressionTime(300),progressionTime(600,RUNS.standard));
 assert.equal(difficultyAt(150).late,difficultyAt(300,RUNS.standard).late);
 assert.ok(difficultyAt(300,RUNS.standard).damage<difficultyAt(150).damage);
 for(const t of [80,170,260,350,440,530,570,599])assert.equal(encounterBeat(t,RUNS.standard).recovery,true);
 for(const t of [0,90,180,360,540,600])assert.equal(encounterBeat(t,RUNS.standard).recovery,false);
 const a=new Game(),b=new Game();a.start('storm',true,'standard');b.start('blade',true,'quick');
 assert.equal(a.run.duration,720);assert.equal(a.mapEvents.sites.length,4);assert.equal(b.run.duration,360);assert.equal(b.mapEvents.sites.length,0);
 a.start('storm',true,'quick');assert.equal(a.mapEvents.sites.length,0);
});

test('seal activation never credits time before entry; hold progress pauses outside and completes once',()=>{
 const {map,calls,update}=fixture(),site=map.sites[0];
 update(74,site);assert.equal(site.state,'locked');
 update(75,site,18);assert.equal(site.state,'active');assert.equal(site.progress,0);
 update(76,site,1);assert.equal(site.progress,1);
 update(77,{x:site.x+161,y:site.y},1);assert.equal(site.progress,1);
 for(let t=78;t<=94;t++)update(t,site,1);
 assert.equal(site.state,'completed');assert.equal(site.progress,18);
 update(95,site,1);assert.deepEqual(calls,['start:grove','complete:grove']);
 assert.equal(SEAL_SITES[0].state,undefined);
});

test('optional seals expire when ignored, when the challenge expires, or on Boss arrival',()=>{
 const f=fixture();f.update(140,{x:0,y:0});assert.equal(f.map.sites[0].state,'expired');
 const s=f.map.sites[1];f.update(210,s);f.update(255,s,18);assert.equal(s.state,'expired');assert.equal(s.progress,0);
 f.update(600,{x:0,y:0});assert.ok(f.map.sites.every(s=>s.state==='expired'));assert.equal(f.map.active(),undefined);
 f.map.reset(RUNS.standard);assert.ok(f.map.sites.every(s=>s.state==='locked'&&s.progress===0));
});

test('event rewards validate tokens, heal actual HP once and queue real fragment choices',()=>{
 const g=new Game();g.start('storm',true,'standard');g.sound=false;g.player.hp=90;
 g.show({type:'event',site:'test'});const id=g.flow.dialogId;
 assert.equal(g.claimReward(id,{type:'event',id:'unknown'}),false);
 assert.equal(g.claimReward(id-1,{type:'event',id:'heal'}),false);
 assert.equal(g.claimReward(id,{type:'event',id:'heal'}),true);assert.equal(g.player.hp,100);
 assert.equal(g.claimReward(id,{type:'event',id:'heal'}),false);
 g.show({type:'event',site:'test'});const next=g.flow.dialogId;
 assert.equal(g.claimReward(next,{type:'event',id:'fragment'}),true);
 assert.equal(g.dialog.type,'fragment');assert.equal(g.dialog.choices.length,3);assert.ok(g.gate.paused);
 assert.equal(g.claimReward(next,{type:'event',id:'fragment'}),false);
 assert.equal(g.claimReward(g.flow.dialogId,{type:'fragment',id:g.dialog.choices[0]}),true);assert.equal(g.dialog,null);
});

test('standard mode Boss and deadline follow actual simulation seconds',()=>{
 const g=new Game();g.start('storm',true,'standard');g.buffs.starterChosen=true;g.sound=false;
 g.time=599;g.update(1/60);assert.equal(g.enemies.some(e=>e.kind===4),false);
 g.time=600;g.update(1/60);assert.equal(g.enemies.some(e=>e.kind===4),true);
 g.time=719;g.update(1/60);assert.equal(g.mode,'battle');
 g.time=720;g.update(1/60);assert.equal(g.mode,'result');assert.equal(g.dialog.win,false);
});

test('seal centers are reachable within world bounds and clear of pillar collision',()=>{
 for(const site of SEAL_SITES){
  assert.ok(Math.abs(site.x)+160<WORLD_RULES.limit&&Math.abs(site.y)+160<WORLD_RULES.limit);
  for(const pillar of WORLD_PILLARS)assert.ok(Math.hypot(site.x-pillar.x,site.y-pillar.y)>WORLD_RULES.playerPillarRadius+95);
 }
});

test('seal drawing is read-only and does not render completed or hidden sites',()=>{
 const {map,update}=fixture();let draws=0;const graphics={drawPoly:()=>draws++,drawLine:()=>draws++};
 drawMapEvents(graphics,map.sites);assert.equal(draws,0);
 update(75,map.sites[0]);update(76,map.sites[0],1);
 const before=JSON.stringify(map.sites);drawMapEvents(graphics,map.sites);assert.ok(draws>0);assert.equal(JSON.stringify(map.sites),before);
 map.sites[0].state='completed';draws=0;drawMapEvents(graphics,map.sites);assert.equal(draws,0);
});

test('phone mode selection starts the intended run and event buttons fit short landscape dialogs',()=>{
 for(const [w,h]of [[320,568],[393,852],[568,320],[852,393]]){
  setupLayaStub();const g=new Game(),ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const quick=find(ui.root,'mode-quick');assert.ok(quick);quick.emit('click');
  find(ui.root,'start').emit('click');assert.equal(g.runKind,'quick');
  g.returnToTitle();find(ui.root,'mode-standard').emit('click');find(ui.root,'start').emit('click');assert.equal(g.runKind,'standard');
  g.show({type:'event',site:'test'});
  for(const name of ['event-heal','event-fragment']){
   const button=find(ui.root,name);assert.ok(button.height>=44);const p=button.localToGlobal(new Laya.Point(0,0));
   assert.ok(p.y>=0&&p.y+button.height<=h+.1,`${w}x${h} ${name}`);
  }
 }
});

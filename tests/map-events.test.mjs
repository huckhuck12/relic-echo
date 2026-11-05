import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {MapEvents,SEAL_SITES} from '../dist/game/map-events.js';
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

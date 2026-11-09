import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {evolutionOf} from '../dist/buffs/buff-evolutions.js';
import {createBuffEffect} from '../dist/buffs/buff-effects.js';
import {buffSynergies} from '../dist/ui/buff-build-view.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);
const enemy=(x,y=0)=>({x,y,hp:10000,dead:false,kind:0});
function fixture(targets=[enemy(300)]){
 const hits=[],host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,d,_f,_q,source)=>{if(t.dead)return;hits.push({t,d,source});t.hp-=d;if(t.hp<=0)t.dead=true;},knock(){}};
 const r=new BuffRuntime(host);r.chooseStarter('ice','bolt');return {r,hits,targets};
}
function branch(r,id){r.receiveFragment('ice');r.receiveFragment('ice');assert.equal(r.takeBranchRequest('bolt/ice'),true);assert.equal(r.chooseBranch(id,'bolt/ice'),true);}

test('ice projectile pierces three actual swept targets once at 30/60/120Hz, including beyond orbit reach',()=>{
 for(const hz of [30,60,120]){
  const f=fixture([250,330,410,490].map(x=>enemy(x)));branch(f.r,'prison');f.r.trigger('hit',0,0,1);
  for(let i=0;i<hz;i++)f.r.update(1/hz);
  assert.equal(f.hits.length,3);assert.equal(new Set(f.hits.map(h=>h.t)).size,3);
  assert.deepEqual(f.hits.map(h=>h.t),f.targets.slice(0,3));assert.ok(f.hits.every(h=>h.source.kind==='bolt'&&h.source.element==='ice'));
  for(const t of f.targets.slice(0,3))assert.equal(f.r.evolutions.frost.get(t).stacks,2);
  assert.equal(f.targets[3].hp,10000);assert.equal(f.r.effects.length,0);
 }
});

test('piercing respects the corridor and frozen targets cannot be hit again by the same projectile',()=>{
 const on=enemy(300),off=enemy(300,33),f=fixture([on,off]);branch(f.r,'prison');f.r.trigger('hit',0,0,1);
 for(let i=0;i<72;i++)f.r.update(1/60);
 assert.equal(f.hits.length,1);assert.equal(f.hits[0].t,on);assert.equal(off.hp,10000);assert.equal(f.r.evolutions.frost.get(on).stacks,2);
});

test('remote shards pays its branch on one real two-layer projectile contact, with bounded splash and source attribution',()=>{
 const f=fixture([enemy(300),enemy(300,60),enemy(300,80),enemy(300,100),enemy(300,-60)]);branch(f.r,'shards');f.r.trigger('hit',0,0,1);
 for(let i=0;i<24;i++)f.r.update(1/60);
 assert.equal(f.r.evolutions.shatters,1);const splash=f.hits.filter(h=>h.source.cast===undefined);
 assert.equal(splash.length,4);assert.ok(splash.every(h=>h.source.kind==='bolt'&&h.source.element==='ice'&&h.d===35*.7));
 assert.equal(f.r.evolutions.frost.size,1,'Secondary shards never seed frost');
});

test('prison stores remote layers for stronger slow, then cross-slot force consumes them with the ice snapshot',()=>{
 const f=fixture(),t=f.targets[0];branch(f.r,'prison');
 for(let cast=0;cast<2;cast++){
  f.r.cooldowns[0]=0;f.r.trigger('hit',0,0,1);for(let i=0;i<24;i++)f.r.update(1/60);
 }
 assert.equal(f.r.evolutions.shatters,0);assert.equal(f.r.evolutions.frost.get(t).stacks,4);assert.equal(f.r.speedMultiplier(t),.5);
 const before=t.hp;f.r.evolutions.hit(t,{kind:'blast',element:'force',damage:999,slot:0});assert.equal(t.hp,before);
 f.r.evolutions.hit(t,{kind:'blast',element:'force',damage:999,slot:1});
 assert.equal(f.r.evolutions.shatters,1);assert.equal(before-t.hp,35*4*.4);assert.equal(f.r.speedMultiplier(t),.65);
 assert.equal(f.hits.at(-1).source.kind,'bolt');
});

test('remote frost keeps expiry, source snapshots, Boss resistance and zero-feedback settlement',()=>{
 const results=[];
 for(const budget of [0,48]){
  const f=fixture();f.targets[0].kind=4;f.r.setVisualBudget(budget);branch(f.r,'prison');f.r.trigger('hit',0,0,1);
  f.r.grant('orbit');f.r.install(0,'action','orbit');for(let i=0;i<24;i++)f.r.update(1/60);
  assert.equal(f.r.evolutions.frost.get(f.targets[0]).source.kind,'bolt');assert.equal(f.r.speedMultiplier(f.targets[0]),.85);
  f.r.effects.length=0;f.r.update(4.01);assert.equal(f.r.evolutions.frost.size,0);assert.equal(f.r.speedMultiplier(f.targets[0]),1);results.push(f.targets[0].hp);
 }
 assert.equal(results[0],results[1]);
});

test('ice action levels and branch choices remain independent when editing and moving slots',()=>{
 const {r}=fixture();branch(r,'shards');const bolt={...r.recipes[0]};r.grant('orbit');r.install(0,'action','orbit');
 assert.equal(r.levelOf(r.recipes[0]),1);assert.equal(r.branchOf(r.recipes[0]),undefined);assert.equal(r.levelOf(bolt),3);
 r.receiveFragment('ice');r.receiveFragment('ice');r.takeBranchRequest('orbit/ice');r.chooseBranch('prison','orbit/ice');
 assert.equal(r.branchOf(r.recipes[0]),'prison');r.install(0,'action','bolt');assert.equal(r.branchOf(r.recipes[0]),'shards');
 r.grant('kill');r.install(0,'trigger','kill');assert.equal(r.levelOf(r.recipes[0]),3);assert.equal(r.branchOf(r.recipes[0]),'shards');
 assert.equal(evolutionOf(bolt).id,'frostShatter');assert.equal(buffSynergies(r.recipes).find(x=>x.id==='ice').ready,true);
});

test('real starter rewards disclose and install ranged frost for storm/flame and orbit for blade with token protection',()=>{
 for(const [weapon,action]of [['storm','bolt'],['flame','bolt'],['blade','orbit']]){
  const g=new Game();g.sound=false;g.start(weapon,true,'standard');g.show({type:'build',choices:['fire','ice','thunder','free']});
  const ui=new GameUI(g),card=find(ui.root,'build-ice');assert.ok(card);
  const texts=childrenOf(card).map(n=>n.text||'').join(' ');assert.match(texts,action==='bolt'?/远程/:/近身/);
  const token=g.flow.dialogId;assert.equal(g.claimReward(token,{type:'build',id:'ice'}),true);assert.equal(g.buffs.recipes[0].action,action);
  assert.equal(g.claimReward(token,{type:'build',id:'ice'}),false);g.returnToTitle();
 }
});

test('real remote projectile damage and shatter are both counted under ice projectile, never the weapon',()=>{
 const g=new Game();g.sound=false;g.start('storm',true);g.buffs.chooseStarter('ice','bolt');branch(g.buffs,'shards');g.enemies.length=0;g.pillars.length=0;
 Object.assign(g.player,{x:0,y:0});g.spawnEnemy(0);Object.assign(g.enemies[0],{x:300,y:0,hp:10000,speed:0});g.grid.rebuild(g.enemies);g.attackTimer=999;
 g.buffs.trigger('hit',300,0,1);for(let i=0;i<24;i++)g.update(1/60);
 const rows=g.damageRanking.rows();assert.equal(rows.length,1);assert.equal(rows[0].id,'bolt/ice');assert.equal(g.buffs.evolutions.shatters,1);g.returnToTitle();
});

test('control coverage counts live slowed enemy seconds, survives transient clears and resets only for a new run',()=>{
 const f=fixture([enemy(300),enemy(350)]);branch(f.r,'prison');f.r.trigger('hit',0,0,1);for(let i=0;i<30;i++)f.r.update(1/60);
 assert.equal(f.r.controlSummary().slowed,2);assert.ok(f.r.control.slowedEnemySeconds>0);assert.ok(f.r.control.reductionEnemySeconds>0);
 const before=f.r.control.slowedEnemySeconds;f.targets.forEach(t=>t.dead=true);f.r.update(1);assert.equal(f.r.control.slowedEnemySeconds,before);
 f.r.clearTransient();assert.equal(f.r.controlSummary().slowed,0);assert.equal(f.r.control.slowedEnemySeconds,before);f.r.reset();assert.equal(f.r.control.slowedEnemySeconds,0);
});

test('impact ice starts at actual hit/kill coordinates, while dash and other projectiles keep their origin',()=>{
 const host={player:{x:0,y:0,dx:1,dy:0},query:()=>[],damage(){},knock(){}};
 for(const event of ['hit','kill','dash','hurt']){
  const e=createBuffEffect(host,{trigger:event,action:'bolt',element:'ice'},event,350,60,20,1);
  assert.equal(e.x,event==='hit'||event==='kill'?350:0);assert.equal(e.y,event==='hit'||event==='kill'?60:0);
 }
 for(const element of ['fire','lightning','force']){
  const e=createBuffEffect(host,{trigger:'hit',action:'bolt',element},'hit',350,60,20,1);assert.equal(e.x,0);assert.equal(e.y,0);
 }
 const f=fixture([enemy(350)]);branch(f.r,'shards');f.r.trigger('hit',350,0,1);f.r.update(1/120);
 assert.equal(f.r.evolutions.shatters,1);assert.ok(f.hits.some(h=>h.source.kind==='bolt'));
 const onward=fixture([enemy(350),enemy(430),enemy(510)]);branch(onward.r,'prison');onward.r.trigger('hit',350,0,1);
 assert.ok(onward.r.effects[0].vx>0);for(let i=0;i<18;i++)onward.r.update(1/60);
 assert.equal(new Set(onward.hits.map(h=>h.t)).size,3,'An impact-centred projectile continues through its next two targets');
});

test('HUD exposes both actual action levels and selected branches without replacing touch controls',()=>{
 for(const [w,h]of [[320,568],[393,852],[568,320],[852,393]]){
  const g=new Game();g.sound=false;g.start('storm',true);g.buffs.chooseStarter('ice','bolt');branch(g.buffs,'prison');
  const ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const button=find(ui.root,'buffs'),dash=find(ui.root,'dash'),label=find(ui.root,'hud-buffs');
  assert.equal(label.text,'寒牢·弹丸 Lv.3\n冲击爆炸 Lv.1');assert.equal(label.wordWrap,false);
  g.buffs.receiveFragment('ice');ui.update();assert.match(label.text,/寒牢·弹丸 Lv.4/);
  assert.equal(find(ui.root,'buffs'),button);assert.equal(find(ui.root,'dash'),dash);button.emit('click');assert.equal(g.dialog.type,'buffs');g.returnToTitle();
 }
});

test('damage panel shows real accumulated slow coverage separately from effective damage',()=>{
 const g=new Game();g.sound=false;g.start('storm',true);g.buffs.chooseStarter('ice','bolt');g.spawnEnemy(0);
 const e=g.enemies.at(-1);g.buffs.apply(e,{kind:'bolt',element:'ice',damage:1,level:1,slot:0,x:e.x,y:e.y});g.buffs.update(.5);
 const ui=new GameUI(g);g.show({type:'damage'});ui.update();const label=find(ui.root,'damage-control');assert.ok(label);assert.match(label.text,/减速 1 敌/);assert.match(label.text,/敌秒/);g.returnToTitle();
});

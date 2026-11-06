import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {BUFF_RULES} from '../dist/buffs/buff-config.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const ice={kind:'orbit',element:'ice',damage:20,level:5,slot:0,branch:'prison'};
const target=(x=30,y=0)=>({x,y,hp:10000,dead:false,kind:0});
function fixture(targets=[target()]){
 const hits=[],player={x:0,y:0,dx:1,dy:0};
 const r=new BuffRuntime({player,query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,d,_f,_q,source)=>{if(t.dead)return;hits.push({t,d,source});t.hp-=d;if(t.hp<=0)t.dead=true;},knock(){}});
 r.chooseStarter('ice');return {r,hits,player,targets};
}
function dash(f,x=180,y=0){f.r.beginDash(0,0);f.r.traceDash(x,y);Object.assign(f.player,{x,y});f.r.trigger('dash',x,y,1);f.r.update(.001);}

test('dash consumes crossed frost outside the landing blast once and keeps the ice damage snapshot',()=>{
 const f=fixture(),t=f.targets[0];for(let i=0;i<4;i++)f.r.evolutions.hit(t,ice);dash(f);
 assert.equal(f.r.dashShatters,1);assert.equal(f.r.evolutions.shatters,1);assert.deepEqual(f.hits.map(h=>h.d),[40]);
 assert.equal(f.hits[0].source.slot,0);assert.equal(f.hits[0].source.kind,'orbit');assert.equal(f.r.feedback.find(v=>v.kind==='harvest').tx,180);
 f.r.update(.01);assert.equal(f.hits.length,1);
});

test('trace uses travelled segments and does not turn a detour into a diagonal damage shortcut',()=>{
 const f=fixture([target(90,0)]);f.r.evolutions.hit(f.targets[0],ice);f.r.beginDash(0,0);f.r.traceDash(0,100);f.r.traceDash(180,100);Object.assign(f.player,{x:180,y:100});f.r.trigger('dash',180,100,1);f.r.update(.001);
 assert.equal(f.r.dashShatters,0);assert.equal(f.hits.length,0);
 const noTrace=fixture();noTrace.r.evolutions.hit(noTrace.targets[0],ice);noTrace.r.beginDash(0,0);Object.assign(noTrace.player,{x:180});noTrace.r.trigger('dash',180,0,1);noTrace.r.update(.001);assert.equal(noTrace.r.dashShatters,0);
});

test('unmarked route targets do not receive the ordinary blast, and boundary contacts use the actual corridor',()=>{
 for(const [y,expected]of [[BUFF_RULES.frost.dashRadius,1],[BUFF_RULES.frost.dashRadius+.01,0]]){
  const f=fixture([target(30,y),target(40,y)]);f.r.evolutions.hit(f.targets[0],ice);dash(f);assert.equal(f.r.dashShatters,expected);
  assert.ok(f.hits.every(h=>h.source.element==='ice'),'Only existing shatter splash can hit the unmarked neighbor');
 }
});

test('dash rejects dead, expired, locked, unknown and same-slot ice and respects cooldown and clear',()=>{
 for(const change of [{life:0},{lock:1},{stacks:0},{source:{...ice,slot:1}},{source:{...ice,slot:undefined}}]){
  const f=fixture();f.r.evolutions.hit(f.targets[0],ice);Object.assign(f.r.evolutions.frost.get(f.targets[0]),change);dash(f);assert.equal(f.r.dashShatters,0);
 }
 const f=fixture();f.r.evolutions.hit(f.targets[0],ice);f.r.cooldowns[1]=1;dash(f);assert.equal(f.r.dashShatters,0);
 f.r.cooldowns[1]=0;f.r.beginDash(0,0);f.r.traceDash(180,0);f.r.clearTransient();Object.assign(f.player,{x:180});f.r.trigger('dash',180,0,1);f.r.update(.001);assert.equal(f.r.dashShatters,0);
});

test('crowd harvest is bounded, revalidates at settlement and is independent of the visual budget',()=>{
 const totals=[];
 for(const budget of [0,48]){
  const f=fixture(Array.from({length:40},(_,i)=>target(20+i)));f.r.setVisualBudget(budget);for(const t of f.targets)f.r.evolutions.hit(t,ice);dash(f);
  assert.equal(f.r.dashShatters,BUFF_RULES.frost.dashTargets);assert.ok(f.r.feedback.length<=budget);totals.push(f.targets.reduce((sum,t)=>sum+10000-t.hp,0));
 }
 assert.equal(totals[0],totals[1]);
 const f=fixture();f.r.evolutions.hit(f.targets[0],ice);f.r.beginDash(0,0);f.r.traceDash(180,0);Object.assign(f.player,{x:180});f.r.trigger('dash',180,0,1);f.targets[0].dead=true;f.r.update(.001);assert.equal(f.r.dashShatters,0);
});

test('actual Game movement crosses frost at 30/60/120Hz and awards lethal harvest damage once',()=>{
 for(const hz of [30,60,120]){
  const g=new Game();g.start('storm',true);g.buffs.chooseStarter('ice');g.enemies.length=0;g.pillars.length=0;g.player.x=0;g.player.y=0;g.player.dx=1;g.player.dy=0;
  g.spawnEnemy(0);const t=g.enemies[0];Object.assign(t,{x:30,y:0,hp:1,speed:0});g.grid.rebuild(g.enemies);g.buffs.evolutions.hit(t,ice);g.buffs.cooldowns[0]=999;g.attackTimer=999;
  const kills=g.kills;g.dash();for(let i=0;i<Math.ceil(.2*hz);i++)g.update(1/hz);
  assert.equal(g.buffs.dashShatters,1);assert.equal(g.kills,kills+1);assert.equal(g.damageRanking.rows().find(r=>r.id==='orbit/ice').damage,1);g.returnToTitle();
 }
});

test('ready hints prefer high frost, require a ready cross-slot dash and leave simulation unchanged',()=>{
 const f=fixture([target(120),target(160)]);f.r.evolutions.hit(f.targets[0],ice);for(let i=0;i<4;i++)f.r.evolutions.hit(f.targets[1],ice);
 const before=JSON.stringify([...f.r.evolutions.frost]);assert.equal(f.r.frostDashTarget(),f.targets[1]);assert.equal(JSON.stringify([...f.r.evolutions.frost]),before);
 f.r.cooldowns[1]=.1;assert.equal(f.r.frostDashTarget(),undefined);f.r.cooldowns[1]=0;f.targets[1].dead=true;assert.equal(f.r.frostDashTarget(),f.targets[0]);
});

test('mobile dash hint fits and disappears after layer consumption without replacing touch nodes',()=>{
 const g=new Game(),ui=new GameUI(g);g.start('storm',true);g.buffs.chooseStarter('ice');ui.mobile=true;Laya.stage.width=320;Laya.stage.height=568;Laya.stage.emit('resize');g.spawnEnemy(0);const t=g.enemies.at(-1);Object.assign(t,{x:g.player.x+150,y:g.player.y});for(let i=0;i<4;i++)g.buffs.evolutions.hit(t,ice);
 const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean),button=find(ui.root,'dash');ui.update();
 const texts=n=>[n.text||'',...childrenOf(n).flatMap(texts)];assert.ok(texts(ui.root).some(s=>s.includes('高层冰')));
 g.buffs.evolutions.harvestFrost(t,{kind:'blast',element:'force',damage:1,slot:1});ui.update();assert.ok(!texts(ui.root).some(s=>s.includes('高层冰')));assert.equal(find(ui.root,'dash'),button);
});

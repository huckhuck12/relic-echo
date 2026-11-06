import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffEvolutions,EVOLUTION_LIMITS} from '../dist/buffs/buff-evolutions.js';
import {BuffRuntime,FRAGMENTS,recipeDescription} from '../dist/buffs/buffs.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(r,name)=>r.name===name?r:childrenOf(r).map(c=>find(c,name)).find(Boolean);
const ice=(branch,level=3,slot=0)=>({kind:'orbit',element:'ice',damage:10,slot,branch,level});
const force={kind:'blast',element:'force',damage:99,slot:1};
function fixture(count=12){
 const targets=Array.from({length:count},(_,i)=>({x:90+i*4,y:0,dead:false,hp:10000})),hits=[],bursts=[];
 const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,d)=>{hits.push({t,d});t.hp-=d;if(t.hp<=0)t.dead=true;},knock(){}};
 const e=new BuffEvolutions(host,{slow(){},burst:(...a)=>bursts.push(a),arc(){}});return {targets,hits,bursts,host,e};
}

test('cross-slot force consumes two layers once, snapshots ice damage and never spreads stacks',()=>{
 const {e,targets,hits}=fixture(),t=targets[0];e.hit(t,ice());e.hit(t,ice());e.hit(t,force);
 assert.equal(e.shatters,1);assert.equal(e.frost.get(t).stacks,0);assert.equal(hits[0].d,8);assert.equal(hits.length,5);assert.ok(hits.slice(1).every(h=>h.d===4));assert.equal(e.frost.size,1);
 e.hit(t,force);for(let i=0;i<5;i++)e.hit(t,ice());assert.equal(e.shatters,1);
 e.update(1.01);e.hit(t,ice());e.hit(t,ice());e.hit(t,force);assert.equal(e.shatters,2);
});

test('same-slot, unknown provenance, empty, expired and dead targets do not consume frost',()=>{
 for(const bad of [{...force,slot:0},{...force,slot:undefined}]){const {e,targets,hits}=fixture();e.hit(targets[0],ice());e.hit(targets[0],ice());e.hit(targets[0],bad);assert.equal(hits.length,0);assert.equal(e.frost.get(targets[0]).stacks,2);}
 const {e,targets,hits}=fixture();e.hit(targets[0],force);assert.equal(hits.length,0);
 e.hit(targets[0],ice());e.update(3.01);e.hit(targets[0],force);assert.equal(hits.length,0);
 e.hit(targets[0],ice());e.hit(targets[0],ice());targets[0].dead=true;e.hit(targets[0],force);assert.equal(hits.length,0);
});

test('shards pays off on the main target and bounds separate neighbor damage at level five',()=>{
 for(const [level,cap]of [[3,3],[5,5]]){
  const {e,targets,hits}=fixture();e.hit(targets[0],ice('shards',level));assert.equal(e.shatters,0);e.hit(targets[0],ice('shards',level));
  assert.equal(e.shatters,1);assert.equal(hits.length,cap+1);assert.equal(hits[0].t,targets[0]);assert.equal(hits[0].d,7);assert.ok(hits.slice(1).every(h=>h.t!==targets[0]&&h.d===7));assert.equal(targets[0].hp,9993);
 }
 const {e,targets,hits}=fixture(1);for(let i=0;i<2;i++)e.hit(targets[0],ice('shards'));assert.equal(hits.length,1);assert.equal(hits[0].d,7);assert.equal(e.shatters,1);
});

test('prison stores five layers in its first-contact window and requires cross-slot force',()=>{
 for(const [level,stacks,multiplier]of [[3,5,1],[5,3,1],[5,4,1.25],[5,5,1.25]]){
  const {e,targets,hits}=fixture();for(let i=0;i<stacks;i++)e.hit(targets[0],ice('prison',level));
  assert.equal(e.shatters,0);assert.equal(e.frost.get(targets[0]).stacks,stacks);e.hit(targets[0],force);
  assert.equal(hits[0].d,10*stacks*.4*multiplier);assert.equal(hits.length,5);
 }
 const {e,targets}=fixture();e.hit(targets[0],ice('prison'));e.update(3.5);e.hit(targets[0],ice('prison'));e.update(.51);assert.equal(e.frost.size,0);
 for(let i=0;i<20;i++)e.hit(targets[0],ice('prison'));assert.equal(e.frost.get(targets[0]).stacks,5);
});

test('prison trades stored layers for control and returns to base slow after consumption, expiry or clear',()=>{
 const {host,targets}=fixture(1),r=new BuffRuntime(host),t=targets[0];
 for(let n=1;n<=7;n++){
  r.apply(t,{...ice('prison',5),x:0,y:0});
  assert.ok(Math.abs(r.speedMultiplier(t)-( .65-Math.min(n-1,4)*.05))<1e-9);
 }
 r.evolutions.hit(t,force);assert.equal(r.speedMultiplier(t),.65);
 r.update(1.01);r.apply(t,{...ice('prison',5),x:0,y:0});r.apply(t,{...ice('prison',5),x:0,y:0});
 assert.equal(r.speedMultiplier(t),.6);r.evolutions.update(4.01);assert.equal(r.speedMultiplier(t),.65);
 r.update(2.01);assert.equal(r.speedMultiplier(t),1);r.clearTransient();assert.equal(r.speedMultiplier(t),1);
});

test('prison keeps Boss slow capped and unrelated ice does not gain layer control',()=>{
 for(const [branch,kind,expected]of [['prison',4,.85],['shards',0,.65],[undefined,0,.65]]){
  const {host,targets}=fixture(1),r=new BuffRuntime(host),t=targets[0];t.kind=kind;
  for(let i=0;i<5;i++)r.apply(t,{...ice(branch,5),x:0,y:0});
  assert.equal(r.speedMultiplier(t),expected);
 }
});

test('two-contact shards still respect expiry, burst lock and the per-step reaction budget',()=>{
 const {e,targets}=fixture(1),t=targets[0];e.hit(t,ice('shards'));e.update(3.01);e.hit(t,ice('shards'));assert.equal(e.shatters,0);
 e.hit(t,ice('shards'));assert.equal(e.shatters,1);for(let i=0;i<10;i++)e.hit(t,ice('shards'));assert.equal(e.shatters,1);
 e.clear();for(let i=0;i<20;i++){const a={x:i,y:0,dead:false};e.hit(a,ice('shards'));e.hit(a,ice('shards'));}
 assert.equal(e.shatters,16);assert.equal(e.frostRejected,4);
});

test('a single physical ice orbit pays two-contact shards at 30/60/120Hz without stacking casts',()=>{
 for(const hz of [30,60,120]){
  const {host,targets}=fixture(1),r=new BuffRuntime(host);targets[0].x=150;r.chooseStarter('ice');
  r.receiveFragment('ice');r.receiveFragment('ice');r.takeBranchRequest('orbit/ice');r.chooseBranch('shards','orbit/ice');r.trigger('hit',0,0,1);
  for(let n=0;n<Math.round(.7*hz);n++)r.update(1/hz);
  assert.equal(r.evolutions.shatters,1);assert.equal(r.effects.length,1);assert.equal(r.evolutions.frost.get(targets[0]).lock>0,true);
 }
});

test('prison weakens only direct orbit damage; old effects keep their branch and level snapshots',()=>{
 const {host,targets}=fixture(1),r=new BuffRuntime(host);r.chooseStarter('ice');r.receiveFragment('ice');r.receiveFragment('ice');
 r.trigger('hit',0,0,1,()=>0);const old=r.effects[0];assert.equal(old.branch,undefined);assert.equal(old.damage,27);
 assert.ok(r.takeBranchRequest('orbit/ice'));assert.ok(r.chooseBranch('prison','orbit/ice'));assert.equal(old.branch,undefined);
 r.effects.length=0;r.cooldowns[0]=0;r.trigger('hit',0,0,1,()=>0);const effect=r.effects[0];assert.equal(effect.damage,27*.8);assert.equal(effect.reactionDamage,27);
 r.evolutions.hit(targets[0],effect);r.evolutions.hit(targets[0],effect);r.evolutions.hit(targets[0],force);assert.equal(r.evolutions.shatters,1);
 assert.match(recipeDescription(r.recipes[0],1,3,'prison'),/不再自动碎裂/);
});

test('ice branch requests keep pair identity, queue independently of fire and reject the wrong branch family',()=>{
 const r=new BuffRuntime(fixture().host);for(const f of FRAGMENTS)r.grant(f.id);
 for(const [slot,trigger,action,element]of [[0,'dash','field','fire'],[1,'hit','orbit','ice']])for(const [part,id]of Object.entries({trigger,action,element}))r.install(slot,part,id);
 for(let i=0;i<2;i++){r.receiveFragment('field');r.receiveFragment('orbit');}
 const fire=r.takeBranchReward(),frost=r.takeBranchReward();assert.equal(fire.pair,'field/fire');assert.equal(frost.pair,'orbit/ice');assert.equal(r.takeBranchReward(),null);
 assert.equal(r.chooseBranch('trail',frost.pair),false);assert.equal(r.chooseBranch('shards',frost.pair),true);assert.equal(r.chooseBranch('prison',frost.pair),false);
 r.install(1,'trigger','dash');assert.equal(r.branchOf(r.recipes[1]),'shards');r.clearTransient();assert.equal(r.branchOf(r.recipes[1]),'shards');
});

test('ice branch rewards preserve stale-token protection and fit phone layouts',()=>{
 for(const [w,h]of [[320,568],[390,844],[568,320],[844,390]]){
  const g=new Game(),ui=new GameUI(g);g.start('storm',true);g.buffs.chooseStarter('ice');ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');g.show(g.buffs.takeBranchReward());const token=g.flow.dialogId;
  const old=find(ui.root,'branch-prison');for(const id of ['prison','shards']){const n=find(ui.root,'branch-'+id);assert.ok(n.width>=44&&n.height>=44);}
  assert.equal(g.claimReward(token,{type:'branch',id:'trail'}),false);old.emit('click');assert.equal(g.buffs.branchOf(g.buffs.recipes[0]),'prison');
  g.toggleBuffs();assert.ok(find(ui.root,'buff-description'),'branch description remains visible');g.close();
  g.show({type:'drop',item:{id:'cape',quality:0}});old.emit('click');assert.equal(g.dialog.type,'drop');assert.equal(g.claimReward(token,{type:'branch',id:'shards'}),false);
 }
});

test('Boss frost slow caps at 15 percent while layers and shatter damage remain active',()=>{
 const {host,targets}=fixture(1),r=new BuffRuntime(host),boss=targets[0];boss.kind=4;boss.x=150;r.chooseStarter('ice');
 r.trigger('hit',0,0,1,()=>0);r.update(.001);assert.equal(r.speedMultiplier(boss),.85);
 r.evolutions.hit(boss,ice());r.evolutions.hit(boss,ice());r.evolutions.hit(boss,force);assert.equal(r.evolutions.shatters,1);assert.ok(boss.hp<10000);
});

test('frost target cap and clear lifecycle remain bounded with prison marks',()=>{
 const {host}=fixture(0),e=new BuffEvolutions(host,{slow(){},burst(){},arc(){}});
 for(let i=0;i<500;i++)e.hit({x:i,y:0,dead:false},ice('prison'));assert.equal(e.frost.size,EVOLUTION_LIMITS.targets);
 e.clear();assert.equal(e.frost.size,0);assert.equal(e.shatters,0);
});

test('crowd bursts have a fixed per-step budget and rejection never consumes layers or locks a target',()=>{
 const {host}=fixture(0),e=new BuffEvolutions(host,{slow(){},burst(){},arc(){}});
 const targets=Array.from({length:40},(_,i)=>({x:i,y:0,dead:false,hp:1000}));
 for(const t of targets){e.hit(t,ice('prison'));e.hit(t,ice('prison'));e.hit(t,force);}
 assert.equal(e.shatters,16);assert.equal(e.frostRejected,24);assert.equal(e.frost.get(targets[16]).stacks,2);assert.equal(e.frost.get(targets[16]).lock,0);
 e.update(.01);e.hit(targets[16],force);assert.equal(e.shatters,17);assert.equal(e.frost.get(targets[16]).stacks,0);
 e.clear();assert.equal(e.frostRejected,0);
});

test('battle update opens the correct ice branch reward, and revival clearing can reissue an unclaimed choice',()=>{
 const g=new Game();g.start('storm',true);g.buffs.chooseStarter('ice');g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');
 g.update(1/60);assert.equal(g.dialog.type,'branch');assert.equal(g.dialog.pair,'orbit/ice');assert.deepEqual(g.dialog.choices,['shards','prison']);
 g.buffs.clearTransient();assert.equal(g.buffs.takeBranchReward().pair,'orbit/ice');
});

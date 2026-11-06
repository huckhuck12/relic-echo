import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffEvolutions,EVOLUTION_LIMITS} from '../dist/buffs/buff-evolutions.js';
import {BuffRuntime,recipeDescription} from '../dist/buffs/buffs.js';
import {applyBuffSlow} from '../dist/buffs/buff-status.js';
import {drawEvolutionState} from '../dist/buffs/buff-evolution-visuals.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(r,name)=>r.name===name?r:childrenOf(r).map(c=>find(c,name)).find(Boolean);
const bolt=(branch,level=3)=>({kind:'bolt',element:'lightning',damage:10,slot:0,branch,level});
const effect=(element,slot=0)=>({...bolt(),element,slot,x:0,y:0});
function fixture(count=10){
 const targets=Array.from({length:count},(_,i)=>({x:50+i*5,y:0,dead:false,hp:10000})),hits=[];
 const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,d)=>{hits.push({t,d});t.hp-=d;if(t.hp<=0)t.dead=true;},knock(){}};
 const e=new BuffEvolutions(host,{slow(){},burst(){},arc(){}});return {targets,hits,host,e};
}
test('conductive ice adds only one mark per second, checks the threshold once and respects detonation lock',()=>{
 const {e,targets}=fixture(),t=targets[0];e.hit(t,bolt('charge'),true);assert.equal(e.thunder.get(t).stacks,2);
 e.hit(t,bolt('charge'),true);assert.equal(e.thunder.get(t).stacks,3);e.update(1.01);e.hit(t,bolt('charge'),true);
 assert.equal(e.detonations,1);assert.equal(e.thunder.get(t).stacks,0);e.hit(t,bolt('charge'),true);assert.equal(e.thunder.get(t).stacks,0);
 const f=fixture();f.e.hit(f.targets[0],bolt(),true);f.e.update(1.01);f.e.hit(f.targets[0],bolt(),true);assert.equal(f.e.detonations,1);
});
test('only live ice from the other slot qualifies; unowned and secondary slow never grant conductive marks',()=>{
 for(const slot of [0,1,undefined]){
  const {host,targets}=fixture(1),r=new BuffRuntime(host),t=targets[0];
  r.apply(t,{...effect('ice'),slot});r.apply(t,effect('lightning'));
  assert.equal(r.evolutions.thunder.get(t).stacks,slot===1?2:1);
 }
 const {host,targets}=fixture(1),r=new BuffRuntime(host),t=targets[0];
 applyBuffSlow(r.statuses,t,5);r.apply(t,effect('lightning'));assert.equal(r.evolutions.thunder.get(t).stacks,1);
 r.apply(t,effect('ice',1));r.update(1.5);applyBuffSlow(r.statuses,t,5);r.update(.51);
 r.apply(t,effect('lightning'));assert.equal(r.evolutions.thunder.get(t).stacks,2);assert.equal(r.speedMultiplier(t),.65);
});
test('overlapping ice provenance survives a same-slot hit but expires independently; chains never mark neighbors',()=>{
 const {host,targets}=fixture(),r=new BuffRuntime(host),t=targets[0];
 r.apply(t,effect('ice',1));r.update(1);r.apply(t,effect('ice',0));r.apply(t,effect('lightning'));
 assert.equal(r.evolutions.thunder.get(t).stacks,2);assert.equal(r.evolutions.thunder.size,1);
 r.update(1.01);r.apply(t,{...effect('lightning'),branch:'charge'});assert.equal(r.evolutions.thunder.get(t).stacks,3);
 const dead=targets[1];dead.hp=1;r.apply(dead,effect('lightning'));assert.equal(r.evolutions.thunder.has(dead),false);
});
test('spread replaces evolution splash with bounded non-detonating marks and scales at level five',()=>{
 for(const [level,cap] of [[3,3],[5,5]]){
  const {e,targets,hits}=fixture();for(let i=0;i<3;i++)e.hit(targets[0],bolt('spread',level));
  assert.deepEqual(hits.map(h=>h.d),[12]);assert.equal(e.thunder.size,cap+1);assert.equal(e.detonations,1);
  for(const t of targets.slice(1,cap+1))assert.equal(e.thunder.get(t).stacks,1);
 }
});
test('spread respects existing branch thresholds, first-contact expiry and neighbor locks',()=>{
 const {e,targets}=fixture(),[a,b,c,d]=targets;
 e.hit(b,bolt('charge'));e.hit(b,bolt('charge'));e.hit(b,bolt('charge'));e.hit(b,bolt('charge'));
 e.hit(c,bolt());e.hit(c,bolt());for(let i=0;i<3;i++)e.hit(d,bolt());
 e.update(.1);for(let i=0;i<3;i++)e.hit(a,bolt('spread'));
 assert.equal(e.detonations,2);assert.equal(e.thunder.get(b).stacks,4);assert.equal(e.thunder.get(b).source.branch,'charge');
 assert.equal(e.thunder.get(c).stacks,2);assert.equal(e.thunder.get(d).stacks,0);assert.ok(e.thunder.get(b).life<9);
 e.update(8.91);assert.equal(e.thunder.has(b),false);assert.equal(e.thunder.has(c),false);
});
test('charge needs five direct marks, deals 300 or 350 percent and has no evolution splash',()=>{
 for(const [level,multiplier]of [[3,3],[5,3.5]]){
  const {e,targets,hits}=fixture();for(let i=0;i<4;i++)e.hit(targets[0],bolt('charge',level));assert.equal(hits.length,0);
  e.hit(targets[0],bolt('charge',level));assert.deepEqual(hits.map(h=>h.d),[10*multiplier]);assert.equal(e.thunder.size,1);
 }
 const {host,targets,hits}=fixture(),r=new BuffRuntime(host);for(let i=0;i<5;i++)r.apply(targets[0],{...effect('lightning'),branch:'charge'});
 assert.equal(r.evolutions.detonations,1);assert.ok(hits.filter(h=>h.t===targets[1]).every(h=>h.d===5.5),'ordinary elemental chain is retained');
});

test('charge survives a sustained sequence beyond nine seconds but expires after nine seconds without a direct hit',()=>{
 const {e,targets,hits}=fixture(1),t=targets[0];
 for(let i=0;i<4;i++){e.hit(t,bolt('charge'));e.update(3);}
 assert.equal(e.thunder.get(t).stacks,4);assert.equal(e.detonations,0);
 e.hit(t,bolt('charge'));assert.equal(e.detonations,1);assert.equal(hits[0].d,30);
 e.hit(t,bolt('charge'));assert.equal(e.thunder.get(t).life,1,'locked hits must not extend the lock');
 e.update(1.01);e.hit(t,bolt('charge'));e.update(9.01);assert.equal(e.thunder.has(t),false);
});

test('spread propagation cannot refresh a charge window or detonate stored charge',()=>{
 const {e,targets}=fixture(2),[a,b]=targets;e.hit(b,bolt('charge'));e.update(8);
 for(let i=0;i<3;i++)e.hit(a,bolt('spread'));
 assert.equal(e.thunder.get(b).stacks,2);assert.equal(e.thunder.get(b).life,1);assert.equal(e.detonations,1);
 e.update(1.01);assert.equal(e.thunder.has(b),false);
});
test('thunder burst budget rejects without consuming marks or reserving either lock, then permits retry',()=>{
 const {host}=fixture(0),e=new BuffEvolutions(host,{slow(){},burst(){},arc(){}});
 const targets=Array.from({length:40},(_,i)=>({x:i,y:0,dead:false,hp:1000}));
 for(const t of targets){e.hit(t,bolt());e.hit(t,bolt());e.hit(t,bolt(),true);}
 assert.equal(e.detonations,EVOLUTION_LIMITS.thunderBurstsPerStep);assert.equal(e.thunderRejected,24);
 const mark=e.thunder.get(targets[16]);assert.equal(mark.stacks,2);assert.equal(mark.lock,0);assert.equal(mark.conductiveLock||0,0);
 e.update(.01);e.hit(targets[16],bolt(),true);assert.equal(e.detonations,17);assert.equal(mark.stacks,0);
 e.clear();assert.equal(e.thunderRejected,0);assert.equal(e.thunder.size,0);
});
test('thunder and propagated targets stay bounded and dead targets never acquire marks',()=>{
 const {e}=fixture(0);for(let i=0;i<500;i++)e.hit({x:i,y:0,dead:false},bolt('charge'));assert.equal(e.thunder.size,200);
 const dead={x:0,y:0,dead:true};e.hit(dead,bolt(),true);assert.equal(e.thunder.has(dead),false);
 e.update(9.01);assert.equal(e.thunder.size,0);
 const f=fixture(250);for(const t of f.targets.slice(1,200))f.e.hit(t,bolt('charge'));
 for(let i=0;i<3;i++)f.e.hit(f.targets[0],bolt('spread',5));assert.equal(f.e.thunder.size,200);
});
test('branch choices belong to lightning pair, retain growth across trigger edits and snapshot released bolts',()=>{
 const r=new BuffRuntime(fixture().host);r.chooseStarter('thunder');r.receiveFragment('lightning');r.receiveFragment('lightning');
 r.trigger('hit',0,0,1,()=>0);const old=r.effects[0];assert.equal(old.branch,undefined);
 const reward=r.takeBranchReward();assert.equal(reward.pair,'bolt/lightning');assert.deepEqual(reward.choices,['spread','charge']);
 assert.equal(r.chooseBranch('prison',reward.pair),false);assert.equal(r.chooseBranch('charge',reward.pair),true);assert.equal(r.chooseBranch('spread',reward.pair),false);
 r.cooldowns[0]=0;r.trigger('hit',0,0,1,()=>0);assert.equal(old.branch,undefined);assert.equal(r.effects.at(-1).branch,'charge');
 r.install(0,'trigger','dash');assert.equal(r.branchOf(r.recipes[0]),'charge');
 assert.match(recipeDescription(r.recipes[0],1,3,'charge'),/五印引爆/);
});
test('lightning branch cards retain transaction protection and fit phone portrait and landscape',()=>{
 for(const [w,h] of [[320,568],[390,844],[568,320],[844,390]]){
  const g=new Game(),ui=new GameUI(g);g.start('storm',true);g.buffs.chooseStarter('thunder');ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  g.buffs.receiveFragment('lightning');g.buffs.receiveFragment('lightning');g.update(1/60);
  assert.equal(g.dialog.pair,'bolt/lightning');const token=g.flow.dialogId,old=find(ui.root,'branch-charge');
  for(const id of ['spread','charge']){const n=find(ui.root,'branch-'+id);assert.ok(n.width>=44&&n.height>=44);}
  assert.equal(g.claimReward(token,{type:'branch',id:'prison'}),false);old.emit('click');assert.equal(g.buffs.branchOf(g.buffs.recipes[0]),'charge');
  g.toggleBuffs();assert.ok(find(ui.root,'buff-description'));g.close();g.show({type:'drop',item:{id:'cape',quality:0}});old.emit('click');assert.equal(g.dialog.type,'drop');
  assert.equal(g.claimReward(token,{type:'branch',id:'spread'}),false);
 }
});
test('charge displays five ticks and a lock indicator without changing simulation state or exceeding mark budget',()=>{
 const {e,targets}=fixture();e.hit(targets[0],bolt('charge'));e.hit(targets[1],bolt('charge'));
 const calls=[];const g=new Proxy({},{get:(_,name)=>(...args)=>calls.push({name,args})});
 const before=JSON.stringify([...e.thunder.values()]);drawEvolutionState(g,g,(x,y)=>({x,y}),e,()=>true,2);assert.equal(JSON.stringify([...e.thunder.values()]),before);
 assert.equal(calls.filter(c=>c.name==='drawPoly'&&c.args[1]===-94&&c.args.length>=5).length,10);
 for(let i=0;i<4;i++)e.hit(targets[0],bolt('charge'));calls.length=0;drawEvolutionState(g,g,(x,y)=>({x,y}),e,()=>true,1);
 assert.ok(calls.some(c=>c.name==='drawLine'&&c.args[1]===-87));
});

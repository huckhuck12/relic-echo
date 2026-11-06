import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime,BUFF_LIMITS} from '../dist/buffs/buffs.js';
import {buffLevelMultiplier} from '../dist/buffs/buff-upgrades.js';
import {fragmentChoices} from '../dist/progression/fragment-rewards.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(root,name)=>root.name===name?root:childrenOf(root).map(c=>find(c,name)).find(Boolean);
function fixture(){
 const targets=[{x:30,y:0,dead:false,hp:10000}],hits=[],knocks=[],player={x:0,y:0,dx:1,dy:0};
 const r=new BuffRuntime({player,query:(x,y,d)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=d),damage:(t,d)=>{hits.push(d);t.hp-=d;if(t.hp<=0)t.dead=true;},knock:(...v)=>knocks.push(v)});
 r.chooseStarter('fire'); return {r,player,targets,hits,knocks};
}
function branch(r,id){r.receiveFragment('fire');r.receiveFragment('fire');assert.equal(r.takeBranchRequest(),true);assert.equal(r.chooseBranch(id),true);}

test('pair growth survives trigger and slot edits, offers one exclusive branch and bounds pending upgrades',()=>{
 const {r}=fixture();assert.deepEqual([1,2,3,4,5].map(buffLevelMultiplier),[1,1.35,1.35,1.7,1.7]);
 r.receiveFragment('fire');r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),3);
 assert.equal(r.takeBranchRequest(),true);assert.equal(r.takeBranchRequest(),false);
 r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),4);assert.equal(r.receiveFragment('fire').kind,'xp');
 r.install(0,'trigger','hit');assert.equal(r.levelOf(r.recipes[0]),4);
 assert.equal(r.chooseBranch('furnace'),true);assert.equal(r.chooseBranch('trail'),false);
 r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),5);
 r.clearTransient();assert.equal(r.branchOf(r.recipes[0]),'furnace');r.reset();assert.equal(r.branchOf(r.recipes[0]),undefined);
});

test('trail follows actual completed dash, snapshots branch, deduplicates overlaps and falls back at capacity',()=>{
 const {r,player,targets,hits}=fixture();branch(r,'trail');
 r.beginDash(0,0);player.x=120;r.trigger('dash',120,0,1);
 assert.deepEqual(r.effects.map(e=>e.x),[0,60,120]);assert.equal(r.evolutions.seeds.length,1);assert.equal(r.evolutions.seeds[0].x,120);
 targets[0].x=60;r.update(.01);assert.deepEqual(hits,[14*.85]);
 r.receiveFragment('fire');r.receiveFragment('fire');assert.equal(r.effects[0].level,3);assert.equal(r.effects[0].life,2.99);
 r.effects.length=0;for(let i=0;i<BUFF_LIMITS.field-2;i++)r.effects.push({kind:'field',element:'ice',life:4});
 r.cooldowns[0]=0;r.beginDash(120,0);player.x=240;r.trigger('dash',240,0,1);
 assert.equal(r.effects.length,BUFF_LIMITS.field-1);assert.equal(r.effects.at(-1).x,240);assert.equal(r.effects.at(-1).damage,17);
});

test('cross-slot reforge pulls living burning targets in valid fields, preserves Boss immunity and locks each target',()=>{
 for(const kind of [0,3,4]){
  const {r,targets,knocks}=fixture();targets[0].kind=kind;
  r.trigger('dash',0,0,1);r.update(.01);r.trigger('hit',30,0,1,()=>0);r.update(.01);
  assert.equal(r.reforges,1);assert.equal(knocks.length,kind===4?0:1);if(knocks.length)assert.equal(knocks[0][1],-380);
  r.cooldowns[1]=0;r.trigger('hit',30,0,1,()=>0);r.update(.01);assert.equal(r.reforges,1);assert.equal(knocks.length,kind===4?0:1);
  r.update(1.01);r.cooldowns[1]=0;r.trigger('hit',30,0,1,()=>0);r.update(.01);assert.equal(r.reforges,2);
 }
 const {r,targets,knocks}=fixture();r.trigger('dash',0,0,1);r.update(.01);targets[0].x=300;
 r.trigger('hit',300,0,1,()=>0);r.update(.01);assert.equal(r.reforges,0);assert.equal(knocks[0][1],380);
});

test('same-slot force never reforges, and lethal base hits cannot react or attach elements to corpses',()=>{
 const {r,targets,knocks}=fixture();r.trigger('dash',0,0,1);r.update(.01);
 r.grant('force');r.install(0,'element','force');r.cooldowns[0]=0;r.trigger('dash',0,0,1);r.update(.01);
 assert.equal(r.reforges,0);assert.equal(knocks[0][1],380);
 const f=fixture();f.r.trigger('dash',0,0,1);f.r.update(.01);f.targets[0].hp=1;f.r.trigger('hit',30,0,1,()=>0);f.r.update(.01);
 assert.equal(f.targets[0].dead,true);assert.equal(f.r.reforges,0);assert.equal(f.knocks.length,0);
});

test('furnace refreshes its own center and Lv.5 heat burst does not recursively dispatch buffs',()=>{
 const {r,player,hits}=fixture();branch(r,'furnace');r.receiveFragment('fire');r.receiveFragment('fire');
 r.trigger('dash',0,0,1);assert.equal(r.effects[0].radius,70);assert.equal(r.effects[0].damage,17*1.35);
 r.cooldowns[0]=0;player.x=10;r.trigger('dash',10,0,1);assert.equal(r.effects.length,1);
 r.update(.01);r.trigger('hit',30,0,1,()=>0);r.update(.01);
 assert.equal(r.reforges,1);assert.equal(r.procs,3);assert.ok(hits.includes(17*1.35*.6));
});

test('first growth offers editable complete builds once and free choice preserves a normal upgrade',()=>{
 for(const id of ['fire','ice','thunder','free']){
  const g=new Game();g.start('storm',true);g.addXP(10);assert.equal(g.dialog.type,'build');const token=g.flow.dialogId;
  assert.equal(g.claimReward(token,{type:'build',id}),true);assert.equal(g.claimReward(token,{type:'build',id}),false);
  if(id==='free'){assert.equal(g.dialog.type,'upgrade');g.claimReward(g.flow.dialogId,{type:'upgrade',id:g.dialog.choices[0]});}
  else assert.ok(g.buffs.recipes.every(r=>r.trigger&&r.action&&r.element));
  g.addXP(30);assert.equal(g.dialog.type,'upgrade');
 }
});

test('equipped pair upgrades remain available before catalog completion',()=>{
 const {r}=fixture(),upgradable=new Set(['field','fire']);
 const choices=fragmentChoices(r.owned,new Set(),()=>.5,upgradable);assert.ok(choices.includes('field'));assert.ok(choices.includes('fire'));
});

test('build and branch cards fit phone layouts and stale card callbacks cannot choose a later reward',()=>{
 for(const [w,h]of [[320,568],[390,844],[568,320],[844,390],[1280,720]]){
  const g=new Game(),ui=new GameUI(g);g.start('storm',true);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');g.addXP(10);
  for(const id of g.dialog.choices){const card=find(ui.root,'build-'+id);assert.ok(card.width>=44&&card.height>=44);}
  const stale=find(ui.root,'build-ice');find(ui.root,'build-fire').emit('click');assert.equal(g.dialog,null);
  g.buffs.receiveFragment('fire');g.buffs.receiveFragment('fire');g.buffs.takeBranchRequest();g.show({type:'branch',choices:['trail','furnace']});
  stale.emit('click');assert.equal(g.dialog.type,'branch');const token=g.flow.dialogId;
  find(ui.root,'branch-trail').emit('click');assert.equal(g.buffs.branchOf(g.buffs.recipes[0]),'trail');assert.equal(g.claimReward(token,{type:'branch',id:'furnace'}),false);
 }
});

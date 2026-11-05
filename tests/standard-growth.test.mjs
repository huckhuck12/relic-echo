import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {BuffMastery} from '../dist/buffs/buff-mastery.js';
import {nextXP} from '../dist/shared/model.js';
import {fragmentRewardText,fragmentRouteHint} from '../dist/progression/fragment-rewards.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);
function runtime(){
 const r=new BuffRuntime({player:{x:0,y:0,dx:1,dy:0},query:()=>[],damage(){},knock(){}});
 r.chooseStarter('fire');r.configureGrowth(true);return r;
}
function grow(r){
 for(let i=0;i<3;i++)r.receiveFragment('fire');
 assert.equal(r.levelOf(r.recipes[0]),3);assert.ok(r.takeBranchRequest());assert.ok(r.chooseBranch('trail'));
}

test('standard growth spends 1/2/3/4 matching fragments per rank without spending on unrelated pairs',()=>{
 const r=runtime();grow(r);
 assert.equal(r.receiveFragment('fire').kind,'progress');
 assert.match(fragmentRouteHint('fire',r.owned,r.upgradePreview('fire')),/2\/3/);
 const result=r.receiveFragment('fire');assert.equal(result.progress,2);assert.equal(r.levelOf(r.recipes[0]),3);
 assert.match(fragmentRewardText('fire',result),/2\/3/);
 r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),4);
 r.receiveFragment('fire');r.receiveFragment('fire');r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),4);
 r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),5);
 assert.equal(r.receiveFragment('fire').kind,'xp');assert.equal(r.levelOf(r.recipes[1]),1);
});

test('partial pair growth survives slot and trigger edits, clears on restart and quick mode stays immediate',()=>{
 const r=runtime();r.receiveFragment('fire');r.receiveFragment('fire');
 const pair={...r.recipes[0]};r.install(0,'element','force');
 for(const part of ['trigger','action','element'])r.install(1,part,pair[part]);
 r.install(1,'trigger','hit');assert.equal(r.upgradePreview('fire').progress,1);
 r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[1]),3);
 r.reset();r.chooseStarter('fire');assert.equal(r.upgradePreview('fire').progress,0);
 r.configureGrowth(false);r.receiveFragment('fire');r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),3);
});

test('mastery offers at most two distinct trained pairs at 4/7 minutes and preserves choices through transient clearing',()=>{
 const r=runtime();grow(r);
 assert.equal(r.mastery.take(239,r.recipes,x=>r.levelOf(x)),null);
 assert.equal(r.mastery.take(240,r.recipes,x=>r.levelOf(x)),'field/fire');
 assert.equal(r.mastery.choose('field/fire','toString'),false);
 assert.equal(r.mastery.choose('field/fire','power'),true);
 assert.equal(r.mastery.choose('field/fire','tempo'),false);
 assert.equal(r.mastery.take(420,r.recipes,x=>r.levelOf(x)),null);
 for(let i=0;i<3;i++)r.receiveFragment('force');
 assert.equal(r.mastery.take(419,r.recipes,x=>r.levelOf(x)),null);
 assert.equal(r.mastery.take(420,r.recipes,x=>r.levelOf(x)),'blast/force');
 assert.equal(r.mastery.choose('blast/force','tempo'),true);
 r.clearTransient();assert.equal(r.mastery.of(r.recipes[0]),'power');
 assert.equal(r.mastery.take(800,r.recipes,()=>5),null);r.reset();assert.equal(r.mastery.choices.size,0);
});

test('mastery snapshots damage and cooldown at cast and does not grant extra effects or bypass existing cooldown',()=>{
 for(const [id,damage,cooldown]of [['power',1.3,1.25],['tempo',.8,.8]]){
  const r=runtime();grow(r);r.trigger('dash',0,0,1);const first=r.effects[0],base=first.damage,cd=r.cooldowns[0];
  r.mastery.take(240,r.recipes,x=>r.levelOf(x));r.mastery.choose('field/fire',id);
  assert.equal(first.damage,base);assert.equal(r.cooldowns[0],cd);
  r.effects.length=0;r.cooldowns[0]=0;r.trigger('dash',0,0,1);
  assert.ok(Math.abs(r.effects[0].damage/base-damage)<1e-8);assert.ok(Math.abs(r.cooldowns[0]/cd-cooldown)<1e-8);
  const count=r.effects.length;r.trigger('dash',0,0,1);assert.equal(r.effects.length,count);
 }
});

test('standard XP slows late level spam while the initial upgrade and quick curve remain unchanged',()=>{
 assert.equal(nextXP(1,true),10);assert.equal(nextXP(20),86);assert.equal(nextXP(20,true),176);
 const g=new Game();g.start('storm',true,'standard');g.buffs.starterChosen=true;
 assert.equal(g.snapshot().need,10);g.addXP(10);assert.equal(g.level,2);assert.equal(g.snapshot().need,14);
 g.close();g.addXP(13);assert.equal(g.level,2);g.addXP(1);assert.equal(g.level,3);
});

test('mastery reward rejects stale IDs, unknown pairs and repeated claims and renders phone cards',()=>{
 for(const [w,h]of [[320,568],[568,320],[393,852],[852,393]]){
  setupLayaStub();const g=new Game(),ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  g.start('storm',true,'standard');g.buffs.chooseStarter('fire');grow(g.buffs);
  const pair=g.buffs.mastery.take(240,g.buffs.recipes,r=>g.buffs.levelOf(r));g.show({type:'mastery',pair,choices:['power','tempo']});
  const token=g.flow.dialogId;assert.equal(g.claimReward(token-1,{type:'mastery',id:'power'}),false);
  const card=find(ui.root,'mastery-tempo');assert.ok(card.height>=44);const p=card.localToGlobal({x:0,y:0});assert.ok(p.y>=0&&p.y+card.height<=h);
  card.emit('click');assert.equal(g.buffs.mastery.of(g.buffs.recipes[0]),'tempo');assert.equal(g.dialog,null);
  assert.equal(g.claimReward(token,{type:'mastery',id:'power'}),false);
 }
 const m=new BuffMastery();assert.equal(m.choose('field/fire','power'),false);
});

test('live standard run offers mastery on the real timeline and preserves the held floating stick across its reward',()=>{
 setupLayaStub();const g=new Game(),ui=new GameUI(g);g.start('storm',true,'standard');g.buffs.chooseStarter('fire');grow(g.buffs);g.level=2;g.sound=false;
 ui.mobile=true;Laya.stage.width=393;Laya.stage.height=852;Laya.stage.emit('resize');
 const stick=ui.hudView.stick,point=stick.activation.localToGlobal({x:40,y:80});
 Laya.stage.mouseX=point.x;Laya.stage.mouseY=point.y;stick.activation.emit('mousedown',{touchId:11});
 Laya.stage.mouseX=point.x+40;Laya.stage.emit('mousemove',{touchId:11});assert.equal(stick.stickTouch,11);
 g.time=239;g.update(1/60);assert.equal(g.dialog,null);
 g.time=240;g.update(1/60);assert.equal(g.dialog.type,'mastery');assert.equal(stick.stickTouch,11);
 find(ui.root,'mastery-power').emit('click',{touchId:22});
 Laya.stage.mouseX=point.x+45;Laya.stage.emit('mousemove',{touchId:11});assert.ok(g.input.stick.x>0);assert.equal(stick.stickTouch,11);
 g.start('storm',true,'quick');g.buffs.chooseStarter('fire');g.buffs.receiveFragment('fire');g.buffs.receiveFragment('fire');g.buffs.takeBranchRequest();g.buffs.chooseBranch('trail');g.level=2;g.time=240;g.update(1/60);assert.notEqual(g.dialog?.type,'mastery');
});

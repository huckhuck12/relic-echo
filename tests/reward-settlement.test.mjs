import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {UPGRADES}=await import('../dist/progression/config.js');
const create=()=>{const g=new Game();g.start('storm',true);g.sound=false;return g;};
const open=(g,dialog)=>{g.show(dialog);return g.flow.dialogId;};

test('settlement rejects wrong type, non-candidates, stale IDs and callbacks from a previous run',()=>{
 const g=create(),id=open(g,{type:'upgrade',choices:[]}),choice={type:'upgrade',id:g.dialog.choices[0]};
 const before={xp:g.xp,hp:g.player.hp,levels:{...g.levels},revision:g.flow.revision};
 const events=[];g.onChange=()=>events.push('change');g.onToast=m=>events.push(m);
 for(const invalid of [{type:'fragment',id:'fire'},{type:'drop',accept:false},{type:'upgrade',id:'unknown'}])assert.equal(g.claimReward(id,invalid),false);
 assert.equal(g.claimReward(id-1,choice),false);
 assert.deepEqual({xp:g.xp,hp:g.player.hp,levels:g.levels,revision:g.flow.revision},before);assert.deepEqual(events,[]);
 assert.equal(g.claimReward(id,choice),true);assert.equal(g.levels[choice.id],1);
 g.start('storm',true);const next=open(g,{type:'upgrade',choices:[]});
 assert.equal(g.claimReward(id,choice),false);assert.equal(g.flow.dialogId,next);assert.deepEqual(g.levels,{});
});

test('identical healing rewards are claimed once per ID, including at full health',()=>{
 const g=create();g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));g.player.hp=70;
 const id=open(g,{type:'upgrade',choices:[]});g.show({type:'upgrade',choices:[]});
 const messages=[];g.onToast=m=>messages.push(m);
 assert.equal(g.claimReward(id,{type:'upgrade',id:'heal'}),true);assert.equal(g.player.hp,100);
 const next=g.flow.dialogId;assert.equal(g.claimReward(id,{type:'upgrade',id:'heal'}),false);assert.equal(g.flow.dialogId,next);
 assert.equal(g.claimReward(next,{type:'upgrade',id:'heal'}),true);assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);
 assert.deepEqual(messages,['已恢复 30 点生命','生命已满，本次奖励已领取']);
});

test('equipment replacement commits stats before advancing existing rewards and queues salvage upgrades last',()=>{
 const g=create();g.xp=9;g.player.hp=40;
 const id=open(g,{type:'drop',item:{id:'flame',quality:1}});g.show({type:'fragment',choices:[]});
 const observations=[];g.onChange=()=>observations.push({dialog:g.dialog.type,weapon:g.loadout.weapon.id,hp:g.player.hp,level:g.level,pending:g.flow.pendingCount,paused:g.gate.paused});
 const messages=[];g.onToast=m=>messages.push(m);
 assert.equal(g.claimReward(id,{type:'drop',accept:true}),true);
 assert.deepEqual(observations,[{dialog:'fragment',weapon:'flame',hp:40,level:2,pending:1,paused:true}]);
 assert.equal(g.xp,4);assert.equal(messages.length,1);
 assert.equal(g.claimReward(id,{type:'drop',accept:true}),false);assert.equal(g.xp,4);assert.equal(messages.length,1);
 const fragmentId=g.flow.dialogId;g.claimReward(fragmentId,{type:'fragment',id:g.dialog.choices[0]});
 assert.equal(g.dialog.type,'upgrade');assert.equal(g.gate.paused,true);
});

test('identical equipment salvage cannot duplicate XP and each generated upgrade is retained',()=>{
 const g=create();g.xp=9;const item={id:'cape',quality:2},id=open(g,{type:'drop',item});g.show({type:'drop',item});
 assert.equal(g.claimReward(id,{type:'drop',accept:false}),true);assert.equal(g.level,3);assert.equal(g.xp,5);assert.equal(g.flow.pendingCount,2);
 const next=g.flow.dialogId;
 assert.equal(g.claimReward(id,{type:'drop',accept:false}),false);assert.equal(g.xp,5);assert.equal(g.flow.dialogId,next);
 assert.equal(g.claimReward(next,{type:'drop',accept:false}),true);assert.equal(g.level,4);assert.equal(g.xp,7);assert.equal(g.flow.pendingCount,2);
 assert.equal(g.loadout.weapon.id,'storm');
});

test('duplicate fragment XP queues its upgrade and final notification observes the completed settlement',()=>{
 const g=create();g.buffs.grant('dash');g.xp=5;
 const id=open(g,{type:'fragment',choices:[]});g.dialog.choices=['dash'];
 const events=[];g.onChange=()=>events.push({type:g.dialog?.type,xp:g.xp,level:g.level,paused:g.gate.paused});g.onToast=m=>events.push(m);
 assert.equal(g.claimReward(id,{type:'fragment',id:'dash'}),true);
 assert.deepEqual(events[0],{type:'upgrade',xp:0,level:2,paused:true});assert.equal(events.length,2);assert.match(events[1],/5 经验/);
 assert.equal(g.claimReward(id,{type:'fragment',id:'dash'}),false);assert.equal(events.length,2);
});

test('reward settlement preserves independent pause reasons and rejects callbacks after death',()=>{
 const g=create(),id=open(g,{type:'drop',item:{id:'cape',quality:0}});g.gate.add('orientation');g.gate.add('focus');
 assert.equal(g.claimReward(id,{type:'drop',accept:false}),true);assert.equal(g.dialog,null);assert.equal(g.gate.paused,true);
 g.gate.remove('orientation');assert.equal(g.gate.paused,false);
 const next=open(g,{type:'upgrade',choices:[]}),choice={type:'upgrade',id:g.dialog.choices[0]};
 g.flow.down();assert.equal(g.claimReward(next,choice),false);assert.equal(g.dialog.type,'revive');assert.deepEqual(g.levels,{});
});

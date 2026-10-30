import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {ReviveService} from '../dist/platform/revive-provider.js';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const {UIControls}=await import('../dist/ui/ui-controls.js');
const find=(root,name)=>root.name===name?root:root.children.map(c=>find(c,name)).find(Boolean);
const down=()=>{const g=new Game();g.start('storm');g.hurt(99999);return g;};

test('revival grants once, preserves build, clears hostile shots and windups, and second death ends run',async()=>{
 const g=down(),loadout=g.loadout,recipes=JSON.stringify(g.buffs.recipes);g.level=8;g.xp=12;
 g.shoot(0,0,1,0,10,true,'#fff');g.shoot(0,0,1,0,10,false,'#fff');
 g.enemies[0].wind=.4;g.enemies[0].charge=1;
 await Promise.all([g.requestRevive(),g.requestRevive()]);
 assert.equal(g.mode,'battle');assert.equal(g.reviveUsed,true);assert.equal(g.player.hp,Math.ceil(g.stats.hp*.5));
 assert.equal(g.player.inv,3);assert.equal(g.player.dash,0);assert.equal(g.shots.length,1);assert.equal(g.shots[0].hostile,false);
 assert.equal(g.enemies[0].wind,0);assert.equal(g.enemies[0].charge,0);assert.ok(Math.hypot(g.enemies[0].x-g.player.x,g.enemies[0].y-g.player.y)>=149);
 assert.equal(g.loadout,loadout);assert.equal(g.level,8);assert.equal(g.xp,12);assert.equal(JSON.stringify(g.buffs.recipes),recipes);
 g.player.inv=0;g.hurt(99999);assert.equal(g.dialog.type,'result');assert.equal(g.dialog.win,false);
 await g.requestRevive();assert.equal(g.player.hp,0);
 g.start('blade');assert.equal(g.reviveUsed,false);
});

test('cancelled/failed provider keeps revival available; completion after leaving never affects new run',async()=>{
 const g=down();let calls=0,resolve;
 g.revival.provider={label:'测试适配器',request:async()=>{calls++;return 'cancelled';}};
 await g.requestRevive();assert.equal(calls,1);assert.equal(g.mode,'downed');assert.equal(g.reviveUsed,false);
 g.revival.provider={label:'失败',request:async()=>{throw Error('offline');}};
 await g.requestRevive();assert.equal(g.mode,'downed');assert.equal(g.reviveUsed,false);assert.ok(g.reviveMessage);
 g.revival.provider={label:'延迟',request:()=>new Promise(r=>resolve=r)};
 const pending=g.requestRevive();await Promise.resolve();g.start('flame');resolve('rewarded');await pending;
 assert.equal(g.mode,'battle');assert.equal(g.player.hp,100);assert.equal(g.reviveUsed,false);assert.equal(g.snapshot().weapon,'flame');
});

test('provider timeout releases busy state and late success cannot issue a reward',async()=>{
 let resolve;
 const service=new ReviveService({label:'hung',request:()=>new Promise(r=>resolve=r)},5);
 assert.equal(await service.request(),'cancelled');assert.equal(service.busy,false);resolve('rewarded');
 service.provider={label:'ready',request:async()=> 'rewarded'};assert.equal(await service.request(),'rewarded');
});

test('advertisement focus loss keeps revived combat paused until explicit continue',async()=>{
 const g=down();let resolve;
 g.revival.provider={label:'advertisement',request:()=>new Promise(r=>resolve=r)};
 const pending=g.requestRevive();await Promise.resolve();g.lostFocus();resolve('rewarded');await pending;
 assert.equal(g.mode,'battle');assert.equal(g.dialog.type,'pause');assert.equal(g.gate.paused,true);
 g.close();assert.equal(g.gate.paused,false);
});

test('downed cannot close into combat, revive dialogs survive rotation, skip cancels pending request',async()=>{
 const g=down(),ui=new GameUI(g);g.close();assert.equal(g.dialog.type,'revive');
 for(const [w,h] of [[320,568],[568,320],[844,390],[1280,720]]){
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const panel=find(ui.root,'dialog-panel');
  for(const name of ['revive-confirm','revive-skip']){const b=find(panel,name);assert.ok(b.width>=44&&b.height>=44);assert.ok(b.y+b.height<=panel.height);}
 }
 let resolve;g.revival.provider={label:'pending',request:()=>new Promise(r=>resolve=r)};
 const pending=g.requestRevive();await Promise.resolve();find(ui.root,'revive-skip').emit('click');resolve('rewarded');await pending;
 assert.equal(g.mode,'result');assert.equal(g.player.hp,0);assert.equal(g.reviveUsed,false);
});

test('UI feedback remains bounded, never delays actions or changes hit bounds, and clears on rebuild/hidden',()=>{
 const ui=new UIControls(()=>{}),root=new Laya.Sprite();Laya.stage.addChild(root);let clicks=0;
 const button=ui.button(root,'选择',12,20,100,44,()=>clicks++);
 for(let i=0;i<30;i++)button.emit('mousedown');assert.equal(ui.effects.count,1);
 button.emit('click');assert.equal(clicks,1);assert.equal(button.x,12);assert.equal(button.width,100);assert.equal(button.children.at(-1).mouseEnabled,false);
 for(let i=0;i<30;i++){const node=ui.panel(root,0,0,50,44);ui.effects.flash(node,'#fff');}
 assert.equal(ui.effects.count,12);ui.effects.tick(performance.now()+1000);assert.equal(ui.effects.count,0);
 ui.effects.flash(button,'#fff');ui.clear(root);assert.equal(ui.effects.count,0);
 const node=ui.panel(root,0,0,50,44);ui.effects.flash(node,'#fff');document.hidden=true;ui.effects.tick();document.hidden=false;assert.equal(ui.effects.count,0);
});

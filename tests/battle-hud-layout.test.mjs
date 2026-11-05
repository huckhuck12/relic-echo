import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();const {Game}=await import('../dist/game/game.js');const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);
const box=n=>{const p=n.localToGlobal({x:0,y:0});return {...p,w:n.width,h:n.height};};
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
test('mobile objective, combo, status and toast have separate rows, outside action buttons',()=>{
 for(const [w,h]of [[320,568],[393,852],[568,320],[852,393]]){
  setupLayaStub();const g=new Game();g.sound=false;const ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');g.start('storm',false,'standard');
  const status=find(ui.root,'player-hud'),event=find(ui.root,'hud-event'),combo=find(ui.root,'hud-combo'),toast=find(ui.root,'hud-toast'),buff=find(ui.root,'buffs'),dash=find(ui.root,'dash');
  assert.equal(status.mouseEnabled,false);assert.equal(toast.mouseEnabled,false);assert.equal(status.height,52);
  for(const [a,b]of [[status,event],[event,combo],[event,toast],[combo,toast],[status,toast],[buff,toast],[dash,toast]])assert.equal(overlaps(box(a),box(b)),false,`${w}x${h}: ${a.name}/${b.name}`);
  for(const n of [event,toast,buff,dash]){const r=box(n);assert.ok(r.x>=0&&r.x+r.w<=w+.01&&r.y>=0&&r.y+r.h<=h+.01);}
 }
});
test('HUD refresh preserves held controls and uses actual seal, health and cooldown values',()=>{
 setupLayaStub();const g=new Game();g.sound=false;const ui=new GameUI(g);ui.mobile=true;Laya.stage.width=393;Laya.stage.height=852;Laya.stage.emit('resize');g.start('blade',false,'standard');
 const site=g.mapEvents.sites[0];Object.assign(site,{state:'active',startedAt:75,progress:9});g.time=85;g.player.hp=40;g.player.dash=1;g.combo=5;
 const dash=find(ui.root,'dash');ui.update();assert.equal(find(ui.root,'dash'),dash);
 assert.match(find(ui.root,'hud-event').text,/9\/18s · 余 35s/);assert.match(find(ui.root,'hud-hp').text,/40/);assert.match(find(ui.root,'hud-dash').text,/1.0/);
 g.player.dash=0;ui.update();assert.equal(find(ui.root,'dash'),dash);assert.equal(find(ui.root,'hud-dash').text,'点击冲刺');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawCallProbe,DRAW_GROUPS,DRAW_CALL_KEY} from '../dist/game/draw-call-probe.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(root,name)=>root.name===name?root:childrenOf(root).map(n=>find(n,name)).find(Boolean);
const variant=(p,n)=>{for(const value of [999,999,n+1,n,n-1])p.record(value);};

test('draw-call ablation uses warm-up and medians, preserves negative deltas and detects baseline drift',()=>{
 const p=new DrawCallProbe(()=>{});p.start({seconds:238});variant(p,388);
 for(const [i,[group]]of DRAW_GROUPS.entries()){assert.equal(p.excluded,group);variant(p,300+i*12);}
 assert.equal(p.excluded,null);variant(p,389);
 assert.equal(p.active,false);assert.equal(p.report.baseline,388);assert.equal(p.report.stable,true);
 assert.equal(p.report.rows[0].saved,88);assert.ok(p.report.rows.at(-1).saved<0,'Removing something can break batching');
 p.start({seconds:239});variant(p,100);for(const _ of DRAW_GROUPS)variant(p,90);variant(p,120);assert.equal(p.report.stable,false);
 const old=p.report;p.start({});p.record(NaN);assert.equal(p.active,false);assert.equal(p.report,old);assert.ok(p.error);
});

test('frozen game ablation restores every category, pauses automatic decisions and persists the full report',()=>{
 setupLayaStub();const saved=new Map();localStorage.setItem=(k,v)=>saved.set(k,v);
 const g=new Game(),ui=new GameUI(g);g.sound=false;g.toggleAutoPlay('storm',true);
 g.spawnEnemy(1,100,0);const e=g.enemies[0];e.hp=1;e.wind=.2;
 g.shoot(20,20,0,0,1,true,'#fff');g.dropXP(20,30,1);
 const label={node:g.acquire(true),x:0,y:0,rise:0,life:1};label.node.text='1';g.labels.push(label);
 g.openPerformance();Laya.stage.render=()=>{};Laya.Stat={renderBatches:0};
 g.measureDrawCalls();const time=g.time,decisions=g.autoPlay.decisions;
 for(let i=0;i<60;i++){
  g.loop.frame();assert.equal(g.time,time);assert.equal(g.autoPlay.decisions,decisions);
  const excluded=g.drawCallProbe.excluded;
  assert.equal(e.node.visible,excluded!=='enemies');assert.equal(g.shots[0].node.visible,excluded!=='shots');
  assert.equal(g.drops[0].node.visible,excluded!=='drops');assert.equal(label.node.visible,excluded!=='labels');
  assert.equal(ui.root.visible,excluded!=='ui');assert.equal(g.scene.playerNode.visible,excluded!=='player');
  g.drawCallProbe.record(100);
 }
 assert.equal(g.drawCallProbe.active,false);assert.equal(g.dialog.type,'performance');assert.equal(g.gate.paused,true);
 assert.equal(g.scene.ground.visible,true);assert.equal(e.node.visible,true);assert.equal(ui.root.visible,true);
 assert.equal(JSON.parse(saved.get(DRAW_CALL_KEY)).rows.length,10);assert.ok(find(ui.root,'drawcall-enemies'));
 g.measureDrawCalls();for(let i=0;i<5;i++)g.drawCallProbe.record(100);g.render();assert.equal(e.node.visible,false);
 g.close();assert.equal(g.drawCallProbe.active,false);assert.equal(e.node.visible,true);assert.equal(g.dialog,null);
});

test('split results and controls fit small portrait and landscape dialogs',()=>{
 for(const [w,h]of [[320,568],[393,852],[568,320],[852,393]]){
  setupLayaStub();const g=new Game(),ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  g.start('storm');g.openPerformance();Laya.stage.render=()=>{};Laya.Stat={renderBatches:0};g.measureDrawCalls();
  for(let i=0;i<60;i++)g.drawCallProbe.record(100);
  const row=find(ui.root,'drawcall-ui'),button=find(ui.root,'drawcall-measure'),resume=find(ui.root,'performance-resume');
  assert.ok(row.y+row.fontSize<=Math.min(button.y,resume.y));
  assert.ok(button.x+button.width<=button.parent.width);assert.equal(g.gate.paused,true);
 }
});

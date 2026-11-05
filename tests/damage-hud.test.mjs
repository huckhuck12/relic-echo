import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {DamageHUD}=await import('../dist/ui/damage-hud.js');
const {DamageRanking}=await import('../dist/combat/damage-ranking.js');
const {UIControls}=await import('../dist/ui/ui-controls.js');
const {screenLayout}=await import('../dist/ui/layout.js');
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);
const box=n=>{const p=n.localToGlobal({x:0,y:0});return{x:p.x,y:p.y,w:n.width,h:n.height};};
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('live ranking throttles changed data and preserves all display nodes and handlers',()=>{
 const hud=new DamageHUD(new Laya.Sprite(),new UIControls(()=>{}),()=>{}),r=new DamageRanking();hud.resize(screenLayout(393,852,true),true);
 let sorts=0;const rows=r.rows.bind(r);r.rows=()=>{sorts++;return rows();};
 const nodes=childrenOf(hud.panel);r.record(10,'storm');hud.update(r,true,0);assert.equal(sorts,1);
 r.record(90,'flame');hud.update(r,true,249);assert.equal(sorts,1);hud.update(r,true,250);assert.equal(sorts,2);
 assert.match(find(hud.panel,'damage-hud-row-0').text,/炎炮.*90.*90%/);hud.update(r,true,1000);assert.equal(sorts,2);
 assert.deepEqual(childrenOf(hud.panel),nodes);hud.update(r,false,1001);r.reset();hud.update(r,true,1002);
 assert.equal(sorts,3);assert.match(find(hud.panel,'damage-hud-row-0').text,/尚未/);
});

test('live panel avoids phone controls, toast and diagnostics and opens full ranking directly',()=>{
 for(const [w,h]of [[320,568],[393,852],[568,320],[852,393],[768,1024],[1280,720]]){
  const g=new Game();g.start('storm',true);const ui=new GameUI(g);ui.mobile=w<1000;
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const panel=find(ui.root,'damage-hud'),rect=box(panel);assert.ok(panel.visible);assert.ok(rect.h>=44&&rect.w>=44);
  assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=w&&rect.y+rect.h<=h);
  for(const name of ['performance-panel','dash','buffs','hud-toast','player-hud','touch-stick-area']){
   const other=find(ui.root,name);if(other && (name!=='touch-stick-area'||w<1000))assert.equal(overlaps(rect,box(other)),false,`${w} ${name}`);
  }
  panel.emit('click');assert.equal(g.dialog.type,'damage');assert.equal(g.gate.paused,true);assert.equal(panel.visible,false);
  assert.ok(find(ui.root,'damage-total'));find(ui.root,'damage-back').emit('click');assert.equal(g.dialog,null);assert.equal(panel.visible,true);
  g.show({type:'upgrade',choices:[]});g.openDamageRanking();assert.equal(g.dialog.type,'upgrade');
 }
});

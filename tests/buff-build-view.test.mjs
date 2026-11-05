import test from 'node:test';
import assert from 'node:assert/strict';
import {buffSynergies,recipeChain} from '../dist/ui/buff-build-view.js';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(n,name)=>n.name===name?n:childrenOf(n).map(c=>find(c,name)).find(Boolean);

test('synergy readiness requires complete recipes in distinct slots and works in either order',()=>{
 const cases=[['fire',{trigger:'dash',action:'field',element:'fire'},{trigger:'hit',action:'blast',element:'force'}],['ice',{trigger:'hit',action:'orbit',element:'ice'},{trigger:'dash',action:'bolt',element:'force'}],['thunder',{trigger:'hit',action:'bolt',element:'lightning'},{trigger:'dash',action:'field',element:'ice'}]];
 for(const [id,a,b]of cases){
  for(const recipes of [[a,b],[b,a]]){const row=buffSynergies(recipes).find(r=>r.id===id);assert.equal(row.ready,true);assert.notEqual(row.source,row.partner);}
  assert.equal(buffSynergies([a,{...b,trigger:null}]).find(r=>r.id===id).ready,false);
  assert.equal(buffSynergies([a,a]).find(r=>r.id===id).ready,false);
 }
 assert.equal(recipeChain({trigger:'hit',action:null,element:'ice'}),'命中 → 未选择 → 冰霜');
});

test('editor pages reflect actual growth and compatibility without changing cooldowns or recipes',()=>{
 setupLayaStub();const g=new Game(),ui=new GameUI(g);g.sound=false;g.start('blade',false,'standard');g.buffs.chooseStarter('ice');
 g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');g.buffs.cooldowns[0]=1.5;g.toggleBuffs();
 const before=JSON.stringify(g.buffs.recipes);find(ui.root,'buff-page-links').emit('click');
 assert.match(find(ui.root,'buff-link-ice').text,/已搭配/);assert.match(find(ui.root,'buff-link-thunder').text,/未搭配/);
 find(ui.root,'buff-page-growth').emit('click');assert.match(find(ui.root,'buff-growth').text,/1\/2 → Lv.3/);assert.match(find(ui.root,'buff-growth').text,/碎冰 \/ 寒牢/);
 find(ui.root,'buff-back').emit('click');assert.ok(find(ui.root,'buff-part-trigger'));
 assert.equal(JSON.stringify(g.buffs.recipes),before);assert.equal(g.buffs.cooldowns[0],1.5);assert.equal(g.gate.paused,true);
});

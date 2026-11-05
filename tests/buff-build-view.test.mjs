import test from 'node:test';
import assert from 'node:assert/strict';
import {buffSynergies,fragmentChoicePreview,recipeChain} from '../dist/ui/buff-build-view.js';
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

test('candidate previews identify gained and lost cross-slot reactions without mutating recipes',()=>{
 const recipes=[{trigger:'hit',action:'bolt',element:'lightning'},{trigger:'dash',action:'field',element:'fire'}];
 const before=JSON.stringify(recipes),gain=fragmentChoicePreview(recipes,1,'element','ice');
 assert.deepEqual(gain.gained,['冰霜导冷']);assert.match(gain.usage,/减速/);
 const paired=[recipes[0],{...recipes[1],element:'ice'}];const loss=fragmentChoicePreview(paired,0,'element','fire');
 assert.deepEqual(loss.lost,['冰霜导冷']);assert.match(loss.summary,/失去/);
 assert.equal(fragmentChoicePreview(recipes,0,'trigger','ice'),null);assert.equal(fragmentChoicePreview(recipes,2,'element','ice'),null);
 assert.equal(JSON.stringify(recipes),before);
 const partial=fragmentChoicePreview([{trigger:null,action:null,element:null},recipes[1]],0,'element','ice');assert.match(partial.summary,/尚未完整/);assert.deepEqual(partial.gained,[]);
});

test('locked picker reports inline feedback while unlocked card installs once and retains cooldown',()=>{
 setupLayaStub();const g=new Game(),ui=new GameUI(g);g.sound=false;g.start('storm',false,'standard');g.buffs.cooldowns[0]=1.5;g.toggleBuffs();
 find(ui.root,'buff-part-element').emit('click');const before=JSON.stringify(g.buffs.recipes);find(ui.root,'fragment-ice').emit('click');
 assert.match(find(ui.root,'buff-picker-status').text,/冰霜尚未解锁/);assert.equal(JSON.stringify(g.buffs.recipes),before);assert.equal(g.buffs.cooldowns[0],1.5);
 g.buffs.grant('ice');g.flow.refresh();find(ui.root,'fragment-ice').emit('click');assert.equal(g.buffs.recipes[0].element,'ice');assert.ok(find(ui.root,'buff-part-element'));assert.equal(g.buffs.cooldowns[0],1.5);
});

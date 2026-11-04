import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const effect=(kind,element)=>({kind,element,damage:10,slot:0,level:1,x:0,y:0,vx:0,vy:0,age:0,life:3,tick:0});
function fixture(){const g=new Game();g.start('storm',true);g.spawnEnemy(0);const e=g.enemies.at(-1);Object.assign(e,{x:50,y:0,kx:0,ky:0,hp:10000,max:10000});return {g,e};}
test('sustained fire field and ice orbit retain damage/status while not ejecting targets through normal hit recoil',()=>{
 for(const [kind,element] of [['field','fire'],['orbit','ice']]){
  const {g,e}=fixture();g.buffs.apply(e,effect(kind,element));
  assert.equal(e.hp,9990);assert.equal(e.kx,0);assert.equal(e.ky,0);
  if(element==='ice'){assert.equal(g.buffs.speedMultiplier(e),.65);assert.equal(g.buffs.evolutions.frost.get(e).stacks,1);}
  else assert.ok(g.buffs.statuses.get(e).burn>0);
 }
});
test('explicit force displacement and direct bolt/blast hit recoil remain intact',()=>{
 const {g,e}=fixture();g.buffs.apply(e,effect('field','force'));assert.equal(e.kx,380);
 for(const kind of ['bolt','blast']){const f=fixture();f.g.buffs.apply(f.e,effect(kind,'fire'));assert.ok(f.e.kx>0);}
 const boss=fixture();boss.e.kind=4;boss.g.buffs.apply(boss.e,effect('field','force'));assert.equal(boss.e.kx,38);
});

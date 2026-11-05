import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAutoDash,pursueAutoSeal} from '../dist/game/auto-navigation.js';
import {project} from '../dist/shared/model.js';
import {autoPlayIntent} from '../dist/game/auto-play.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const p={x:0,y:0,hp:100},w={enemies:[],shots:[],drops:[],pillars:[]};
const enemy=(x,y=0)=>({x,y,radius:16,kind:0,wind:0,charge:0,dead:false});
test('blade approaches inside actual weapon reach and deals ordinary attack damage without an orbit buff',()=>{
 const g=new Game();g.sound=false;g.start('blade');g.enemies.length=0;g.spawnEnemy(0,180,0);
 const e=g.enemies[0];e.hp=e.max=10000;e.speed=0;const hp=e.hp;
 for(let i=0;i<180;i++){
  const a=autoPlayIntent(g.player,{...w,enemies:[e]},i/60,{orbit:false,attackRange:150,focus:e});
  const direction=project(a.x,a.y);g.setStick(direction.x,direction.y);g.update(1/60);
 }
 assert.ok(e.hp<hp);assert.equal(g.buffs.recipes.some(r=>r.action==='orbit'),false);
 const target=enemy(180);assert.ok(autoPlayIntent(p,{...w,enemies:[target]},0,{orbit:false,attackRange:150,focus:target}).x>0);
 assert.ok(autoPlayIntent(p,{...w,enemies:[target]},0,{orbit:false,attackRange:490,focus:target}).x<0);
});
test('dash checks swept pillars and moving projectiles, rejects blocked escape and finds an alternate exit',()=>{
 assert.equal(safeAutoDash(p,{x:1,y:0},{...w,pillars:[{x:90,y:0}]}),false);
 assert.equal(safeAutoDash(p,{x:1,y:0},{...w,shots:[{x:90,y:80,vx:0,vy:-1000,hostile:true}]}),false);
 const crowded={...w,enemies:[enemy(20)],pillars:[{x:-100,y:0}]};
 const a=autoPlayIntent(p,crowded,0);assert.equal(a.dash,true);assert.equal(safeAutoDash(p,a,crowded),true);assert.ok(Math.abs(a.y)>.5);
 const blocked={...w,enemies:[enemy(20)],pillars:[{x:0,y:0}]};
 assert.equal(autoPlayIntent(p,blocked,0).dash,false);
 assert.deepEqual(autoPlayIntent(p,crowded,0),a);
});
test('seal pursuit considers relative health, travel deadline, local pressure and retained progress without mutation',()=>{
 const site={id:'test',name:'test',x:300,y:0,at:75,state:'available',progress:0,startedAt:0};
 const before=JSON.stringify(site);assert.equal(pursueAutoSeal(p,100,240,site,80,w),true);
 assert.equal(pursueAutoSeal({...p,hp:100},200,240,site,80,w),false);
 assert.equal(pursueAutoSeal(p,100,240,site,139,w),false);
 assert.equal(pursueAutoSeal(p,100,240,site,80,{...w,enemies:Array.from({length:8},()=>enemy(300))}),false);
 assert.equal(JSON.stringify(site),before);
 const active={...site,state:'active',startedAt:80,progress:17};
 assert.equal(pursueAutoSeal({...p,hp:40},100,240,active,115,w),true);
 assert.equal(pursueAutoSeal({...p,hp:20},100,240,active,115,w),false);
 assert.equal(pursueAutoSeal(p,100,240,{...active,progress:0},115,w),false);
});
test('healing drop priority follows maximum health instead of an absolute seventy HP',()=>{
 const drops=[{x:100,y:0,xp:-1},{x:0,y:60,xp:1}];
 const a=autoPlayIntent({...p,hp:90},{...w,drops},0,{orbit:false,maxHp:200});assert.ok(a.x>.99);
 const b=autoPlayIntent({...p,hp:90},{...w,drops},0,{orbit:false,maxHp:100});assert.ok(b.y>.8);
});

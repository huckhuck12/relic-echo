import test from 'node:test';
import assert from 'node:assert/strict';
import {DamageRanking} from '../dist/combat/damage-ranking.js';
import {damageEnemy} from '../dist/combat/combat-system.js';
import {applyBuffElement,updateBuffStatuses} from '../dist/buffs/buff-status.js';

test('ranking counts effective HP once, crit included; dead targets and overkill excluded',()=>{
 const ranking=new DamageRanking(), recorded=[];
 const hooks={recordDamage:(raw,effective,source)=>{recorded.push(raw);ranking.record(effective,source);},present(){},killed(){return false;},triggerHit(){}};
 const state={player:{x:0,y:0},time:0,crit:1},enemy={x:1,y:0,hp:20,kind:0,kx:0,ky:0,dead:false};
 damageEnemy(state,hooks,enemy,10,{canCrit:true,source:'storm'});
 damageEnemy(state,hooks,enemy,100,{source:{kind:'blast',element:'ice'}});
 damageEnemy(state,hooks,enemy,100,{source:'blade'});
 assert.deepEqual(recorded,[15,100]);assert.equal(ranking.total,20);
 assert.deepEqual(ranking.rows().map(r=>[r.id,r.damage,r.share]),[['storm',15,.75],['blast/ice',5,.25]]);
 ranking.reset();assert.equal(ranking.total,0);assert.deepEqual(ranking.rows(),[]);
});

test('burn provenance follows the strongest damage snapshot even after recipe mutation',()=>{
 const statuses=new Map(),target={x:0,y:0,dead:false},hits=[];
 const host={query:()=>[],damage:(...args)=>hits.push(args),knock(){}};
 const original={kind:'blast',element:'fire',damage:100,slot:0,x:0,y:0};
 applyBuffElement(host,statuses,target,original,()=>{});
 original.kind='orbit';original.element='ice';
 applyBuffElement(host,statuses,target,{kind:'bolt',element:'fire',damage:10,slot:1,x:0,y:0},()=>{});
 updateBuffStatuses(statuses,host,1);
 assert.deepEqual(hits[0][4],{kind:'blast',element:'fire'});
});

test('fractional DOT totals, merged pairs, fallback and invalid analytics inputs',()=>{
 const r=new DamageRanking();for(let i=0;i<100;i++)r.record(.125,'flame');
 r.record(5,{kind:'orbit',element:'force'});r.record(5,{kind:'orbit',element:'force'});r.record(2);
 for(const value of [NaN,Infinity,-1,0])r.record(value,'blade');
 assert.equal(r.total,24.5);assert.equal(r.rows().length,3);assert.equal(r.rows()[1].damage,10);
 assert.ok(Math.abs(r.rows().reduce((sum,row)=>sum+row.share,0)-1)<1e-12);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {surgePattern,surgeMember} from '../dist/enemies/encounter-patterns.js';
import {RUN,RUNS} from '../dist/game/pace.js';
import {difficultyAt,enemyKind} from '../dist/game/difficulty.js';

test('authored standard surges preserve pack budgets and leave gaps between finite approach lanes',()=>{
 const previous=Math.random;Math.random=()=>{throw Error('placement consumed RNG');};
 try{
  const names=[];
  for(const time of [30,180,300,480]){
   const pattern=surgePattern(time,RUNS.standard),pack=difficultyAt(time,RUNS.standard).pack;
   names.push(pattern.name);assert.ok(pattern.spread<Math.PI*2/pattern.lanes);
   const members=Array.from({length:pack},(_,i)=>surgeMember(time,i,pack,.5,.5,RUNS.standard));
   assert.equal(members.length,pack);assert.ok(members.every(m=>Number.isFinite(m.angle)&&m.kind>=0&&m.kind<=2));
   for(let i=0;i<pack;i++)assert.deepEqual(surgeMember(time,i,pack,.5,.5,RUNS.standard),members[i]);
   if(time===300)assert.ok(members.filter(m=>m.kind===1).length>=Math.ceil(pack/3));
   if(time===480)assert.ok(members.filter(m=>m.kind===2).length>=Math.ceil(pack/4));
  }
  assert.equal(new Set(names).size,4);
  for(const time of [30,180,300,480])for(let i=0;i<16;i++){
   const m=surgeMember(time,i,16,.5,.8,RUN);assert.equal(m.kind,enemyKind(time,.8,RUN));assert.equal(m.angle,.5+i/16*Math.PI*2);
  }
 }finally{Math.random=previous;}
});

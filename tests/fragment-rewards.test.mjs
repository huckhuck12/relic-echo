import test from 'node:test';
import assert from 'node:assert/strict';
import {fragmentChoices,fragmentRouteHint} from '../dist/progression/fragment-rewards.js';
import {FRAGMENTS,START_FRAGMENTS} from '../dist/buffs/buffs.js';

test('fully unlocked choices favor upgradeable fragments and explain the actual upgrade target',()=>{
 const owned=new Set(FRAGMENTS.map(f=>f.id));
 assert.deepEqual(fragmentChoices(owned,new Set(),()=>.5,new Set(['hit','field','fire'])),['hit','field','fire']);
 assert.match(fragmentRouteHint('fire',owned,{slot:1,level:3,nextLevel:4}),/配方 2：Lv.3 → 4/);
});

test('fragment choices prioritize completing evolution and offer distinct missing fragments',()=>{
 const owned=new Set(START_FRAGMENTS),choices=fragmentChoices(owned,new Set(),()=>.5);
 assert.equal(choices[0],'field');assert.equal(new Set(choices).size,3);
 assert.ok(choices.every(id=>!owned.has(id)));
 assert.match(fragmentRouteHint('field',owned),/火种连线：可组合/);
 assert.match(fragmentRouteHint('bolt',owned),/雷印引爆：还缺雷电/);
 assert.match(fragmentRouteHint('dash',owned),/释放时机/);
 assert.deepEqual([...owned],START_FRAGMENTS);
});

test('ground duplicates lose ties and almost/full unlock pools remain selectable',()=>{
 const owned=new Set(START_FRAGMENTS);
 const choices=fragmentChoices(owned,new Set(['bolt','lightning']),()=>.5);
 assert.deepEqual(choices,['field','orbit','ice']);
 const almost=new Set(FRAGMENTS.filter(f=>f.id!=='ice').map(f=>f.id));
 assert.deepEqual(fragmentChoices(almost),['ice']);
 almost.add('ice');const repeats=fragmentChoices(almost);
 assert.equal(repeats.length,3);assert.equal(new Set(repeats).size,3);
 assert.match(fragmentRouteHint(repeats[0],almost),/5 经验/);
});

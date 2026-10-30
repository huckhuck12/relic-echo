import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLoadout, resolveStats, equip, candidates, project, screenInput, rollItem, PauseGate, SpatialGrid } from '../dist/shared/model.js';
import { GEARS, SLOTS, UPGRADES } from '../dist/progression/config.js';
import { avatarShapes, drawShapes } from '../dist/rendering/appearance.js';

test('repeated equipment replacement never stacks old stats or grants health',()=>{
  let loadout=emptyLoadout('storm'),hp=75;
  for(let i=0;i<100;i++){
    let result=equip(loadout,{id:'helmet',quality:2},hp,{});loadout=result.loadout;hp=result.hp;
    assert.equal(resolveStats(loadout,{}).hp,135);assert.equal(hp,75);
    result=equip(loadout,{id:'visor',quality:0},hp,{});loadout=result.loadout;hp=result.hp;
    assert.equal(resolveStats(loadout,{}).hp,100);assert.equal(hp,75);assert.equal(resolveStats(loadout,{}).crit,.13);
  }
});
test('removing health equipment clamps current health to new maximum',()=>{
  const l={...emptyLoadout('storm'),head:{id:'helmet',quality:0}};
  assert.equal(equip(l,{id:'visor',quality:0},120,{}).hp,100);
});
test('quality scales positive bonuses but preserves penalties and applies caps',()=>{
  const s=resolveStats({...emptyLoadout('storm'),armor:{id:'heavy',quality:2}},{});
  assert.ok(Math.abs(s.reduction-.21)<1e-8);assert.equal(s.speed,-.05);
  assert.equal(resolveStats(emptyLoadout('storm'),{speed:100,haste:100}).speed,.5);
  assert.equal(resolveStats(emptyLoadout('storm'),{speed:100,haste:100}).attackSpeed,1);
});
test('upgrade pool excludes full ranks and inactive weapon upgrades',()=>{
  const full=Object.fromEntries(UPGRADES.filter(u=>!u.weapon).map(u=>[u.id,u.max]));
  assert.deepEqual(candidates(full,'storm',()=>.1).sort(),['chain','conductor']);
  const all=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));assert.deepEqual(candidates(all,'storm'),['heal']);
  for(let i=0;i<50;i++){const choices=candidates({},'flame');assert.equal(new Set(choices).size,choices.length);assert.ok(!choices.includes('chain'));}
});
test('screen movement is correctly converted to isometric ground coordinates',()=>{
  for(const [x,y]of [[1,0],[0,1],[-1,0],[0,-1],[1,1]]){
    const d=screenInput(x,y),s=project(d.x,d.y);assert.ok(Math.abs(Math.hypot(d.x,d.y)-1)<1e-9);
    assert.ok(Math.abs(s.x*y-s.y*x)<1e-4);
    assert.ok(s.x*x+s.y*y>0);
  }
});
test('pause reasons remain independent when one modal closes',()=>{
  const gate=new PauseGate();gate.add('dialog');gate.add('focus');gate.remove('dialog');assert.equal(gate.paused,true);gate.remove('focus');assert.equal(gate.paused,false);
});
test('first elite drop fills an empty non-weapon slot',()=>{
  for(let i=0;i<50;i++){const item=rollItem(120,emptyLoadout('storm'),true);assert.notEqual(GEARS.find(g=>g.id===item.id).slot,'weapon');}
});
test('spatial grid queries work across cell boundaries without stale entries',()=>{
  const grid=new SpatialGrid(100),a={x:99,y:0},b={x:101,y:0},c={x:250,y:0};grid.rebuild([a,b,c]);assert.deepEqual(grid.query(100,0,5),[a,b]);grid.rebuild([c]);assert.deepEqual(grid.query(100,0,5),[]);
});
test('all 81 loadouts render in four directions and every quality',()=>{
  const seen=new Set();
  const graphics={clear(){},drawPoly(){},drawCircle(){},drawRect(){}};
  for(const w of GEARS.filter(g=>g.slot==='weapon'))for(const h of GEARS.filter(g=>g.slot==='head'))for(const a of GEARS.filter(g=>g.slot==='armor'))for(const b of GEARS.filter(g=>g.slot==='back'))for(let quality=0;quality<3;quality++){
    const l=Object.fromEntries([w,h,a,b].map(g=>[g.slot,{id:g.id,quality}]));
    for(const back of [false,true])for(const facing of [-1,1]){
      const shapes=avatarShapes(l,back,facing,1);assert.ok(shapes.length>10);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));drawShapes(graphics,shapes);
    }
    seen.add(JSON.stringify(avatarShapes(l)));
  }
  assert.equal(seen.size,243);
  const base=emptyLoadout('storm');for(const slot of SLOTS)for(const g of GEARS.filter(g=>g.slot===slot))assert.notEqual(JSON.stringify(avatarShapes({...base,[slot]:{id:g.id,quality:1}})),JSON.stringify(avatarShapes(base)));
});

test('bounded neighbor queries and nearest selection match spatial radius and exclusion rules',()=>{
  const grid=new SpatialGrid(100),items=Array.from({length:100},(_,i)=>({x:(i%10)*5,y:Math.floor(i/10)*5,dead:i%3===0}));grid.rebuild(items);
  const around=grid.query(20,20,30),limited=grid.query(20,20,30,8,items[44]);assert.equal(limited.length,8);assert.ok(!limited.includes(items[44]));assert.ok(limited.every(e=>around.includes(e)));assert.deepEqual(grid.query(0,0,100,0),[]);
  const expected=around.filter(e=>!e.dead).sort((a,b)=>(a.x-20)**2+(a.y-20)**2-((b.x-20)**2+(b.y-20)**2))[0];assert.equal(grid.nearest(20,20,30,e=>!e.dead),expected);
  assert.equal(grid.nearest(500,500,1,()=>true),undefined);grid.rebuild([{x:500,y:500}]);assert.deepEqual(grid.query(20,20,30),[]);assert.equal(grid.nearest(500,500,1,()=>true).x,500);
});

const {block,enemyShapes}=await import('../dist/rendering/voxel.js');
test('voxel actors use shaded planar faces, stay within preview height and retain distinct silhouettes',()=>{
  const faces=block(-10,0,20,30,6,'#80a060');assert.equal(faces.length,3);assert.equal(new Set(faces.map(f=>f.fill)).size,3);
  for(let kind=0;kind<5;kind++)for(const flash of [false,true]){const shapes=enemyShapes(kind,flash);assert.ok(shapes.length<=40);assert.ok(shapes.every(s=>['poly','rect'].includes(s.type)&&s.p.every(Number.isFinite)));assert.notDeepEqual(shapes,enemyShapes((kind+1)%5,flash));}
  const avatar=avatarShapes(emptyLoadout('storm'));assert.ok(avatar.every(s=>s.type==='poly'||s.type==='rect'));assert.ok(avatar.length<100);
  const standing=avatarShapes(emptyLoadout('storm'),false,1,0),walking=avatarShapes(emptyLoadout('storm'),false,1,1.5);assert.notDeepEqual(standing,walking);
});


test('six-minute growth lowers later XP thresholds and moves improved loot odds to 200 seconds',async()=>{
  const {nextXP}=await import('../dist/shared/model.js');assert.equal(nextXP(1),10);assert.equal(nextXP(10),46);
  const random=()=>.6;assert.equal(rollItem(199,emptyLoadout('storm'),false,random).quality,0);
  assert.equal(rollItem(200,emptyLoadout('storm'),false,random).quality,1);
});

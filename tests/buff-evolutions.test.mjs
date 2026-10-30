import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffEvolutions,EVOLUTION_LIMITS,evolutionOf} from '../dist/buffs/buff-evolutions.js';
import {BuffRuntime,FRAGMENTS,recipeDescription} from '../dist/buffs/buffs.js';
import {drawEvolutionState} from '../dist/buffs/buff-evolution-visuals.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';

function fixture(count=12){
 const targets=Array.from({length:count},(_,i)=>({x:40+i*8,y:0,dead:false,hp:100000})),hits=[],bursts=[],arcs=[],slows=[];
 const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,value)=>{hits.push({t,value});t.hp-=value;if(t.hp<=0)t.dead=true;},knock(){}};
 const evolution=new BuffEvolutions(host,{slow:(...a)=>slows.push(a),burst:(...a)=>bursts.push(a),arc:(...a)=>arcs.push(a)});
 return {targets,hits,bursts,arcs,slows,host,evolution};
}
const thunder={kind:'bolt',element:'lightning',damage:20},ice={kind:'orbit',element:'ice',damage:10};
const ticks=(runtime,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)runtime.update(1/60);};
function runtimeFixture(action,element,count=12){const f=fixture(count),runtime=new BuffRuntime(f.host);for(const id of FRAGMENTS)runtime.grant(id.id);runtime.install(0,'trigger','hurt');runtime.install(0,'action',action);runtime.install(0,'element',element);return {...f,runtime};}

test('evolution identity depends on action and element; description explains stack and damage rules',()=>{
 for(const [action,element,id]of [['bolt','lightning','thunderMark'],['field','fire','fireLinks'],['orbit','ice','frostShatter']]){
  assert.equal(evolutionOf({action,element}).id,id);assert.match(recipeDescription({trigger:'hit',action,element}),/进化/);
 }
 assert.equal(evolutionOf({action:'blast',element:'fire'}),undefined);
});

test('three thunder marks detonate once, chain at most three, and respect lock and first-stack expiry',()=>{
 const f=fixture(),target=f.targets[0],e=f.evolution;
 e.hit(target,thunder);e.hit(target,thunder);assert.equal(f.hits.length,0);e.hit(target,thunder);
 assert.equal(f.bursts.length,1);assert.equal(f.hits.length,4);assert.equal(f.arcs.length,3);assert.equal(f.hits[0].value,32);
 assert.ok(f.hits.slice(1).every(h=>h.value===16));
 for(let i=0;i<10;i++)e.hit(target,thunder);assert.equal(f.bursts.length,1);
 e.update(1.1);e.hit(target,thunder);e.update(4);e.hit(target,thunder);e.update(5.1);
 assert.equal(e.thunder.size,0);e.hit(target,thunder);assert.equal(e.thunder.get(target).stacks,1);
});

test('frost shatter caps its burst targets and spreads slow without recursively stacking them',()=>{
 const f=fixture(30),target=f.targets[0];for(let i=0;i<3;i++)f.evolution.hit(target,ice);
 assert.deepEqual(f.bursts,[['shatter',target.x,target.y,1]]);assert.equal(f.hits.length,EVOLUTION_LIMITS.shatterTargets);assert.ok(f.hits.every(h=>h.value===12));
 assert.equal(f.slows.length,EVOLUTION_LIMITS.shatterTargets);assert.ok(f.slows.every(([,seconds])=>seconds===2));
 assert.equal(f.evolution.frost.size,1);assert.equal(f.evolution.frost.get(target).stacks,0);
});

test('fire links damage a corridor outside the base field and overlapping lines do not multiply hits',()=>{
 const f=fixture(3);Object.assign(f.targets[0],{x:100,y:0});Object.assign(f.targets[1],{x:100,y:24});Object.assign(f.targets[2],{x:100,y:25});
 f.evolution.seed(0,0,20);f.evolution.seed(200,0,20);f.evolution.seed(100,100,40);f.evolution.update(.01);
 assert.equal(f.hits.filter(h=>h.t===f.targets[0]).length,1);assert.equal(f.hits.find(h=>h.t===f.targets[0]).value,13);
 assert.equal(f.hits.filter(h=>h.t===f.targets[1]).length,1);assert.equal(f.hits.filter(h=>h.t===f.targets[2]).length,0);
 const count=f.hits.length;f.evolution.update(.2);assert.equal(f.hits.length,count);f.evolution.update(.31);assert.ok(f.hits.length>count);
});

test('fire seed distance, merging, expiry and replacement keep all links valid and bounded',()=>{
 const f=fixture(),e=f.evolution;e.seed(0,0,10);e.seed(10,0,20);assert.equal(e.seeds.length,1);assert.equal(e.links.length,0);
 e.seed(500,0,10);assert.equal(e.links.length,0);
 for(let i=0;i<40;i++)e.seed(i*60,0,10);
 assert.ok(e.seeds.length<=EVOLUTION_LIMITS.seeds);assert.ok(e.links.length<=EVOLUTION_LIMITS.links);
 assert.ok(e.links.every(l=>e.seeds.includes(l.a)&&e.seeds.includes(l.b)&&Math.hypot(l.a.x-l.b.x,l.a.y-l.b.y)<=260));
 e.update(6.1);assert.equal(e.seeds.length,0);assert.equal(e.links.length,0);
});

test('mark maps remove dead targets and enforce their target cap',()=>{
 const f=fixture(500);for(const target of f.targets){f.evolution.hit(target,thunder);f.evolution.hit(target,ice);}
 assert.equal(f.evolution.thunder.size,EVOLUTION_LIMITS.targets);assert.equal(f.evolution.frost.size,EVOLUTION_LIMITS.targets);
 f.targets[0].dead=true;f.evolution.update(.01);assert.ok(!f.evolution.thunder.has(f.targets[0]));assert.ok(!f.evolution.frost.has(f.targets[0]));
 f.evolution.clear();assert.equal(f.evolution.thunder.size,0);assert.equal(f.evolution.frost.size,0);
});

test('real slow trigger cooldown still permits thunder evolution and old projectiles retain their recipe',()=>{
 const f=runtimeFixture('bolt','lightning',1),r=f.runtime;
 for(let i=0;i<3;i++){r.trigger('hurt',0,0,1);ticks(r,.1);if(i<2)ticks(r,3.91);}
 assert.equal(r.procs,3);assert.ok(f.hits.some(h=>Math.abs(h.value-26*1.6)<1e-9));
 const old=runtimeFixture('bolt','lightning',1);old.runtime.trigger('hurt',0,0,1);old.runtime.install(0,'element','fire');ticks(old.runtime,.1);
 assert.equal(old.runtime.evolutions.thunder.get(old.targets[0]).stacks,1);
});

test('actual ice orbit contact shatters and slows neighbors that the orbit itself never touched',()=>{
 const f=runtimeFixture('orbit','ice',2),r=f.runtime;Object.assign(f.targets[0],{x:90,y:0});Object.assign(f.targets[1],{x:20,y:0});
 r.trigger('hurt',0,0,1);let found=false;
 for(let i=0;i<180;i++){r.update(1/60);if(r.feedback.some(v=>v.kind==='shatter')){found=true;break;}}
 assert.ok(found);assert.equal(r.speedMultiplier(f.targets[1]),.65);assert.ok(f.hits.some(h=>h.t===f.targets[1]&&Math.abs(h.value-14.4)<1e-9));
});

test('evolution mechanics survive zero visual budget and render is finite, culled and read-only',()=>{
 const totals=[];
 for(const budget of [0,10,48]){
  const f=runtimeFixture('field','fire'),r=f.runtime;r.setVisualBudget(budget);
  r.trigger('hurt',0,0,1);f.host.player.x=200;r.cooldowns[0]=0;r.trigger('hurt',0,0,1);
  for(let i=0;i<3;i++){r.evolutions.hit(f.targets[0],thunder);r.evolutions.hit(f.targets[0],ice);}
  ticks(r,1);totals.push(f.hits.reduce((s,h)=>s+h.value,0));assert.ok(r.feedback.length<=budget);
  const calls=[],g=Object.fromEntries(['drawPoly','drawRect','drawLine','drawLines'].map(name=>[name,(...a)=>calls.push(a)]));
  const before=JSON.stringify({hp:f.targets.map(t=>t.hp),seeds:r.evolutions.seeds,links:r.evolutions.links,effects:r.effects});
  const random=Math.random;Math.random=()=>{throw Error('render consumed RNG');};
  try{r.render(g,(x,y)=>({x,y}),g);for(const v of calls.flat(Infinity))if(typeof v==='number')assert.ok(Number.isFinite(v));
   calls.length=0;drawEvolutionState(g,g,(x,y)=>({x,y}),r.evolutions,()=>false,3);assert.equal(calls.length,0);
  }finally{Math.random=random;}
  assert.equal(JSON.stringify({hp:f.targets.map(t=>t.hp),seeds:r.evolutions.seeds,links:r.evolutions.links,effects:r.effects}),before);
  r.clearTransient();assert.equal(r.evolutions.seeds.length,0);assert.equal(r.evolutions.thunder.size,0);
 }
 assert.ok(totals.every(t=>t===totals[0]));
});

setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(node,name)=>node.name===name?node:node.children.map(c=>find(c,name)).find(Boolean);
test('evolution timers freeze in menus, clear on restart and descriptions fit mobile layouts',()=>{
 for(const [w,h]of [[320,568],[390,844],[568,320],[844,390]])for(const [action,element]of [['bolt','lightning'],['field','fire'],['orbit','ice']]){
  const g=new Game(),ui=new GameUI(g);g.start('storm',true);g.toggleBuffs();g.unlockFragments();g.installBuff(0,'action',action);g.installBuff(0,'element',element);
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const label=find(ui.root,'buff-description');assert.ok(label,`${w}x${h}: ${action}`);assert.match(label.text,/进化/);
  g.buffs.evolutions.seed(0,0,10);const before=g.buffs.evolutions.seeds[0].life;g.loop.last=performance.now()-50;g.loop.frame();assert.equal(g.buffs.evolutions.seeds[0].life,before);
  g.start('storm',true);assert.equal(g.buffs.evolutions.seeds.length,0);
 }
});

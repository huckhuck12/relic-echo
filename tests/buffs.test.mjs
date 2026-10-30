import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime,TRIGGERS,ACTIONS,ELEMENTS,FRAGMENTS,BUFF_LIMITS,recipeDescription} from '../dist/buffs/buffs.js';
function fixture(){const targets=Array.from({length:5},(_,i)=>({x:30+i*35,y:0,dead:false,hp:10000})),hits=[],knocks=[];const player={x:0,y:0,dx:1,dy:0};const runtime=new BuffRuntime({player,query:(x,y,r)=>targets.filter(t=>!t.dead&&Math.hypot(t.x-x,t.y-y)<=r),damage:(t,v,feedback=true,quiet=false)=>{hits.push({target:t,value:v,feedback,quiet});t.hp-=v;if(t.hp<=0)t.dead=true;},knock:(...args)=>knocks.push(args)});for(const f of FRAGMENTS)runtime.grant(f.id);return {runtime,targets,hits,knocks,player};}
function install(runtime,trigger,action,element,slot=0){assert.ok(runtime.install(slot,'trigger',trigger));assert.ok(runtime.install(slot,'action',action));assert.ok(runtime.install(slot,'element',element));}

test('duplicate fragments upgrade only matching complete recipes, cap at five and reset per run',()=>{
 const {runtime:r}=fixture();install(r,'dash','blast','fire');
 r.cooldowns[0]=2;assert.equal(r.receiveFragment('unknown').kind,'invalid');assert.equal(r.receiveFragment('ice').kind,'xp');
 for(let level=2;level<=5;level++){assert.deepEqual(r.receiveFragment('fire'),{kind:'upgrade',slot:0,level});assert.equal(r.levelOf(r.recipes[0]),level);}
 assert.deepEqual(r.receiveFragment('fire'),{kind:'xp',amount:5});assert.equal(r.cooldowns[0],2);
 r.clearTransient();assert.equal(r.levelOf(r.recipes[0]),5);
 r.install(0,'action','bolt');assert.equal(r.levelOf(r.recipes[0]),1);r.install(0,'action','blast');assert.equal(r.levelOf(r.recipes[0]),5);
 r.install(0,'element',null);assert.equal(r.receiveFragment('fire').kind,'xp');r.install(0,'element','fire');assert.equal(r.levelOf(r.recipes[0]),5);
 r.reset();install(r,'hit','blast','fire');assert.equal(r.levelOf(r.recipes[0]),1);assert.equal(r.receiveFragment('ice').kind,'unlock');
});

test('one fragment selects the lowest matching recipe; identical recipes share one level',()=>{
 const {runtime:r}=fixture();install(r,'dash','blast','fire',0);install(r,'dash','bolt','fire',1);
 assert.equal(r.receiveFragment('fire').slot,0);assert.equal(r.receiveFragment('fire').slot,1);
 assert.equal(r.levelOf(r.recipes[0]),2);assert.equal(r.levelOf(r.recipes[1]),2);
 install(r,'dash','blast','fire',1);r.receiveFragment('fire');assert.equal(r.levelOf(r.recipes[0]),3);assert.equal(r.levelOf(r.recipes[1]),3);
 r.install(0,'action',null);assert.equal(r.upgradePreview('fire').slot,1);
});

test('upgrades snapshot new damage for every action and fire seeds without changing existing effects',()=>{
 for(const action of ACTIONS){const {runtime:r,player}=fixture();install(r,'dash',action.id,'fire');
  r.trigger('dash',0,0,1);const old=r.effects[0],before=old.damage;
  r.receiveFragment('fire');assert.equal(old.damage,before);assert.equal(r.cooldowns[0],3);
  r.cooldowns[0]=0;player.x=100;r.trigger('dash',100,0,1);const next=r.effects.at(-1);
  assert.equal(next.damage,Math.round(({bolt:26,blast:22,field:10,orbit:12}[action.id])*1.2));
  if(action.id==='field'){assert.equal(r.evolutions.seeds[0].damage,10);assert.equal(r.evolutions.seeds[1].damage,12);assert.equal(r.evolutions.links[0].damage,6.5);}
  assert.match(recipeDescription(r.recipes[0],1,r.levelOf(r.recipes[0])),/Lv\.2\/5 · 伤害 \+20%/);
 }
});

test('upgraded real lightning bolts feed their captured damage into thunder evolution',()=>{
 const {runtime:r,hits}=fixture();install(r,'dash','bolt','lightning');r.receiveFragment('bolt');
 for(let i=0;i<3;i++){r.cooldowns[0]=0;r.trigger('dash',0,0,1);r.update(.1);}
 assert.equal(r.evolutions.detonations,1);assert.ok(hits.some(h=>h.value===31*1.6));assert.ok(hits.some(h=>h.value===31*.8));
});

test('effect visuals snapshot their release level and evolution bursts inherit the actual hit source',()=>{
 const {runtime:r}=fixture();install(r,'dash','bolt','lightning');
 r.trigger('dash',0,0,1);const old=r.effects[0];for(let i=0;i<4;i++)r.receiveFragment('bolt');
 assert.equal(old.level,1);r.cooldowns[0]=0;r.trigger('dash',0,0,1);assert.equal(r.effects.at(-1).level,5);
 const target={x:0,y:0,dead:false};for(let i=0;i<3;i++)r.evolutions.hit(target,{kind:'bolt',element:'lightning',damage:47,level:5});
 assert.equal(r.feedback.find(f=>f.kind==='detonate').level,5);
 r.evolutions.seed(0,0,18,5);r.evolutions.seed(120,0,10,1);const link=r.evolutions.links[0];assert.equal(link.level,1);
 r.evolutions.seed(120,0,18,5);assert.equal(r.evolutions.seeds[1].level,5);assert.equal(link.level,1);
});

test('full-level rendering is read-only and visual budgets do not change Buff or evolution damage',()=>{
 const results=[];
 for(const budget of [0,10,24,48]){
  const {runtime:r,hits,targets}=fixture();install(r,'dash','field','fire');for(let i=0;i<4;i++)r.receiveFragment('fire');r.setVisualBudget(budget);
  r.trigger('dash',0,0,1);r.host.player.x=120;r.cooldowns[0]=0;r.trigger('dash',120,0,1);r.update(.01);
  const state=()=>JSON.stringify({effects:r.effects,seeds:r.evolutions.seeds,links:r.evolutions.links,hp:targets.map(t=>t.hp),cooldowns:r.cooldowns});
  const before=state(),out=recorder(),floor=recorder();r.render(out.graphics,project,floor.graphics);assert.equal(state(),before);
  const calls=out.calls.length+floor.calls.length;r.render(out.graphics,project,floor.graphics,()=>false);assert.equal(out.calls.length+floor.calls.length,calls);
  results.push(hits.map(h=>h.value));assert.ok(r.feedback.length<=budget);
 }
 for(const result of results)assert.deepEqual(result,results[0]);
});

test('all 64 recipes activate, deal damage and expire with distinct element effects',()=>{
  for(const trigger of TRIGGERS)for(const action of ACTIONS)for(const element of ELEMENTS){
    const {runtime,targets,hits,knocks}=fixture();install(runtime,trigger.id,action.id,element.id);runtime.trigger(trigger.id,0,0,1,()=>0);assert.equal(runtime.procs,1);assert.ok(!recipeDescription(runtime.recipes[0]).includes('请选择'));
    for(let i=0;i<300;i++)runtime.update(1/60);
    assert.ok(hits.length>0,`${trigger.id}/${action.id}/${element.id}`);assert.ok(targets.some(t=>t.hp<10000));assert.equal(runtime.effects.length,0);
    if(element.id==='force')assert.ok(knocks.length>0);
  }
});

test('fire burns after contact, ice slows temporarily, lightning arcs and force knocks',()=>{
  for(const element of ELEMENTS){const {runtime,targets,hits,knocks}=fixture();install(runtime,'dash','blast',element.id);runtime.trigger('dash',0,0,1);runtime.update(.01);const direct=targets[0].hp,count=hits.length;
    if(element.id==='ice'){assert.equal(runtime.speedMultiplier(targets[0]),.65);runtime.update(2.1);assert.equal(runtime.speedMultiplier(targets[0]),1);}
    if(element.id==='fire'){runtime.update(.5);assert.ok(targets[0].hp<direct);assert.ok(hits.some(h=>h.feedback===false));}
    if(element.id==='lightning')assert.ok(count>3);
    if(element.id==='force')assert.ok(knocks.some(k=>k[0]===targets[0]&&k[1]===380));
  }
});

test('invalid, locked and incomplete recipes cannot activate and cooldown survives editing',()=>{
  const {runtime}=fixture();runtime.reset();assert.equal(runtime.owned.size,3);assert.equal(runtime.install(0,'trigger','hurt'),false);assert.equal(runtime.install(0,'trigger','fire'),false);assert.equal(runtime.install(2,'trigger','hit'),false);assert.equal(runtime.install(.5,'action','blast'),false);assert.equal(runtime.grant('unknown'),false);
  runtime.install(0,'trigger','hit');runtime.trigger('hit',0,0,1,()=>0);assert.equal(runtime.procs,0);runtime.install(0,'action','blast');runtime.install(0,'element','fire');runtime.trigger('hit',0,0,1,()=>.9);assert.equal(runtime.procs,0);runtime.trigger('hit',0,0,1,()=>0);assert.equal(runtime.procs,1);
  runtime.install(0,'element',null);runtime.install(0,'element','fire');runtime.trigger('hit',0,0,1,()=>0);assert.equal(runtime.procs,1);runtime.update(2);runtime.trigger('hit',0,0,1,()=>0);assert.equal(runtime.procs,2);
});

test('two recipes have independent cooldowns, captured damage and bounded effects',()=>{
  const {runtime,hits}=fixture();install(runtime,'dash','blast','ice',0);install(runtime,'dash','blast','fire',1);runtime.trigger('dash',0,0,2);assert.equal(runtime.procs,2);runtime.update(.01);assert.ok(hits.some(h=>h.value===44));assert.equal(runtime.cooldowns[0],runtime.cooldowns[1]);
  runtime.effects.length=0;install(runtime,'dash','bolt','force',0);install(runtime,'dash','bolt','ice',1);for(let i=0;i<100;i++){runtime.cooldowns.fill(0);runtime.trigger('dash',0,0,1);}assert.equal(runtime.effects.length,BUFF_LIMITS.bolt);runtime.reset();assert.equal(runtime.effects.length,0);assert.equal(runtime.procs,0);assert.equal(runtime.cooldowns[0],0);
});

function recorder(){const calls=[];return {calls,graphics:Object.fromEntries(['drawRect','drawPoly','drawLine','drawLines'].map(name=>[name,(...args)=>calls.push({name,args})]))};}
const project=(x,y)=>({x:(x-y)*.7071,y:(x+y)*.3536});

test('all sixteen visual combinations render finite distinct geometry without changing combat state',()=>{
  const signatures=new Set();
  for(const action of ACTIONS)for(const element of ELEMENTS){
    const {runtime,targets}=fixture();install(runtime,'dash',action.id,element.id);runtime.trigger('dash',0,0,1);runtime.update(.01);
    const floor=recorder(),overlay=recorder(),before=JSON.stringify({effects:runtime.effects,hp:targets.map(t=>t.hp),cooldowns:runtime.cooldowns});
    runtime.render(overlay.graphics,project,floor.graphics);
    const calls=[...floor.calls,...overlay.calls];assert.ok(calls.length>0);
    for(const call of calls)for(const value of call.args.flat())if(typeof value==='number')assert.ok(Number.isFinite(value));
    signatures.add(JSON.stringify(calls));
    assert.equal(JSON.stringify({effects:runtime.effects,hp:targets.map(t=>t.hp),cooldowns:runtime.cooldowns}),before);
    runtime.render(overlay.graphics,project,floor.graphics,()=>false);assert.equal([...floor.calls,...overlay.calls].length,calls.length);
  }
  assert.equal(signatures.size,16);
});

test('lightning arcs connect actual hit targets and visual feedback expires or clears on restart',()=>{
  const {runtime,targets}=fixture();install(runtime,'dash','blast','lightning');runtime.trigger('dash',0,0,1);runtime.update(.01);
  const arcs=runtime.feedback.filter(f=>f.kind==='arc');assert.ok(arcs.length>0);
  for(const f of arcs){assert.ok(targets.some(t=>t.x===f.x&&t.y===f.y));assert.ok(targets.some(t=>t.x===f.tx&&t.y===f.ty));assert.notEqual(f.x,f.tx);}
  runtime.update(.8);assert.equal(runtime.feedback.length,0);
  runtime.cooldowns.fill(0);runtime.trigger('dash',0,0,1);runtime.update(.01);runtime.reset();assert.equal(runtime.feedback.length,0);
});

test('quality feedback budgets bound crowded fields without changing damage or status results',()=>{
  const damage=[];const commands=[];
  for(const budget of [0,10,24,48]){
    const {runtime,targets,hits}=fixture();runtime.setVisualBudget(budget);install(runtime,'dash','field','fire');
    for(let i=0;i<8;i++){runtime.cooldowns.fill(0);runtime.trigger('dash',i*10,0,1);}runtime.update(.01);
    assert.ok(runtime.feedback.length<=budget);damage.push(targets.reduce((n,t)=>n+10000-t.hp,0));
    assert.ok(hits.every(h=>h.quiet===true));
    const out=recorder();runtime.render(out.graphics,project);commands.push(out.calls.length);
    runtime.setVisualBudget(0);assert.equal(runtime.feedback.length,0);
  }
  assert.ok(damage.every(n=>n===damage[0]));assert.ok(commands[1]<commands[3]);
});

test('orbit visuals follow player movement between damage ticks',()=>{
  const {runtime,player}=fixture();install(runtime,'dash','orbit','ice');runtime.trigger('dash',0,0,1);runtime.update(.01);
  const tick=runtime.effects[0].tick;player.x=70;player.y=40;runtime.update(.01);
  assert.ok(runtime.effects[0].tick<tick);assert.equal(runtime.effects[0].x,70);assert.equal(runtime.effects[0].y,40);
});

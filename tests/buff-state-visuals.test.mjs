import test from 'node:test';
import assert from 'node:assert/strict';
import {drawBuffMark,drawBuffStatus,drawBuffTransfer} from '../dist/buffs/buff-state-visuals.js';
import {drawEvolutionState,drawEvolutionBurst} from '../dist/buffs/buff-evolution-visuals.js';
import {fireFieldMotif} from '../dist/buffs/buff-visuals.js';
import {renderBuffs} from '../dist/buffs/buff-renderer.js';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {project} from '../dist/shared/model.js';
function recorder(){const calls=[];return{calls,g:Object.fromEntries(['drawPoly','drawLines','drawLine','drawRect'].map(name=>[name,(...args)=>calls.push({name,args})]))};}
const source=(branch)=>({kind:branch==='prison'?'orbit':'bolt',element:branch==='prison'?'ice':'lightning',damage:10,level:5,slot:0,branch});
function runtime(){const targets=[{x:30,y:0,dead:false},{x:60,y:0,dead:false}],damage=[];const r=new BuffRuntime({player:{x:0,y:0,dx:1,dy:0},query:()=>targets,damage:(t,d)=>damage.push([targets.indexOf(t),d]),knock(){}});return{r,targets,damage};}

test('simultaneous ice and thunder use separate lanes, distinct shapes and exact three/five slots',()=>{
 for(const branch of [undefined,'charge','prison']){
  const a=recorder(),b=recorder(),mark=Object.freeze({stacks:2,life:3,lock:0,source:source(branch)});
  drawBuffMark(a.g,0,0,'lightning',mark);drawBuffMark(b.g,0,0,'ice',mark);
  assert.equal(a.calls.length,branch==='charge'?6:4);assert.equal(b.calls.length,branch==='prison'?6:4);
  const bounds=c=>c.calls.flatMap(v=>v.args[2].filter((_,i)=>i%2).map(y=>y+v.args[1]));
  assert.ok(Math.max(...bounds(a))<Math.min(...bounds(b)));
  assert.notDeepEqual(a.calls[1].args[2],b.calls[1].args[2]);
 }
 for(const kind of [0,1,2,3,4])for(const element of ['ice','lightning']){
  const out=recorder();drawBuffMark(out.g,0,0,element,{stacks:0,lock:.5},kind);
  const healthY=-65-(kind>=3?25:0);
  const bottoms=out.calls.map(c=>c.name==='drawPoly'?Math.max(...c.args[2].filter((_,i)=>i%2))+c.args[1]:Math.max(c.args[1],c.args[3]));
  assert.ok(bottoms.every(y=>y<healthY-2),'Marks and lock bars stay above the health bar');
 }
 const empty=recorder();drawBuffStatus(empty.g,empty.g,project,{x:0,y:0},{burn:0,slow:0},0);assert.equal(empty.calls.length,0);
 const overlay=recorder(),floor=recorder();drawBuffStatus(overlay.g,floor.g,project,{x:0,y:0},{burn:0,slow:2},0);
 assert.equal(overlay.calls.length,0);assert.equal(floor.calls.length,2,'Slow has only ground frost, no false frozen body');
});

test('both mark types remain represented under dense overlap without exceeding the existing total target budget',()=>{
 const state={links:[],seeds:[],thunder:new Map(),frost:new Map()};
 for(let i=0;i<200;i++){const target={x:i,y:0,dead:false};state.thunder.set(target,{stacks:4,life:9,lock:0,source:source('charge')});state.frost.set(target,{stacks:4,life:4,lock:0,source:source('prison')});}
 const out=recorder();drawEvolutionState(out.g,out.g,project,state,()=>true,3);assert.equal(out.calls.length,36);
 assert.ok(out.calls.some(c=>c.args[2].length===8));
 const hidden=recorder();drawEvolutionState(hidden.g,hidden.g,project,state,()=>false,3);assert.equal(hidden.calls.length,0);
});

test('fire branch motifs are distinct and stay inside the snapshotted field radius',()=>{
 for(const radius of [54,90,135]){
  const signatures=[];
  for(const branch of ['trail','furnace']){
   const out=recorder();fireFieldMotif(out.g,project,Object.freeze({x:0,y:0,age:.2,radius,branch}));assert.equal(out.calls.length,3);signatures.push(JSON.stringify(out.calls));
   for(const c of out.calls){const points=c.args[2];for(let i=0;i<points.length;i+=2){const sx=points[i]+c.args[0],sy=points[i+1]+c.args[1],x=sx/(2*.7071)+sy/(2*.3536),y=sy/(2*.3536)-sx/(2*.7071);assert.ok(Math.hypot(x,y)<=radius);}}
  }
  assert.notEqual(...signatures);
 }
});

test('reaction snapshots stay read-only, finite, expired and independent of combat RNG',()=>{
 const random=Math.random;Math.random=()=>{throw Error('render consumed RNG');};
 try{for(const kind of ['reforge','shard','arc'])for(const branch of [undefined,'spread'])for(const t of [0,.3,.8,1]){
  const effect=Object.freeze({kind,branch,x:30,y:40,tx:-50,ty:70,life:1-t,max:1,age:t}),out=recorder();drawBuffTransfer(out.g,out.g,project,effect);
  assert.ok(out.calls.length<=6);for(const v of out.calls.flatMap(c=>c.args.flat(Infinity)))if(typeof v==='number')assert.ok(Number.isFinite(v));
  if(t===1)assert.equal(out.calls.length,0);
 }}finally{Math.random=random;}
 for(const branch of ['charge','spread','shards','prison']){
  const out=recorder();drawEvolutionBurst(out.g,out.g,project,branch==='charge'||branch==='spread'?'detonate':'shatter',0,0,1,5,8,branch);assert.equal(out.calls.length,0);
 }
});

test('actual reforge and evolution events record branch provenance inside the original bounded feedback queue',()=>{
 const {r,targets}=runtime();r.chooseStarter('fire');r.receiveFragment('fire');r.receiveFragment('fire');r.takeBranchRequest();r.chooseBranch('furnace');
 r.trigger('dash',0,0,1);r.update(.01);r.trigger('hit',30,0,1,()=>0);r.update(.01);
 const reforge=r.feedback.find(f=>f.kind==='reforge');assert.ok(reforge);assert.equal(reforge.branch,'furnace');assert.equal(reforge.tx,0);assert.equal(reforge.x,30);
 for(const branch of ['charge','spread','shards']){
  const f=runtime(),s={...source(branch),kind:branch==='shards'?'orbit':'bolt',element:branch==='shards'?'ice':'lightning'};
  for(let i=0;i<(branch==='charge'?5:3);i++)f.r.evolutions.hit(f.targets[0],s);
  assert.equal(f.r.feedback.find(v=>v.kind===(branch==='shards'?'shatter':'detonate')).branch,branch);
  if(branch==='spread')assert.ok(f.r.feedback.some(v=>v.kind==='arc'&&v.branch==='spread'));
  if(branch==='shards')assert.ok(f.r.feedback.some(v=>v.kind==='shard'&&v.tx===f.targets[0].x&&v.x===f.targets[1].x));
 }
 const before=JSON.stringify({effects:r.effects,feedback:r.feedback,statuses:[...r.statuses],evolutions:r.evolutions.seeds});
 const out=recorder();r.render(out.g,project,out.g);assert.equal(JSON.stringify({effects:r.effects,feedback:r.feedback,statuses:[...r.statuses],evolutions:r.evolutions.seeds}),before);
 assert.ok(r.feedback.length<=20);
 const expired=recorder();renderBuffs({effects:[],feedback:[{...reforge,life:0}],statuses:new Map(),evolutions:{links:[],seeds:[],thunder:new Map(),frost:new Map()},visualBudget:20,visualTime:0},expired.g,project,expired.g,()=>true);assert.equal(expired.calls.length,0);
});

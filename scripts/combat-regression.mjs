import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setupLayaStub} from '../tests/helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
// 固定输入与随机源的整局回归。只验证模拟/反馈状态，不测浏览器或 GPU。
const original=Math.random,runs=[];
try{
 for(const weapon of ['storm','flame','blade']){
  let seed=20261029,draws=0;
  Math.random=()=>{draws++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);};
  const g=new Game();g.start(weapon,true);g.sound=false;const samples=[];
  function sample(step){
   const state={time:g.time,mode:g.mode,dialog:g.dialog,player:g.player,damage:g.damage,kills:g.kills,xp:g.xp,level:g.level,
    levels:g.levels,loadout:g.loadout,combo:g.combo,momentum:g.momentum,overdrive:g.overdrive,
    timers:[g.spawnTimer,g.attackTimer,g.dropCooldown,g.healDropCooldown,g.fragmentCooldown,g.thornCd,g.nextSurge],
    enemies:g.enemies.map(({node,flashPaint,icePaint,actionPaint,...e})=>e),
    shots:g.shots.map(({node,...s})=>s),drops:g.drops.map(({node,...d})=>d),fields:g.fields,fx:g.fx,
    labels:g.labels.map(({node,...l})=>({...l,text:node.text})),buffs:{procs:g.buffs.procs,cooldowns:g.buffs.cooldowns,recipes:g.buffs.recipes,effects:g.buffs.effects},seed,draws};
   samples.push({step,time:g.time,kills:g.kills,damage:g.damage,enemies:g.enemies.length,draws,hash:createHash('sha256').update(JSON.stringify(state)).digest('hex')});
  }
  for(let step=0;step<400*60&&g.mode==='battle';step++){
   // 自动处理正式奖励入口，不跳过候选生成/装备分解；移动路线固定，不依赖画面时钟。
   if(g.dialog?.type==='upgrade')g.chooseUpgrade(g.dialog.choices[0]);
   if(g.dialog?.type==='drop')g.takeDrop(true);
   if(g.dialog?.type==='fragment')g.chooseFragment(g.dialog.choices[0]);
   g.setStick(Math.cos(step/180),Math.sin(step/180));
   if(step%240===0)g.dash();
   if(!g.gate.paused)g.update(1/60);
   if(step%10===0)g.render();
   if(step%600===0||g.mode!=='battle')sample(step);
  }
  runs.push({weapon,samples,result:g.dialog});console.log(`${weapon}: ${samples.length} samples, ${g.time.toFixed(2)} s, ${g.kills} kills`);
 }
}finally{Math.random=original;}
const output=process.argv.find(x=>x.endsWith('.json'))||'artifacts/combat-regression.json';
const compareAt=process.argv.indexOf('--compare');
if(compareAt>=0){
 const baseline=JSON.parse(await readFile(process.argv[compareAt+1],'utf8'));
 if(JSON.stringify(baseline.runs)!==JSON.stringify(runs)){
  const mismatches=runs.flatMap((run,i)=>run.samples.filter((s,j)=>s.hash!==baseline.runs[i]?.samples[j]?.hash).map(s=>({weapon:run.weapon,step:s.step,time:s.time})));
  throw Error('Combat regression differs: '+JSON.stringify(mismatches));
 }
 console.log('All weapon samples and final results match the baseline.');
}
// 比较模式下最后一个 .json 参数可能是基线，因此必须显式指定 --output，防止覆盖。
const outputAt=process.argv.indexOf('--output');
if(compareAt<0||outputAt>=0)await writeFile(outputAt>=0?process.argv[outputAt+1]:output,JSON.stringify({kind:'Node deterministic simulation; not browser rendering',runs},null,2));

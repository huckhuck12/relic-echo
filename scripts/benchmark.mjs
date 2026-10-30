import {performance} from 'node:perf_hooks';
import {writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import {setupLayaStub} from '../tests/helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {scenario,seeded,summary,enableBuffs,enableEvolutions}=await import('../bench/scenario.js');
const rows=[],withBuffs=process.argv.includes('--buffs'),withEvolutions=process.argv.includes('--evolutions');
for(const count of [240,600,1000])for(const weapon of ['storm','flame','blade']){
  Math.random=seeded(20261028);const g=new Game();scenario(g,count,weapon);if(withBuffs)enableBuffs(g);if(withEvolutions)enableEvolutions(g,weapon);
  const update=[],commands=[];global.gc?.();const before=process.memoryUsage().heapUsed;
  for(let i=0;i<360;i++){
    const a=performance.now();g.update(1/60);const b=performance.now();g.render();const c=performance.now();
    if(i>=60){update.push(b-a);commands.push(c-b);}
  }
  const evolution=g.buffs.evolutions;
  global.gc?.();const row={count,weapon,samples:300,updateMs:summary(update),renderCommandsMs:summary(commands),heapDeltaMiB:Math.round((process.memoryUsage().heapUsed-before)/10485.76)/100,enemies:g.enemies.length,shots:g.shots.length,fx:g.fx.length,buffProcs:g.buffs.procs,buffEffects:g.buffs.effects.length,...(withEvolutions?{evolutions:{thunderMarks:evolution.thunder.size,iceMarks:evolution.frost.size,fireSeeds:evolution.seeds.length,fireLinks:evolution.links.length}}:{})};rows.push(row);console.log(JSON.stringify(row));
}
await mkdir('artifacts',{recursive:true});
const result={buffs:withEvolutions?'two evolution recipes rotating by weapon; real hit chance/cooldown':withBuffs?'hit/field/lightning + hit/orbit/fire':'none',kind:'Node logic + no-op graphics; NOT browser FPS or GPU time',date:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,rows};
await writeFile(process.argv.find(x=>x.endsWith('.json'))||'artifacts/performance-node.json',JSON.stringify(result,null,2));

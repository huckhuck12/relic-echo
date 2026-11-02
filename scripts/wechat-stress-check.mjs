import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Diagnostic benchmark only: gameplay and real Laya rendering run unchanged.
export async function checkWechatStress({evaluate,directory}){
 await evaluate(`(async()=>{
  const t=wechatTest,{scenario,seeded,summary}=await import('/bench/scenario.js'),g=t.app.game,L=t.root.Laya;
  L.timer.clear(g.loop,g.loop.frame);const original=L.stage._loop;
  let stages=[];L.stage._loop=function(...args){const a=performance.now();const v=original.apply(this,args);stages.push(performance.now()-a);return v;};
  t.stress={async run(cache){
   const random=Math.random;Math.random=seeded(20261028);
   try{
    scenario(g,240,'storm');g.scene.ground.cacheAs=cache==='none'?'none':'normal';
    for(const e of g.enemies)e.node.cacheAs=cache==='actors'?'normal':'none';
    const intervals=[],updates=[],commands=[];let last=await new Promise(requestAnimationFrame);stages=[];
    for(let i=0;i<65;i++){
     const now=await new Promise(requestAnimationFrame);if(i>=20)intervals.push(now-last);last=now;
     const a=performance.now();g.update(1/60);const b=performance.now();g.render();const c=performance.now();
     if(i>=20){updates.push(b-a);commands.push(c-b);}else stages=[];
    }
    return {cache,enemies:g.enemies.length,visible:g.enemies.filter(e=>e.node.visible).length,fps:1000/summary(intervals).mean,intervalMs:summary(intervals),updateMs:summary(updates),commandsMs:summary(commands),engineMs:summary(stages)};
   }finally{Math.random=random;}
  },stop(){L.stage._loop=original;g.start('storm',true);L.timer.frameLoop(1,g.loop,g.loop.frame);}};
 })()`);
 const rows=[];
 try{for(const cache of ['none','ground','actors'])rows.push(await evaluate(`wechatTest.stress.run(${JSON.stringify(cache)})`));}
 finally{await evaluate(`wechatTest.stress.stop()`);}
 const result={kind:'240 enemies, 208 initial projectiles, 170 drops; browser mock SDK, not iPhone GPU',rows};
 await writeFile(resolve(directory,'wechat-stress.json'),JSON.stringify(result,null,2));
 return result;
}

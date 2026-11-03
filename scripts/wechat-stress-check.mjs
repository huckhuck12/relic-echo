import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Diagnostic benchmark only: gameplay and real Laya rendering run unchanged.
export async function checkWechatStress({evaluate,directory,send}){
 await evaluate(`(async()=>{
  const t=wechatTest,{scenario,seeded,summary}=await import('/bench/scenario.js'),g=t.app.game,L=t.root.Laya;
  L.timer.clear(g.loop,g.loop.frame);const original=L.stage._loop,originalSpeed=g.buffs.speedMultiplier;
  let stages=[],draws=[],triangles=[];L.stage._loop=function(...args){const a=performance.now(),d=L.Stat.renderBatches,f=L.Stat.trianglesFaces;const v=original.apply(this,args);stages.push(performance.now()-a);draws.push(L.Stat.renderBatches-d);triangles.push(L.Stat.trianglesFaces-f);return v;};
  t.stress={async run(cache,textures=false){
   const random=Math.random;Math.random=seeded(20261028);
   try{
    g.scene.enemyAtlas.enabled=textures;
    scenario(g,202,'storm');while(g.shots.length>206)g.release(g.shots.pop().node);while(g.drops.length>103)g.release(g.drops.pop().node);g.scene.ground.cacheAs=cache==='none'?'none':'normal';
    for(const e of g.enemies)e.node.cacheAs=cache==='actors'?'normal':'none';
    const intervals=[],updates=[],commands=[];let last=await new Promise(requestAnimationFrame);stages=[];draws=[];triangles=[];
    for(let i=0;i<65;i++){
     const now=await new Promise(requestAnimationFrame);if(i>=20)intervals.push(now-last);last=now;
     const a=performance.now();g.update(1/60);const b=performance.now();g.render();const c=performance.now();
     if(i>=20){updates.push(b-a);commands.push(c-b);}else {stages=[];draws=[];triangles=[];}
    }
    return {cache,textures,atlasBytes:g.scene.enemyAtlas.bytes,enemies:g.enemies.length,visible:g.enemies.filter(e=>e.node.visible).length,fps:1000/summary(intervals).mean,intervalMs:summary(intervals),updateMs:summary(updates),commandsMs:summary(commands),engineMs:summary(stages),drawCalls:summary(draws),triangles:summary(triangles)};
   }finally{Math.random=random;}
  },stop(){L.stage._loop=original;g.buffs.speedMultiplier=originalSpeed;g.scene.enemyAtlas.enabled=true;g.start('storm',true);L.timer.frameLoop(1,g.loop,g.loop.frame);}};
 })()`);
 const rows=[];
 try{
  for(const [cache,textures] of [['none',false],['ground',false],['ground',true],['ground',false],['ground',true]])rows.push(await evaluate(`wechatTest.stress.run(${JSON.stringify(cache)},${textures})`));
  if(send){
   await evaluate(`(()=>{const g=wechatTest.app.game;g.scene.enemyAtlas.enabled=false;for(const [i,e]of g.enemies.entries()){e.wind=e.kind===1?.12:0;e.actionTime=0;e.flash=i%3===0?.1:0;}g.buffs.speedMultiplier=e=>g.enemies.indexOf(e)%3===1?.5:1;for(const e of g.enemies)g.paintEnemy(e);g.render();})()`);
   for(const textures of [false,true]){
    await evaluate(`(()=>{const g=wechatTest.app.game;g.scene.enemyAtlas.enabled=${textures};for(const e of g.enemies)g.paintEnemy(e);g.render();})()`);
    await new Promise(r=>setTimeout(r,100));const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(resolve(directory,textures?'atlas-battle.png':'vector-battle.png'),Buffer.from(shot.data,'base64'));
   }
  }
 }
 finally{await evaluate(`wechatTest.stress.stop()`);}
 const result={kind:'202 enemies, 206 initial projectiles, 103 drops; repeated vector/atlas comparison in browser mock SDK, not iPhone GPU',rows};
 await writeFile(resolve(directory,'wechat-stress.json'),JSON.stringify(result,null,2));
 return result;
}

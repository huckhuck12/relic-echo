import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Frozen state: entity density and action state vary independently of gameplay progression.
export async function checkRenderAudit({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:640,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/bench/hero-motion.html'});
 for(let i=0;i<100&&!await evaluate('!!window.heroMotion');i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(await evaluate('!!window.heroMotion'),'Hero review board ready');
 const hero=[];
 for(const [mode,frame]of [['idle',0],['walk',1],['cast',0],['cast',5],['cast',11],['walk-cast',2]]){
  const status=await evaluate(`heroMotion.paint(${JSON.stringify(mode)},${frame})`);
  assert.ok(status.ready&&status.bytes.every(b=>b>0&&b<=8388608));hero.push({mode,frame,...status});
  await new Promise(r=>setTimeout(r,60));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`hero-${mode}-${frame}.png`),Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:720,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/bench/guardian-motion.html'});
 for(let i=0;i<100&&!await evaluate('!!window.guardianReady');i++)await new Promise(r=>setTimeout(r,100));
 const guardian=await evaluate('guardianReady');assert.ok(guardian.ready&&guardian.bytes<=8388608);assert.equal(guardian.revision,1,'Guardian review uses painted source');
 await new Promise(r=>setTimeout(r,60));
 const guardianShot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,'guardian-motion.png'),Buffer.from(guardianShot.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:640,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/'});
 for(let i=0;i<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');i++)await new Promise(r=>setTimeout(r,100));
 await evaluate(`(async()=>{
  const {game:g}=await import('/dist/main.js'),{scenario,seeded}=await import('/bench/scenario.js');
  const {enemyArt}=await import('/dist/rendering/enemy-art.js');
  for(let i=0;i<100&&!enemyArt().image&&!enemyArt().error;i++)await new Promise(r=>setTimeout(r,50));
  if(!enemyArt().image)throw Error('Painted enemy source unavailable');
  const L=Laya;L.timer.clear(g.loop,g.loop.frame);
  const original=L.stage._loop;let samples=[];
  L.stage._loop=function(...args){const d=L.Stat.renderBatches;const v=original.apply(this,args);samples.push(L.Stat.renderBatches-d);return v;};
  window.renderAudit={async run(count,kind,wind,flash=false){
   const random=Math.random;Math.random=seeded(20261104);
   try{g.quality='high';scenario(g,count,'storm');}finally{Math.random=random;}
   for(const s of g.shots)g.release(s.node);g.shots=[];
   for(const d of g.drops)g.release(d.node);g.drops=[];g.fx=[];g.fields=[];
   for(const [i,e]of g.enemies.entries()){
    const a=i*2.399963229728653,r=30+Math.sqrt((i+.5)/count)*210;
    e.facing=i%8;e.x=Math.cos(a)*r;e.y=Math.sin(a)*r;e.kind=kind===-1?i%4:kind===-2?1+i%2:kind;e.wind=wind;e.dx=1;e.dy=0;e.hp=e.max;e.flash=flash?.1:0;e.action=undefined;e.actionTime=0;g.paintEnemy(e);
   }
   g.render();samples=[];
   for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
   const sorted=samples.slice(4).sort((a,b)=>a-b);
   return {count,kind,wind,flash,facingVariants:Math.min(count,8),visible:g.enemies.filter(e=>e.node.visible).length,dc:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1)};
  },stop(){L.stage._loop=original;}};
 })()`);
 const rows=[];
 try{
  for(const count of [25,100,200,400])for(const [kind,wind,flash]of [[0,0,false],[0,0,true],[1,0,false],[1,.12,false],[2,.2,false],[-1,0,false],[-2,.2,false]])
   rows.push(await evaluate(`renderAudit.run(${count},${kind},${wind},${flash})`));
  for(const count of [5,20,50])rows.push(await evaluate(`renderAudit.run(${count},3,0)`));
 }finally{await evaluate('renderAudit.stop()');}
 for(const row of rows.filter(r=>r.kind===-1)){
  const ordinary=rows.find(r=>r.count===row.count&&r.kind===0&&!r.flash);
  assert.equal(row.visible,row.count,'Density case keeps every enemy visible');
  assert.ok(row.dc<=ordinary.dc+2,'Interleaved guardians must not cause DC growth per entity');
 }
 const result={scope:'Frozen real Laya WebGL, desktop browser; all enemies visible; no projectiles, drops or gameplay updates. Not native iPhone performance.',hero,guardian,rows};
 await writeFile(resolve(directory,'render-audit.json'),JSON.stringify(result,null,2));
 return result;
}

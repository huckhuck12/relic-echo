import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkMapAudit({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:720,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/'});
 for(let i=0;i<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');i++)await new Promise(r=>setTimeout(r,100));
 await evaluate(`(async()=>{
  const {game:g}=await import('/dist/main.js'),{SEAL_SITES}=await import('/dist/game/map-events.js');
  g.sound=false;g.start('blade',true,'standard');Laya.timer.clear(g.loop,g.loop.frame);
  for(const e of g.enemies)g.release(e.node);g.enemies=[];
  window.mapReview={async paint(index,active=false){
   const site=SEAL_SITES[index];g.player.x=site.x;g.player.y=site.y;g.time=site.at;
   for(const s of g.mapEvents.sites){s.state=s.id===site.id&&active?'active':'locked';s.progress=s.state==='active'?9:0;s.startedAt=g.time;}
   g.render();
   const samples=[],original=Laya.stage._loop;
   Laya.stage._loop=function(...args){const before=Laya.Stat.renderBatches;const value=original.apply(this,args);samples.push(Laya.Stat.renderBatches-before);return value;};
   try{for(let n=0;n<12;n++)await new Promise(requestAnimationFrame);}finally{Laya.stage._loop=original;}
   const sorted=samples.slice(4).sort((a,b)=>a-b);
   return {id:site.id,active,x:g.player.x,y:g.player.y,textureBytes:g.scene.textureBytes,dc:sorted[Math.floor(sorted.length/2)],actorNodes:g.scene.actors.numChildren};
  }};
 })()`);
 const rows=[];
 for(let i=0;i<4;i++)for(const active of [false,true]){
  const row=await evaluate(`mapReview.paint(${i},${active})`);
  assert.ok(row.textureBytes<=24*1048576,'Scene texture budget');assert.ok(row.dc<40,'Static region decoration keeps bounded batches');rows.push(row);
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`map-${row.id}-${active?'active':'idle'}.png`),Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:2,mobile:true});
 await new Promise(r=>setTimeout(r,100));
 for(let i=0;i<4;i++){
  const row=await evaluate(`mapReview.paint(${i},true)`);rows.push({...row,mobile:true});
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`map-${row.id}-mobile.png`),Buffer.from(shot.data,'base64'));
 }
 const report={scope:'Real Laya WebGL static map regions and active seal overlays; desktop browser, not native performance.',rows};
 await writeFile(resolve(directory,'map-audit.json'),JSON.stringify(report,null,2));return report;
}

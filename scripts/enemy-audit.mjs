import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkEnemyAudit({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/bench/enemy-review.html'});
 for(let i=0;i<100&&!await evaluate('!!window.enemyReview');i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(await evaluate('!!window.enemyReview'),'Enemy production board ready');
 const rows=[];
 for(const [detail,palette]of [[false,'normal'],[true,'normal'],[true,'ice'],[true,'flash']])for(const time of palette==='normal'?[0,.17,.34,.51]:[.17]){
  const row=await evaluate(`enemyReview.paint(${time},${detail},${JSON.stringify(palette)})`);
  assert.equal(row.ready,true,'Painted source loaded');assert.equal(row.revision,1);assert.equal(row.atlas.ready,true,JSON.stringify(row));assert.ok(row.atlas.bytes<=4194304,'One enemy page per quality');
  await new Promise(r=>setTimeout(r,80));const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`enemies-${detail?'fine':'standard'}-${palette}-${time}.png`),Buffer.from(shot.data,'base64'));rows.push(row);
 }
 for(const time of [0,.1,.3,.5]){
  const row=await evaluate(`enemyReview.paint(${time},true,'normal',true)`);assert.equal(row.ready,true);rows.push(row);
  await new Promise(r=>setTimeout(r,80));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,`enemies-death-${time}.png`),Buffer.from(shot.data,'base64'));
 }
 for(const [time,palette,state] of [[0,'normal','idle'],[.17,'normal','idle'],[.34,'normal','idle'],[.51,'normal','idle'],[.17,'normal','wind'],[.17,'normal','release'],[.17,'ice','wind'],[.17,'flash','release']]){
  const row=await evaluate(`enemyReview.directions(${time},${JSON.stringify(palette)},${JSON.stringify(state)})`);assert.equal(row.ready,true);assert.equal(row.atlas.bytes,4194304);rows.push(row);
  await new Promise(r=>setTimeout(r,80));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,`enemy-directions-${state}-${palette}-${time}.png`),Buffer.from(shot.data,'base64'));
 }
 const report={scope:'Real desktop Laya WebGL enemy animation and palette review; not native iPhone performance',rows};
 await writeFile(resolve(directory,'enemy-audit.json'),JSON.stringify(report,null,2));return report;
}

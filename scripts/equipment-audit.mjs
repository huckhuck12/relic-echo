import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkEquipmentAudit({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/bench/equipment-review.html'});
 for(let i=0;i<100&&!await evaluate('!!window.equipmentReview');i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(await evaluate('!!window.equipmentReview'),'Equipment review board ready');
 const rows=[];
 for(const category of ['sets','head','armor','back'])for(const [mode,frame]of category==='sets'?[['idle',0],['walk',1],['walk',3],['cast',0],['cast',5],['cast',11],['walk-cast',1]]:[['idle',0]]){
  const row=await evaluate(`equipmentReview.paint(${JSON.stringify(category)},${JSON.stringify(mode)},${frame})`);
  assert.equal(row.ready,true);assert.ok(row.bytes.every(bytes=>bytes>0&&bytes<=8388608),'Every loadout is within 8 MiB');
  await new Promise(r=>setTimeout(r,100));
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,`equipment-${category}-${mode}-${frame}.png`),Buffer.from(shot.data,'base64'));rows.push(row);
 }
 for(const id of ['visor','hood','helmet','light','heavy','energy','cape','pack','thorn'])for(let direction=0;direction<8;direction++){
  const preview=await evaluate(`equipmentReview.preview(${JSON.stringify(id)},${direction})`);assert.equal(preview.result,true);assert.ok(preview.bytes>0&&preview.bytes<=262144,'Static equipment preview stays within 256 KiB');
 }
 const report={scope:'Real desktop Laya WebGL wearable art, eight-direction mapping, cast/move and preview budgets; not native iPhone performance',rows};
 await writeFile(resolve(directory,'equipment-audit.json'),JSON.stringify(report,null,2));return report;
}

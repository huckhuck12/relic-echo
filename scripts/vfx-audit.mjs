import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkVfxAudit({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:960,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/bench/vfx-review.html'});
 for(let i=0;i<100&&!await evaluate('!!window.vfxReview');i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(await evaluate('!!window.vfxReview'),'VFX production board ready');
 // Allow the first rendering call to finish the optional async image upload.
 for(let i=0;i<100&&!await evaluate('vfxReview.paint().atlas.ready');i++)await new Promise(r=>setTimeout(r,100));
 const rows=[];
 for(const [mode,age,level,detail]of [['buffs',.08,1,3],['buffs',.08,3,5],['buffs',.18,5,8],['buffs',1.8,5,8],['weapons',.08,3,5],['weapons',.19,3,3],['player-stages',.08,3,5],['build-states',.08,3,5],['build-states',.22,5,3],['enemy-shots',0,3,5],['enemy-shots',.12,3,5],['accents',.08,3,5],['evolutions',.08,3,5],['evolutions',.18,5,8]]){
  const row=await evaluate(`(async()=>{
   const L=Laya,original=L.stage._loop,samples=[];
   L.stage._loop=function(...args){const d=L.Stat.renderBatches;const value=original.apply(this,args);samples.push(L.Stat.renderBatches-d);return value;};
   try{
    const state=vfxReview.paint(${JSON.stringify(mode)},${age},${level},${detail});
    for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
    const sorted=samples.slice(4).sort((a,b)=>a-b);return{...state,dc:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1)};
   }finally{L.stage._loop=original;}
  })()`);
  assert.equal(row.atlas.ready,true,'Painted atlas uploaded');
  assert.equal(row.atlas.bytes,1048576,'One shared 1 MiB page');
  assert.ok(row.dc<=10,'Bounded raster/vector passes: '+JSON.stringify(row));
  rows.push(row);
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`vfx-${mode}-${age}-${level}-${detail}.png`),Buffer.from(shot.data,'base64'));
 }
 const report={scope:'Real Laya WebGL VFX board on desktop; not native iPhone or a gameplay FPS measurement.',rows};
 await writeFile(resolve(directory,'vfx-audit.json'),JSON.stringify(report,null,2));return report;
}

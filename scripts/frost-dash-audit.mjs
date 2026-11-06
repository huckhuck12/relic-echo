import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Deterministic staged interaction with the production engine and real touch dispatch. */
export async function checkFrostDashAudit({send,evaluate,origin,directory}){
 const rows=[];
 const run=code=>evaluate(`(async()=>{const {game:g,ui}=await import('/dist/main.js');const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};${code}})()`);
 await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',platform:'iPhone'});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [width,height]of [[320,568],[393,852],[568,320],[852,393]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:origin+'/?frost-dash='+width});
  for(let n=0;n<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');n++)await new Promise(r=>setTimeout(r,100));
  const before=await run(`
   g.start('storm',true,'standard');Laya.timer.clear(g.loop,g.loop.frame);g.buffs.chooseStarter('ice');
   for(let n=0;n<5&&g.buffs.levelOf(g.buffs.recipes[0])<3;n++)g.buffs.receiveFragment('ice');
   g.buffs.takeBranchRequest('orbit/ice');if(!g.buffs.chooseBranch('prison','orbit/ice'))throw Error('Branch not ready');
   g.enemies.length=0;g.pillars.length=0;Object.assign(g.player,{x:0,y:0,dx:1,dy:0,dash:0});g.attackTimer=999;g.buffs.cooldowns.fill(0);
   g.spawnEnemy(0);const target=g.enemies[0];Object.assign(target,{x:60,y:50,hp:10000,speed:0});g.grid.rebuild(g.enemies);
   for(let n=0;n<4;n++)g.buffs.evolutions.hit(target,{kind:'orbit',element:'ice',damage:27,level:3,slot:0,branch:'prison'});
   g.render();ui.update();await new Promise(requestAnimationFrame);
   const node=find(ui.root,'dash'),hint=find(ui.root,'hud-dash'),p=node.localToGlobal(new Laya.Point(node.width*.5,node.height*.5)),q=hint.localToGlobal(new Laya.Point(0,0));
   window.frostDashButton=node;return {x:p.x,y:p.y,hint:hint.text,hintX:q.x,hintY:q.y,hintWidth:hint.width,hintHeight:hint.textHeight};
  `);
  assert.match(before.hint,/高层冰/);
  assert.ok(before.x>=0&&before.x<=width&&before.y>=0&&before.y<=height);
  assert.ok(before.hintY+before.hintHeight<=height+1,'Hint stays inside phone');
  await writeFile(resolve(directory,`frost-dash-${width}x${height}-ready.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:before.x,y:before.y}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await run(`
   const started=g.player.dashTime>0;for(let n=0;n<12;n++)g.update(1/60);g.render();ui.update();await new Promise(requestAnimationFrame);
   return {started,shatters:g.buffs.dashShatters,hint:find(ui.root,'hud-dash').text,sameButton:window.frostDashButton===find(ui.root,'dash'),feedback:g.buffs.feedback.map(v=>v.kind),player:{x:g.player.x,y:g.player.y},sources:g.damageRanking.rows()};
  `);
  assert.equal(after.started,true);assert.equal(after.shatters,1);assert.equal(after.sameButton,true);
  assert.ok(after.feedback.includes('harvest'));assert.ok(after.sources.some(r=>r.id==='orbit/ice'&&r.damage>0));
  assert.ok(!after.sources.some(r=>r.id==='blast/force'),'Crossed target outside landing blast receives no extra base force damage');
  assert.match(after.hint,/冷却/);
  await writeFile(resolve(directory,`frost-dash-${width}x${height}-harvest.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  rows.push({width,height,before,after});
 }
 const report={scope:'Staged ice marks, production Laya engine and real touch events at four phone sizes; not a natural encounter frequency or native FPS measurement.',rows};
 await writeFile(resolve(directory,'frost-dash-audit.json'),JSON.stringify(report,null,2));return report;
}

import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Real reward taps, rendering and touch ownership at four phone sizes. */
export async function checkIceBuildAudit({send,evaluate,origin,directory}){
 const rows=[];
 const run=code=>evaluate(`(async()=>{const {game:g,ui}=await import('/dist/main.js');const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};${code}})()`);
 const tap=async name=>{const p=await run(`const n=find(ui.root,${JSON.stringify(name)});if(!n)throw Error('Missing '+${JSON.stringify(name)});const p=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));return{x:p.x,y:p.y};`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',platform:'iPhone'});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [width,height]of [[320,568],[393,852],[568,320],[852,393]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await send('Page.navigate',{url:origin+'/?ice-build='+width});
  for(let n=0;n<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');n++)await new Promise(r=>setTimeout(r,100));
  for(const branch of ['shards','prison']){
   const start=await run(`g.start('storm',true,'standard');Laya.timer.clear(g.loop,g.loop.frame);g.show({type:'build',choices:['fire','ice','thunder','free']});ui.update();await new Promise(requestAnimationFrame);const card=find(ui.root,'build-ice');return card.getChildAt(1).text;`);
   assert.match(start,/远程/);await tap('build-ice');
   assert.equal(await run(`return g.buffs.recipes[0].action;`),'bolt');
   await run(`for(let i=0;i<8&&g.buffs.levelOf(g.buffs.recipes[0])<3;i++)g.buffs.receiveFragment('ice');g.update(1/60);ui.update();`);
   assert.equal(await run(`return g.dialog?.pair;`),'bolt/ice');await tap('branch-'+branch);
   const before=await run(`g.enemies.length=0;g.pillars.length=0;Object.assign(g.player,{x:0,y:0,dx:1,dy:0});g.spawnEnemy(0);const t=g.enemies[0];Object.assign(t,{x:300,y:0,hp:10000,speed:0});g.grid.rebuild(g.enemies);g.attackTimer=999;g.buffs.cooldowns.fill(0);g.buffs.trigger('hit',300,0,1);for(let i=0;i<20;i++)g.update(1/60);g.render();ui.update();await new Promise(requestAnimationFrame);const n=find(ui.root,'hud-buffs'),b=find(ui.root,'buffs'),p=n.localToGlobal(new Laya.Point(0,0));window.iceBuffButton=b;window.iceDashButton=find(ui.root,'dash');return {text:n.text,width:n.textWidth,height:n.textHeight,labelWidth:n.width,x:p.x,y:p.y,bottom:b.localToGlobal(new Laya.Point(0,b.height)).y,sources:g.damageRanking.rows(),shatters:g.buffs.evolutions.shatters,control:g.buffs.controlSummary()};`);
   assert.match(before.text,branch==='shards'?/碎冰·弹丸 Lv.3/:/寒牢·弹丸 Lv.3/);
   assert.ok(before.width<=before.labelWidth+1,'HUD text fits the build button');assert.ok(before.y+before.height<=before.bottom+1);assert.ok(before.y>=0&&before.bottom<=height+1);
   assert.ok(before.sources.some(r=>r.id==='bolt/ice'&&r.damage>0));assert.equal(before.sources.some(r=>r.id==='orbit/ice'),false);
   assert.equal(before.shatters,branch==='shards'?1:0);
   if(branch==='prison')assert.ok(before.control.slowed>0&&before.control.slowedEnemySeconds>0);
   await writeFile(resolve(directory,`ice-build-${width}x${height}-${branch}-battle.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
   const point=await run(`const n=ui.hudView.stick.activation,p=n.localToGlobal(new Laya.Point(n.width*.6,n.height*.35));return{x:p.x,y:p.y};`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:7,...point}]});
   const stable=await run(`const owner=ui.hudView.stick.stickTouch;g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');ui.update();return {owner,after:ui.hudView.stick.stickTouch,same:window.iceBuffButton===find(ui.root,'buffs')&&window.iceDashButton===find(ui.root,'dash'),text:find(ui.root,'hud-buffs').text};`);
   assert.notEqual(stable.owner,null);assert.equal(stable.after,stable.owner);assert.equal(stable.same,true);assert.match(stable.text,/Lv.4/);
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tap('buffs');await tap('buff-page-growth');
   assert.match(await run(`return find(ui.root,'buff-growth').text;`),/弹丸.*冰霜.*Lv.4/);
   await writeFile(resolve(directory,`ice-build-${width}x${height}-${branch}-growth.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
   await run(`g.close();g.show({type:'damage'});ui.update();`);
   const control=await run(`const n=find(ui.root,'damage-control'),p=n.localToGlobal(new Laya.Point(0,0));return{text:n.text,bottom:p.y+n.textHeight,next:find(ui.root,'damage-row-bolt/ice').localToGlobal(new Laya.Point(0,0)).y};`);
   assert.match(control.text,/减速.*敌秒/);assert.ok(control.bottom<=control.next+1);
   rows.push({width,height,branch,before,stable,control});
  }
 }
 const report={scope:'Staged production-engine ice projectile builds with real reward taps, HUD levels, held joystick and control panel. Not human balance or native phone performance.',rows};
 await writeFile(resolve(directory,'ice-build-audit.json'),JSON.stringify(report,null,2));return report;
}

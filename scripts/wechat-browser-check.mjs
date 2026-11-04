import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {checkWechatStress} from './wechat-stress-check.mjs';
export async function checkWechatBrowser({send,evaluate,origin,directory}){
 await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true});
 await send('Page.navigate',{url:origin+'/bench/wechat-smoke.html'});
 let ready=false;
 for(let i=0;i<100;i++){
  const status=await evaluate(`({ready:!!window.wechatTest,error:window.wechatError})`);
  if(status.error)throw Error(status.error);
  if(status.ready){ready=true;break;}await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'Generated WeChat package starts with real engine');
 assert.equal(await evaluate(`wechatTest.host.__relicDiagnostics.report().current.events.at(-1).type`),'ready','Diagnostics start before the engine and attach after game initialization');
 assert.equal(await evaluate(`(()=>{const t=wechatTest;t.emit('MemoryWarning',{level:10});return JSON.parse(t.storage.get('relic-runtime-diagnostics')).current.events.at(-1).type;})()`),'memory-warning','Native memory warnings persist with a game snapshot');
 assert.deepEqual(await evaluate(`wechatTest.frameRateRequests`),[60],'Startup requests native 60 FPS');
 assert.equal(await evaluate(`wechatTest.root.Laya.stage.frameRate`),'fast','Engine does not skip alternate frames');
 assert.equal(await evaluate(`(()=>{const r=wechatTest.root,p=r.canvas.parentNode,a=r.document.createElement('div'),b=r.document.createElement('div');a.appendChild(r.canvas);b.appendChild(r.canvas);const moved=!a.contains(r.canvas)&&b.contains(r.canvas);b.removeChild(r.canvas);return moved&&!b.contains(r.canvas)&&r.canvas.parentNode===p;})()`),true,'Synthetic containers do not write the native Canvas parentNode');
 assert.equal(await evaluate(`wechatTest.host.window===window && wechatTest.root!==wechatTest.host && wechatTest.root.window===wechatTest.root && wechatTest.host.Laya===wechatTest.root.Laya`),true,'Read-only devtools host globals remain untouched');
 assert.equal(await evaluate(`(()=>{const r=wechatTest.root,c=r.wx.createCanvas().getContext('2d'),pixels=new r.ImageData(2,3);return r.CanvasRenderingContext2D.prototype===Object.getPrototypeOf(c)&&typeof c.drawTexture==='function'&&pixels.width===2&&pixels.height===3&&Number.isFinite(r.performance.now());})()`),true,'Native 2D prototype and pixel allocation work without host DOM constructors');
 const initial=await evaluate(`(()=>{const t=wechatTest,{game,ui}=t.app;return{dialog:game.dialog?.type,stage:[t.root.Laya.stage.width,t.root.Laya.stage.height],mobile:ui.mobile,top:ui.root.y,adapter:!!t.root.Laya.MiniAdpter?._inited,canvas:[t.root.canvas.width,t.root.canvas.height]};})()`);
 assert.equal(initial.dialog,'start');assert.equal(initial.mobile,true);assert.equal(initial.adapter,true);assert.equal(initial.top,88);
 assert.deepEqual(initial.stage,[393,852]);assert.deepEqual(initial.canvas,[786,1704]);
 const screenRect=await evaluate(`(()=>{const b=Element.prototype.getBoundingClientRect.call(document.querySelector('canvas'));return {x:b.x,y:b.y,width:b.width,height:b.height};})()`);
 assert.deepEqual(screenRect,{x:0,y:0,width:393,height:852},'SDK already fits the canvas to the screen; engine CSS must not shrink it again');
 const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,'wechat-'+name+'.png'),Buffer.from(shot.data,'base64'));};
 await screenshot('menu');
 await evaluate(`wechatTest.tap('start');wechatTest.app.game.showPerformance=true`);await new Promise(r=>setTimeout(r,900));
 const battle=await evaluate(`({mode:wechatTest.app.game.mode,time:wechatTest.app.game.time})`);
 assert.equal(battle.mode,'battle');assert.ok(battle.time>.1);
 assert.equal(await evaluate(`wechatTest.app.game.scene.playerArtStatus.ready`),true,'Packaged painted hero loads through native image creation');
 for(let i=0;i<100&&!await evaluate(`wechatTest.app.game.scene.enemyAtlas.revision===1`);i++)await new Promise(r=>setTimeout(r,50));
 assert.equal(await evaluate(`wechatTest.app.game.scene.enemyAtlas.revision`),1,'Packaged painted enemies load through native image creation');
 const stick=await evaluate(`(()=>{const t=wechatTest,s=t.app.ui.hudView.stick.activation,p=s.localToGlobal(new t.root.Laya.Point(s.width*.6,s.height*.35));const touch={identifier:7,clientX:p.x,clientY:p.y};t.touch('Start',[touch]);t.touch('Move',[{...touch,clientX:p.x+44}]);return{x:p.x,y:p.y,playerX:t.app.game.player.x,playerY:t.app.game.player.y};})()`);
 await new Promise(r=>setTimeout(r,200));
 const moved=await evaluate(`(()=>{const t=wechatTest;const p=t.app.game.player;return {x:p.x,y:p.y,owner:t.app.ui.hudView.stick.stickTouch};})()`);
 assert.equal(moved.owner,7);assert.ok(Math.hypot(moved.x-stick.playerX,moved.y-stick.playerY)>1);
 // A second finger can dash without releasing the stick owned by finger 7.
 const dual=await evaluate(`(()=>{const t=wechatTest,p=t.point('dash'),left={identifier:7,clientX:${stick.x+44},clientY:${stick.y}},right={identifier:8,clientX:p.x,clientY:p.y};t.touch('Start',[left,right],[right]);t.touch('End',[left],[right]);return{owner:t.app.ui.hudView.stick.stickTouch,dash:t.app.game.player.dash};})()`);
 assert.equal(dual.owner,7);assert.ok(dual.dash>0);
 const cancelled=await evaluate(`(()=>{const t=wechatTest,left={identifier:7,clientX:${stick.x+44},clientY:${stick.y}};t.touch('Cancel',[],[left]);return t.app.ui.hudView.stick.stickTouch;})()`);
 assert.equal(cancelled,null,'Touch cancellation releases the joystick');
 await evaluate(`wechatTest.touch('Start',[{identifier:7,clientX:${stick.x},clientY:${stick.y}}])`);
 await evaluate(`wechatTest.emit('Hide');wechatTest.emit('Show')`);
 const paused=await evaluate(`({dialog:wechatTest.app.game.dialog?.type,owner:wechatTest.app.ui.hudView.stick.stickTouch,stick:wechatTest.app.game.input.stick})`);
 assert.equal(paused.dialog,'pause');assert.equal(paused.owner,null);assert.deepEqual(paused.stick,{x:0,y:0});
 assert.equal(await evaluate(`(()=>{wechatTest.tap('copy-diagnostics');return JSON.parse(wechatTest.clipboard()).current.events.some(e=>e.type==='memory-warning');})()`),true,'Experience builds can export local diagnostics from the pause menu');
 assert.deepEqual(await evaluate(`wechatTest.frameRateRequests`),[60,60],'Foreground restores native 60 FPS');
 await evaluate(`wechatTest.tap('resume')`);
 await new Promise(r=>setTimeout(r,2000));
 const performance=await evaluate(`wechatTest.app.game.performanceSnapshot()`);
 assert.ok(performance.samples>0,'Collect actual battle frame intervals rather than treating requested FPS as measured FPS');
 assert.ok(performance.engineSamples>0&&performance.drawCalls>0&&performance.simulationSteps>0,'Real Stage.render records engine CPU, draw calls and simulation steps');
 const atlas=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;return{bytes:g.scene.enemyAtlas.bytes,tiles:g.scene.enemyAtlas.sheet.tiles.size};})()`);
 assert.equal(atlas.tiles,341,'Directional gait/body/arms/staff, palettes and actors share one page');assert.equal(atlas.bytes,4194304,'GPU atlas has a fixed 4 MiB budget');
 const highAtlas=await evaluate(`(()=>{const g=wechatTest.app.game;g.spawnEnemy(1);g.cycleVisualQuality();for(const e of g.enemies)g.paintEnemy(e);return {quality:g.quality,...g.scene.enemyAtlas.snapshot(true),total:g.scene.enemyAtlas.bytes};})()`);
 assert.equal(highAtlas.quality,'high');assert.equal(highAtlas.ready,true,'Detailed enemies use a shared atlas too');assert.equal(highAtlas.bytes,4194304);assert.equal(highAtlas.total,4194304,'Painted family shares the same page across quality changes');
 const wearables=[];
 for(const [head,armor,back]of [['visor','light','cape'],['helmet','heavy','thorn'],['hood','energy','pack']]){
  const row=await evaluate(`(()=>{const g=wechatTest.app.game;wechatTest.savedLoadout??=g.loadout;g.loadout={...g.loadout,head:{id:${JSON.stringify(head)},quality:2},armor:{id:${JSON.stringify(armor)},quality:2},back:{id:${JSON.stringify(back)},quality:2}};g.player.direction=1;g.render();wechatTest.app.ui.update();return{head:${JSON.stringify(head)},armor:${JSON.stringify(armor)},back:${JSON.stringify(back)},bytes:g.scene.playerAtlas.bytes,ready:g.scene.playerArtStatus.ready};})()`);
  assert.equal(row.ready,true);assert.ok(row.bytes>0&&row.bytes<=8388608,'Painted wearable composition succeeds in the WeChat engine environment');wearables.push(row);
  await new Promise(r=>setTimeout(r,60));await screenshot('wearables-'+head);
 }
 await evaluate(`(()=>{const g=wechatTest.app.game;g.loadout=wechatTest.savedLoadout;delete wechatTest.savedLoadout;g.render();wechatTest.app.ui.update();})()`);
 await evaluate(`wechatTest.app.game.cycleVisualQuality();wechatTest.app.game.cycleVisualQuality()`);
 // Isolate input checks from random combat rewards on slower CI machines.
 await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.start('storm',true);t.root.Laya.timer.clear(g.loop,g.loop.frame);t.app.ui.update();})()`);
 const displayedVersion=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.openPerformance();const text=t.find(t.app.ui.root,'build-version').text;g.close();return {text,version:t.host.__relicDiagnostics.report().current.version};})()`);
 assert.equal(displayedVersion.text,'当前版本 v'+displayedVersion.version,'Performance panel matches the generated package version');
 const beforeReward=await evaluate(`(()=>{const t=wechatTest,s=t.app.ui.hudView.stick,a=s.activation,p=a.localToGlobal(new t.root.Laya.Point(a.width*.8,a.height*.15));t.heldStick={identifier:7,clientX:p.x+44,clientY:p.y};t.touch('Start',[{...t.heldStick,clientX:p.x}]);t.touch('Move',[t.heldStick]);const g=t.app.game;g.onToast('怪潮涌入');const n=g.acquire(true);n.text='999';g.labels.push({node:n,x:g.player.x,y:g.player.y,rise:48,life:.65});g.render();g.onChange();return{owner:s.stickTouch,direction:g.input.stick,decorative:n.mouseEnabled};})()`);
 assert.equal(beforeReward.owner,7);assert.ok(beforeReward.direction.x>.9);assert.equal(beforeReward.decorative,false);
 // New rewards preserve the held floating joystick, using actual SDK touch dispatch.
 await evaluate(`(()=>{const g=wechatTest.app.game;g.addXP(10);})()`);
 await evaluate(`wechatTest.tap('build-fire',[wechatTest.heldStick])`);
 assert.equal(await evaluate(`wechatTest.app.ui.hudView.stick.stickTouch`),7);
 await evaluate(`(()=>{const g=wechatTest.app.game;g.buffs.receiveFragment('fire');g.buffs.receiveFragment('fire');g.buffs.takeBranchRequest();g.show({type:'branch',choices:['trail','furnace']});})()`);
 await screenshot('buff-branch');
 await evaluate(`wechatTest.tap('branch-furnace',[wechatTest.heldStick])`);
 assert.equal(await evaluate(`wechatTest.app.ui.hudView.stick.stickTouch`),7);
 assert.ok(await evaluate(`wechatTest.app.game.input.stick.x>.9`));
 await evaluate(`(()=>{const g=wechatTest.app.game,b=g.buffs;for(const id of ['orbit','ice'])b.grant(id);b.install(0,'trigger','hit');b.install(0,'action','orbit');b.install(0,'element','ice');b.receiveFragment('ice');b.receiveFragment('ice');g.show(b.takeBranchReward());})()`);
 await screenshot('ice-branch');
 await evaluate(`wechatTest.tap('branch-prison',[wechatTest.heldStick])`);
 assert.equal(await evaluate(`wechatTest.app.game.buffs.branchOf(wechatTest.app.game.buffs.recipes[0])`),'prison');
 assert.equal(await evaluate(`wechatTest.app.ui.hudView.stick.stickTouch`),7);
 assert.ok(await evaluate(`wechatTest.app.game.input.stick.x>.9`));
 await evaluate(`(()=>{const g=wechatTest.app.game,b=g.buffs;for(const id of ['bolt','lightning'])b.grant(id);b.install(0,'action','bolt');b.install(0,'element','lightning');b.receiveFragment('lightning');b.receiveFragment('lightning');g.show(b.takeBranchReward());})()`);
 await screenshot('thunder-branch');
 await evaluate(`wechatTest.tap('branch-spread',[wechatTest.heldStick])`);
 assert.equal(await evaluate(`wechatTest.app.game.buffs.branchOf(wechatTest.app.game.buffs.recipes[0])`),'spread');
 assert.equal(await evaluate(`wechatTest.app.ui.hudView.stick.stickTouch`),7);
 assert.ok(await evaluate(`wechatTest.app.game.input.stick.x>.9`));
 await evaluate(`(()=>{const t=wechatTest,{UPGRADES}=t.load('/app/progression/config.js'),g=t.app.game;g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));for(let i=0;i<3;i++)g.show({type:'upgrade',choices:[]});t.app.ui.update();})()`);
 for(let i=0;i<3;i++){
  const result=await evaluate(`(()=>{const t=wechatTest,g=t.app.game,id=g.flow.dialogId;t.tap('upgrade-heal',[t.heldStick]);return{pending:g.flow.pendingCount,dialog:g.dialog?.type,owner:t.app.ui.hudView.stick.stickTouch,stick:g.input.stick,stale:g.claimReward(id,{type:'upgrade',id:'heal'})};})()`);
  assert.equal(result.pending,Math.max(0,1-i));assert.equal(result.dialog,i<2?'upgrade':undefined);assert.equal(result.stale,false);
  assert.equal(result.owner,7,'Left thumb stays owned while right thumb claims cards');
  assert.equal(result.stick.x,i<2?0:1,'Movement stays paused until the final card, then resumes without lifting');
 }
 await evaluate(`wechatTest.touch('End',[],[wechatTest.heldStick])`);
 for(const fraction of [.12,.85]){
  const owner=await evaluate(`(()=>{const t=wechatTest,s=t.app.ui.hudView.stick,a=s.activation,p=a.localToGlobal(new t.root.Laya.Point(a.width*.75,a.height*${fraction})),finger={identifier:9,clientX:p.x,clientY:p.y};t.touch('Start',[finger]);t.touch('Move',[{...finger,clientX:p.x+44}]);const result={owner:s.stickTouch,x:t.app.game.input.stick.x};t.touch('End',[],[finger]);return result;})()`);
  assert.equal(owner.owner,9,'Floating activation area remains interactive after rewards');assert.ok(owner.x>.9);
 }
 await evaluate(`wechatTest.resize(393,760)`);await new Promise(r=>setTimeout(r,200));
 assert.equal(await evaluate(`wechatTest.root.Laya.stage.height`),760);
 await screenshot('battle');
 await evaluate(`wechatTest.resize(852,393);wechatTest.app.game.show({type:'pause'})`);await new Promise(r=>setTimeout(r,200));
 const diagnosticLayout=await evaluate(`(()=>{const t=wechatTest,c=t.find(t.app.ui.root,'copy-diagnostics'),r=t.find(t.app.ui.root,'resume');return{bottom:c.y+c.height,resume:r.y,right:c.x+c.width,panel:c.parent.width};})()`);
 assert.ok(diagnosticLayout.bottom<=diagnosticLayout.resume&&diagnosticLayout.right<=diagnosticLayout.panel,'Diagnostics fit landscape phones without overlapping resume: '+JSON.stringify(diagnosticLayout));
 await evaluate(`wechatTest.tap('copy-diagnostics');wechatTest.app.game.close();wechatTest.resize(393,760)`);
 const death=await evaluate(`(()=>{const g=wechatTest.app.game;g.training=false;g.player.inv=0;g.hurt(999999);return{dialog:g.dialog?.type,revival:g.revival.provider.available};})()`);
 assert.equal(death.dialog,'result');assert.equal(death.revival,false);
 await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.flow.title();t.app.ui.update();t.tap('autoplay-start');t.root.Laya.timer.frameLoop(1,g.loop,g.loop.frame);})()`);
 await new Promise(r=>setTimeout(r,2200));
 const auto=await evaluate(`(()=>{const g=wechatTest.app.game;return{enabled:g.autoPlay.enabled,decisions:g.autoPlay.decisions,time:g.time,training:g.training};})()`);
 assert.equal(auto.enabled,true);assert.equal(auto.training,false);assert.ok(auto.decisions>5&&auto.time>.5,'Automatic play advances on the real engine loop');
 await screenshot('autoplay');
 let autoPaused=false;
 for(let i=0;i<40&&!autoPaused;i++){
  autoPaused=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;if(!g.dialog)t.tap('pause');return g.dialog?.type==='pause';})()`);
  if(!autoPaused)await new Promise(r=>setTimeout(r,150));
 }
 assert.equal(autoPaused,true,'Pause via real touch after any automatic reward finishes');
 const decisions=await evaluate(`wechatTest.app.game.autoPlay.decisions`);await new Promise(r=>setTimeout(r,350));
 assert.equal(await evaluate(`wechatTest.app.game.autoPlay.decisions`),decisions,'Manual pause stops automatic input');
 await evaluate(`wechatTest.tap('copy-diagnostics')`);
 assert.equal(await evaluate(`JSON.parse(wechatTest.clipboard()).autoPlay.round`),1,'Copied diagnostics contain the persistent automatic test report');
 await evaluate(`wechatTest.tap('autoplay-toggle')`);
 assert.equal(await evaluate(`wechatTest.app.game.autoPlay.enabled`),false);
 await evaluate(`wechatTest.app.game.close()`);
 const protectedRun=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.returnToTitle();t.app.ui.update();t.tap('autoplay-stress');g.player.hp=1;g.player.inv=0;g.hurt(99999);return{stress:g.autoPlay.stress,hp:g.player.hp,mode:g.mode,training:g.training};})()`);
 assert.deepEqual(protectedRun,{stress:true,hp:1,mode:'battle',training:false},'Real engine stress entry keeps lethal-hit protection separate from training');
 await screenshot('autoplay-stress');
 await evaluate(`wechatTest.app.game.returnToTitle()`);
 const probeContext=await evaluate(`(async()=>{const t=wechatTest,g=t.app.game,{scenario,seeded,enableBuffs}=await import('/bench/scenario.js');const random=Math.random;Math.random=seeded(20261103);try{g.quality='high';scenario(g,235,'storm');enableBuffs(g);for(let i=0;i<90;i++)g.update(1/60);g.render();g.openPerformance();t.app.ui.update();t.tap('drawcall-measure');return{time:g.time,hp:g.player.hp,enemies:g.enemies.length,shots:g.shots.length,drops:g.drops.length};}finally{Math.random=random;}})()`);
 for(let i=0;i<150&&await evaluate(`wechatTest.app.game.drawCallProbe.active`);i++)await new Promise(r=>setTimeout(r,100));
 const drawCallProbe=await evaluate(`(()=>{const g=wechatTest.app.game;return{active:g.drawCallProbe.active,error:g.drawCallProbe.error,report:g.drawCallProbe.report,time:g.time,hp:g.player.hp,dialog:g.dialog?.type};})()`);
 assert.equal(drawCallProbe.active,false);assert.equal(drawCallProbe.error,'');assert.ok(drawCallProbe.report?.baseline>0);assert.equal(drawCallProbe.report.rows.length,10);
 assert.equal(drawCallProbe.time,probeContext.time);assert.equal(drawCallProbe.hp,probeContext.hp);assert.equal(drawCallProbe.dialog,'performance');
 await screenshot('drawcall-probe');
 await evaluate(`wechatTest.tap('performance-summary')`);
 assert.equal(await evaluate(`wechatTest.app.game.drawCallProbe.showReport`),false,'Frame statistics remain accessible after a split');
 await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.close();g.togglePause();t.tap('copy-diagnostics');})()`);
 assert.equal(await evaluate(`JSON.parse(wechatTest.clipboard()).drawCalls.rows.length`),10,'Copied diagnostics contain the complete split report');
 await evaluate(`wechatTest.app.game.returnToTitle()`);
 const stress=process.argv.includes('--stress')?await checkWechatStress({evaluate,directory,send}):undefined;
 return {kind:'wechat-package-in-browser',initial,battle,dual,paused,death,performance,enemyArt:{atlas,highAtlas},wearables,drawCallProbe,probeContext,stress};
}

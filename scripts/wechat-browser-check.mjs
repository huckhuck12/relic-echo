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
 const atlas=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;return{bytes:g.scene.enemyAtlas.bytes,tiles:g.scene.enemyAtlas.tiles.size};})()`);
 assert.equal(atlas.tiles,57,'One shared atlas covers all ordinary enemy palette and caster phases');assert.equal(atlas.bytes,4194304,'GPU atlas has a fixed 4 MiB budget');
 const highAtlas=await evaluate(`(()=>{const g=wechatTest.app.game;g.spawnEnemy(1);g.cycleVisualQuality();for(const e of g.enemies)g.paintEnemy(e);return {quality:g.quality,...g.scene.enemyAtlas.snapshot(true),total:g.scene.enemyAtlas.bytes};})()`);
 assert.equal(highAtlas.quality,'high');assert.equal(highAtlas.ready,true,'Detailed enemies use a shared atlas too');assert.equal(highAtlas.bytes,4194304);assert.equal(highAtlas.total,8388608);
 await evaluate(`wechatTest.app.game.cycleVisualQuality();wechatTest.app.game.cycleVisualQuality()`);
 // Isolate input checks from random combat rewards on slower CI machines.
 await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.start('storm',true);t.root.Laya.timer.clear(g.loop,g.loop.frame);t.app.ui.update();})()`);
 const displayedVersion=await evaluate(`(()=>{const t=wechatTest,g=t.app.game;g.openPerformance();const text=t.find(t.app.ui.root,'build-version').text;g.close();return {text,version:t.host.__relicDiagnostics.report().current.version};})()`);
 assert.equal(displayedVersion.text,'当前版本 v'+displayedVersion.version,'Performance panel matches the generated package version');
 const beforeReward=await evaluate(`(()=>{const t=wechatTest,s=t.app.ui.hudView.stick,a=s.activation,p=a.localToGlobal(new t.root.Laya.Point(a.width*.8,a.height*.15));t.heldStick={identifier:7,clientX:p.x+44,clientY:p.y};t.touch('Start',[{...t.heldStick,clientX:p.x}]);t.touch('Move',[t.heldStick]);const g=t.app.game;g.onToast('怪潮涌入');const n=g.acquire(true);n.text='999';g.labels.push({node:n,x:g.player.x,y:g.player.y,rise:48,life:.65});g.render();g.onChange();return{owner:s.stickTouch,direction:g.input.stick,decorative:n.mouseEnabled};})()`);
 assert.equal(beforeReward.owner,7);assert.ok(beforeReward.direction.x>.9);assert.equal(beforeReward.decorative,false);
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
 const stress=process.argv.includes('--stress')?await checkWechatStress({evaluate,directory,send}):undefined;
 return {kind:'wechat-package-in-browser',initial,battle,dual,paused,death,performance,stress};
}

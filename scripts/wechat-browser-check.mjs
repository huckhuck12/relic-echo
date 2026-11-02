import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
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
 assert.equal(await evaluate(`(()=>{const r=wechatTest.root,p=r.canvas.parentNode,a=r.document.createElement('div'),b=r.document.createElement('div');a.appendChild(r.canvas);b.appendChild(r.canvas);const moved=!a.contains(r.canvas)&&b.contains(r.canvas);b.removeChild(r.canvas);return moved&&!b.contains(r.canvas)&&r.canvas.parentNode===p;})()`),true,'Synthetic containers do not write the native Canvas parentNode');
 assert.equal(await evaluate(`wechatTest.host.window===window && wechatTest.root!==wechatTest.host && wechatTest.root.window===wechatTest.root && wechatTest.host.Laya===wechatTest.root.Laya`),true,'Read-only devtools host globals remain untouched');
 assert.equal(await evaluate(`(()=>{const r=wechatTest.root,c=r.wx.createCanvas().getContext('2d'),pixels=new r.ImageData(2,3);return r.CanvasRenderingContext2D.prototype===Object.getPrototypeOf(c)&&typeof c.drawTexture==='function'&&pixels.width===2&&pixels.height===3&&Number.isFinite(r.performance.now());})()`),true,'Native 2D prototype and pixel allocation work without host DOM constructors');
 const initial=await evaluate(`(()=>{const t=wechatTest,{game,ui}=t.app;return{dialog:game.dialog?.type,stage:[t.root.Laya.stage.width,t.root.Laya.stage.height],mobile:ui.mobile,top:ui.root.y,adapter:!!t.root.Laya.MiniAdpter?._inited,canvas:[t.root.canvas.width,t.root.canvas.height]};})()`);
 assert.equal(initial.dialog,'start');assert.equal(initial.mobile,true);assert.equal(initial.adapter,true);assert.equal(initial.top,88);
 assert.deepEqual(initial.stage,[393,852]);assert.deepEqual(initial.canvas,[1179,2556]);
 const screenRect=await evaluate(`(()=>{const b=Element.prototype.getBoundingClientRect.call(document.querySelector('canvas'));return {x:b.x,y:b.y,width:b.width,height:b.height};})()`);
 assert.deepEqual(screenRect,{x:0,y:0,width:393,height:852},'SDK already fits the canvas to the screen; engine CSS must not shrink it again');
 const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,'wechat-'+name+'.png'),Buffer.from(shot.data,'base64'));};
 await screenshot('menu');
 await evaluate(`wechatTest.tap('start')`);await new Promise(r=>setTimeout(r,900));
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
 await evaluate(`wechatTest.tap('resume')`);
 await evaluate(`(()=>{const t=wechatTest,{UPGRADES}=t.load('/app/progression/config.js'),g=t.app.game;g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));for(let i=0;i<3;i++)g.show({type:'upgrade',choices:[]});t.app.ui.update();})()`);
 for(let i=0;i<3;i++){
  const result=await evaluate(`(()=>{const t=wechatTest,g=t.app.game,id=g.flow.dialogId;t.tap('upgrade-heal');return{pending:g.flow.pendingCount,dialog:g.dialog?.type,stale:g.claimReward(id,{type:'upgrade',id:'heal'})};})()`);
  assert.equal(result.pending,Math.max(0,1-i));assert.equal(result.dialog,i<2?'upgrade':undefined);assert.equal(result.stale,false);
 }
 await evaluate(`wechatTest.resize(393,760)`);await new Promise(r=>setTimeout(r,200));
 assert.equal(await evaluate(`wechatTest.root.Laya.stage.height`),760);
 await screenshot('battle');
 const death=await evaluate(`(()=>{const g=wechatTest.app.game;g.training=false;g.player.inv=0;g.hurt(999999);return{dialog:g.dialog?.type,revival:g.revival.provider.available};})()`);
 assert.equal(death.dialog,'result');assert.equal(death.revival,false);
 return {kind:'wechat-package-in-browser',initial,battle,dual,paused,death};
}

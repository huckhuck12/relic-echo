import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createStaticServer} from './serve.mjs';
import {checkWechatBrowser} from './wechat-browser-check.mjs';
import {checkRenderAudit} from './render-audit.mjs';

// Real bundled Laya + WebGL. Emulates touch/DPR, not an iOS GPU or Safari.
const directory=resolve('artifacts','mobile-check-'+Date.now());
await mkdir(directory,{recursive:true});
const server=createStaticServer();server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=spawn(process.env.PERF_BROWSER||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'google-chrome'),[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
 ...(process.env.CI?['--no-sandbox','--enable-unsafe-swiftshader']:[]),
 '--remote-debugging-port=0',`--user-data-dir=${directory}`,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;
try{
 let port;
 for(let i=0;i<100;i++){
  try{port=Number((await readFile(resolve(directory,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}
  catch{await new Promise(r=>setTimeout(r,200));}
 }
 assert.ok(port,'Browser debugging port available');
 const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(ws,'open');
 let serial=0;const pending=new Map(),errors=[];
 ws.onmessage=event=>{
  const value=JSON.parse(event.data);
  if(process.env.WECHAT_TRACE&&value.method==='Runtime.consoleAPICalled')console.log('Browser:',value.params.args.map(a=>a.value||a.description).join(' '));
  if(value.method==='Runtime.exceptionThrown')errors.push(value.params.exceptionDetails);
  const callback=pending.get(value.id);if(callback){pending.delete(value.id);callback(value);}
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`));},method==='Page.navigate'?30000:15000);
  pending.set(id,value=>{clearTimeout(timeout);value.error?reject(Error(JSON.stringify(value.error))):resolve(value.result);});
  ws.send(JSON.stringify({id,method,params}));
 });
 const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
 };
 await send('Runtime.enable');await send('Page.enable');
 const reports=[];
 const wechat=process.argv.includes('--wechat');
 const renderAudit=process.argv.includes('--render-audit');
 if(renderAudit)reports.push(await checkRenderAudit({send,evaluate,origin,directory}));
 if(wechat)reports.push(await checkWechatBrowser({send,evaluate,origin,directory}));
 for(const [width,height,dpr,touch] of wechat||renderAudit?[]:[[393,852,3,true],[852,393,3,true],[1280,720,1,false]]){
  await send('Emulation.setUserAgentOverride',{userAgent:touch?'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',platform:touch?'iPhone':'Win32'});
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:touch});
  await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:touch?5:1});
  const caseUrl=origin+'/?case='+width+'x'+height;
  await send('Page.navigate',{url:caseUrl});
  let ready=false;
  for(let i=0;i<80;i++){
   ready=await evaluate(`location.href===${JSON.stringify(caseUrl)} && document.readyState==='complete' && !!window.Laya?.stage?.getChildByName('game-ui')`);
   if(ready)break;
   if(errors.length)throw Error(JSON.stringify(errors));
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Production entry created complete UI');
  const initial=await evaluate(`(async()=>{
   const {game,ui}=await import('/dist/main.js');
   const find=(node,name)=>{if(node.name===name)return node;for(let i=0;i<node.numChildren;i++){const found=find(node.getChildAt(i),name);if(found)return found;}};
   const start=find(ui.root,'start'),stick=find(ui.root,'touch-stick'),dash=find(ui.root,'dash');
   if(!start||!stick||!dash)throw Error('Incomplete mobile UI: '+JSON.stringify({start:!!start,stick:!!stick,dash:!!dash}));
   const point=start.localToGlobal(new Laya.Point(start.width/2,start.height/2));
   return {dialog:game.dialog?.type,stickVisible:stick.visible,font:dash.getChildAt(0).font,point:{x:point.x,y:point.y},stage:[Laya.stage.width,Laya.stage.height]};
  })()`);
  assert.equal(initial.dialog,'start');assert.equal(initial.stickVisible,touch);
  assert.equal(initial.font,touch?'PingFang SC':'system-ui');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`${width}x${height}-menu.png`),Buffer.from(screenshot.data,'base64'));
  if(touch){
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:initial.point.x,y:initial.point.y}]});
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...initial.point,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...initial.point,button:'left',clickCount:1});
  }
  await new Promise(r=>setTimeout(r,1800));
  const battle=await evaluate(`import('/dist/main.js').then(({game})=>({mode:game.mode,time:game.time,hp:game.player.hp,enemies:game.snapshot().enemies,hero:game.scene.playerArtStatus,textureBytes:game.scene.textureBytes}))`);
  assert.equal(battle.mode,'battle');assert.ok(battle.time>.2,'Simulation advances after start');
  assert.equal(battle.hero.ready,true,'Painted hero source loads in the production browser entry');
  if(touch){
   const stick=await evaluate(`import('/dist/main.js').then(({ui,game})=>{
    const s=ui.hudView.stick.activation,p=s.localToGlobal(new Laya.Point(s.width*.6,s.height*.35));
    return {x:p.x,y:p.y,playerX:game.player.x,playerY:game.player.y};
   })`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x,y:stick.y}]});
   const origin=await evaluate(`import('/dist/main.js').then(({ui})=>({touch:ui.hudView.stick.stickTouch,origin:ui.hudView.stick.stickOrigin}))`);
   assert.notEqual(origin.touch,null,'Touch outside the resting base activates the left zone');
   assert.ok(Math.hypot(origin.origin.x-stick.x,origin.origin.y-stick.y)<2,'Floating origin follows actual press');
   await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x+44,y:stick.y}]});
   await new Promise(r=>setTimeout(r,250));
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const moved=await evaluate(`import('/dist/main.js').then(({game})=>({x:game.player.x,y:game.player.y}))`);
   assert.ok(Math.hypot(moved.x-stick.playerX,moved.y-stick.playerY)>1,'Real touch stick moves player');
  }
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`${width}x${height}-battle.png`),Buffer.from(shot.data,'base64'));
  // Exercise the actual card surface, including icon/title/description.
  if(touch)for(const [u,v]of [[.15,.25],[.5,.5],[.85,.75]]){
   const card=await evaluate(`import('/dist/main.js').then(({game,ui})=>{
    game.show({type:'upgrade',choices:[]});
    const id=game.dialog.choices[0];
    const find=n=>{if(n.name==='upgrade-'+id)return n;for(let i=0;i<n.numChildren;i++){const found=find(n.getChildAt(i));if(found)return found;}};
    const node=find(ui.root),p=node.localToGlobal(new Laya.Point(node.width*${u},node.height*${v}));
    return {id,before:game.levels[id]||0,x:p.x,y:p.y};
   })`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:card.x,y:card.y}]});
   await new Promise(r=>setTimeout(r,200));
   await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:card.x+3,y:card.y+3}]});
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const after=await evaluate(`import('/dist/main.js').then(({game})=>({level:game.levels[${JSON.stringify(card.id)}]||0,dialog:game.dialog?.type}))`);
   assert.equal(after.level,card.before+1,`Card ${card.id} responds at ${u},${v}`);
  }
  if(touch){
   await evaluate(`(async()=>{const {game,ui}=await import('/dist/main.js'),{UPGRADES}=await import('/dist/progression/config.js');
    game.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));game.player.hp=game.stats.hp;
    for(let i=0;i<3;i++)game.show({type:'upgrade',choices:[]});ui.update();})()`);
   const rewardId=await evaluate(`import('/dist/main.js').then(({game})=>game.flow.dialogId)`);
   await send('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:dpr,mobile:true});
   await new Promise(r=>setTimeout(r,300));
   assert.equal(await evaluate(`import('/dist/main.js').then(({game})=>game.flow.dialogId)`),rewardId,'Rotation preserves current reward identity');
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:true});
   await new Promise(r=>setTimeout(r,300));
   const rewardShot=await send('Page.captureScreenshot',{format:'png'});
   await writeFile(resolve(directory,`${width}x${height}-reward.png`),Buffer.from(rewardShot.data,'base64'));
   for(let remaining=3;remaining>0;remaining--){
    const card=await evaluate(`import('/dist/main.js').then(({game,ui})=>{
     const find=n=>{if(n.name==='upgrade-heal')return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i));if(r)return r;}};
     const n=find(ui.root),p=n.localToGlobal(new Laya.Point(n.width*.5,n.height*.5));return {x:p.x,y:p.y,pending:game.flow.pendingCount,dialogId:game.flow.dialogId};})`);
    assert.equal(card.pending,remaining-1);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:card.x,y:card.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const outcome=await evaluate(`import('/dist/main.js').then(({game})=>({dialog:game.dialog?.type,pending:game.flow.pendingCount,feedback:game.upgradeFeedback}))`);
    assert.equal(outcome.dialog,remaining>1?'upgrade':undefined);
    assert.equal(outcome.feedback,'生命已满，本次奖励已领取');
    const stale=await evaluate(`import('/dist/main.js').then(({game})=>({claimed:game.claimReward(${card.dialogId},{type:'upgrade',id:'heal'}),pending:game.flow.pendingCount}))`);
    assert.equal(stale.claimed,false,'Settlement rejects the consumed card ID');assert.equal(stale.pending,Math.max(0,remaining-2));
   }
  }
  await evaluate(`import('/dist/main.js').then(({game})=>game.toggleInventory())`);
  const inventoryShot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,`${width}x${height}-inventory.png`),Buffer.from(inventoryShot.data,'base64'));
  assert.equal(errors.length,0,JSON.stringify(errors));
  reports.push({width,height,dpr,touch,initial,battle});
 }
 if(process.argv.includes('--art-board')){
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/bench/art-board.html'});
  let ready=false;
  for(let i=0;i<100;i++){if(errors.length)throw Error(JSON.stringify(errors));ready=await evaluate('!!window.artBoardReady');if(ready)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Production art board renders');
  await new Promise(r=>setTimeout(r,150));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(directory,'art-board.png'),Buffer.from(shot.data,'base64'));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 await writeFile(resolve(directory,'report.json'),JSON.stringify(reports,null,2));
 console.log(JSON.stringify({passed:true,directory,reports},null,2));
}finally{ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

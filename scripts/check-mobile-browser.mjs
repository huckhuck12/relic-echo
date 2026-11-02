import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createStaticServer} from './serve.mjs';

// Real bundled Laya + WebGL. Emulates touch/DPR, not an iOS GPU or Safari.
const directory=resolve('artifacts','mobile-check-'+Date.now());
await mkdir(directory,{recursive:true});
const server=createStaticServer();server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=spawn(process.env.PERF_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
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
  if(value.method==='Runtime.exceptionThrown')errors.push(value.params.exceptionDetails);
  const callback=pending.get(value.id);if(callback){pending.delete(value.id);callback(value);}
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`));},15000);
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
 for(const [width,height,dpr,touch] of [[393,852,3,true],[852,393,3,true],[1280,720,1,false]]){
  await send('Emulation.setUserAgentOverride',{userAgent:touch?'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',platform:touch?'iPhone':'Win32'});
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:touch});
  await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:touch?5:1});
  await send('Page.navigate',{url:origin});
  let ready=false;
  for(let i=0;i<80;i++){
   ready=await evaluate(`document.readyState==='complete' && !!window.Laya?.stage?.getChildByName('game-ui')`);
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
  const battle=await evaluate(`import('/dist/main.js').then(({game})=>({mode:game.mode,time:game.time,hp:game.player.hp,enemies:game.snapshot().enemies}))`);
  assert.equal(battle.mode,'battle');assert.ok(battle.time>.2,'Simulation advances after start');
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
  assert.equal(errors.length,0,JSON.stringify(errors));
  reports.push({width,height,dpr,touch,initial,battle});
 }
 await writeFile(resolve(directory,'report.json'),JSON.stringify(reports,null,2));
 console.log(JSON.stringify({passed:true,directory,reports},null,2));
}finally{ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

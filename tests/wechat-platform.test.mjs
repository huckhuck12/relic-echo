import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatPlatform} from '../dist/platform/wechat-platform.js';
import {installPlatform} from '../dist/platform/runtime.js';
import {readSettings,writeSettings} from '../dist/platform/local-settings.js';
import {bindViewport} from '../dist/platform/viewport.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {ReviveService} from '../dist/platform/revive-provider.js';
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
function fixture(){
 const handlers=new Map(),storage=new Map();
 let info={windowWidth:393,windowHeight:852,screenHeight:896,screenTop:44,pixelRatio:3,platform:'ios',safeArea:{top:44,left:0,right:393,bottom:862}};
 const api={getWindowInfo:()=>info,getSystemInfoSync:()=>info,getMenuButtonBoundingClientRect:()=>({top:4,bottom:36,left:297,right:384}),getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value)};
 for(const event of ['Hide','Show','WindowResize']){
  handlers.set(event,new Set());api['on'+event]=fn=>handlers.get(event).add(fn);api['off'+event]=fn=>handlers.get(event).delete(fn);
 }
 return {api,storage,handlers,setInfo:next=>{info={...info,...next};},emit:event=>{for(const fn of handlers.get(event))fn();}};
}
test('WeChat uses logical pixels, screen-relative safe area and capsule space, with removable resize listeners',()=>{
 const f=fixture(),host=createWechatPlatform(f.api),restore=installPlatform(host);
 try{
  assert.deepEqual(host.viewport(),{width:393,height:852,pixelRatio:3});assert.equal(host.touch(),true);assert.equal(host.font(),'PingFang SC');
  assert.deepEqual(host.safeArea(),{top:44,left:0,right:0,bottom:34});
  const sizes=[],stage={size:(w,h)=>sizes.push([w,h])};const dispose=bindViewport(stage);
  assert.equal(stage.scaleMode,'fixedwidth');assert.equal(stage.useRetinalCanvas,true);
  f.emit('WindowResize');assert.equal(sizes.length,1);
  f.setInfo({windowHeight:760});f.emit('WindowResize');assert.deepEqual(sizes.at(-1),[393,760]);
  dispose();assert.equal(f.handlers.get('WindowResize').size,0);
  delete f.api.getWindowInfo;assert.equal(host.viewport().height,760);
 }finally{restore();}
});
test('WeChat storage never uses localStorage and corrupt or failed reads keep defaults',()=>{
 const f=fixture(),restore=installPlatform(createWechatPlatform(f.api));
 try{
  writeSettings({sound:false,shake:false,quality:'low',showPerformance:true});
  assert.deepEqual(readSettings(),{sound:false,shake:false,quality:'low',showPerformance:true});
  f.api.getStorageSync=()=>({wrong:'type'});assert.equal(readSettings().sound,true);
  f.api.getStorageSync=()=>'{';assert.equal(readSettings().quality,'standard');
  f.api.getStorageSync=()=>{throw Error('unavailable');};assert.equal(readSettings().sound,true);
  f.api.setStorageSync=()=>{throw Error('full');};assert.doesNotThrow(()=>writeSettings(readSettings()));
 }finally{restore();}
});
test('WeChat Game and UI start without DOM, suspend held input on hide, and require explicit resume',async()=>{
 setupLayaStub();const f=fixture(),restore=installPlatform(createWechatPlatform(f.api));
 const previous={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,AbortController:globalThis.AbortController};
 try{
  delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.AbortController;
  const g=new Game(),ui=new GameUI(g);assert.equal(ui.mobile,true);assert.equal(g.revival.provider.available,false);
  g.start('storm',true);g.setStick(1,0);ui.hudView.stick.stickTouch=7;
  f.emit('Hide');assert.equal(g.dialog.type,'pause');assert.deepEqual(g.input.stick,{x:0,y:0});assert.equal(ui.hudView.stick.stickTouch,null);
  const before=g.time;f.emit('Show');g.loop.frame();assert.equal(g.time,before);assert.equal(g.gate.paused,true);
  g.close();assert.equal(g.gate.paused,false);
  g.training=false;g.hurt(99999);assert.equal(g.dialog.type,'result');
  const service=new ReviveService({label:'pending',request:signal=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve('cancelled')))},5);
  assert.equal(await service.request(),'cancelled');assert.equal(service.busy,false);
 }finally{Object.assign(globalThis,previous);restore();}
});
test('WeChat audio tolerates missing or failing SDK methods and suspends on hide',()=>{
 const f=fixture(),host=createWechatPlatform(f.api);assert.doesNotThrow(()=>{const a=host.createAudio();a.enable();a.play(true,440);a.suspend();});
 let suspended=0;f.api.createWebAudioContext=()=>({resume:()=>Promise.resolve(),suspend:()=>{suspended++;return Promise.resolve();},createOscillator:()=>{throw Error('unsupported');}});
 const audio=host.createAudio();audio.enable();assert.doesNotThrow(()=>audio.play(true,440));audio.suspend();assert.equal(suspended,1);
});

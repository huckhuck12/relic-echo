import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatDiagnostics,DIAGNOSTICS_KEY} from '../dist/platform/wechat-diagnostics.js';
function fixture(){
 const callbacks={},storage=new Map();let tick,clipboard;
 const api={getSystemInfoSync:()=>({model:'iPhone Air',system:'iOS',SDKVersion:'3.17.6'}),getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),setClipboardData:options=>{clipboard=options.data;}};
 for(const name of ['Error','UnhandledRejection','MemoryWarning','Hide','Show'])api['on'+name]=fn=>callbacks[name]=fn;
 const timers={setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=undefined;}};
 return {api,storage,callbacks,timers,tick:()=>tick(),clipboard:()=>clipboard};
}
test('WeChat breadcrumbs survive relaunch, preserve errors through sampling and export without console',()=>{
 const f=fixture(),first=createWechatDiagnostics(f.api,'0.11.2',f.timers);let time=0;
 first.attach(()=>({time:++time,enemies:20,engineGpuBytes:1024}));
 f.callbacks.Error('native bridge exception');f.callbacks.UnhandledRejection({reason:Error('rejected')});f.callbacks.MemoryWarning({level:10});
 for(let i=0;i<100;i++)f.tick();
 assert.equal(first.report().current.events.filter(e=>e.type==='sample').length,12);
 assert.ok(first.report().current.events.some(e=>e.type==='error'&&e.detail==='native bridge exception'));
 const last=JSON.parse(f.storage.get(DIAGNOSTICS_KEY));first.stop();
 f.storage.set('relic-auto-play-report',JSON.stringify({round:3,results:[{win:false}]}));
 const next=createWechatDiagnostics(f.api,'0.11.2',f.timers);next.copy();
 const copied=JSON.parse(f.clipboard());assert.deepEqual(copied.previous,last.current);assert.equal(copied.current.events[0].type,'startup');
 assert.ok(copied.previous.events.some(e=>e.type==='memory-warning'));assert.equal(copied.previous.device.model,'iPhone Air');
 assert.equal(copied.autoPlay.round,3);
 f.storage.set('relic-auto-play-report','{');next.copy();assert.ok(JSON.parse(f.clipboard()).previous,'Corrupt test report never blocks crash diagnostics');
});
test('diagnostics remain bounded and never interrupt play when SDK, storage or snapshot fails',()=>{
 const f=fixture();f.storage.set(DIAGNOSTICS_KEY,'{');const d=createWechatDiagnostics(f.api,'test',f.timers);
 d.attach(()=>Object.fromEntries(Array.from({length:100},(_,i)=>['field'+i,'x'.repeat(10000)])));
 for(let i=0;i<50;i++){f.callbacks.Error('e'.repeat(10000));f.tick();}
 assert.ok(f.storage.get(DIAGNOSTICS_KEY).length<=32768);
 f.api.setStorageSync=()=>{throw Error('full');};f.api.setClipboardData=()=>{throw Error('denied');};
 d.attach(()=>{throw Error('snapshot failed');});assert.doesNotThrow(()=>{f.callbacks.Error(Error('failure'));f.tick();d.copy();d.stop();});
});

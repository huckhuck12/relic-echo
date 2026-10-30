import test from 'node:test';
import assert from 'node:assert/strict';
import {readSettings,writeSettings} from '../dist/platform/local-settings.js';

test('diagnostics start collapsed and an explicit saved choice survives settings reload',()=>{
 const previous=globalThis.localStorage;let stored=null;
 try{
  globalThis.localStorage={getItem:()=>stored,setItem:(key,value)=>{stored=value;}};
  assert.equal(readSettings().showPerformance,false);
  writeSettings({...readSettings(),showPerformance:true});assert.equal(readSettings().showPerformance,true);
  writeSettings({...readSettings(),showPerformance:false});assert.equal(readSettings().showPerformance,false);
  stored='{"sound":false}';assert.equal(readSettings().sound,false);assert.equal(readSettings().showPerformance,false);
 }finally{globalThis.localStorage=previous;}
});

test('corrupt or unavailable storage falls back to collapsed diagnostics without preventing play',()=>{
 const previous=globalThis.localStorage;
 try{
  for(const value of ['bad json','null']){
   globalThis.localStorage={getItem:()=>value};assert.equal(readSettings().showPerformance,false);
  }
  globalThis.localStorage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};
  assert.equal(readSettings().showPerformance,false);assert.doesNotThrow(()=>writeSettings(readSettings()));
 }finally{globalThis.localStorage=previous;}
});

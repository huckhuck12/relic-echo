import test from 'node:test';
import assert from 'node:assert/strict';
import {ToneVoices} from '../dist/platform/tone-voices.js';
import {createWechatPlatform} from '../dist/platform/wechat-platform.js';
function fixture(){
 const nodes=[],active=new Set();
 const parameter={setValueAtTime(){},exponentialRampToValueAtTime(){}};
 const make=oscillator=>{const n={onended:null,frequency:parameter,gain:parameter,connect(){active.add(n);},disconnect(){active.delete(n);},start(){},stop(){}};nodes.push(n);return n;};
 const context={state:'running',currentTime:0,destination:{},resume:()=>Promise.resolve(),suspend:()=>Promise.resolve(),createOscillator:()=>make(true),createGain:()=>make(false)};
 return {context,nodes,active};
}
test('native tones stay bounded across a long session even when ended callbacks are omitted',()=>{
 const f=fixture(),voices=new ToneVoices();
 for(let frame=0;frame<21600;frame++){
  f.context.currentTime=frame/60;
  for(let hit=0;hit<12;hit++)voices.play(f.context,440,.045,.025);
  assert.ok(f.active.size<=16,'At most eight oscillator/gain pairs stay connected');
 }
 voices.clear();assert.equal(f.active.size,0);
});
test('completed, suspended and partially failed tones release both native connections',()=>{
 const f=fixture(),voices=new ToneVoices();
 voices.play(f.context,440,.045,.025);const ended=f.nodes[0].onended;ended();ended();assert.equal(f.active.size,0);
 voices.play(f.context,440,.045,.025);voices.clear();assert.equal(f.active.size,0);
 f.context.createGain=()=>{throw Error('allocation failed');};assert.doesNotThrow(()=>voices.play(f.context,440,.045,.025));assert.equal(f.nodes.at(-1).onended,null);
 const native=fixture(),audio=createWechatPlatform({createWebAudioContext:()=>native.context}).createAudio();
 audio.enable();audio.play(true,440);assert.equal(native.active.size,2);audio.suspend();assert.equal(native.active.size,0);
});

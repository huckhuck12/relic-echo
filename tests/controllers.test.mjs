import test from 'node:test';
import assert from 'node:assert/strict';
import {GameLoop} from '../dist/game/game-loop.js';
import {PerformanceMonitor} from '../dist/game/performance-monitor.js';
import {FeedbackController} from '../dist/combat/feedback-controller.js';

test('extracted loop bounds catch-up and stops immediately when an update opens a modal',t=>{
 let now=0,active=true,paused=false,updates=0,renders=0,openModal=false;
 t.mock.method(performance,'now',()=>now);
 const loop=new GameLoop({active:()=>active,paused:()=>paused,measuring:()=>false,
  consumeHitStop:()=>0,monitor:new PerformanceMonitor(),changed(){},render(){renders++;},
  update(dt){assert.equal(dt,1/60);updates++;if(openModal){active=false;paused=true;}}
 });
 now=1000;loop.frame();assert.equal(updates,6);assert.equal(renders,1);
 openModal=true;now+=100;loop.frame();assert.equal(updates,7);assert.equal(loop.accumulator,0);
 // 选卡期间仍绘图但不模拟；恢复后只积累新的 10ms，不补算等待的五秒。
 now+=5000;loop.frame();assert.equal(updates,7);
 active=true;paused=false;openModal=false;now+=10;loop.frame();assert.equal(updates,7);
 now+=10;loop.frame();assert.equal(updates,8);assert.equal(renders,5);
});

test('feedback uses current run array and budget, while hit stop cooldown prevents repeated freezing',()=>{
 let effects=[],budget=1;
 const feedback=new FeedbackController({effects:()=>effects,budget:()=>budget});
 feedback.ring(0,0,'#fff');feedback.ring(1,1,'#fff');assert.equal(effects.length,1);
 const previous=effects;effects=[];feedback.ring(2,2,'#fff');
 assert.equal(previous.length,1);assert.equal(effects[0].x,2);
 budget=0;feedback.line(0,0,1,1,'#fff');assert.equal(effects.length,1);
 feedback.freeze(.05);feedback.freeze(.5);assert.equal(feedback.hitStop,.05);
 assert.equal(feedback.consumeHitStop(.02),.02);
 assert.ok(Math.abs(feedback.consumeHitStop(.1)-.03)<1e-12);assert.equal(feedback.hitStop,0);
});

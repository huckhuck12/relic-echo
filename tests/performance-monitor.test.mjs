import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceMonitor} from '../dist/game/performance-monitor.js';

test('performance uses real frame intervals, nearest-rank P95 and independent mean CPU costs',()=>{
 const m=new PerformanceMonitor();m.record(0,0,0);
 let now=0;for(let i=0;i<19;i++){now+=10;m.record(now,2,3);}now+=1000;m.record(now,4,5);
 const s=m.snapshot();assert.equal(s.samples,20);assert.equal(s.frameMs,59.5);
 assert.equal(s.fps,1000/59.5);assert.equal(s.p95Ms,10);assert.equal(s.maxMs,1000);
 assert.equal(s.updateMs,2.1);assert.equal(s.renderMs,3.1);
});

test('performance ring evicts old frames and pause/resume excludes waiting time',()=>{
 const m=new PerformanceMonitor();m.record(0,0,0);m.record(1000,10,10);
 for(let i=1;i<=300;i++)m.record(1000+i*10,1,2);
 assert.equal(m.snapshot().samples,300);assert.equal(m.snapshot().maxMs,10);
 const before=m.snapshot();m.suspend();assert.deepEqual(m.snapshot(),before);
 m.record(100000,0,0);assert.equal(m.snapshot().samples,0);
 m.record(100020,1,2);assert.equal(m.snapshot().frameMs,20);
 m.reset();assert.deepEqual(m.snapshot(),new PerformanceMonitor().snapshot());
});

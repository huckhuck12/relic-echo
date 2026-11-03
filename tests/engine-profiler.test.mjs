import test from 'node:test';
import assert from 'node:assert/strict';
import {profileEngine} from '../dist/game/engine-profiler.js';
import {PerformanceMonitor} from '../dist/game/performance-monitor.js';
import {DrawCallProbe} from '../dist/game/draw-call-probe.js';
test('engine profiler subtracts same-frame game work, counts draw calls, and bypasses disabled monitoring',()=>{
 let now=0,enabled=true;const m=new PerformanceMonitor(),stats={renderBatches:0};m.record(0,0,0);
 const stage={render(){assert.equal(this,stage);now+=10;stats.renderBatches+=20;m.record(now,4,2,4);return 17;}};
 profileEngine(stage,m,()=>enabled,()=>now,stats);assert.equal(stage.render(),17);
 let s=m.snapshot();assert.equal(s.engineMs,4);assert.equal(s.drawCalls,20);assert.equal(s.simulationSteps,4);assert.equal(s.stepMs,1);
 enabled=false;stage.render();s=m.snapshot();assert.equal(s.engineSamples,1);assert.equal(s.samples,2);
});

test('paused draw-call probe observes whole stage flushes without recording live performance frames',()=>{
 const m=new PerformanceMonitor(),p=new DrawCallProbe(()=>{}),stats={renderBatches:0};
 const stage={render(){stats.renderBatches+=p.excluded==='shots'?30:50;}};
 profileEngine(stage,m,()=>false,()=>0,stats,p);p.start({});for(let i=0;i<60;i++)stage.render();
 assert.equal(p.report.baseline,50);assert.equal(p.report.rows.find(r=>r.group==='shots').saved,20);
 assert.equal(m.snapshot().samples,0);assert.equal(p.active,false);
});
test('engine profiler ignores paused/non-sampled frames, preserves thrown errors and does not label elapsed time as GPU',()=>{
 const m=new PerformanceMonitor();let now=0;const stage={render(){now+=30;throw Error('native render');}};
 profileEngine(stage,m,()=>true,()=>now,{});assert.throws(()=>stage.render(),/native render/);assert.equal(m.snapshot().engineSamples,0);
 m.record(1,0,0);const sequence=m.sequence;m.record(76,14,4,5);m.finishStage(sequence,30,100);const s=m.snapshot();
 assert.equal(s.frameMs,75);assert.equal(s.simulationSteps,5);assert.equal(s.maxSimulationSteps,5);assert.equal(s.stepMs,2.8);assert.equal(s.engineMs,12);
 m.finishStage(sequence+1,99,999);assert.equal(m.snapshot().drawCalls,100,'No stale stage attaches to another frame');
});

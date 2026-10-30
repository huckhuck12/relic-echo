import test from 'node:test';
import assert from 'node:assert/strict';
import {RunFlow} from '../dist/game/run-flow.js';

function fixture(){
  const events=[];
  let rank=0;
  const flow=new RunFlow({
    beforeOpen:()=>events.push('input-cleared'),
    prepare:request=>request.type==='upgrade'?{type:'upgrade',choices:[`rank-${rank}`]}:request,
    changed:()=>events.push({type:flow.dialog?.type,paused:flow.gate.paused,pending:flow.pendingCount}),
  });
  flow.begin();
  return {flow,events,setRank:value=>rank=value};
}

test('flow promotes rewards FIFO, recomputes upgrade candidates on display and notifies only final state',()=>{
  const {flow,events,setRank}=fixture();
  flow.open({type:'drop',item:{id:'heavy',quality:1}});
  flow.open({type:'upgrade',choices:['stale']});
  flow.open({type:'drop',item:{id:'cape',quality:2}});
  assert.equal(flow.pendingCount,2);assert.equal(events.filter(e=>typeof e==='object').length,1);
  setRank(5);events.length=0;flow.close();
  assert.deepEqual(flow.dialog,{type:'upgrade',choices:['rank-5']});
  assert.deepEqual(events,['input-cleared',{type:'upgrade',paused:true,pending:1}]);
  flow.close();assert.equal(flow.dialog.item.id,'cape');flow.close();
  assert.equal(flow.dialog,null);assert.equal(flow.gate.paused,false);
});

test('closing a choice releases focus but preserves unrelated pause reasons',()=>{
  const {flow}=fixture();flow.open({type:'inventory'});
  flow.gate.add('focus');flow.gate.add('orientation');flow.close();
  assert.equal(flow.dialog,null);assert.equal(flow.gate.paused,true);
  flow.gate.remove('orientation');assert.equal(flow.gate.paused,false);
});

test('finish preempts pending rewards and begin clears the complete previous flow without premature notifications',()=>{
  const {flow,events}=fixture();flow.open({type:'upgrade',choices:[]});flow.open({type:'drop',item:{id:'visor',quality:0}});
  flow.gate.add('focus');flow.finish(false,'dead');
  assert.equal(flow.mode,'result');assert.deepEqual(flow.dialog,{type:'result',win:false,reason:'dead'});
  assert.equal(flow.pendingCount,0);assert.equal(flow.gate.paused,true);
  const count=events.length;flow.begin();assert.equal(events.length,count);
  assert.equal(flow.mode,'battle');assert.equal(flow.dialog,null);assert.equal(flow.gate.paused,false);
});

test('title transition clears queued rewards and keeps the title modal paused',()=>{
  const {flow}=fixture();flow.open({type:'inventory'});flow.open({type:'upgrade',choices:[]});flow.title();
  assert.equal(flow.mode,'ready');assert.deepEqual(flow.dialog,{type:'start'});
  assert.equal(flow.pendingCount,0);assert.equal(flow.gate.paused,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {RunFlow} from '../dist/game/run-flow.js';

test('dialog identity survives content refresh but differs for identical queued rewards and new runs',()=>{
 const {flow}=fixture();flow.open({type:'upgrade',choices:[]});
 const first=flow.dialogId,revision=flow.revision;
 flow.refresh();assert.equal(flow.dialogId,first);assert.ok(flow.revision>revision);
 flow.open({type:'upgrade',choices:[]});assert.equal(flow.dialogId,first);
 flow.close();const second=flow.dialogId;assert.ok(second>first);
 flow.begin();assert.equal(flow.dialogId,0);flow.open({type:'upgrade',choices:[]});assert.ok(flow.dialogId>second);
});

function fixture(onChanged=()=>{}){
  const events=[];
  let rank=0;
  const flow=new RunFlow({
    beforeOpen:()=>events.push('input-cleared'),
    prepare:request=>request.type==='upgrade'?{type:'upgrade',choices:[`rank-${rank}`]}:request,
    changed:()=>{events.push({type:flow.dialog?.type,paused:flow.gate.paused,pending:flow.pendingCount});onChanged(flow);},
  });
  flow.begin();
  return {flow,events,setRank:value=>rank=value};
}

test('reward settlement rejects reentry during commit and final notification, releasing its guard on failure',()=>{
 let checking=false,notifications=0;
 const {flow}=fixture(f=>{if(checking){notifications++;assert.equal(f.settleReward(f.dialogId,()=>{throw Error('reentered notification');}),false);}});flow.open({type:'upgrade',choices:[]});flow.open({type:'upgrade',choices:[]});
 const id=flow.dialogId,revision=flow.revision;
 assert.equal(flow.settleReward(id,()=>false),false);assert.equal(flow.revision,revision);
 assert.throws(()=>flow.settleReward(id,()=>{throw Error('failure');}),/failure/);assert.equal(flow.dialogId,id);
 let commits=0;
 checking=true;
 assert.equal(flow.settleReward(id,()=>{commits++;assert.equal(flow.settleReward(id,()=>{commits++;return true;}),false);return true;}),true);
 assert.equal(commits,1);assert.equal(notifications,1);assert.equal(flow.pendingCount,0);assert.notEqual(flow.dialogId,id);
});

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

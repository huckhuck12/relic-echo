import {Game} from '../dist/game/game.js';
import {GameUI} from '../dist/ui/ui.js';
import {nextXP} from '../dist/shared/model.js';
import {scenario,summary} from './scenario.js';

// 仅供开发验收；保留正式 GameLoop.frame 和 Laya 舞台循环，不以手动 update 代替实际运行。
const $=id=>document.getElementById(id),errors=[],runs=[];
window.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
try {
 const game=new Game();new GameUI(game);
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.width>100);
 const gl=canvas?.getContext('webgl')||canvas?.getContext('experimental-webgl');
 if(!gl)throw Error('未获取 WebGL 上下文，不能进行真实渲染验收');
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 const renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'浏览器未公开';
 let intervals=[],stages=[],previous=0,lastStatus=0,run,busy=false;
 const active=()=>!document.hidden&&!game.gate.paused&&game.mode==='battle';
 const push=(list,value)=>{list.push(value);if(list.length>300)list.shift();};
 // 舞台 CPU 时间包含引擎提交，不是 GPU 执行时间；rAF 间隔才用于估算呈现节奏。
 const original=Laya.stage._loop;
 Laya.stage._loop=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(active())push(stages,performance.now()-start);}};
 function snapshot(){
  return {...run,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
   actualEnemies:game.enemies.length,visibleEnemies:game.enemies.filter(e=>e.node.visible).length,
   renderer,quality:game.quality,paused:game.gate.paused,dialog:game.dialog?.type||null,
   samples:intervals.length,frameIntervalMs:intervals.length?summary(intervals):null,
   estimatedFPS:intervals.length?Math.round(1000/summary(intervals).mean):null,
   engineStageCpuMs:stages.length?summary(stages):null,
   manualChecks:Object.fromEntries([...document.querySelectorAll('[data-check]')].map(e=>[e.dataset.check,e.checked?'人工确认':'待人工验收']))};
 }
 function resetSamples(){intervals=[];stages=[];previous=0;}
 function restart(){
  if(busy)return;
  if(run)runs.push(snapshot());
  scenario(game,Number($('count').value),$('weapon').value);game.onChange();
  run={weapon:$('weapon').value,requestedEnemies:Number($('count').value),started:new Date().toISOString(),cardCheck:'未执行'};
  document.querySelectorAll('[data-check]').forEach(e=>e.checked=false);resetSamples();
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const require=(condition,message)=>{if(!condition)throw Error(message);};
 // 通过正式 Laya 按钮事件选择卡片，覆盖 UI → 奖励队列 → 暂停门解除这一整条链。
 const find=(node,name)=>{if(node.name===name)return node;for(let i=0;i<node.numChildren;i++){const found=find(node.getChildAt(i),name);if(found)return found;}};
 $('cards').onclick=async()=>{
  if(busy)return;busy=true;$('restart').disabled=true;
  try{
   require(!document.hidden&&!game.gate.paused,'请回到前台并先关闭现有弹窗');
   game.addXP(nextXP(game.level)-game.xp);
   require(game.dialog?.type==='upgrade','未出现升级选卡');
   const before=game.time;await delay(350);
   require(!document.hidden,'检查中切到后台，请重试');
   require(game.time===before,'选卡期间模拟仍在推进');
   let choices=0;
   while(game.dialog?.type==='upgrade'&&choices++<20){
    const button=find(Laya.stage,`upgrade-${game.dialog.choices[0]}`);
    require(button,'找不到真实选卡按钮');button.event(Laya.Event.CLICK);await delay(20);
   }
   require(!game.dialog&&!game.gate.paused,'选卡后仍有弹窗或暂停原因');
   const resumed=game.time;await delay(500);
   require(!document.hidden,'检查中切到后台，请重试');
   require(game.time>resumed,'选卡后战斗未继续');
   run.cardCheck='通过：选卡暂停，真实按钮选择后恢复';
  }catch(error){run.cardCheck=`失败或未完成：${error.message}`;}
  finally{busy=false;$('restart').disabled=false;resetSamples();}
 };
 $('restart').onclick=restart;
 $('save').onclick=()=>{
  const report={date:new Date().toISOString(),userAgent:navigator.userAgent,
   measurement:'前台未暂停时最近 300 帧；rAF 间隔与舞台 CPU 耗时；非 GPU 时间。勾选项为人工确认，未勾选不代表通过。',
   errors,runs:[...runs,snapshot()]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='battle-acceptance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 // 切换窗口/标签页时丢弃跨窗口间隔，避免把后台节流和布局变化混入当前样本。
 window.addEventListener('resize',()=>{resetSamples();document.querySelectorAll('[data-check]').forEach(e=>e.checked=false);});
 document.addEventListener('visibilitychange',resetSamples);
 restart();
 function monitor(now){
  if(active()){if(previous)push(intervals,now-previous);previous=now;}else previous=0;
  if(now-lastStatus>500){lastStatus=now;$('status').textContent=JSON.stringify({...snapshot(),errors},null,2);}
  requestAnimationFrame(monitor);
 }
 requestAnimationFrame(monitor);
}catch(error){errors.push(String(error.stack||error));$('status').textContent=errors.join('\n');}

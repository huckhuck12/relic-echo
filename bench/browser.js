import {Game} from '../dist/game/game.js';
import {GameUI} from '../dist/ui/ui.js';
import {scenario,seeded,summary,enableBuffs,enableEvolutions} from './scenario.js';
const output=document.getElementById('result');
window.benchmarkProgress='initializing';
const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
try {
  const g=new Game();new GameUI(g);g.sound=false;Laya.timer.clear(g.loop,g.loop.frame);
  const canvas=[...document.querySelectorAll('canvas')].find(c=>c.width>100),gl=canvas?.getContext('webgl')||canvas?.getContext('experimental-webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
  if(!gl)throw new Error('WebGL 未启动，无法进行真实渲染测试');
  const environment={userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};
  let stageSamples=[];const stageLoop=Laya.stage._loop;Laya.stage._loop=function(...args){const start=performance.now();const value=stageLoop.apply(this,args);stageSamples.push(performance.now()-start);return value;};
  const rows=[],quick=new URLSearchParams(location.search).has('quick'),warm=quick?20:60,samples=quick?60:180;
  for(const count of [240,600,1000])for(const weapon of ['storm','flame','blade']){
    window.benchmarkProgress=`${count} enemies / ${weapon}`;output.textContent=`真实 LayaAir WebGL 压测：${window.benchmarkProgress}\n${JSON.stringify(rows.at(-1)||{})}`;
    Math.random=seeded(20261028);scenario(g,count,weapon);if(new URLSearchParams(location.search).has('buffs'))enableBuffs(g);if(new URLSearchParams(location.search).has('evolutions'))enableEvolutions(g,weapon);g.onChange();
    const update=[],commands=[],intervals=[];let previous=await raf();stageSamples=[];
    for(let i=0;i<warm+samples;i++){
      const frame=await raf();if(i>=warm)intervals.push(frame-previous);previous=frame;
      const a=performance.now();g.update(1/60);const b=performance.now();g.render();if(i%8===0)g.onChange();const c=performance.now();
      if(i>=warm){update.push(b-a);commands.push(c-b);}else stageSamples=[];
    }
    if(!stageSamples.length)throw new Error('Laya 舞台没有实际渲染，不能报告帧率');
    rows.push({count,weapon,samples,updateMs:summary(update),renderCommandsMs:summary(commands),engineStageMs:summary(stageSamples),frameIntervalMs:summary(intervals),fps:Math.round(100000/summary(intervals).mean)/100,framesOver25ms:intervals.filter(x=>x>25).length,visibleEnemies:g.enemies.filter(e=>e.node.visible).length});
  }
  const result={evolutions:new URLSearchParams(location.search).has('evolutions'),buffs:new URLSearchParams(location.search).has('buffs'),kind:'Real LayaAir WebGL + HUD in headless Edge; rAF timing, not GPU timestamps',date:new Date().toISOString(),environment,rows};window.benchmarkResult=result;window.benchmarkProgress='complete';g.gate.add('benchmark');output.textContent=JSON.stringify(result,null,2);output.style.maxHeight='180px';const link=document.createElement('a');link.textContent='下载性能结果 JSON';link.href=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));link.download='performance-browser.json';link.style.cssText='position:fixed;right:15px;top:15px;z-index:99;background:#fff;padding:12px';document.body.append(link);
}catch(error){window.benchmarkError=error.stack||String(error);output.textContent=window.benchmarkError;}

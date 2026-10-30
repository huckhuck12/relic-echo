import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bindViewport} from '../dist/platform/viewport.js';
import {screenLayout} from '../dist/ui/layout.js';

// 旧节点替身未模拟 DPR，无法发现 full 模式的物理像素舞台。
// 直接执行仓库内引擎的尺寸计算方法，仅替换画布/矩阵依赖，不把该测试视为 GPU 验收。
const engine=await readFile(new URL('../vendor/laya.core.js',import.meta.url),'utf8');
const marker='__proto.setScreenSize=';
const start=engine.indexOf(marker);
assert.ok(start>=0);
const end=engine.indexOf('\n\t/**@private */',start);
assert.ok(end>start);
const resizeSource=engine.slice(start+marker.length,end).trim();

class Matrix {
 constructor(){this.identity();}
 identity(){this.a=this.d=1;this.b=this.c=this.tx=this.ty=0;return this;}
 scale(x,y){this.a*=x;this.d*=y;return this;}
 translate(x,y){this.tx+=x;this.ty+=y;return this;}
 toString(){return [this.a,this.b,this.c,this.d,this.tx,this.ty].join(',');}
}

test('real Laya sizing keeps CSS layout and touch targets independent of DPR through rotation',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 try{
  for(const dpr of [1,2,3]){
   const events=new Map(),visualEvents=new Map();
   const viewport={innerWidth:393,innerHeight:676,
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
    visualViewport:{addEventListener:(name,fn)=>visualEvents.set(name,fn),removeEventListener:name=>visualEvents.delete(name)}
   };
   let meta='';
   globalThis.window=viewport;
   globalThis.document={querySelector:()=>({setAttribute:(name,value)=>{assert.equal(name,'content');meta=value;}})};
   const canvas={source:{style:{}},size(w,h){this.width=w;this.height=h;}};
   const setScreenSize=vm.runInNewContext('('+resizeSource+')',{
    Browser:{pixelRatio:dpr},Render:{_mainCanvas:canvas},RunDriver:{changeWebGLSize(){}}
   });
   const stage={designWidth:393,designHeight:676,_screenMode:'none',_scaleMode:'full',
    get scaleMode(){return this._scaleMode;},set scaleMode(value){this._scaleMode=value;},
    get width(){return this._width;},get height(){return this._height;},
    scaleX:1,scaleY:1,offset:{x:0,y:0},_canvasTransform:new Matrix(),transform:new Matrix(),
    _formatData:value=>value,event(){},setScreenSize,
    size(w,h){this.designWidth=w;this.designHeight=h;this.setScreenSize(viewport.innerWidth*dpr,viewport.innerHeight*dpr);}
   };
   stage.setScreenSize(393*dpr,676*dpr);
   assert.equal(stage.width,393*dpr,'reproduce old physical-pixel stage');
   if(dpr===3)assert.equal(screenLayout(stage.width,stage.height,false).sidebar,true);
   const dispose=bindViewport(stage);
   assert.match(meta,/viewport-fit=cover/);
   for(const [w,h,event]of [[393,676,null],[844,390,'orientationchange'],[393,600,'resize']]){
    viewport.innerWidth=w;viewport.innerHeight=h;if(event)events.get(event)();
    assert.equal(stage.width,w);assert.equal(stage.height,h);
    assert.equal(canvas.width,w*dpr);assert.equal(canvas.height,h*dpr);
    const layout=screenLayout(stage.width,stage.height,true);
    assert.equal(layout.compact,true);assert.equal(layout.sidebar,false);assert.equal(layout.scale,1);
    // Stage 与 canvas 变换组合后，44 个布局单位确实是 44 CSS px。
    assert.ok(Math.abs(44*stage.transform.a*stage._canvasTransform.a-44)<1e-8);
   }
   dispose();assert.equal(events.size,0);assert.equal(visualEvents.size,0);
  }
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('WeChat engine bridge provides native 2D bindings without browser globals',async()=>{
 const source=await readFile(new URL('../wechat/engine-environment.js',import.meta.url),'utf8');
 const sandbox=vm.createContext({module:{exports:{}}});
 vm.runInContext('"use strict";\n'+source,sandbox);
 const canvases=[],handlers=new Map(),nativeStyles=new WeakMap(),frameRateRequests=[];
 class NativeContext {createImageData(width,height){return{width,height,data:new Uint8ClampedArray(width*height*4)};}}
 class NativeCanvas {
  constructor(){nativeStyles.set(this,{width:'393px',height:'852px',transform:''});}
  get style(){return nativeStyles.get(this);}
  set style(value){nativeStyles.get(this).cssText=String(value);}
  get parentNode(){return null;}
  getContext(){return new NativeContext();}
 }
 const wx={getSystemInfoSync:()=>({windowWidth:393,windowHeight:852,pixelRatio:3}),
  setPreferredFramesPerSecond(fps){assert.equal(this,wx);frameRateRequests.push(fps);},
  createCanvas:()=>{const canvas=new NativeCanvas();canvases.push(canvas);return canvas;}};
 for(const name of ['WindowResize','Hide','Show','TouchStart','TouchMove','TouchEnd','TouchCancel'])wx['on'+name]=fn=>handlers.set(name,fn);
 const root=sandbox.module.exports(wx,{});
 assert.deepEqual(frameRateRequests,[60],'Request 60 FPS before engine startup');
 handlers.get('Show')();
 assert.deepEqual(frameRateRequests,[60,60],'Restore target after returning to foreground');
 assert.equal(vm.runInContext('typeof CanvasRenderingContext2D',sandbox),'undefined');
 assert.equal(vm.runInContext('typeof performance',sandbox),'undefined');
 assert.equal(root.canvas,canvases[0],'First canvas remains the visible surface');
 root.canvas.style.transform='matrix(0.333333,0,0,0.333333,0,0)';
 assert.equal(nativeStyles.get(root.canvas).transform,'','Engine CSS must not shrink the SDK screen canvas');
 assert.equal(nativeStyles.get(root.canvas).cssText,undefined,'Native CSS setter is never invoked');
 const offscreen=root.document.createElement('canvas');offscreen.style.transform='scale(0.5)';
 assert.equal(nativeStyles.get(offscreen).transform,'');
 assert.equal(root.CanvasRenderingContext2D.prototype,NativeContext.prototype);
 const image=new root.ImageData(2,3);assert.equal(image.data.length,24);
 assert.ok(Number.isFinite(root.performance.now()));
 let cancelled;root.canvas.addEventListener('touchcancel',event=>{cancelled=event.changedTouches[0];});
 handlers.get('TouchCancel')({changedTouches:[{identifier:4,x:10,y:20}]});
 assert.equal(cancelled.clientX,10);assert.equal(cancelled.clientY,20);
 assert.equal(root.window,root);
 const container=root.document.createElement('div'),other=root.document.createElement('div');
 assert.equal(container.appendChild(root.canvas),root.canvas);
 assert.equal(container.contains(root.canvas),true);
 assert.equal(root.canvas.parentNode,null,'Native getter is untouched');
 other.appendChild(root.canvas);
 assert.equal(container.contains(root.canvas),false);
 assert.equal(other.contains(root.canvas),true);
 assert.equal(other.removeChild(root.canvas),root.canvas);
 assert.equal(other.contains(root.canvas),false);
 const child=root.document.createElement('span');
 container.appendChild(child);assert.equal(child.parentNode,container);
 other.appendChild(child);assert.equal(child.parentNode,other);assert.equal(container.contains(child),false);
 other.removeChild(child);assert.equal(child.parentNode,null);
 const unsupported={...wx};delete unsupported.setPreferredFramesPerSecond;
 assert.doesNotThrow(()=>sandbox.module.exports(unsupported,{}));
 const rejected={...wx,setPreferredFramesPerSecond(){throw Error('unsupported');}};
 assert.doesNotThrow(()=>sandbox.module.exports(rejected,{}));
 assert.doesNotThrow(()=>handlers.get('Show')());
});

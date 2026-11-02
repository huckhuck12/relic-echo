import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('WeChat engine bridge provides native 2D bindings without browser globals',async()=>{
 const source=await readFile(new URL('../wechat/engine-environment.js',import.meta.url),'utf8');
 const sandbox=vm.createContext({module:{exports:{}}});
 vm.runInContext(source,sandbox);
 const canvases=[],handlers=new Map();
 class NativeContext {createImageData(width,height){return{width,height,data:new Uint8ClampedArray(width*height*4)};}}
 const wx={getSystemInfoSync:()=>({windowWidth:393,windowHeight:852,pixelRatio:3}),
  createCanvas:()=>{const canvas={getContext:()=>new NativeContext()};canvases.push(canvas);return canvas;}};
 for(const name of ['WindowResize','Hide','Show','TouchStart','TouchMove','TouchEnd','TouchCancel'])wx['on'+name]=fn=>handlers.set(name,fn);
 const root=sandbox.module.exports(wx,{});
 assert.equal(vm.runInContext('typeof CanvasRenderingContext2D',sandbox),'undefined');
 assert.equal(vm.runInContext('typeof performance',sandbox),'undefined');
 assert.equal(root.canvas,canvases[0],'First canvas remains the visible surface');
 assert.equal(root.CanvasRenderingContext2D.prototype,NativeContext.prototype);
 const image=new root.ImageData(2,3);assert.equal(image.data.length,24);
 assert.ok(Number.isFinite(root.performance.now()));
 let cancelled;root.canvas.addEventListener('touchcancel',event=>{cancelled=event.changedTouches[0];});
 handlers.get('TouchCancel')({changedTouches:[{identifier:4,x:10,y:20}]});
 assert.equal(cancelled.clientX,10);assert.equal(cancelled.clientY,20);
 assert.equal(root.window,root);
});

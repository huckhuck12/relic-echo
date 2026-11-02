// Minimal environment bridge for the pinned Laya 2.0.2 engine.
// Not a general browser/DOM implementation. Game code uses platform interfaces.
module.exports = function installEngineEnvironment(wx, timers) {
  // Devtools exposes a real Window with read-only window/document/navigator.
  // Keep the legacy engine's browser facade private; never patch that host.
  const root = {};
  function prefer60FPS() {
    // Ask the native scheduler directly; another JS timer cannot bypass its cap.
    try { wx.setPreferredFramesPerSecond?.(60); } catch { /* Older SDKs keep their supported rate. */ }
  }
  prefer60FPS();
  const syntheticNodes = new WeakSet();
  const parents = new WeakMap();
  function events(target) {
    const listeners = new Map();
    target.addEventListener = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    };
    target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    target.dispatchEvent = event => {
      if (typeof event === 'string') event = {type:event};
      for (const fn of [...(listeners.get(event.type) || [])]) fn.call(target, event);
    };
    return target;
  }
  function element(tagName) {
    const node = events({tagName, style:{}, children:[], parentNode:null, value:'', textContent:''});
    syntheticNodes.add(node);
    node.appendChild = child => {
      parents.get(child)?.removeChild(child);
      node.children.push(child);parents.set(child,node);
      // Native Canvas/Image nodes own their read-only DOM relationships.
      if(syntheticNodes.has(child))child.parentNode=node;
      return child;
    };
    node.removeChild = child => {
      node.children=node.children.filter(n=>n!==child);
      if(parents.get(child)===node){
        parents.delete(child);
        if(syntheticNodes.has(child))child.parentNode=null;
      }
      return child;
    };
    node.setAttribute = (name,value) => {node[name]=value;};
    node.getAttribute = name => node[name];
    node.contains = child => node.children.includes(child);
    node.focus = node.blur = () => {};
    return node;
  }
  function canvasStyle(target) {
    // The SDK owns on-screen sizing. On devtools Canvas.style is a native DOM
    // accessor: assigning {} changes cssText rather than replacing that style.
    // Keep Laya's browser-only CSS transforms on a separate plain object.
    Object.defineProperty(target,'style',{value:{},writable:true,configurable:true});
    return target;
  }
  const info = wx.getSystemInfoSync();
  const canvas = wx.createCanvas(); // First canvas is the visible game surface.
  // MiniAdpter exposes a constructor on its window facade, but the old core
  // also uses bare constructor names. Both must share the native prototype.
  const context2d = wx.createCanvas().getContext('2d');
  function CanvasContext() {}
  CanvasContext.prototype = Object.getPrototypeOf(context2d);
  canvasStyle(canvas);
  events(canvas);
  canvas.getBoundingClientRect = () => ({left:0,top:0,right:root.innerWidth,bottom:root.innerHeight,width:root.innerWidth,height:root.innerHeight});
  const doc = events({hidden:false,visibilityState:'visible'});
  doc.body = element('body');doc.head = element('head');doc.documentElement = element('html');
  const meta = element('meta');meta.name='viewport';doc.head.appendChild(meta);
  doc.createElement = type => {
    if (type === 'canvas') return canvasStyle(wx.createCanvas());
    if (type === 'img' || type === 'image') return wx.createImage();
    const node=element(type);
    if (type === 'audio') {node.canPlayType=()=>'';node.play=()=>Promise.resolve();node.pause=()=>{};}
    return node;
  };
  doc.getElementsByTagName = name => name==='head'?[doc.head]:name==='body'?[doc.body]:name==='meta'?[meta]:[];
  doc.getElementById = id => id===canvas.id?canvas:null;
  const ios = /ios/i.test(info.platform || '');
  Object.assign(root, timers, {
    window:root,self:root,top:root,parent:root,document:doc,canvas,wx,
    navigator:{userAgent:ios?'MiniGame Mobile MicroMessenger (iPhone; CPU iPhone OS 16_0 like Mac OS X)':'MiniGame Mobile MicroMessenger Android',platform:info.platform || 'wechat',maxTouchPoints:5,geolocation:{}},
    location:{href:'game.js',pathname:'game.js',search:'',protocol:'game:'},
    devicePixelRatio:info.pixelRatio || 1,screen:{width:info.screenWidth,height:info.screenHeight},orientation:0,
    localStorage:{getItem:key=>wx.getStorageSync(key)||null,setItem:(key,value)=>wx.setStorageSync(key,value),removeItem:key=>wx.removeStorageSync(key),clear:()=>wx.clearStorageSync()},
    Image:function(){return wx.createImage();},
    CanvasRenderingContext2D:CanvasContext,
    ImageData:function(width,height){return context2d.createImageData(width,height);},
    performance:{now:()=>Date.now()},
    focus(){},scrollTo(){},
  });
  events(root);
  function resize() {
    const w=wx.getWindowInfo?.() || wx.getSystemInfoSync();
    root.innerWidth=w.windowWidth;root.innerHeight=w.windowHeight;root.devicePixelRatio=w.pixelRatio || 1;
    doc.body.clientWidth=doc.documentElement.clientWidth=w.windowWidth;
    doc.body.clientHeight=doc.documentElement.clientHeight=w.windowHeight;
    root.dispatchEvent({type:'resize'});
  }
  resize();wx.onWindowResize(resize);
  wx.onHide(()=>{doc.hidden=true;doc.visibilityState='hidden';root.dispatchEvent({type:'blur'});doc.dispatchEvent({type:'visibilitychange'});});
  wx.onShow(()=>{prefer60FPS();resize();doc.hidden=false;doc.visibilityState='visible';root.dispatchEvent({type:'focus'});doc.dispatchEvent({type:'visibilitychange'});});
  function touch(type,event) {
    const points = list => (list || []).map(t=>({...t,clientX:t.clientX ?? t.x,clientY:t.clientY ?? t.y,pageX:t.pageX ?? t.clientX ?? t.x,pageY:t.pageY ?? t.clientY ?? t.y}));
    const native={...event,type,target:canvas,touches:points(event.touches),changedTouches:points(event.changedTouches),preventDefault(){},stopPropagation(){}};
    canvas.dispatchEvent(native);doc.dispatchEvent(native);
  }
  wx.onTouchStart(e=>touch('touchstart',e));wx.onTouchMove(e=>touch('touchmove',e));
  wx.onTouchEnd(e=>touch('touchend',e));wx.onTouchCancel(e=>touch('touchcancel',e));
  return root;
};

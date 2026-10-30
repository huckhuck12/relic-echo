export function setupLayaStub(){
// Logic and command-generation double; never a WebGL/FPS measurement.
class Graphics {clear(){}drawPoly(){}drawCircle(){}drawRect(){}drawLine(){}drawLines(){}}
class Sprite {
  constructor(){this.graphics=new Graphics();this.children=[];this.handlers={};this.x=0;this.y=0;this.alpha=1;this.width=1280;this.height=720;this.scaleX=1;this.scaleY=1;}
  addChild(node){node.removeSelf();node.parent=this;this.children.push(node);return node;}
  removeSelf(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;return this;}
  pos(x,y){this.x=x;this.y=y;return this;}
  size(w,h){this.width=w;this.height=h;return this;}
  scale(x,y){this.scaleX=x;this.scaleY=y;return this;}
  pivot(x,y){this.pivotX=x;this.pivotY=y;return this;}
  on(type,caller,listener){this.handlers[type]=(this.handlers[type]||[]).filter(h=>h.caller!==caller||h.listener!==listener);this.handlers[type].push({caller,listener});return this;}
  emit(type,event={}){for(const h of [...(this.handlers[type]||[])])h.listener.call(h.caller,{stopPropagation(){},...event});}
  destroyChildren(){for(const child of [...this.children])child.destroy();}
  destroy(){this.destroyChildren();this.handlers={};this.removeSelf();}
  localToGlobal(point){let x=point.x,y=point.y;for(let p=this;p;p=p.parent){x=(x-(p.pivotX||0))*p.scaleX+p.x;y=(y-(p.pivotY||0))*p.scaleY+p.y;}return {x,y};}
}
class Text extends Sprite {}
globalThis.window={innerWidth:1280,innerHeight:720,addEventListener(){}};
globalThis.document={hidden:false,addEventListener(){}};
globalThis.localStorage={getItem(){return null;},setItem(){}};
globalThis.Laya={Sprite,Text,Point:class{constructor(x,y){this.x=x;this.y=y;}},Event:{MOUSE_DOWN:'mousedown',MOUSE_MOVE:'mousemove',MOUSE_UP:'mouseup',MOUSE_OUT:'mouseout',CLICK:'click',RESIZE:'resize',KEY_DOWN:'keydown',KEY_UP:'keyup'},WebGL:{},stage:new Sprite(),init(){this.stage=new Sprite();},timer:{frameLoop(){}}};

}

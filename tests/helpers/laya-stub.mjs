export function setupLayaStub(){
// Logic and command-generation double; never a WebGL/FPS measurement.
class Graphics {clear(){}drawPoly(){}drawCircle(){}drawRect(){}drawLine(){}drawLines(){}}
class Sprite {
  constructor(){this.graphics=new Graphics();this._children=[];this.handlers={};this.x=0;this.y=0;this.alpha=1;this.width=1280;this.height=720;this.scaleX=1;this.scaleY=1;this.name='';this.destroyed=false;this.parent=null;this.pivotX=0;this.pivotY=0;this.rotation=0;this.zOrder=0;this.visible=true;this.mouseEnabled=true;this.mouseThrough=false;}
  /** @template {import('../../src/platform/laya.js').LayaSprite} T @param {T} node @returns {T} */
  addChild(node){node.removeSelf();node.parent=this;this._children.push(node);return node;}
  get numChildren(){return this._children.length;}
  getChildByName(name){return this._children.find(node=>node.name===name)||null;}
  getChildAt(index){return this._children[index]||null;}
  removeSelf(){if(this.parent)this.parent._children=this.parent._children.filter(n=>n!==this);this.parent=null;return this;}
  pos(x,y){this.x=x;this.y=y;return this;}
  size(w,h){this.width=w;this.height=h;return this;}
  scale(x,y){this.scaleX=x;this.scaleY=y;return this;}
  pivot(x,y){this.pivotX=x;this.pivotY=y;return this;}
  on(type,caller,listener){this.handlers[type]=(this.handlers[type]||[]).filter(h=>h.caller!==caller||h.listener!==listener);this.handlers[type].push({caller,listener});return this;}
  emit(type,event={}){for(const h of [...(this.handlers[type]||[])])h.listener.call(h.caller,{stopPropagation(){},...event});}
  destroyChildren(){for(const child of [...this._children])child.destroy();}
  destroy(){this.destroyed=true;this.destroyChildren();this.handlers={};this.removeSelf();}
  localToGlobal(point){let x=point.x,y=point.y;for(let p=this;p;p=p.parent){x=(x-(p.pivotX||0))*p.scaleX+p.x;y=(y-(p.pivotY||0))*p.scaleY+p.y;}return {x,y};}
}
class Text extends Sprite {constructor(){super();this.text='';this.font='';this.fontSize=12;this.color='';this.wordWrap=false;this.leading=0;this.align='left';this.bold=false;this.stroke=0;this.strokeColor='';this.overflow='';}}
class Stage extends Sprite {constructor(){super();this.bgColor='';this.scaleMode='';this.useRetinalCanvas=false;this.mouseX=0;this.mouseY=0;}}
globalThis.window={innerWidth:1280,innerHeight:720,addEventListener(){}};
globalThis.document={hidden:false,addEventListener(){}};
globalThis.localStorage={getItem(){return null;},setItem(){}};
const runtime={Sprite,Text,Point:class{constructor(x,y){this.x=x;this.y=y;}},Event:{MOUSE_DOWN:'mousedown',MOUSE_MOVE:'mousemove',MOUSE_UP:'mouseup',MOUSE_OUT:'mouseout',CLICK:'click',RESIZE:'resize',KEY_DOWN:'keydown',KEY_UP:'keyup'},WebGL:{},stage:new Stage(),init(){this.stage=new Stage();},timer:{frameLoop(){}}};
globalThis.Laya=runtime;
return runtime;

}

export const childrenOf=node=>Array.from({length:node.numChildren},(_,i)=>node.getChildAt(i));

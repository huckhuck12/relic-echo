import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub,childrenOf} from './helpers/laya-stub.mjs';
import {platform,installPlatform} from '../dist/platform/runtime.js';
setupLayaStub();
const {UIControls}=await import('../dist/ui/ui-controls.js');
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
const find=(node,name)=>node.name===name?node:childrenOf(node).map(child=>find(child,name)).find(Boolean);

test('modal entrance accepts clicks immediately, keeps touch targets at least 44px and settles exactly',()=>{
 setupLayaStub();let now=0;const restore=installPlatform({...platform(),now:()=>now,reducedMotion:()=>false});
 try{
  const controls=new UIControls(()=>{}),root=new Laya.Sprite();Laya.stage.addChild(root);
  const shade=controls.panel(root,0,0,600,500),panel=controls.panel(root,100,80,300,220);let clicks=0;
  const button=controls.button(panel,'选择',20,140,100,44,()=>clicks++);
  controls.effects.enter(panel,shade);assert.equal(controls.effects.entering,true);assert.ok(panel.alpha>0&&panel.alpha<1);assert.ok(panel.scaleY*button.height>=44);
  button.emit('click');assert.equal(clicks,1);const alpha=panel.alpha;
  now=90;controls.effects.tick();assert.ok(panel.alpha>alpha&&panel.alpha<1);assert.ok(panel.scaleY*button.height>=44);
  now=181;controls.effects.tick();assert.equal(controls.effects.entering,false);assert.deepEqual([panel.x,panel.y,panel.scaleX,panel.scaleY,panel.alpha,shade.alpha],[100,80,1,1,1,.9]);
 }finally{restore();}
});

test('modal motion cancels on rebuild or background and respects reduced motion without retaining old nodes',()=>{
 setupLayaStub();const original=platform(),restore=installPlatform({...original,reducedMotion:()=>false});
 try{
  const controls=new UIControls(()=>{}),root=new Laya.Sprite();Laya.stage.addChild(root);
  const shade=controls.panel(root,0,0,600,500),panel=controls.panel(root,100,80,300,220);
  controls.effects.enter(panel,shade);document.hidden=true;controls.effects.tick();document.hidden=false;assert.equal(controls.effects.entering,false);assert.equal(panel.alpha,1);
  controls.effects.enter(panel,shade);controls.clear(root);assert.equal(controls.effects.entering,false);assert.equal(panel.destroyed,true);
  const undo=installPlatform({...original,reducedMotion:()=>true});
  try{const reduced=new UIControls(()=>{}),s=reduced.panel(root,0,0,600,500),p=reduced.panel(root,100,80,300,220);s.alpha=.9;reduced.effects.enter(p,s);assert.equal(reduced.effects.entering,false);assert.deepEqual([p.x,p.y,p.scaleX,p.alpha,s.alpha],[100,80,1,1,.9]);}finally{undo();}
 }finally{document.hidden=false;restore();}
});

test('settings refresh does not replay entrance and queued healing rewards remain clickable during transitions',async()=>{
 setupLayaStub();const g=new Game(),ui=new GameUI(g);
 find(ui.root,'autoplay-start').emit('click');assert.equal(ui.controls.effects.entering,true);
 find(ui.root,'autoplay-build').emit('click');assert.equal(ui.controls.effects.entering,false);
 find(ui.root,'autoplay-back').emit('click');find(ui.root,'start').emit('click');
 g.levels=Object.fromEntries((await import('../dist/progression/config.js')).UPGRADES.map(u=>[u.id,u.max]));
 g.player.hp=1;for(let i=0;i<3;i++)g.show({type:'upgrade',choices:[]});
 for(let i=0;i<3;i++){assert.equal(ui.controls.effects.entering,true);find(ui.root,'upgrade-heal').emit('click');}
 assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);assert.equal(ui.controls.effects.entering,false);
});

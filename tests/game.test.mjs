import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {GameUI}=await import('../dist/ui/ui.js');
// Isolate weapon and input checks from the starter Buff's random procs.
const create=()=>{const g=new Game();g.start('storm',true);for(let i=0;i<2;i++)for(const part of ['trigger','action','element'])g.buffs.install(i,part,null);return g;};
const tick=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++){if(g.gate.paused||g.mode!=='battle')break;g.update(1/60);g.render();}};
const find=(root,name)=>root.name===name?root:root.children.map(child=>find(child,name)).find(Boolean);

test('performance sampling freezes in dialogs/background and resets on restart/resize/toggle',()=>{
 const g=create();g.showPerformance=true;g.sound=false;g.performanceMonitor.record(0,0,0);g.performanceMonitor.record(16,1,2);
 assert.equal(g.performanceSnapshot().samples,1);g.togglePause();g.loop.frame();assert.equal(g.performanceSnapshot().samples,1);
 g.close();g.loop.frame();assert.equal(g.performanceSnapshot().samples,0);g.loop.frame();assert.equal(g.performanceSnapshot().samples,1);
 document.hidden=true;g.loop.frame();document.hidden=false;g.loop.frame();assert.equal(g.performanceSnapshot().samples,0);
 g.performanceMonitor.record(performance.now()+20,1,2);g.togglePerformance();g.loop.frame();assert.equal(g.performanceSnapshot().samples,0);
 assert.equal(g.showPerformance,false);g.start('storm',true);assert.equal(g.showPerformance,false);
 g.togglePerformance();g.loop.frame();g.loop.frame();assert.equal(g.performanceSnapshot().samples,1);
 Laya.stage.emit('resize');assert.equal(g.performanceSnapshot().samples,0);
 const p=g.performanceSnapshot();assert.equal(p.enemies,g.enemies.length);assert.equal(p.shots,g.shots.length);assert.equal(p.drops,g.drops.length);
});

test('compact performance strip fits viewports and opens paused details without covering touch actions',()=>{
 for(const [w,h]of [[320,568],[390,844],[844,390],[568,320],[1280,720],[1920,1080]]){
  const g=create();g.showPerformance=true;const ui=new GameUI(g);ui.mobile=w<1000;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const panel=find(ui.root,'performance-panel'),r=bounds(panel);
  assert.ok(panel.visible);assert.equal(panel.mouseEnabled,true);assert.ok(panel.width<=104&&panel.height===44);
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=w+.01&&r.y+r.h<=h+.01);
  if(ui.mobile){for(const name of ['dash','buffs','touch-stick']){const other=find(ui.root,name);if(other){const b=bounds(other);assert.ok(r.x+r.w<=b.x||b.x+b.w<=r.x||r.y+r.h<=b.y||b.y+b.h<=r.y);}}}
  panel.emit('click');assert.equal(g.dialog.type,'performance');assert.equal(g.gate.paused,true);assert.equal(panel.visible,false);
  assertControls(find(ui.root,'dialog-panel'),w,h,ui.mobile);find(ui.root,'performance-resume').emit('click');
  g.togglePause();assertControls(find(ui.root,'dialog-panel'),w,h,ui.mobile);
  find(ui.root,'performance-toggle').emit('click');assert.equal(g.showPerformance,false);assert.equal(panel.visible,false);assert.equal(g.dialog.type,'pause');
  find(ui.root,'performance-toggle').emit('click');assert.equal(g.showPerformance,true);find(ui.root,'resume').emit('click');
  assert.equal(g.gate.paused,false);assert.equal(panel.visible,true);
 }
});

test('first elite choice is once per run, freezes simulation and preserves later physical loot',()=>{
 const g=create();g.eliteIndex=4;
 const killElite=()=>{g.spawnEnemy(3);g.hit(g.enemies.at(-1),999999,{triggerBuffs:false});};
 killElite();assert.equal(g.dialog.type,'fragment');assert.equal(g.dialog.choices.length,3);
 assert.equal(g.drops.filter(d=>d.fragment).length,0);assert.ok(g.drops.some(d=>d.item));
 const before=g.time,recipes=JSON.stringify(g.buffs.recipes);tick(g,1);assert.equal(g.time,before);
 g.chooseFragment('invalid');assert.equal(g.dialog.type,'fragment');
 const id=g.dialog.choices[0];g.chooseFragment(id);assert.ok(g.buffs.owned.has(id));assert.equal(g.dialog,null);
 assert.equal(JSON.stringify(g.buffs.recipes),recipes);g.chooseFragment(id);assert.equal(g.dialog,null);
 killElite();assert.equal(g.dialog,null);assert.equal(g.drops.filter(d=>d.fragment).length,1);
 g.start('storm',true);killElite();assert.equal(g.dialog.type,'fragment');
});

test('fragment reward refreshes on activation and chains upgrade/equipment without resuming early',()=>{
 const g=create();g.addXP(10);g.spawnEnemy(3);g.hit(g.enemies.at(-1),999999,{triggerBuffs:false});
 g.show({type:'drop',item:{id:'heavy',quality:1}});
 for(const f of FRAGMENTS_FOR_REWARD())g.buffs.grant(f);
 // 排队后只剩冰霜未拥有；真正显示时必须重新生成候选。
 g.chooseUpgrade(g.dialog.choices[0]);assert.equal(g.dialog.type,'fragment');assert.deepEqual(g.dialog.choices,['ice']);
 g.chooseFragment('ice');assert.equal(g.dialog.type,'drop');assert.ok(g.gate.paused);
 g.takeDrop(true);assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);
 g.show({type:'fragment',choices:[]});g.chooseFragment(g.dialog.choices[0]);assert.equal(g.xp,5);
 g.show({type:'fragment',choices:[]});g.finish(false,'test');g.chooseFragment('field');assert.equal(g.dialog.type,'result');
 g.start('storm',true);assert.equal(g.flow.pendingCount,0);assert.equal(g.dialog,null);
});
function FRAGMENTS_FOR_REWARD(){return ['hit','dash','kill','hurt','bolt','blast','field','orbit','fire','lightning','force'];}

test('ground and elite duplicate fragments use the same upgrade settlement and preserve reward flow',()=>{
 const g=new Game();g.start('storm',true);g.sound=false;
 const r=g.buffs.recipes[0];g.drops.push({x:0,y:0,xp:0,fragment:'fire',collecting:false,node:g.acquire()});
 g.updateDrops(.01);assert.equal(g.buffs.levelOf(r),2);assert.equal(g.xp,0);assert.equal(g.drops.length,0);
 for(const id of FRAGMENTS_FOR_REWARD())g.buffs.grant(id);g.buffs.grant('ice');
 g.show({type:'fragment',choices:[]});assert.ok(g.dialog.choices.includes('fire'));
 g.chooseFragment('fire');assert.equal(g.buffs.levelOf(r),3);assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);
 g.buffs.receiveFragment('fire');g.buffs.receiveFragment('fire');assert.equal(g.buffs.levelOf(r),5);
 g.xp=5;g.drops.push({x:0,y:0,xp:0,fragment:'fire',collecting:false,node:g.acquire()});g.updateDrops(.01);
 assert.equal(g.dialog.type,'upgrade');assert.equal(g.buffs.levelOf(r),5);
 g.chooseUpgrade(g.dialog.choices[0]);assert.equal(g.gate.paused,false);
 g.start('storm',true);assert.equal(g.buffs.levelOf(g.buffs.recipes[0]),1);
});

test('Buff panel shows upgraded level/benefit on phone and refreshes without resetting cooldown',()=>{
 const g=new Game(),ui=new GameUI(g);g.start('storm',true);g.buffs.receiveFragment('fire');g.buffs.cooldowns[0]=1.5;g.toggleBuffs();
 for(const [w,h]of [[320,568],[390,844],[568,320],[844,390]]){
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  assert.match(find(ui.root,'buff-description').text,/伤害 \+20%/);
  assert.ok(find(ui.root,'buff-slot-0').children.some(c=>c.text?.includes('Lv.2')));assertControls(find(ui.root,'dialog-panel'),w,h,true);
 }
 assert.equal(g.buffs.cooldowns[0],1.5);g.buffs.receiveFragment('fire');g.onChange();assert.match(find(ui.root,'buff-description').text,/伤害 \+40%/);
});

test('fragment cards remain clickable and inside desktop/phone dialogs across rotation',()=>{
 for(const [w,h]of [[320,568],[390,844],[844,390],[568,320],[1280,720],[1920,1080]]){
  const g=create(),ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  g.show({type:'fragment',choices:[]});const choices=[...g.dialog.choices];
  assertControls(find(ui.root,'dialog-panel'),w,h,true);
  const button=find(ui.root,`fragment-${choices[0]}`);assert.ok(button);
  button.emit('click');assert.ok(g.buffs.owned.has(choices[0]));assert.equal(g.dialog,null);
 }
});

test('enemy mage bullets launch visually at the animated staff without shifting ground collision',()=>{
 const g=create();g.attackTimer=999;g.spawnTimer=999;const e=g.enemies[0];
 Object.assign(e,{kind:1,x:300,y:0,wind:.001,dx:-1,dy:0,dead:false});
 g.grid.rebuild(g.enemies);g.updateEnemies(.01);const shot=g.shots.find(s=>s.hostile&&s.color==='#c99bef');
 assert.ok(shot);assert.equal(e.action,'cast');assert.equal(shot.x,300);assert.equal(shot.y,0);assert.equal(shot.launchLife,6);
 g.render();assert.ok(Math.abs(shot.node.y)<150);assert.ok(Number.isFinite(shot.launchX));assert.ok(shot.launchY<0);
 g.toggleInventory();const before=e.actionTime;g.loop.last=performance.now()-50;g.loop.frame();assert.equal(e.actionTime,before);
});

test('cast animation freezes through inventory, resumes on simulation steps and clears on restart',()=>{
 const g=create();g.player.castWeapon='storm';g.player.castTime=.28;g.attackTimer=999;
 g.toggleInventory();g.loop.last=performance.now()-60;g.loop.frame();assert.equal(g.player.castTime,.28);
 g.close();g.update(.1);assert.ok(Math.abs(g.player.castTime-.18)<1e-8);
 g.toggleInventory();g.testGear('weapon');assert.equal(g.player.castTime,0);assert.equal(g.player.castWeapon,undefined);
 g.start('flame',true);assert.equal(g.player.castTime||0,0);assert.equal(g.player.castWeapon,undefined);
});

test('mouse click moves toward an unprojected world target then stops',()=>{
  const g=create();g.render();const screen={x:g.scene.world.x+100,y:g.scene.world.y};Laya.stage.mouseX=screen.x;Laya.stage.mouseY=screen.y;
  g.input.mouseDown({target:Laya.stage});g.input.mouseHeld=false;const destination={...g.input.mouseTarget};tick(g,2);
  assert.ok(Math.hypot(g.player.x-destination.x,g.player.y-destination.y)<=5);
  const position={x:g.player.x,y:g.player.y};tick(g,1);assert.deepEqual({x:g.player.x,y:g.player.y},position);
});

test('touch movement owns one stick finger and press-to-dash does not interrupt or repeat on click',()=>{
 const g=create(),ui=new GameUI(g);ui.mobile=true;
 Laya.stage.width=393;Laya.stage.height=676;Laya.stage.emit('resize');
 const center=ui.hudView.stick.joystick.localToGlobal({x:56,y:56});
 Laya.stage.mouseX=center.x;Laya.stage.mouseY=center.y;
 ui.hudView.stick.joystick.emit('mousedown',{touchId:11});
 assert.equal(ui.hudView.stick.stickTouch,11);assert.deepEqual(g.input.stick,{x:0,y:0});
 Laya.stage.mouseX=center.x+4;Laya.stage.emit('mousemove',{touchId:11});
 assert.deepEqual(g.input.stick,{x:0,y:0});
 Laya.stage.mouseX=center.x+30;Laya.stage.emit('mousemove',{touchId:11});
 const held={...g.input.stick};assert.ok(held.x>.8);
 // 第二指落在摇杆和抬起都不能抢夺/结束第一指。
 ui.hudView.stick.joystick.emit('mousedown',{touchId:22});assert.equal(ui.hudView.stick.stickTouch,11);
 Laya.stage.mouseX=center.x-30;Laya.stage.emit('mousemove',{touchId:22});
 Laya.stage.emit('mouseup',{touchId:22});assert.deepEqual(g.input.stick,held);
 const dash=find(ui.root,'dash');dash.emit('mousedown',{touchId:22});
 assert.ok(g.player.dashTime>0);assert.deepEqual(g.input.stick,held);
 // 用清零冷却模拟下一次可释放，检查同一次抬手 CLICK 没有再次提交。
 g.player.dashTime=0;g.player.dash=0;dash.emit('click',{touchId:22});assert.equal(g.player.dashTime,0);
 Laya.stage.emit('mouseup',{touchId:11});assert.deepEqual(g.input.stick,{x:0,y:0});
 assert.equal(ui.hudView.stick.stickTouch,null);
});

test('touching the battlefield never creates a persistent desktop mouse destination',()=>{
 const g=create();g.render();Laya.stage.mouseX=300;Laya.stage.mouseY=300;
 for(const type of ['touchstart','touchmove']){
  g.input.mouseDown({target:Laya.stage,nativeEvent:{type,changedTouches:[{identifier:1}]}});
  assert.equal(g.input.mouseTarget,null);assert.equal(g.input.mouseHeld,false);
 }
 g.input.mouseDown({target:Laya.stage,nativeEvent:{type:'mousedown'}});
 assert.ok(g.input.mouseTarget);
});
test('mouse hold follows pointer, UI clicks are ignored, keyboard and pause cancel targets',()=>{
  const g=create();g.render();Laya.stage.mouseX=g.scene.world.x+100;Laya.stage.mouseY=g.scene.world.y;g.input.mouseDown({target:Laya.stage});tick(g,.5);const first={...g.player};tick(g,.5);assert.ok(g.player.x>first.x);
  g.cancelMouseMovement();g.input.mouseDown({target:{name:'button',parent:{name:'game-ui'}}});assert.equal(g.input.mouseTarget,null);
  g.input.mouseDown({target:Laya.stage});g.input.keys.add('KeyW');g.input.movement();assert.equal(g.input.mouseTarget,null);
  g.input.keys.clear();g.input.mouseDown({target:Laya.stage});g.toggleInventory();assert.equal(g.input.mouseHeld,false);assert.equal(g.input.mouseTarget,null);g.close();assert.equal(g.input.mouseTarget,null);
});
test('mouse destinations stay within world boundaries and outside obstacles',()=>{
  const g=create();g.render();Laya.stage.mouseX=100000;Laya.stage.mouseY=100000;g.input.mouseDown({target:Laya.stage});assert.ok(Math.abs(g.input.mouseTarget.x)<=1120&&Math.abs(g.input.mouseTarget.y)<=1120);
  const pillar=g.pillars[0];Laya.stage.mouseX=g.scene.world.x+(pillar.x-pillar.y)*.7071;Laya.stage.mouseY=g.scene.world.y+(pillar.x+pillar.y)*.3536;g.input.mouseDown({target:Laya.stage});assert.ok(Math.hypot(g.input.mouseTarget.x-pillar.x,g.input.mouseTarget.y-pillar.y)>=55);
});

test('native Laya UI supports selecting a weapon, starting, inventory and visible gear cycling',()=>{
  const g=new Game(),ui=new GameUI(g);assert.equal(ui.root.name,'game-ui');assert.equal(ui.root.parent,Laya.stage);
  find(ui.root,'select-flame').emit('click');find(ui.root,'training').emit('click');assert.equal(g.snapshot().weapon,'flame');assert.equal(g.dialog.type,'inventory');
  find(ui.root,'cycle-head').emit('click');assert.equal(g.loadout.head.id,'visor');find(ui.root,'turn').emit('click');assert.equal(g.previewBack,true);find(ui.root,'quality').emit('click');assert.equal(g.loadout.head.quality,1);find(ui.root,'close-inventory').emit('click');assert.equal(g.dialog,null);
});
test('native UI supports upgrade, equipment comparison, settings, boss and results',()=>{
  const g=create(),ui=new GameUI(g);g.addXP(10);find(ui.root,`upgrade-${g.dialog.choices[0]}`).emit('click');assert.equal(g.dialog,null);
  g.show({type:'drop',item:{id:'heavy',quality:1}});find(ui.root,'equip').emit('click');assert.equal(g.loadout.armor.id,'heavy');assert.equal(g.dialog,null);
  find(ui.root,'pause').emit('click');assert.equal(g.dialog.type,'pause');find(ui.root,'sound').emit('click');assert.equal(g.sound,false);find(ui.root,'resume').emit('click');assert.equal(g.dialog,null);
  g.toggleInventory();find(ui.root,'boss').emit('click');assert.ok(g.snapshot().boss);g.finish(true,'test result');assert.ok(find(ui.root,'restart'));find(ui.root,'title').emit('click');assert.equal(g.dialog.type,'start');assert.ok(find(ui.root,'start'));
});
test('native UI resize preserves display tree, pause state and usable viewport fit',()=>{
  const g=create(),ui=new GameUI(g);g.toggleInventory();Laya.stage.width=844;Laya.stage.height=390;Laya.stage.emit('resize');
  assert.equal(ui.root.width*ui.root.scaleX,844);assert.equal(ui.root.height*ui.root.scaleY,390);assert.equal(ui.root.scaleX,1);assert.equal(g.dialog.type,'inventory');assert.ok(find(ui.root,'close-inventory'));assert.ok(g.gate.paused);
});

test('phone portrait HUD uses a full-width status strip and readable touch controls',()=>{
 for(const [w,h]of [[320,568],[393,676],[430,780]]){
  const g=create(),ui=new GameUI(g);ui.mobile=true;
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const player=find(ui.root,'player-hud'),margin=ui.layout.margin;
  assert.equal(ui.layout.compact,true);assert.equal(ui.layout.sidebar,false);
  assert.equal(player.width,w-2*margin);assert.equal(player.height,64);
  assert.equal(find(ui.hudView.root,'gear-weapon'),undefined);assert.ok(ui.hudView.labels.hp.fontSize>=13);
  assertControls(ui.hudView.root,w,h,true);
  const stick=bounds(ui.hudView.stick.joystick);assert.equal(stick.w,112);assert.equal(stick.h,112);
  const toast=bounds(ui.toastNode),buff=bounds(find(ui.root,'buffs'));
  assert.ok(toast.y+toast.h<=buff.y-11.99);
  assert.equal(ui.hudView.labels.dash.text,'点击冲刺');
 }
});

test('mobile HUD separates primary controls, keeps center clear and reuses stick stage bindings',()=>{
 const g=create(),ui=new GameUI(g);ui.mobile=true;
 const bindings=()=>Object.fromEntries(['mousemove','mouseup','mouseout'].map(key=>[key,Laya.stage.handlers[key].length]));
 const initialBindings=bindings();
 for(const [w,h]of [[320,568],[393,676],[844,390],[568,320],[1024,768],[393,676]]){
  Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
  const dash=bounds(find(ui.root,'dash')),buff=bounds(find(ui.root,'buffs')),stick=bounds(ui.hudView.stick.joystick);
  assert.equal(dash.h,72);assert.equal(dash.w,96);assert.ok(dash.y-buff.y-buff.h>=20);
  assert.ok(stick.x+stick.w<dash.x);assert.ok(stick.y+stick.h<=h-16);
  assertControls(ui.hudView.root,w,h,true);
  assert.deepEqual(bindings(),initialBindings,'rotation must not add stage touch listeners');
  assert.equal(ui.hudView.root.children.filter(node=>node.name==='touch-stick').length,1);
  assert.ok(bounds(ui.hudView.labels.combo).y<h*.4,'combo stays above the battle center');
  const dashNode=find(ui.root,'dash');ui.update();ui.update();assert.equal(find(ui.root,'dash'),dashNode);
 }
 assert.equal(g.showPerformance,false);assert.equal(ui.performancePanel.visible,false);
 g.togglePause();find(ui.root,'performance-toggle').emit('click');assert.equal(g.showPerformance,true);
 find(ui.root,'resume').emit('click');assert.equal(ui.performancePanel.visible,true);
});

test('mobile safe area moves HUD and dialogs inside screen cutouts and keeps stick input aligned',()=>{
 const oldCreate=document.createElement,oldBody=document.body,oldStyle=globalThis.getComputedStyle;
 let probes=0;
 try{
  document.body={appendChild(){probes++;}};
  document.createElement=()=>({style:{cssText:''},remove(){probes--;}});
  globalThis.getComputedStyle=()=>({paddingTop:'44px',paddingRight:'0px',paddingBottom:'34px',paddingLeft:'0px'});
  const g=create(),ui=new GameUI(g);ui.mobile=true;
  Laya.stage.width=393;Laya.stage.height=760;Laya.stage.emit('resize');
  assert.equal(probes,0);assert.equal(ui.root.y,44);assert.equal(ui.root.height,682);
  const dash=bounds(find(ui.root,'dash'));assert.ok(dash.y+dash.h<760-34);
  const center=ui.hudView.stick.joystick.localToGlobal({x:56,y:56});
  Laya.stage.mouseX=center.x+30;Laya.stage.mouseY=center.y;
  ui.hudView.stick.joystick.emit('mousedown',{touchId:3});assert.ok(g.input.stick.x>.8);assert.equal(g.input.stick.y,0);
  g.toggleInventory();assert.deepEqual(g.input.stick,{x:0,y:0});assert.equal(ui.hudView.stick.stickTouch,null);
  const panel=bounds(find(ui.root,'dialog-panel'));assert.ok(panel.y>=44);assert.ok(panel.y+panel.h<=760-34);
 }finally{
  document.createElement=oldCreate;document.body=oldBody;
  if(oldStyle===undefined)delete globalThis.getComputedStyle;else globalThis.getComputedStyle=oldStyle;
 }
});

const buttons=(root)=>root.visible===false?[]:[...(root.handlers.click?.length?[root]:[]),...root.children.flatMap(buttons)];
// Model Laya's front-to-back hit traversal, including disabled parent subtrees.
function pickUI(root,x,y){
  if(root.visible===false||root.mouseEnabled===false)return null;
  for(const child of [...root.children].reverse()){const hit=pickUI(child,x,y);if(hit)return hit;}
  const r=bounds(root);
  return root.mouseThrough!==true&&x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h?root:null;
}
function bounds(node){const a=node.localToGlobal({x:0,y:0}),b=node.localToGlobal({x:node.width,y:node.height});return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};}
function assertControls(root,w,h,touch=false){
  const list=buttons(root).map(node=>({name:node.name,...bounds(node)}));
  for(const r of list){assert.ok(r.x>=-.01&&r.y>=-.01&&r.x+r.w<=w+.01&&r.y+r.h<=h+.01,`${w}x${h}: ${r.name} lies outside screen: ${JSON.stringify(r)}`);if(touch)assert.ok(r.h>=43.99&&r.w>=43.99,`${r.name} is too small for touch`);}
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);assert.ok(dx<=.01||dy<=.01,`${w}x${h}: ${a.name} overlaps ${b.name}`);}
}

test('all six dialogs reflow across phone, tablet, desktop and ultrawide sizes',()=>{
  const sizes=[[320,568,true],[390,844,true],[768,1024,true],[844,390,true],[568,320,true],[1024,768,false],[1280,720,false],[1920,1080,false],[2560,1080,false]];
  for(const [w,h,touch]of sizes){
    const g=create(),ui=new GameUI(g);ui.mobile=touch;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
    assertControls(ui.hudView.root,w,h,touch);
    const cases=[{type:'start'},{type:'upgrade',choices:['power','haste','vital']},{type:'drop',item:{id:'heavy',quality:2}},{type:'inventory'},{type:'pause'},{type:'result',win:true,reason:'Complete'}];
    for(const dialog of cases){g.flow.replace(dialog);ui.modalKey='';ui.update();assertControls(find(ui.root,'dialog-panel'),w,h,touch);const shade=bounds(find(ui.root,'modal-shade'));assert.ok(Math.abs(shade.w-w)<.001&&Math.abs(shade.h-h)<.001);}
    if(w<h){g.flow.replace(null);ui.update();assert.equal(g.gate.paused,false);}
  }
});

test('portrait rotation preserves gear, upgrades and modal while clearing active input',()=>{
  const g=create(),ui=new GameUI(g);g.levels.power=2;g.toggleInventory();g.testGear('head');const before=JSON.stringify(g.loadout);ui.mobile=true;
  for(const [w,h]of [[390,844],[844,390],[320,568],[1280,720],[390,844]]){
    Laya.stage.width=w;Laya.stage.height=h;g.input.mouseTarget={x:100,y:100};g.input.mouseHeld=true;g.setStick(.5,0);Laya.stage.emit('resize');
    assert.equal(g.dialog.type,'inventory');assert.equal(JSON.stringify(g.loadout),before);assert.equal(g.levels.power,2);assert.equal(g.input.mouseTarget,null);assert.equal(g.input.mouseHeld,false);assert.deepEqual(g.input.stick,{x:0,y:0});assert.ok(g.gate.paused);find(ui.root,'turn').emit('click');
  }
  find(ui.root,'close-inventory').emit('click');assert.equal(g.gate.paused,false);tick(g,.1);assert.ok(g.time>0);
});

test('mouse picking uses the camera zoom after responsive resizing',()=>{
  for(const [w,h]of [[390,844],[844,390],[1920,1080]]){
    const g=create(),ui=new GameUI(g);Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');g.render();
    const target={x:90,y:-60};Laya.stage.mouseX=g.scene.world.x+(target.x-target.y)*.7071*g.scene.world.scaleX;Laya.stage.mouseY=g.scene.world.y+(target.x+target.y)*.3536*g.scene.world.scaleY;
    g.input.mouseDown({target:Laya.stage});g.input.mouseHeld=false;assert.ok(Math.abs(g.input.mouseTarget.x-target.x)<1e-6&&Math.abs(g.input.mouseTarget.y-target.y)<1e-6);tick(g,1);assert.ok(Math.hypot(g.player.x-target.x,g.player.y-target.y)<=5);assert.ok(ui.root.width>0);
  }
});

test('Laya keyboard events move and toggle equipment without browser DOM handlers',()=>{
  const g=create();Laya.stage.emit('keydown',{keyCode:68});tick(g,.2);assert.ok(g.player.x>0);Laya.stage.emit('keyup',{keyCode:68});assert.equal(g.input.keys.has('KeyD'),false);
  Laya.stage.emit('keydown',{keyCode:69});assert.equal(g.dialog.type,'inventory');Laya.stage.emit('keydown',{keyCode:69,nativeEvent:{repeat:true}});assert.equal(g.dialog.type,'inventory');Laya.stage.emit('keyup',{keyCode:69});Laya.stage.emit('keydown',{keyCode:69});assert.equal(g.dialog,null);
});

test('gameplay loop spawns enemies and delivers actual weapon damage',()=>{
  for(const weapon of ['storm','flame','blade']){
    const g=create();g.start(weapon,true);g.spawnEnemy(0);const e=g.enemies.at(-1);e.x=40;e.y=40;tick(g,3);
    assert.ok(g.damage>0,`${weapon} should deal damage`);assert.ok(g.kills>=1,`${weapon} should kill`);
  }
});
test('inventory pauses simulation and resumes without a stuck focus gate',()=>{
  const g=create();g.toggleInventory();const before=g.time;tick(g,2);assert.equal(g.time,before);g.gate.add('focus');g.close();tick(g,1);assert.ok(g.time>before);
});
test('equipment updates health, appearance and attack family together',()=>{
  const g=create();g.toggleInventory();g.testGear('head');assert.equal(g.loadout.head.id,'visor');assert.equal(g.stats.crit,.13);g.testGear('weapon');assert.equal(g.snapshot().weapon,'flame');assert.ok(g.scene.avatarKey.includes('flame'));g.testQuality();assert.equal(g.loadout.weapon.quality,1);assert.equal(g.stats.crit,.05+.08*1.2);
});
test('queued upgrades recalculate available choices after previous selection',()=>{
  const g=create();g.levels.power=4;g.addXP(26);assert.equal(g.dialog.type,'upgrade');assert.equal(g.flow.pendingCount,1);
  // Select power if it was not randomly drawn, using an explicit currently offered card.
  g.dialog.choices=['power'];g.chooseUpgrade('power');assert.equal(g.levels.power,5);assert.equal(g.dialog.type,'upgrade');assert.ok(!g.dialog.choices.includes('power'));
});
test('elite guarantees a wearable drop and ordinary deaths yield experience',()=>{
  const g=create();g.eliteIndex=1;g.spawnEnemy(3);const e=g.enemies.at(-1);g.hit(e, 10000);assert.ok(g.drops.some(d=>d.item));assert.ok(g.drops.some(d=>d.xp>0));
});
test('normal death offers revival, training prevents damage, declining ends run and boss death wins',()=>{
  const g=create();g.hurt(999);assert.equal(g.player.hp,100);g.training=false;g.hurt(999);g.player.inv=0;g.hurt(999);assert.equal(g.dialog.type,'revive');assert.equal(g.mode,'downed');g.finish(false,'declined');assert.equal(g.dialog.type,'result');assert.equal(g.dialog.win,false);
  g.start('storm',true);g.spawnBoss();const boss=g.enemies.find(e=>e.kind===4);g.hit(boss, 99999);assert.equal(g.dialog.type,'result');assert.equal(g.dialog.win,true);
});
test('timeout ends battle and restart clears entities, upgrades, timers and dialogs',()=>{
  const g=create();g.time=359.99;tick(g,.1);assert.equal(g.mode,'result');assert.equal(g.dialog.win,false);g.start('blade');assert.equal(g.time,0);assert.equal(g.level,1);assert.equal(g.enemies.length,7);assert.equal(g.flow.pendingCount,0);assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);assert.equal(g.snapshot().weapon,'blade');
});
test('fixed budgets survive a full six-minute training simulation and five restarts',()=>{
  const g=new Game();g.start('storm',true);
  for(let i=0;i<21610&&g.mode==='battle';i++){
    if(g.dialog?.type==='upgrade')g.chooseUpgrade(g.dialog.choices[0]);
    if(g.dialog?.type==='drop')g.takeDrop(true);
    if(g.dialog?.type==='fragment')g.chooseFragment(g.dialog.choices[0]);
    if(!g.gate.paused)g.update(1/60);
    if(i%60===0){g.render();assert.ok(g.enemies.length<=240);assert.ok(g.shots.length<=240);assert.ok(g.drops.length<=170);}
  }
  assert.equal(g.mode,'result');
  for(let i=0;i<5;i++){g.start('storm',true);tick(g,3);}
  assert.ok(g.scene.actors.children.length<50);assert.ok(g.nodes.sprites.length<=500);
});

function clearArena(g){for(const e of g.enemies)g.release(e.node);g.enemies=[];g.grid.rebuild([]);g.spawnTimer=999;g.attackTimer=999;}
function enemyAt(g,x,y,hp=500){g.spawnEnemy(0);const e=g.enemies.at(-1);Object.assign(e,{x,y,hp,max:hp});return e;}

test('guided blade recasts preserve spin and contact cooldown while only the simulation advances boost',()=>{
 const g=create();g.start('blade',true);clearArena(g);g.stats.crit=0;const near=enemyAt(g,40,0),far=enemyAt(g,250,0);g.grid.rebuild(g.enemies);
 g.attack();assert.equal(near.hp,480);assert.equal(far.hp,500);g.update(.05);
 const spin=g.player.bladeSpin,hp=near.hp;assert.ok(spin>0);g.attack();assert.equal(g.player.bladeSpin,spin);assert.equal(near.hp,hp);
 g.render();g.render();assert.equal(g.player.bladeSpin,spin);
 g.toggleInventory();g.loop.last=performance.now()-50;g.loop.frame();assert.equal(g.player.bladeSpin,spin);
 g.start('blade',true);assert.equal(g.player.bladeSpin||0,0);
});

test('all three weapons engage within the first second without player movement',()=>{
  for(const weapon of ['storm','flame','blade']){const g=create();g.start(weapon,true);assert.equal(g.enemies.length,7);tick(g,1);assert.ok(g.damage>0,weapon);}
  const g=create();g.time=44.99;g.attackTimer=999;g.update(.02);assert.equal(g.eliteIndex,1);assert.ok(g.enemies.some(e=>e.kind===3));
});

test('flame detonates once across a crowd and retains shot damage after swapping gear',()=>{
  const g=create();g.start('flame',true);clearArena(g);g.stats.crit=0;g.levels.burn=1;g.levels.ground=1;
  const a=enemyAt(g,100,0),b=enemyAt(g,160,0),far=enemyAt(g,500,0);g.grid.rebuild(g.enemies);
  g.shoot(0,0,680,0,30,false,'#ffcc77',true);const shot=g.shots[0];assert.equal(shot.radius,126);assert.equal(shot.fieldLife,3);
  g.loadout.weapon={id:'storm',quality:2};g.levels.burn=2;g.stats.damage=10;g.stats.element=10;
  g.updateShots(.13);assert.equal(g.shots.length,0);assert.equal(a.hp,465);assert.equal(b.hp,465);assert.equal(far.hp,500);assert.equal(a.burnD,11);assert.equal(g.fields.length,1);assert.equal(g.fields[0].damage,11);
  g.updateShots(.1);assert.equal(a.hp,465);assert.equal(g.fields.length,1);
});

test('chain upgrades reach distinct enemies and blade upgrades increase sweep range',()=>{
  const g=create();clearArena(g);g.stats.crit=0;const enemies=Array.from({length:7},(_,i)=>enemyAt(g,80+i*40,0));g.grid.rebuild(g.enemies);g.attack();assert.equal(enemies.filter(e=>e.hp<500).length,3);
  for(const e of enemies){e.hp=500;e.kx=0;}g.levels.chain=2;g.attack();assert.equal(enemies.filter(e=>e.hp<500).length,7);
  g.start('blade',true);clearArena(g);g.stats.crit=0;const e=enemyAt(g,180,0);g.grid.rebuild(g.enemies);g.attack();assert.equal(e.hp,500);g.levels.orbit=1;g.levels.blades=1;g.attack();assert.equal(e.hp,476);assert.ok(g.snapshot().dashMax<2.2);
});

test('eight fast kills trigger frenzy, pauses preserve it, inactivity clears the chain',()=>{
  const g=create();clearArena(g);for(let i=0;i<8;i++)g.onKill();assert.equal(g.combo,8);assert.equal(g.overdrive,5);assert.equal(g.snapshot().momentum,0);
  g.toggleInventory();tick(g,2);assert.equal(g.overdrive,5);assert.equal(g.combo,8);g.close();tick(g,3.6);assert.equal(g.combo,0);assert.ok(g.overdrive>0);tick(g,1.5);assert.equal(g.overdrive,0);
  g.onKill();assert.equal(g.snapshot().momentum,1);g.start('storm',true);assert.equal(g.combo,0);assert.equal(g.overdrive,0);
});

test('direct hits flash and knock back, damage over time avoids repeated impact feedback',()=>{
  const g=create();clearArena(g);g.stats.crit=1;const e=enemyAt(g,90,0);g.grid.rebuild(g.enemies);g.hit(e, 10, { canCrit: true });assert.ok(e.kx>0);assert.ok(e.flash>0);assert.ok(g.feedback.hitStop>0);g.render();assert.equal(e.flashPaint,true);assert.equal(e.node.alpha,1);
  const count=g.fx.length;g.updateEnemies(.1);g.render();assert.equal(e.flashPaint,false);g.hit(e, 1, { impact: false, round: false });assert.equal(g.fx.length,count);assert.equal(e.flash,0);
  g.start('storm',true);assert.equal(g.feedback.hitStop,0);assert.equal(g.recoil,0);assert.equal(g.feedback.shakeTime,0);
});

test('experience attraction persists beyond pickup radius and never overshoots',()=>{
  const g=create();clearArena(g);g.dropXP(140,0,1);const d=g.drops[0];g.updateDrops(.01);assert.equal(d.collecting,true);g.player.x=-300;g.updateDrops(1);assert.equal(d.x,-300);g.updateDrops(.01);assert.equal(g.drops.length,0);assert.equal(g.xp,1);
});

test('guaranteed equipment fits the drop budget without losing accumulated experience',()=>{
  const g=create();clearArena(g);for(let i=0;i<170;i++)g.drops.push({x:800,y:800,xp:1,collecting:false,node:g.acquire()});
  g.dropGear(100,0,{id:'visor',quality:1});assert.equal(g.drops.length,170);assert.ok(g.drops.some(d=>d.item));assert.equal(g.drops.reduce((sum,d)=>sum+d.xp,0),170);
});

test('dash covers its configured distance with a trail and frenzy changes real firepower',()=>{
  const g=create();clearArena(g);g.dash();assert.equal(g.player.dash,2.2);tick(g,.2);assert.ok(Math.abs(Math.hypot(g.player.x,g.player.y)-180)<1e-8);assert.ok(g.fx.some(f=>f.kind==='dash'));
  g.start('storm',true);clearArena(g);g.stats.crit=0;const e=enemyAt(g,90,0);g.grid.rebuild(g.enemies);g.attack();assert.equal(e.hp,475);e.hp=500;g.overdrive=5;g.attack();assert.equal(e.hp,469);g.attackTimer=0;g.update(1/60);assert.ok(Math.abs(g.attackTimer-.32/1.6)<1e-8);
});

const {difficultyAt,ENEMY_LIMIT,SHOT_LIMIT}=await import('../dist/game/difficulty.js');
const {resolveStats}=await import('../dist/shared/model.js');
const {UPGRADES}=await import('../dist/progression/config.js');
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('later waves increase density, damage and pursuit while keeping opening values',()=>{
  const early=difficultyAt(0),late=difficultyAt(270);assert.equal(early.batch,1);assert.equal(early.damage,1);assert.equal(early.hp,1);assert.equal(early.speed,1);
  assert.equal(late.batch,10);assert.ok(late.damage>3);assert.ok(late.speed>1.5);assert.ok(late.surgeInterval<early.surgeInterval);assert.ok(late.maxEnemies>early.maxEnemies);assert.ok(late.hp<5);
  for(let time=0;time<=600;time+=30){const d=difficultyAt(time);assert.ok(d.maxEnemies<=ENEMY_LIMIT);assert.ok(d.knockback>0);assert.ok(d.attackInterval>=.7);}
  const g=create();clearArena(g);g.time=270;g.spawnTimer=0;g.nextSurge=999;g.eliteIndex=4;g.update(1/60);assert.equal(g.enemies.length,10);assert.ok(g.enemies.every(e=>e.damage>25));
});

test('ranged enemies telegraph before late spread shots and fast shots cannot tunnel through player',()=>{
  const g=create();clearArena(g);g.time=270;g.spawnEnemy(1);const e=g.enemies.at(-1);Object.assign(e,{x:400,y:0,cooldown:0});g.grid.rebuild(g.enemies);g.updateEnemies(.01);assert.ok(e.wind>0);assert.equal(g.shots.length,0);g.updateEnemies(.46);assert.equal(g.shots.length,3);assert.ok(g.shots.every(s=>s.damage>30));
  for(const s of g.shots)g.release(s.node);g.shots=[];g.training=false;g.player.inv=0;g.shoot(-80,0,1000,0,30,true,'#eeaa77');g.updateShots(.16);assert.equal(g.player.hp,70);assert.equal(g.shots.length,0);
});

test('late healing drops have a cooldown, and enemy bullets leave room for player attacks',()=>{
  const random=Math.random;Math.random=()=>0;
  try {const g=create();clearArena(g);g.time=270;g.eliteIndex=4;for(let i=0;i<20;i++){const e=enemyAt(g,400,0,1);g.hit(e, 10, { impact: false });}assert.equal(g.drops.filter(d=>d.xp<0).length,1);assert.ok(g.healDropCooldown>15);
    for(let i=0;i<SHOT_LIMIT;i++)g.shoot(800,800,1,0,1,true,'#eeaa77');assert.equal(g.shots.length,SHOT_LIMIT-32);g.shoot(0,0,680,0,30,false,'#ffaa66',true);assert.equal(g.shots.length,SHOT_LIMIT-31);
  }finally{Math.random=random;}
});

test('a fully upgraded stationary player remains vulnerable to the late horde',t=>{
  const random=Math.random;
  try {for(const weapon of ['storm','flame','blade']){
    Math.random=seeded(627);const g=create();g.start(weapon,false);clearArena(g);g.time=270;g.level=30;g.attackTimer=0;g.spawnTimer=0;g.nextSurge=270;g.eliteIndex=4;
    g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));g.loadout={weapon:{id:weapon,quality:2},head:{id:'helmet',quality:2},armor:{id:'heavy',quality:2},back:{id:'thorn',quality:2}};g.stats=resolveStats(g.loadout,g.levels);g.player.hp=g.stats.hp;
    for(let i=0;i<40*60&&g.mode==='battle';i++){if(g.dialog?.type==='upgrade')g.chooseUpgrade(g.dialog.choices[0]);if(g.dialog?.type==='drop')g.takeDrop(false);if(g.dialog?.type==='fragment')g.chooseFragment(g.dialog.choices[0]);if(!g.gate.paused)g.update(1/60);}
    t.diagnostic(`${weapon}: hp=${g.player.hp}, survived=${(g.time-270).toFixed(1)}s, kills=${g.kills}`);assert.equal(g.mode,'downed',`${weapon} should need movement despite full defensive gear`);assert.equal(g.player.hp,0);
  }}finally{Math.random=random;}
});

test('boss retains reinforcements and higher health instead of becoming an empty arena',()=>{
  const g=create();g.time=300;g.spawnBoss();assert.equal(g.snapshot().boss.max,8400);g.attackTimer=999;g.spawnTimer=0;g.nextSurge=999;g.eliteIndex=4;g.update(1/60);assert.equal(g.enemies.length,4);assert.ok(g.enemies.some(e=>e.kind===1));assert.ok(g.enemies.some(e=>e.kind===2));
});


test('240-enemy late capacity is enforced and restart returns to the opening pack',()=>{
  const g=create();clearArena(g);g.time=270;for(let i=0;i<610;i++)g.spawnEnemy(0);assert.equal(g.enemies.length,240);g.spawnEnemy(3);assert.equal(g.enemies.length,240);assert.ok(g.enemies.some(e=>e.kind===3));g.start('storm',true);assert.equal(g.enemies.length,7);assert.ok(g.nodes.sprites.length<=500);assert.ok(g.nodes.texts.length<=40);
});

test('offscreen enemies keep simulating and reappear when returning to the viewport',()=>{
  const g=create();clearArena(g);const e=enemyAt(g,1100,-1100);g.render();assert.equal(e.node.visible,false);const before={x:e.x,y:e.y};g.grid.rebuild(g.enemies);g.updateEnemies(.1);assert.notEqual(e.x,before.x);assert.notEqual(e.y,before.y);e.x=50;e.y=50;g.render();assert.equal(e.node.visible,true);
});

test('dense fights bound ordinary health-bar drawing while keeping elite health visible',()=>{
  const g=create();clearArena(g);for(let i=0;i<100;i++){const e=enemyAt(g,(i%10)*12-60,Math.floor(i/10)*12-60);e.hp=400;}g.spawnEnemy(3);const elite=g.enemies.at(-1);Object.assign(elite,{x:0,y:100,hp:50});let rectangles=0;g.scene.effects.graphics.drawRect=()=>rectangles++;g.render();assert.equal(rectangles,50);assert.equal(elite.node.visible,true);
});

test('Buff editor builds two recipes with unlocks, pause and restart lifecycle',()=>{
  const g=create(),ui=new GameUI(g);find(ui.root,'buffs').emit('click');assert.equal(g.dialog.type,'buffs');const time=g.time;
  for(const [part,id]of [['trigger','hit'],['action','blast'],['element','fire']]){find(ui.root,`buff-part-${part}`).emit('click');find(ui.root,`fragment-${id}`).emit('click');}
  assert.deepEqual(g.buffs.recipes[0],{trigger:'hit',action:'blast',element:'fire'});tick(g,1);assert.equal(g.time,time);find(ui.root,'buff-slot-1').emit('click');find(ui.root,'buff-unlock').emit('click');assert.equal(g.buffs.owned.size,12);
  for(const [part,id]of [['trigger','dash'],['action','field'],['element','ice']]){find(ui.root,`buff-part-${part}`).emit('click');find(ui.root,`fragment-${id}`).emit('click');}
  find(ui.root,'buff-close').emit('click');assert.equal(g.gate.paused,false);clearArena(g);g.dash();tick(g,.2);assert.equal(g.buffs.procs,1);assert.ok(g.buffs.effects.some(e=>e.kind==='field'));g.toggleBuffs();const cd=g.buffs.cooldowns[1],life=g.buffs.effects[0].life;tick(g,2);assert.equal(g.buffs.cooldowns[1],cd);assert.equal(g.buffs.effects[0].life,life);
  g.start('storm',true);assert.equal(g.buffs.owned.size,3);assert.equal(g.buffs.procs,0);assert.equal(g.buffs.effects.length,0);assert.equal(g.buffs.recipes[0].trigger,'hit');
});

test('Buffs cannot recursively trigger hit or kill recipes and hurt only activates on real damage',()=>{
  const g=create();clearArena(g);for(const id of ['kill','dash','hurt','ice'])g.buffs.grant(id);g.buffs.install(0,'trigger','kill');g.buffs.install(0,'action','blast');g.buffs.install(0,'element','fire');g.buffs.install(1,'trigger','hit');g.buffs.install(1,'action','blast');g.buffs.install(1,'element','ice');
  const enemies=Array.from({length:6},(_,i)=>enemyAt(g,i*10+10,0,10));g.grid.rebuild(g.enemies);g.hit(enemies[0], 30, { triggerBuffs: false });assert.equal(g.buffs.procs,0);
  g.buffs.install(1,'trigger',null);g.hit(enemies[1], 30);assert.equal(g.buffs.procs,1);g.buffs.update(.01);assert.equal(g.kills,6);assert.equal(g.buffs.procs,1);assert.equal(g.buffs.effects.length,1);
  g.buffs.install(1,'trigger','hurt');g.buffs.install(1,'element','ice');g.hurt(10);assert.equal(g.buffs.procs,1);g.training=false;g.player.inv=0;g.hurt(10);assert.equal(g.buffs.procs,2);g.hurt(10);assert.equal(g.buffs.procs,2);
});

test('fragment loot unlocks without interrupting battle, duplicates salvage and full loot stays bounded',()=>{
  const g=create();clearArena(g);const oldRandom=Math.random;Math.random=()=>0;try{g.dropFragment(0,0);const id=g.drops[0].fragment;assert.ok(id);g.updateDrops(.01);assert.ok(g.buffs.owned.has(id));assert.equal(g.dialog,null);
    g.drops.push({x:0,y:0,xp:0,fragment:id,collecting:false,node:g.acquire()});g.updateDrops(.01);assert.equal(g.xp,5);assert.equal(g.drops.length,0);
    for(let i=0;i<170;i++)g.drops.push({x:800,y:800,xp:1,collecting:false,node:g.acquire()});g.dropFragment(500,500);assert.equal(g.drops.length,170);assert.ok(g.drops.some(d=>d.fragment));assert.equal(g.drops.reduce((sum,d)=>sum+d.xp,0),170);
  }finally{Math.random=oldRandom;}
});

test('Buff editor and all fragment pickers fit nine viewports and retain state after rotation',()=>{
  for(const [w,h]of [[320,568],[390,844],[768,1024],[844,390],[568,320],[1024,768],[1280,720],[1920,1080],[2560,1080]]){
    const g=create(),ui=new GameUI(g);ui.mobile=true;Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');g.toggleBuffs();assertControls(ui.hudView.root,w,h,true);assertControls(find(ui.root,'dialog-panel'),w,h,true);
    for(const part of ['trigger','action','element']){find(ui.root,`buff-part-${part}`).emit('click');assertControls(find(ui.root,'dialog-panel'),w,h,true);find(ui.root,'buff-back').emit('click');}
    g.installBuff(0,'trigger','hit');Laya.stage.emit('resize');assert.equal(g.buffs.recipes[0].trigger,'hit');assert.ok(g.gate.paused);find(ui.root,'buff-close').emit('click');assert.equal(g.gate.paused,false);
  }
});


test('visual quality saves and reloads, bounds feedback, and leaves gameplay stats intact',()=>{
  const g=create(),ui=new GameUI(g),before=JSON.stringify(g.stats),original=globalThis.localStorage;
  let saved='';globalThis.localStorage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
  try {
    g.togglePause();find(ui.root,'visual-quality').emit('click');assert.equal(g.quality,'high');
    const restored=new Game();assert.equal(restored.quality,'high');
    g.cycleVisualQuality();assert.equal(g.quality,'low');assert.equal(JSON.stringify(g.stats),before);
    for(let i=0;i<100;i++)g.deathBurst({x:0,y:0,kind:0});assert.equal(g.fx.length,20);
    const enemy=enemyAt(g,90,0);enemy.hp=100000;for(let i=0;i<50;i++)g.hit(enemy, 1, { canCrit: true });assert.ok(g.labels.length<=8);
    saved=JSON.stringify({quality:'corrupt'});assert.equal(new Game().quality,'standard');
  } finally {globalThis.localStorage=original;}
});

test('ground aim stays below actors and staff charge renders after Buff effects on every quality',()=>{
  for(const quality of ['low','standard','high']){
    const g=create();clearArena(g);g.quality=quality;
    assert.ok(g.scene.world.children.indexOf(g.scene.groundEffects)<g.scene.world.children.indexOf(g.scene.actors));
    const e=enemyAt(g,60,0);e.kind=1;e.wind=.3;e.dx=1;e.dy=0;
    const calls=[],aim=[];g.scene.effects.graphics.drawPoly=()=>calls.push('warning');g.scene.groundEffects.graphics.drawLine=(...a)=>aim.push(a);g.buffs.render=()=>calls.push('buff');
    g.render();assert.ok(calls.indexOf('warning')>calls.indexOf('buff'));assert.equal(aim.length,8);
  }
});

test('simplified enemies retain distinct silhouettes with fewer shapes and elites retain detail',async()=>{
  const {enemyShapes}=await import('../dist/rendering/voxel.js');
  for(const kind of [1,2])assert.ok(enemyShapes(kind,false,false).length<enemyShapes(kind,false,true).length);
  for(const kind of [3,4])assert.deepEqual(enemyShapes(kind,false,false),enemyShapes(kind,false,true));
  assert.notDeepEqual(enemyShapes(0,false,false),enemyShapes(1,false,false));
});


test('every weapon starts with an editable working Buff and deals opening damage within three seconds',()=>{
  const random=Math.random;Math.random=()=>0;
  try {for(const weapon of ['storm','flame','blade']){
    const g=new Game();g.start(weapon,true);
    assert.deepEqual(g.buffs.recipes[0],{trigger:'hit',action:'blast',element:'fire'});
    assert.equal(g.buffs.recipes[1].trigger,null);assert.equal(g.buffs.owned.size,3);
    tick(g,3);assert.ok(g.damage>0);assert.ok(g.buffs.procs>0,weapon);
    while(g.dialog?.type==='upgrade')g.chooseUpgrade(g.dialog.choices[0]);
    g.toggleBuffs();g.installBuff(0,'trigger',null);assert.equal(g.buffs.recipes[0].trigger,null);
  }}finally{Math.random=random;}
});

test('twenty-second catch-up grants only missing first-level XP and pauses for the choice',()=>{
  const g=create();clearArena(g);g.time=19.98;g.xp=4;
  g.update(.01);assert.equal(g.level,1);assert.equal(g.dialog,null);
  g.update(.02);assert.equal(g.level,2);assert.equal(g.xp,0);assert.equal(g.dialog.type,'upgrade');
  const time=g.time;tick(g,1);assert.equal(g.time,time);g.chooseUpgrade(g.dialog.choices[0]);tick(g,.1);
  assert.equal(g.level,2);assert.equal(g.dialog,null);assert.equal(g.flow.pendingCount,0);
  g.start('storm',true);assert.equal(g.level,1);assert.equal(g.xp,0);
});

test('six-minute timeline spawns four elites and a five-minute Boss, then seals exactly at six minutes',async()=>{
  const {ELITE_TIMES}=await import('../dist/progression/config.js');assert.deepEqual(ELITE_TIMES,[45,105,165,225]);
  const g=create();clearArena(g);g.level=2;g.nextSurge=999;
  for(const [i,at]of ELITE_TIMES.entries()){
    clearArena(g);g.time=at-.02;g.eliteIndex=i;g.update(.01);assert.equal(g.enemies.length,0);
    g.update(.02);assert.equal(g.eliteIndex,i+1);assert.equal(g.enemies.length,1);assert.equal(g.enemies[0].kind,3);
  }
  clearArena(g);g.time=299.98;g.update(.01);assert.equal(g.bossSpawned,false);
  g.update(.02);assert.equal(g.bossSpawned,true);assert.equal(g.enemies.filter(e=>e.kind===4).length,1);assert.equal(g.mode,'battle');
  g.time=359.98;g.update(.01);assert.equal(g.mode,'battle');g.update(.02);assert.equal(g.mode,'result');assert.equal(g.dialog.win,false);
  g.start('blade',true);g.testBoss();assert.equal(g.time,300);assert.ok(g.snapshot().boss);
});

test('opening surge arrives at twelve seconds and lower-quality duplicates never open a gear comparison',()=>{
  const g=create();clearArena(g);g.level=10;g.time=11.98;g.update(.01);assert.equal(g.enemies.length,0);
  g.update(.02);assert.ok(g.enemies.length>=8);assert.ok(g.nextSurge>12);
  clearArena(g);g.loadout.head={id:'visor',quality:2};g.dropGear(0,0,{id:'visor',quality:1});g.updateDrops(.01);
  assert.equal(g.dialog,null);assert.equal(g.xp,10);assert.equal(g.loadout.head.quality,2);
  g.kills=17;g.fragmentCooldown=0;const e=enemyAt(g,400,0,1);g.hit(e, 10, { impact: false });
  assert.equal(g.drops.filter(d=>d.fragment).length,1);assert.equal(g.fragmentCooldown,8);
});

test('active reward toasts cannot block overlapping upgrade cards or equipment confirmation',()=>{
  for(const [w,h]of [[320,568],[390,844],[844,390],[1280,720]]){
    const g=create(),ui=new GameUI(g);Laya.stage.width=w;Laya.stage.height=h;Laya.stage.emit('resize');
    const check=(name)=>{
      const button=find(ui.root,name),r=bounds(button),toast=ui.toastNode;
      // Force the notification over the click point, without waiting for its expiry.
      toast.pos(r.x,r.y);toast.size(r.w,r.h);g.onToast('Reward notification');
      assert.equal(toast.visible,false);assert.equal(toast.mouseEnabled,false);
      const hit=pickUI(ui.root,r.x+r.w/2,r.y+r.h/2);
      assert.equal(hit,button);hit.emit('click');
    };
    g.show({type:'upgrade',choices:['power']});const choice=g.dialog.choices[0];check('upgrade-'+choice);
    assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);assert.equal(g.levels[choice],1);
    g.show({type:'drop',item:{id:'heavy',quality:1}});check('equip');
    assert.equal(g.loadout.armor.id,'heavy');assert.equal(g.dialog,null);assert.equal(g.gate.paused,false);
  }
});

test('ice tint follows slow status transitions and expires without repainting every frame',()=>{
  const g=create();clearArena(g);const e=enemyAt(g,50,0);g.grid.rebuild(g.enemies);
  g.buffs.grant('dash');g.buffs.grant('ice');g.buffs.install(0,'trigger','dash');g.buffs.install(0,'action','blast');g.buffs.install(0,'element','ice');
  g.buffs.trigger('dash',0,0,1);g.buffs.update(.01);e.flash=0;
  let paints=0;const paint=g.scene.paintEnemy.bind(g.scene);g.scene.paintEnemy=(...args)=>{paints++;paint(...args);};
  g.render();assert.equal(e.icePaint,true);assert.equal(paints,1);g.render();assert.equal(paints,1);
  g.buffs.update(2.1);g.render();assert.equal(e.icePaint,false);assert.equal(paints,2);
});

test('quiet continuous Buff feedback retains damage and knockback without repeated white flashes',()=>{
  const g=create();clearArena(g);const e=enemyAt(g,50,0);g.grid.rebuild(g.enemies);
  for(const id of ['dash','field'])g.buffs.grant(id);
  g.buffs.install(0,'trigger','dash');g.buffs.install(0,'action','field');g.buffs.install(0,'element','fire');
  g.buffs.trigger('dash',0,0,1);g.buffs.update(.01);
  assert.ok(e.hp<e.max);assert.ok(e.kx>0);assert.equal(e.flash,0);assert.equal(g.labels.length,0);
});


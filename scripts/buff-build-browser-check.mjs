import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Actual production engine cards, including second-finger ownership through both rewards. */
export async function checkBuffBuildBrowser({send,evaluate,directory,wechat=false,touch=true}){
 const access=wechat ? 'const t=wechatTest,{game:g,ui}=t.app,L=t.root.Laya;' : "const {game:g,ui}=await import('/dist/main.js'),L=Laya;";
 const run=code=>evaluate(`(async()=>{${access}${code}})()`);
 await run(`g.start('storm',true);L.timer.clear(g.loop,g.loop.frame);g.addXP(10);ui.update();`);
 const shot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`${wechat?'wechat-':''}buff-build-${touch?'touch':'mouse'}.png`),Buffer.from(shot.data,'base64'));
 const point=await run(`const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const f=find(n.getChildAt(i),name);if(f)return f;}};const n=find(ui.root,'build-fire'),p=n.localToGlobal(new L.Point(n.width*.5,n.height*.7));return {x:p.x,y:p.y};`);
 if(wechat)await evaluate(`wechatTest.tap('build-fire',[wechatTest.heldStick].filter(Boolean))`);
 else if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}
 assert.deepEqual(await run(`return {dialog:g.dialog?.type||null,action:g.buffs.recipes[0].action,element:g.buffs.recipes[1].element};`),{dialog:null,action:'field',element:'force'});
 await run(`g.buffs.receiveFragment('fire');g.buffs.receiveFragment('fire');if(!g.buffs.takeBranchRequest())throw Error('Missing branch');g.show({type:'branch',choices:['trail','furnace']});ui.update();`);
 const branchShot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`${wechat?'wechat-':''}buff-branch-${touch?'touch':'mouse'}.png`),Buffer.from(branchShot.data,'base64'));
 if(wechat){
  const result=await evaluate(`(()=>{const t=wechatTest,g=t.app.game,id=g.flow.dialogId;t.tap('branch-trail',[t.heldStick].filter(Boolean));return {branch:g.buffs.branchOf(g.buffs.recipes[0]),stale:g.claimReward(id,{type:'branch',id:'furnace'}),owner:t.app.ui.hudView.stick.stickTouch};})()`);
  assert.equal(result.branch,'trail');assert.equal(result.stale,false);
 }else{
  const p=await run(`const find=n=>{if(n.name==='branch-trail')return n;for(let i=0;i<n.numChildren;i++){const f=find(n.getChildAt(i));if(f)return f;}};const n=find(ui.root),p=n.localToGlobal(new L.Point(n.width*.5,n.height*.7));return {x:p.x,y:p.y};`);
  if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  assert.equal(await run(`return g.buffs.branchOf(g.buffs.recipes[0]);`),'trail');
 }
 // Exercise the second branch family through real production cards too.
 await run(`g.start('storm',true);g.addXP(10);ui.update();`);
 const tapCard=async name=>{
  if(wechat){await evaluate(`wechatTest.tap('${name}')`);return;}
  const p=await run(`const find=n=>{if(n.name==='${name}')return n;for(let i=0;i<n.numChildren;i++){const f=find(n.getChildAt(i));if(f)return f;}};const n=find(ui.root),p=n.localToGlobal(new L.Point(n.width*.5,n.height*.7));return {x:p.x,y:p.y};`);
  if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 };
 await tapCard('build-ice');
 await run(`g.buffs.receiveFragment('ice');g.buffs.receiveFragment('ice');g.show(g.buffs.takeBranchReward());ui.update();`);
 const iceShot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`buff-ice-branch-${touch?'touch':'mouse'}.png`),Buffer.from(iceShot.data,'base64'));
 await tapCard('branch-prison');
 assert.equal(await run(`return g.buffs.branchOf(g.buffs.recipes[0]);`),'prison');
 await run(`g.toggleBuffs();ui.update();const find=n=>{if(n.name==='buff-description')return n;for(let i=0;i<n.numChildren;i++){const f=find(n.getChildAt(i));if(f)return f;}};if(!find(ui.root)?.text.includes('寒牢'))throw Error('Missing prison editor description');`);
 const editorShot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`buff-ice-editor-${touch?'touch':'mouse'}.png`),Buffer.from(editorShot.data,'base64'));
 // Third family: the actual starter, branch and compact editor description.
 await run(`g.start('storm',true);g.addXP(10);ui.update();`);
 await tapCard('build-thunder');
 await run(`g.buffs.receiveFragment('lightning');g.buffs.receiveFragment('lightning');g.show(g.buffs.takeBranchReward());ui.update();`);
 const thunderShot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`buff-thunder-branch-${touch?'touch':'mouse'}.png`),Buffer.from(thunderShot.data,'base64'));
 await tapCard('branch-charge');
 assert.equal(await run(`return g.buffs.branchOf(g.buffs.recipes[0]);`),'charge');
 await run(`g.toggleBuffs();ui.update();const find=n=>{if(n.name==='buff-description')return n;for(let i=0;i<n.numChildren;i++){const f=find(n.getChildAt(i));if(f)return f;}};if(!find(ui.root)?.text.includes('蓄雷'))throw Error('Missing charge editor description');`);
 const thunderEditor=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(resolve(directory,`buff-thunder-editor-${touch?'touch':'mouse'}.png`),Buffer.from(thunderEditor.data,'base64'));
 await run(`g.start('storm',true);ui.update();`);
}

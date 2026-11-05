import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function checkDialogAudit({send,evaluate,origin,directory}){
 const rows=[];
 for(const [width,height]of [[320,568],[393,852],[568,320],[852,393],[1280,720]]){
  const touch=width<1000;
  await send('Emulation.setUserAgentOverride',{userAgent:touch?'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',platform:touch?'iPhone':'Win32'});
  await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:touch});
  await send('Page.navigate',{url:origin+'/?dialog-audit='+width});
  for(let n=0;n<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');n++)await new Promise(r=>setTimeout(r,100));
  for(const type of ['start','upgrade','heal','inventory','drop','build','event','fragment','pause','result','damage-pause','damage-result']){
   const row=await evaluate(`(async()=>{
    const {game:g,ui}=await import('/dist/main.js');g.sound=false;
    if(${JSON.stringify(type)}==='start')g.returnToTitle();else{
     g.start('blade',false,'standard');Laya.timer.clear(g.loop,g.loop.frame);g.player.hp=40;
     if(${JSON.stringify(type)}==='heal'){const {UPGRADES}=await import('/dist/progression/config.js');g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));}
     const requests={upgrade:{type:'upgrade',choices:[]},heal:{type:'upgrade',choices:[]},inventory:{type:'inventory'},drop:{type:'drop',item:{id:'flame',quality:2}},build:{type:'build',choices:['fire','ice','thunder','free']},event:{type:'event',site:'苔庭'},fragment:{type:'fragment',choices:['hit','field','fire']},pause:{type:'pause'},result:{type:'result',win:true,reason:'界面布局检查'}};
     g.flow.replace(requests[${JSON.stringify(type)}] || requests[${JSON.stringify(type.replace('damage-',''))}]);
    }
    ui.update();await new Promise(requestAnimationFrame);
    const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};
    if(${JSON.stringify(type)}.startsWith('damage-')){
     for(const kind of ['bolt','blast','field','orbit'])for(const element of ['fire','ice','lightning','force'])g.damageRanking.record(500+Math.random()*500,{kind,element});
     g.damageRanking.record(4000,'storm');find(ui.root,'damage-ranking').event('click',{stopPropagation(){}});ui.update();await new Promise(requestAnimationFrame);
    }
    const panel=find(ui.root,'dialog-panel'),buttons=[];
    const walk=n=>{if(n.caption){const a=n.localToGlobal(new Laya.Point(0,0)),b=n.localToGlobal(new Laya.Point(n.width,n.height));buttons.push({name:n.name,x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y,mouseEnabled:n.mouseEnabled});}for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i));};walk(panel);
    return {width:${width},height:${height},type:${JSON.stringify(type)},buttons};
   })()`);
   for(const [i,b]of row.buttons.entries()){
    assert.equal(b.mouseEnabled,true,b.name);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1,`${width} ${type}: ${b.name} outside viewport`);assert.ok(b.h>=44,`${b.name} touch height`);
    for(const a of row.buttons.slice(0,i))assert.equal(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,false,`${width} ${type}: overlapping ${a.name}/${b.name}`);
   }
   rows.push(row);
   const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,`dialog-${width}x${height}-${type}.png`),Buffer.from(shot.data,'base64'));
   if(type.startsWith('damage-')){
    for(const name of ['damage-next','damage-prev','damage-back']){
     const b=row.buttons.find(b=>b.name===name),x=b.x+b.w/2,y=b.y+b.h/2;
     if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
     else{await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
     const state=await evaluate(`import('/dist/main.js').then(({game:g,ui})=>{const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};return {dialog:g.dialog.type,paused:g.gate.paused,total:find(ui.root,'damage-total')?.text,back:!!find(ui.root,'damage-ranking')};})`);
     assert.equal(state.dialog,type.replace('damage-',''));assert.equal(state.paused,true);
     if(name==='damage-next')assert.match(state.total,/2 \/ /);
     if(name==='damage-prev')assert.match(state.total,/1 \/ /);
     if(name==='damage-back')assert.equal(state.back,true);
    }
   }
  }
 }
 const report={scope:'Real Laya browser, responsive dialog geometry and screenshots. Not native device acceptance.',rows};
 await writeFile(resolve(directory,'dialog-audit.json'),JSON.stringify(report,null,2));return report;
}

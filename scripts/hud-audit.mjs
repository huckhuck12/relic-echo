import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkHudAudit({send,evaluate,origin,directory}){
 const rows=[];
 await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',platform:'iPhone'});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [width,height]of [[320,568],[393,852],[568,320],[852,393]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:origin+'/?hud-audit='+width});
  for(let n=0;n<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');n++)await new Promise(r=>setTimeout(r,100));
  for(const mode of ['seal','boss']){
   const row=await evaluate(`(async()=>{
    const {game:g,ui}=await import('/dist/main.js');g.sound=false;g.start('blade',false,'standard');Laya.timer.clear(g.loop,g.loop.frame);
    for(const e of g.enemies)g.release(e.node);g.enemies=[];g.time=85;g.player.hp=28;g.player.dash=1.2;g.combo=12;g.momentum=12;
    const site=g.mapEvents.sites[0];Object.assign(site,{state:'active',startedAt:75,progress:9});g.player.x=site.x;g.player.y=site.y;
    if(${JSON.stringify(mode)}==='boss'){g.time=601;site.state='expired';g.spawnEnemy(4,220,0);}
    g.showPerformance=true;g.damageRanking.record(10000,'storm');g.damageRanking.record(5000,{kind:'blast',element:'fire'});g.damageRanking.record(2500,{kind:'orbit',element:'ice'});
    await new Promise(r=>setTimeout(r,300));
    g.render();ui.update();ui.toast('封印补给已领取 · 恢复生命 24');
    const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};
    const box=name=>{const n=find(ui.root,name),p=n.localToGlobal(new Laya.Point(0,0));return {name,x:p.x,y:p.y,w:n.width,h:n.height,visible:n.visible,mouseEnabled:n.mouseEnabled,text:n.text};};
    await new Promise(requestAnimationFrame);
    return {mode:${JSON.stringify(mode)},width:${width},height:${height},boxes:['player-hud','hud-event','hud-combo','hud-toast','dash','buffs','hud-boss','damage-hud','performance-panel','touch-stick-area'].map(box)};
   })()`);
   const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
   const get=name=>row.boxes.find(b=>b.name===name);
   for(const name of ['player-hud','hud-event','hud-combo','dash','buffs','hud-boss'])if(get(name).visible)assert.equal(overlap(get(name),get('hud-toast')),false,`${width}x${height} ${mode}: toast / ${name}`);
   assert.equal(get('hud-toast').mouseEnabled,false);assert.equal(get('player-hud').mouseEnabled,false);
   for(const name of ['player-hud','hud-event','hud-combo','hud-toast','dash','buffs','hud-boss','performance-panel','touch-stick-area'])assert.equal(overlap(get('damage-hud'),get(name)),false,`${width}x${height}: damage / ${name}`);
   if(mode==='seal')assert.match(get('hud-event').text,/9\/18s/);
   rows.push(row);const shot=await send('Page.captureScreenshot',{format:'png'});
   await writeFile(resolve(directory,`hud-${width}x${height}-${mode}.png`),Buffer.from(shot.data,'base64'));
   const point=await evaluate(`import('/dist/main.js').then(({ui})=>{const s=ui.hudView.stick.activation,p=s.localToGlobal(new Laya.Point(s.width*.6,s.height*.35));return{x:p.x,y:p.y};})`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:7,...point}]});
   const before=await evaluate(`import('/dist/main.js').then(({ui})=>{ui.auditDamagePanel=ui.damageHUD.panel;return {owner:ui.hudView.stick.stickTouch};})`);
   await new Promise(r=>setTimeout(r,300));
   const refreshed=await evaluate(`import('/dist/main.js').then(({game:g,ui})=>{g.damageRanking.record(90000,'flame');ui.update();return {owner:ui.hudView.stick.stickTouch,stable:ui.damageHUD.panel===ui.auditDamagePanel,text:ui.damageHUD.panel.getChildByName('damage-hud-row-0').text};})`);
   assert.notEqual(before.owner,null);assert.equal(refreshed.owner,before.owner);assert.equal(refreshed.stable,true);assert.match(refreshed.text,/炎炮/);
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const damage=get('damage-hud');
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:damage.x+damage.w/2,y:damage.y+damage.h/2}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await evaluate(`import('/dist/main.js').then(({game})=>game.dialog?.type)`),'damage');
   await evaluate(`import('/dist/main.js').then(({game})=>game.close())`);
  }
 }
 const report={scope:'Real Laya browser HUD at phone portrait/landscape sizes, frozen low-health seal/Boss with toast and combo. Not native iPhone performance.',rows};
 await writeFile(resolve(directory,'hud-audit.json'),JSON.stringify(report,null,2));return report;
}

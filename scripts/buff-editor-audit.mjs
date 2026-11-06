import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function checkBuffEditorAudit({send,evaluate,origin,directory}){
 const rows=[];
 const run=code=>evaluate(`(async()=>{const {game:g,ui}=await import('/dist/main.js');const find=(n,name)=>{if(n.name===name)return n;for(let i=0;i<n.numChildren;i++){const r=find(n.getChildAt(i),name);if(r)return r;}};${code}})()`);
 const tap=async name=>{const p=await run(`const n=find(ui.root,${JSON.stringify(name)}),p=n.localToGlobal(new Laya.Point(n.width*.5,n.height*.5));return {x:p.x,y:p.y};`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',platform:'iPhone'});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [width,height]of [[320,568],[393,852],[568,320],[852,393]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await send('Page.navigate',{url:origin+'/?buff-editor-audit='+width});
  for(let n=0;n<100&&!await evaluate('!!window.Laya?.stage?.getChildByName("game-ui")');n++)await new Promise(r=>setTimeout(r,100));
  const capture=async name=>{
   const row=await run(`ui.update();await new Promise(requestAnimationFrame);const panel=find(ui.root,'dialog-panel'),buttons=[],texts=[];const walk=n=>{const a=n.localToGlobal(new Laya.Point(0,0)),b=n.localToGlobal(new Laya.Point(n.width,n.height));if(n.caption)buttons.push({name:n.name,x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y});if(n.name?.startsWith('buff-')&&typeof n.text==='string')texts.push({name:n.name,text:n.text,y:a.y,h:n.textHeight||0,parentBottom:n.parent.localToGlobal(new Laya.Point(0,n.parent.height)).y});for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i));};walk(panel);const footer=find(ui.root,'buff-close').localToGlobal(new Laya.Point(0,0)).y;return {buttons,texts,footer,cooldowns:[...g.buffs.cooldowns]};`);
   for(const [i,b]of row.buttons.entries()){assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1,`${width} ${name}: bounds ${b.name}`);assert.ok(b.h>=44);for(const a of row.buttons.slice(0,i))assert.equal(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,false,`${width} ${name}: buttons overlap`);}
   for(const t of row.texts)assert.ok(t.y+t.h<=row.footer+1,`${width} ${name}: text ${t.name} overlaps footer`);
   for(const t of row.texts.filter(t=>t.name.startsWith('buff-choice-')))assert.ok(t.y+t.h<=t.parentBottom+1,`${width} ${name}: ${t.name} outside card`);
   for(const t of row.texts.filter(t=>t.name.startsWith('buff-choice-usage-'))){const preview=row.texts.find(p=>p.name==='buff-choice-preview-'+t.name.slice('buff-choice-usage-'.length));assert.ok(t.y+t.h<=preview.y+1,`${width} ${name}: choice usage/preview overlap`);}
   assert.equal(row.cooldowns[0],1.5);rows.push({width,height,name,...row});const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(directory,`buff-editor-${width}x${height}-${name}.png`),Buffer.from(shot.data,'base64'));
  };
  for(const family of ['fire','ice','thunder']){
   await run(`g.start('blade',false,'standard');Laya.timer.clear(g.loop,g.loop.frame);g.buffs.chooseStarter(${JSON.stringify(family)});g.buffs.cooldowns[0]=1.5;ui.buffEditor.page='recipe';ui.buffEditor.slot=0;g.toggleBuffs();ui.update();`);
   await capture(family+'-recipe');await tap('buff-page-links');
   assert.match(await run(`return find(ui.root,'buff-link-'+${JSON.stringify(family)}).text;`),/已搭配/);await capture(family+'-links');
  }
  await tap('buff-page-growth');await capture('growth');await tap('buff-back');await tap('buff-part-element');await capture('picker');
  // A locked choice keeps the recipe and cooldown, and remains in the picker.
  const before=await run('return JSON.stringify(g.buffs.recipes);');await tap('fragment-force');assert.equal(await run('return JSON.stringify(g.buffs.recipes);'),before);assert.match(await run(`return find(ui.root,'buff-picker-status').text;`),/冲击尚未解锁/);await capture('picker-locked');
  await tap('fragment-fire');assert.equal(await run('return g.buffs.recipes[0].element;'),'fire');await capture('picker-installed');
  await tap('buff-part-trigger');await capture('picker-trigger');await tap('buff-back');await tap('buff-part-action');await capture('picker-action');await tap('buff-back');
  await tap('buff-part-element');await tap('fragment-lightning');
  // Exercise a real branch plus mastery; the compact description must still be visible.
  await run(`for(let n=0;n<5&&g.buffs.levelOf(g.buffs.recipes[0])<3;n++)g.buffs.receiveFragment('lightning');g.buffs.takeBranchRequest('bolt/lightning');g.buffs.chooseBranch('charge','bolt/lightning');const pair=g.buffs.mastery.take(240,g.buffs.recipes,r=>g.buffs.levelOf(r));g.buffs.mastery.choose(pair,'tempo');g.flow.refresh();`);
  await capture('branch-mastery');assert.match(await run(`return find(ui.root,'buff-description')?.text||'';`),/蓄雷/);await tap('buff-page-growth');await capture('branch-growth');
  for(const branch of ['shards','prison']){
   await run(`g.start('blade',false,'standard');Laya.timer.clear(g.loop,g.loop.frame);g.buffs.chooseStarter('ice');for(let n=0;n<5&&g.buffs.levelOf(g.buffs.recipes[0])<3;n++)g.buffs.receiveFragment('ice');g.buffs.takeBranchRequest('orbit/ice');if(!g.buffs.chooseBranch(${JSON.stringify(branch)},'orbit/ice'))throw Error('Ice branch setup failed');g.buffs.cooldowns[0]=1.5;ui.buffEditor.page='recipe';ui.buffEditor.slot=0;g.toggleBuffs();ui.update();`);
   await capture(branch+'-recipe');
   assert.match(await run(`return find(ui.root,'buff-description')?.text||'';`),branch==='shards'?/两层/:/35%[\s\S]*55%/);
  }
 }
 const report={scope:'Production Laya, real touch page navigation at four phone sizes. Static compatibility, no native FPS claim.',rows};await writeFile(resolve(directory,'buff-editor-audit.json'),JSON.stringify(report,null,2));return report;
}

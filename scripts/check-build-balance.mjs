import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setupLayaStub} from '../tests/helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const {gear,WEAPONS}=await import('../dist/progression/config.js');
const routes=[['fire','trail'],['fire','furnace'],['ice','shards'],['ice','prison'],['thunder','spread'],['thunder','charge']];
const seeded=value=>()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=')[1];
const branches=arg('branches')?.split(',');
if(branches?.some(branch=>!routes.some(r=>r[1]===branch)))throw Error('Unknown --branches route.');
const seeds=(arg('seeds')||'627,1104').split(',').map(Number);
const weapons=(arg('weapons')||'storm').split(',');
const mode=arg('mode')||'quick';
const mastery=arg('mastery');
if(mastery&&!['power','tempo'].includes(mastery))throw Error('Use --mastery=power or --mastery=tempo.');
if(!['quick','standard'].includes(mode))throw Error('Use --mode=quick or --mode=standard.');
if(seeds.some(s=>!Number.isInteger(s))||weapons.some(w=>!Object.hasOwn(WEAPONS,w)))throw Error('Use integer seeds and weapons storm,flame,blade.');
const protectedRun=!process.argv.includes('--normal');
const legacyContact=process.argv.includes('--legacy-contact');
const rows=[],originalRandom=Math.random;
try{
 for(const weapon of weapons)for(const seed of seeds)for(const [build,branch] of routes){
  if(branches&&!branches.includes(branch))continue;
  setupLayaStub();Math.random=seeded(seed);const g=new Game();g.sound=false;g.runKind=mode;g.autoPlay.start(weapon,protectedRun);
  const events=[],checkpoints=[];let buffDamage=0,bossBuffDamage=0,totalDamage=0,firstBranch=null,maxLevelAt=null,bossStartHP=null,pressureHits=0,protectedHits=0,now=0;
  const peak={enemies:0,shots:0};let lethalContext=null;
  for(const action of ['start','complete']){
   const original=g.mapEventHooks[action];g.mapEventHooks[action]=site=>{events.push({time:+g.time.toFixed(2),type:'seal-'+action,id:site.id});return original(site);};
  }
  const reactions={reforges:0,shatters:0,detonations:0};
  // Share the authoritative effective-damage event and preserve every forwarded argument.
  const record=g.enemyDamageHooks.recordDamage;
  g.enemyDamageHooks.recordDamage=(value,actual,source,enemy)=>{
   totalDamage+=actual;
   if(source && typeof source==='object'){buffDamage+=actual;if(enemy.kind===4)bossBuffDamage+=actual;}
   record(value,actual,source,enemy);
  };
  const killed=g.enemyDamageHooks.killed;g.enemyDamageHooks.killed=(enemy,...args)=>{if(enemy.kind>=3)events.push({time:+g.time.toFixed(2),type:enemy.kind===4?'boss-kill':'elite-kill'});return killed(enemy,...args);};
  const damage=g.buffs.host.damage;g.buffs.host.damage=(...args)=>{if(legacyContact&&args[3]===true)args[2]=true;damage(...args);};
  const burst=g.buffs.evolutions.hooks.burst;g.buffs.evolutions.hooks.burst=(kind,...args)=>{reactions[kind==='shatter'?'shatters':'detonations']++;burst(kind,...args);};
  const hurt=g.hurt.bind(g);g.hurt=value=>{if(g.player.inv<=0&&g.mode==='battle'){pressureHits++;if(Math.max(1,Math.round(value*(1-g.stats.reduction)))>=g.player.hp){protectedHits++;lethalContext={time:+g.time.toFixed(2),hp:g.player.hp,maxHP:g.stats.hp,damage:value,reduction:g.stats.reduction,enemies:g.enemies.length,shots:g.shots.length,site:g.mapEvents.active()?.id||null};}}hurt(value);};
  const claim=g.claimReward.bind(g);g.claimReward=(token,choice)=>{
   const d=g.dialog;if(!d)return false;
   if(d.type==='build')choice={type:'build',id:build};
   if(d.type==='branch')choice={type:'branch',id:d.choices.includes(branch)?branch:d.choices[0]};
   if(d.type==='mastery'&&mastery)choice={type:'mastery',id:mastery};
   if(d.type==='fragment'){
    const sorted=[...d.choices].sort((a,b)=>{
     const score=id=>{const p=g.buffs.upgradePreview(id);return p?(p.slot===0?20:10)-p.level:0;};return score(b)-score(a);
    });choice={type:'fragment',id:sorted[0]};
   }
   // Keep the initial weapon: this comparison measures the same weapon for every build.
   if(d.type==='drop'&&gear(d.item).slot==='weapon')choice={type:'drop',accept:d.item.id===weapon};
   const hpBefore=g.player.hp,ok=claim(token,choice);
   if(ok&&choice.type==='event')events.push({time:+g.time.toFixed(2),type:'seal-reward',id:choice.id,healed:g.player.hp-hpBefore});
   if(ok&&['build','branch','fragment','mastery'].includes(choice.type))events.push({time:+g.time.toFixed(2),type:choice.type,id:choice.id,pair:d.pair});
   if(ok&&choice.type==='branch'&&firstBranch===null)firstBranch=+g.time.toFixed(2);
   return ok;
  };
  let nextCheckpoint=60;
  for(let step=0;step<65000&&g.dialog?.type!=='result';step++){
   now+=1000/60;g.autoPlay.frame(now);
   if(g.mode!=='battle'||g.gate.paused)continue;
   g.update(1/60);
   peak.enemies=Math.max(peak.enemies,g.enemies.length);peak.shots=Math.max(peak.shots,g.shots.length);
   const level=g.buffs.levelOf(g.buffs.recipes[0]);
   if(level===5&&maxLevelAt===null)maxLevelAt=+g.time.toFixed(2);
   reactions.reforges=g.buffs.reforges;
   const boss=g.enemies.find(e=>e.kind===4&&!e.dead);if(boss&&bossStartHP===null)bossStartHP=boss.max;
   if(g.time>=nextCheckpoint){checkpoints.push({time:nextCheckpoint,hp:g.player.hp,maxHP:g.stats.hp,enemies:g.enemies.length,shots:g.shots.length,pressureHits,protectedHits,kills:g.kills,level:g.level,buffLevel:level,buffDamage:Math.round(buffDamage),procs:g.buffs.procs,...reactions});nextCheckpoint+=60;}
  }
  const boss=g.enemies.find(e=>e.kind===4);
  const balance=g.autoPlay.balanceReport();
  assert.ok(Math.abs(balance.damage.total-totalDamage)<.001,'Damage script must agree with the runtime ledger.');
  assert.ok(Math.abs(balance.damage.buff-buffDamage)<.001,'Buff damage must agree with the runtime ledger.');
  assert.ok(Math.abs(balance.boss.damage.buff-bossBuffDamage)<.001,'Boss Buff damage must agree with the runtime ledger.');
  assert.equal(balance.combat.hitsTaken,pressureHits,'Hurt event count must agree.');
  rows.push({weapon,seed,build,branch,mode,balance:g.autoPlay.balanceReport(),peak,lethalContext,seals:g.mapEvents.sites.map(s=>({id:s.id,state:s.state,progress:+s.progress.toFixed(2)})),protected:protectedRun,seconds:+g.time.toFixed(2),win:g.dialog?.win||false,kills:g.kills,firstBranch,maxLevelAt,buffLevel:g.buffs.levelOf(g.buffs.recipes[0]),buffDamage:Math.round(buffDamage),totalDamage:Math.round(totalDamage),bossBuffDamage:Math.round(bossBuffDamage),bossRemaining:boss?+Math.max(0,boss.hp).toFixed(1):null,bossStartHP,pressureHits,protectedHits,procs:g.buffs.procs,...reactions,checkpoints,events});
  console.log(JSON.stringify(rows.at(-1)));g.autoPlay.stop();g.returnToTitle();
 }
}finally{Math.random=originalRandom;}
await mkdir('artifacts',{recursive:true});
await writeFile(arg('out')||'artifacts/build-balance.json',JSON.stringify({schema:2,version:JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8')).version,legacyContact,kind:'Seeded Node logic, real rewards and build-aware autopilot; NOT human balance, survival rate, WebGL or native performance. Damage uses the shared effective-HP ledger, including per-source Boss damage; reaction totals survive Boss clearing. Protected runs count lethal exposures rather than die. Divergent combats consume different RNG sequences.',rows},null,2));

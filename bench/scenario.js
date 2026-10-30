import {resolveStats} from '../dist/shared/model.js';
import {UPGRADES} from '../dist/progression/config.js';
export function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function scenario(g,count,weapon){
  g.start(weapon,true);g.sound=false;g.time=270;g.level=30;g.spawnTimer=1e9;g.nextSurge=1e9;g.eliteIndex=4;g.attackTimer=0;
  g.levels=Object.fromEntries(UPGRADES.map(u=>[u.id,u.max]));g.loadout={weapon:{id:weapon,quality:2},head:{id:'visor',quality:2},armor:{id:'energy',quality:2},back:{id:'pack',quality:2}};g.stats=resolveStats(g.loadout,g.levels);
  for(const e of g.enemies)g.release(e.node);g.enemies=[];g.spawnEnemy(0);const template=g.enemies.pop();g.release(template.node);
  for(let i=0;i<count;i++){
    const a=i*2.399963229728653,r=100+Math.sqrt((i+.5)/count)*520,node=g.acquire(),kind=i%10<5?0:i%10<8?1:2;
    const e={...template,x:Math.cos(a)*r,y:Math.sin(a)*r,hp:1e6,max:1e6+1,kind,radius:[16,18,20][kind],speed:[125,104,145][kind],damage:35,cooldown:.2+(i%20)*.06,node};g.enemies.push(e);g.paintEnemy(e);
  }
  for(let i=0;i<170;i++)g.dropXP(700+(i%15)*10,700+Math.floor(i/15)*10,1);
  for(let i=0;i<208;i++){const a=i/208*Math.PI*2;g.shoot(Math.cos(a)*550,Math.sin(a)*550,-Math.cos(a)*100,-Math.sin(a)*100,35,true,'#c99bef');}
  g.grid.rebuild(g.enemies);g.render();
}
export function summary(values){const sorted=[...values].sort((a,b)=>a-b);return {mean:round(values.reduce((s,v)=>s+v,0)/values.length),p50:round(sorted[Math.floor(sorted.length*.5)]),p95:round(sorted[Math.floor(sorted.length*.95)]),max:round(sorted.at(-1))};}
const round=n=>Math.round(n*1000)/1000;

export function enableBuffs(g){
  for(const id of ['orbit','field','lightning'])g.buffs.grant(id);
  for(const [slot,action,element]of [[0,'field','lightning'],[1,'orbit','fire']]){g.buffs.install(slot,'trigger','hit');g.buffs.install(slot,'action',action);g.buffs.install(slot,'element',element);}
}

/** 进化专项压测：两槽轮换三种进化，保留真实命中概率/冷却，不手动塞入伤害事件。 */
export function enableEvolutions(g,weapon){
  for(const id of ['bolt','field','orbit','lightning','ice'])g.buffs.grant(id);
  const pairs={storm:[['bolt','lightning'],['field','fire']],flame:[['field','fire'],['orbit','ice']],blade:[['orbit','ice'],['bolt','lightning']]}[weapon];
  pairs.forEach(([action,element],slot)=>{g.buffs.install(slot,'trigger','hit');g.buffs.install(slot,'action',action);g.buffs.install(slot,'element',element);});
}

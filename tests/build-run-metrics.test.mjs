import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {BuildRunMetrics}=await import('../dist/game/build-run-metrics.js');
const {DamageRanking}=await import('../dist/combat/damage-ranking.js');
const {Game}=await import('../dist/game/game.js');

test('growth milestones are first observations, missing events stay null; Boss kill time is not exposure time',()=>{
 const m=new BuildRunMetrics(),r=new DamageRanking();
 assert.equal(m.snapshot(500,r).boss.killSeconds,null);assert.equal(m.snapshot(500,r).boss.appearedAt,null);
 m.observe(20,true,false,false,false);m.observe(30,true,true,false,true);m.observe(70,true,true,true,true);
 assert.deepEqual(m.snapshot(80,r).growth,{firstBuildAt:20,firstBranchAt:30,firstMaxLevelAt:70,firstEvolutionAt:30});
 m.bossAppearedAt=300;assert.equal(m.snapshot(350,r).boss.killSeconds,null);assert.equal(m.snapshot(350,r).boss.observedSeconds,50);
 m.bossKilledAt=360;assert.equal(m.snapshot(500,r).boss.killSeconds,60);assert.equal(m.snapshot(500,r).boss.observedSeconds,60);
});

test('automatic combat records actual HP, counts stress lethal exposures even at one HP, skips invulnerability/training',()=>{
 const g=new Game();g.autoPlay.start('storm',true);g.player.hp=10;g.player.inv=0;
 g.hurt(1000);g.hurt(1000);g.player.inv=0;g.hurt(1000);
 let p=g.autoPlay.balanceReport();assert.deepEqual(p.combat,{hitsTaken:2,damageTaken:9,lethalExposures:2});
 g.training=true;g.player.inv=0;g.hurt(1000);assert.deepEqual(g.autoPlay.balanceReport().combat,p.combat);
 g.autoPlay.start('storm',false);g.player.hp=10;g.player.inv=0;g.hurt(1000);
 p=g.autoPlay.balanceReport();assert.deepEqual(p.combat,{hitsTaken:1,damageTaken:10,lethalExposures:1});
});

test('real Boss spawn and killing events share effective source damage, with isolated metrics on restart',()=>{
 const g=new Game();g.autoPlay.start('storm',true);g.time=g.run.bossAt-1/60;g.update(1/60);
 let boss=g.enemies.find(e=>e.kind===4);assert.ok(boss);const appeared=g.autoPlay.metrics.bossAppearedAt;
 assert.ok(Math.abs(appeared-g.run.bossAt)<.001);
 boss.hp=20;g.time+=10;g.hit(boss,5,{source:'storm',impact:false});g.hit(boss,999,{source:{kind:'blast',element:'fire'},triggerBuffs:false});
 let p=g.autoPlay.balanceReport();assert.equal(p.damage.total,20);assert.equal(p.boss.damage.total,20);assert.equal(p.boss.damage.buff,15);assert.equal(p.boss.killSeconds,10);
 assert.deepEqual(p.boss.damage.sources.map(s=>[s.id,s.damage]),[['blast/fire',15],['storm',5]]);
 g.time+=50;assert.equal(g.autoPlay.balanceReport().boss.killSeconds,10);
 g.autoPlay.start('blade',false);p=g.autoPlay.balanceReport();assert.equal(p.boss.appearedAt,null);assert.equal(p.damage.total,0);assert.equal(p.boss.damage.total,0);
});

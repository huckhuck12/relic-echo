import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';

const files=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'artifacts/build-balance-summary.json';
if(!files.length)throw Error('Pass balance JSON reports and optional --out=path.');
const reports=await Promise.all(files.map(f=>readFile(f,'utf8').then(JSON.parse)));
assert.ok(reports.every(r=>r.schema===2),'Use schema 2 balance reports.');
assert.equal(new Set(reports.map(r=>r.version)).size,1,'Do not merge different versions.');
const median=values=>{const a=values.filter(v=>v!==null&&v!==undefined).sort((a,b)=>a-b);return a.length?+((a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2).toFixed(2):null;};
const rows=reports.flatMap(r=>r.rows),groups=new Map(),seen=new Set();
for(const row of rows){
 const id=[row.mode,row.protected,row.weapon,row.seed,row.branch].join('/');assert.ok(!seen.has(id),'Duplicate run: '+id);seen.add(id);
 const b=row.balance;
 for(const ledger of [b.damage,b.boss.damage]){
  assert.ok(Math.abs(ledger.sources.reduce((n,s)=>n+s.damage,0)-ledger.total)<.001,'Source totals disagree.');
  assert.ok(Math.abs(ledger.sources.filter(s=>s.id.includes('/')).reduce((n,s)=>n+s.damage,0)-ledger.buff)<.001,'Buff totals disagree.');
 }
 assert.ok(Math.abs(b.damage.total-row.totalDamage)<=.51,'Legacy and runtime total disagree.');
 assert.ok(Math.abs(b.damage.buff-row.buffDamage)<=.51,'Legacy and runtime Buff total disagree.');
 assert.equal(b.combat.hitsTaken,row.pressureHits);assert.equal(b.combat.lethalExposures,row.protectedHits);
 const key=[row.mode,row.protected,row.branch].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
}
const summary=[...groups.values()].map(r=>({
 mode:r[0].mode,protected:r[0].protected,branch:r[0].branch,runs:r.length,
 reachedBoss:r.filter(x=>x.balance.boss.appearedAt!==null).length,
 killedBoss:r.filter(x=>x.balance.boss.killSeconds!==null).length,
 evolutionObserved:r.filter(x=>x.balance.growth.firstEvolutionAt!==null).length,
 medianSeconds:median(r.map(x=>x.seconds)),medianBranchAt:median(r.map(x=>x.balance.growth.firstBranchAt)),
 medianMaxLevelAt:median(r.map(x=>x.balance.growth.firstMaxLevelAt)),
 medianEvolutionAt:median(r.map(x=>x.balance.growth.firstEvolutionAt)),
 medianBuffPercent:median(r.map(x=>x.balance.damage.buffShare*100)),
 medianBossKillSeconds:median(r.map(x=>x.balance.boss.killSeconds)),
 medianHits:median(r.map(x=>x.balance.combat.hitsTaken)),medianLethalExposures:median(r.map(x=>x.balance.combat.lethalExposures)),
}));
const compact=rows.map(r=>({weapon:r.weapon,seed:r.seed,build:r.build,branch:r.branch,mode:r.mode,protected:r.protected,seconds:r.seconds,win:r.win,kills:r.kills,reforges:r.reforges,shatters:r.shatters,detonations:r.detonations,balance:r.balance}));
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({schema:1,version:reports[0].version,scope:'Seeded Node logic with normal rewards and autopilot, not human survival rate or device performance. Missing milestones and uncompleted Boss kills stay null. Evolution times are first observations at the 150ms decision interval; fire links count when formed. Branch/max-level milestones refer to any active pair.',summary,rows:compact},null,2));
console.log('| 模式 | 分支 | 局数 | 到达/击杀 Boss | 进化出现 | Buff 伤害中位占比 | 分支中位时间 | 击杀中位耗时 |');
console.log('|---|---|---:|---|---|---:|---:|---:|');
for(const r of summary)console.log(`| ${r.protected?'保命':'正常'} | ${r.branch} | ${r.runs} | ${r.reachedBoss}/${r.killedBoss} | ${r.evolutionObserved}/${r.runs} | ${r.medianBuffPercent}% | ${r.medianBranchAt??'—'}s | ${r.medianBossKillSeconds??'—'} |`);

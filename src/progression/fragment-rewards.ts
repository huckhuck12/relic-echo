import { FRAGMENTS, fragment } from '../buffs/buffs.js';
import { EVOLUTIONS } from '../buffs/buff-evolutions.js';
import type { FragmentReward } from '../buffs/buffs.js';
import type { BuffUpgradeTarget } from '../buffs/buff-upgrades.js';
import { BUFF_UPGRADES } from '../buffs/buff-upgrades.js';
/** 首精英候选只在弹窗真正打开时生成；不冻结排队期间可能已经拾取的碎片状态。
 * 优先补齐进化，其次推进未完成路线；同分随机，地上已有的碎片排在同分项之后。
 * 未解锁不足三种时只显示剩余种类；全部解锁后优先提供可强化的重复碎片。
 */
export function fragmentChoices(owned: ReadonlySet<string>, ground: ReadonlySet<string> = new Set(), random = Math.random, upgradable: ReadonlySet<string> = new Set()): string[] {
    const missing = FRAGMENTS.filter(f => !owned.has(f.id));
    const pool = missing.length ? missing : FRAGMENTS;
    return pool.map(f => {
        const routes = EVOLUTIONS.filter(e => e.action === f.id || e.element === f.id);
        const score = owned.has(f.id) ? (upgradable.has(f.id) ? 3 : 0) : routes.reduce((best, e) => Math.max(best, owned.has(e.action === f.id ? e.element : e.action) ? 2 : 1), 0);
        return { id: f.id, score, ground: ground.has(f.id) ? 1 : 0, tie: random() };
    }).sort((a, b) => b.score - a.score || a.ground - b.ground || a.tie - b.tie).slice(0, 3).map(f => f.id);
}
/** 说明以当前持有集合为准，明确“解锁可组合”和“已经装入配方”的区别。 */
export function fragmentRouteHint(id: string, owned: ReadonlySet<string>, upgrade?: BuffUpgradeTarget | null): string {
    if (owned.has(id))
        return upgrade ? `强化配方 ${upgrade.slot + 1}：Lv.${upgrade.level} → ${upgrade.nextLevel}\n每级伤害 +${BUFF_UPGRADES.damagePerLevel * 100}%` : '已解锁：领取转为 5 经验';
    const routes = EVOLUTIONS.filter(e => e.action === id || e.element === id);
    if (!routes.length)
        return '改变释放时机，可搭配三条进化路线';
    return routes.map(e => {
        const other = e.action === id ? e.element : e.action;
        return `${e.name}：${owned.has(other) ? '可组合' : '还缺' + fragment(other)!.name}`;
    }).join('\n');
}
/** 地面拾取和首精英选卡共用文案与结算结果，避免两个入口给出不同规则。 */
export function fragmentRewardText(id: string, reward: FragmentReward): string {
    if (reward.kind === 'unlock')
        return `解锁 ${fragment(id)!.name} 碎片 · 按 B / Buff 组合装入配方`;
    if (reward.kind === 'upgrade')
        return `配方 ${reward.slot + 1} 升至 Lv.${reward.level} · 伤害 +${Math.round((reward.level - 1) * BUFF_UPGRADES.damagePerLevel * 100)}%`;
    return '重复碎片无可强化配方 · 转为 5 经验';
}

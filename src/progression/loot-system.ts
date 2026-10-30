import { FRAGMENTS } from '../buffs/buffs.js';
import { fragmentRewardText } from './fragment-rewards.js';
import type { BuffRuntime } from '../buffs/buffs.js';
import { COMBAT, QUALITY_COLOR, gear } from './config.js';
import type { Item } from './config.js';
import { salvage } from '../shared/model.js';
import type { Loadout, Stats } from '../shared/model.js';
import { drawShapes } from '../rendering/appearance.js';
import { experienceShapes, chestShapes, fragmentShapes } from '../rendering/loot-presentation.js';
import type { Player, Enemy, Drop } from '../shared/entities.js';
import type { Dialog } from '../game/run-flow.js';
/**
 * 每次调用传入本局状态，不在模块内缓存玩家或掉落数组。
 * 生成操作原地追加；updateDrops 筛选后替换 drops，调用方必须写回。
 * 坐标为世界坐标，dt 为秒；本模块不扣升级经验，也不直接操作暂停状态。
 */
export interface LootState {
    drops: Drop[];
    player: Player;
    loadout: Loadout;
    stats: Stats;
    buffs: Pick<BuffRuntime<Enemy>, 'owned' | 'receiveFragment'>;
}
/** 经验与奖励由编排层即时结算，弹窗进入 RunFlow 队列；音效节流仍归 Game。 */
export interface LootHooks {
    acquire(): any;
    release(node: any): void;
    addXP(amount: number): void;
    show(dialog: NonNullable<Dialog>): void;
    onToast(message: string): void;
    onChange(): void;
    pickupSound(): void;
}
/** 150 个起合并正经验，170 个为硬上限；负经验代表治疗，不参与合并。 */
export function dropXP(state: LootState, hooks: LootHooks, x: number, y: number, xp: number): void {
    if (state.drops.length >= 150 && xp > 0) {
        const existing = state.drops.find(d => !d.item && !d.fragment && d.xp > 0);
        if (existing) {
            existing.xp += xp;
            return;
        }
    }
    if (state.drops.length >= 170)
        return;
    const node = hooks.acquire();
    drawShapes(node.graphics, experienceShapes(xp < 0));
    state.drops.push({
        x, y, xp, collecting: false, node
    });
}
/** 给装备/碎片腾位置时合并正经验，不为特殊掉落静默丢弃已获得的经验价值。 */
export function makeDropRoom(state: LootState, hooks: LootHooks): boolean {
    if (state.drops.length >= 170) {
        const index = state.drops.findIndex(d => !d.item && !d.fragment);
        if (index < 0)
            return false;
        const old = state.drops[index];
        if (old.xp > 0) {
            const other = state.drops.find(d => d !== old && !d.item && !d.fragment && d.xp > 0);
            if (other)
                other.xp += old.xp;
            else
                hooks.addXP(old.xp);
        }
        hooks.release(old.node);
        state.drops.splice(index, 1);
    }
    return true;
}
/** 优先选择未解锁且地上没有的碎片；先确认容量，再消费一次随机数。 */
export function dropFragment(state: LootState, hooks: LootHooks, x: number, y: number): void {
    if (!makeDropRoom(state, hooks))
        return;
    const missing = FRAGMENTS.filter(f => !state.buffs.owned.has(f.id) && !state.drops.some(d => d.fragment === f.id)), pool = missing.length ? missing : FRAGMENTS, id = pool[Math.floor(Math.random() * pool.length)].id;
    const node = hooks.acquire();
    drawShapes(node.graphics, fragmentShapes());
    state.drops.push({
        x, y, xp: 0, collecting: false, fragment: id, node
    });
}
/** 特殊掉落优先腾位；全部为特殊掉落时拒绝生成，避免无限增长。 */
export function dropGear(state: LootState, hooks: LootHooks, x: number, y: number, item: Item): void {
    if (!makeDropRoom(state, hooks))
        return;
    const node = hooks.acquire();
    const color = QUALITY_COLOR[item.quality];
    drawShapes(node.graphics, chestShapes(color));
    state.drops.push({
        x, y, xp: 0, collecting: false, item, node
    });
}
/** 普通经验/碎片吸取后持续追踪；装备近身才比较，重复低品直接分解不弹窗。 */
export function updateDrops(state: LootState, hooks: LootHooks, dt: number): void {
    const p = state.player;
    state.drops = state.drops.filter(d => {
        const dx = p.x - d.x, dy = p.y - d.y, distance = Math.hypot(dx, dy);
        if (!d.item && distance < COMBAT.pickup * (1 + state.stats.pickup))
            d.collecting = true;
        if (d.collecting && distance > 22) {
            const step = Math.min(distance, 650 * dt);
            d.x += dx / distance * step;
            d.y += dy / distance * step;
        }
        if (distance < (d.item ? 40 : 24)) {
            if (d.item) {
                const old = state.loadout[gear(d.item).slot];
                if (old?.id === d.item.id && old.quality >= d.item.quality) {
                    hooks.addXP(salvage(d.item.quality));
                    hooks.onToast('重复装备已自动分解为经验');
                }
                else
                    hooks.show({ type: 'drop', item: d.item });
            }
            else if (d.fragment) {
                const reward = state.buffs.receiveFragment(d.fragment);
                if (reward.kind === 'xp')
                    hooks.addXP(reward.amount);
                hooks.onToast(fragmentRewardText(d.fragment, reward));
                hooks.onChange();
            }
            else if (d.xp < 0)
                p.hp = Math.min(state.stats.hp, p.hp - d.xp);
            else
                hooks.addXP(d.xp);
            hooks.pickupSound();
            hooks.release(d.node);
            return false;
        }
        return true;
    });
}

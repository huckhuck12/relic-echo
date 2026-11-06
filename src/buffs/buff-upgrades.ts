import { branchPair } from './buff-branches.js';
import type { BuffBranch, Recipe } from './buff-types.js';
export const BUFF_UPGRADES = { maxLevel: 5, damagePerLevel: .35 } as const;
export interface BuffUpgradeTarget {
    slot: number;
    level: number;
    nextLevel: number;
    progress?: number;
    required?: number;
}
/** 以行为＋元素为键记录本局等级，至多 4×4 项。
 * 换槽/清空不抹掉投入，也不能把等级转移到其他配方；无节点、随机数或逐帧工作。
 */
export class BuffUpgrades {
    readonly branches = new Map<string, BuffBranch>();
    private readonly levels = new Map<string, number>();
    private readonly progress = new Map<string, number>();
    gradual = false;
    private key(r: Recipe): string | null { return r.trigger && r.action && r.element ? `${r.action}/${r.element}` : null; }
    level(r: Recipe): number {
        const key = this.key(r);
        return key ? this.levels.get(key) || 1 : 1;
    }
    growth(r: Recipe): {
        progress: number;
        required: number;
        nextLevel: number;
    } | null {
        const key = this.key(r), level = this.level(r);
        return this.gradual && key && level < BUFF_UPGRADES.maxLevel ? { progress: this.progress.get(key) || 0, required: level, nextLevel: level + 1 } : null;
    }
    clear(): void {
        this.levels.clear();
        this.progress.clear();
        this.branches.clear();
    }
    /** 一片只升一种组合一次；同配方放双槽共享等级，按最低等级、槽序稳定选择。 */
    target(id: string, recipes: readonly Recipe[]): BuffUpgradeTarget | null {
        let best: BuffUpgradeTarget | null = null;
        recipes.forEach((r, slot) => {
            if (!this.key(r) || ![r.trigger, r.action, r.element].some(part => part === id))
                return;
            const level = this.level(r);
            const pair = branchPair(r);
            if (pair && level >= 4 && !this.branches.has(pair.pair))
                return;
            if (level >= BUFF_UPGRADES.maxLevel || best && best.level <= level)
                return;
            best = { slot, level, nextLevel: level + 1, ...(this.gradual ? { progress: this.progress.get(this.key(r)!) || 0, required: level } : {}) };
        });
        return best;
    }
    apply(id: string, recipes: readonly Recipe[]): BuffUpgradeTarget | null {
        const target = this.target(id, recipes);
        if (target) {
            const key = this.key(recipes[target.slot])!;
            if (this.gradual && (target.progress || 0) + 1 < target.required!) {
                target.progress = (target.progress || 0) + 1;
                this.progress.set(key, target.progress);
            }
            else {
                this.levels.set(key, target.nextLevel);
                this.progress.delete(key);
                target.progress = undefined;
            }
        }
        return target;
    }
}
/** 伤害在 Lv.2/4 增长，Lv.3/5 留给机制分支。 */
export function buffLevelMultiplier(level: number): number {
    return 1 + Math.floor((Math.max(1, Math.min(BUFF_UPGRADES.maxLevel, Math.floor(level)))) / 2) * BUFF_UPGRADES.damagePerLevel;
}

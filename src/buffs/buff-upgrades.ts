import type { Recipe } from './buff-types.js';
export const BUFF_UPGRADES = { maxLevel: 5, damagePerLevel: .2 } as const;
export interface BuffUpgradeTarget {
    slot: number;
    level: number;
    nextLevel: number;
}
/** 以完整三片组合为键记录本局等级，至多 4×4×4 项。
 * 换槽/清空不抹掉投入，也不能把等级转移到其他配方；无节点、随机数或逐帧工作。
 */
export class BuffUpgrades {
    private readonly levels = new Map<string, number>();
    private key(r: Recipe): string | null { return r.trigger && r.action && r.element ? `${r.trigger}/${r.action}/${r.element}` : null; }
    level(r: Recipe): number {
        const key = this.key(r);
        return key ? this.levels.get(key) || 1 : 1;
    }
    clear(): void { this.levels.clear(); }
    /** 一片只升一种组合一次；同配方放双槽共享等级，按最低等级、槽序稳定选择。 */
    target(id: string, recipes: readonly Recipe[]): BuffUpgradeTarget | null {
        let best: BuffUpgradeTarget | null = null;
        recipes.forEach((r, slot) => {
            if (!this.key(r) || ![r.trigger, r.action, r.element].some(part => part === id))
                return;
            const level = this.level(r);
            if (level >= BUFF_UPGRADES.maxLevel || best && best.level <= level)
                return;
            best = { slot, level, nextLevel: level + 1 };
        });
        return best;
    }
    apply(id: string, recipes: readonly Recipe[]): BuffUpgradeTarget | null {
        const target = this.target(id, recipes);
        if (target)
            this.levels.set(this.key(recipes[target.slot])!, target.nextLevel);
        return target;
    }
}
/** 等级只放大伤害快照，不增加命中次数、范围、对象数或降低冷却。 */
export function buffLevelMultiplier(level: number): number {
    return 1 + (Math.max(1, Math.min(BUFF_UPGRADES.maxLevel, Math.floor(level))) - 1) * BUFF_UPGRADES.damagePerLevel;
}

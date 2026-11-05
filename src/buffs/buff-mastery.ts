import type { Recipe } from './buff-types.js';
export const MASTERY = {
    power: {
        name: '凝聚回响', brief: '伤害 +30% / 冷却 +25%', note: '此配方单次伤害 +30%，触发冷却 +25%。适合集中爆发。', damage: 1.3, cooldown: 1.25
    },
    tempo: {
        name: '疾奏回响', brief: '伤害 -20% / 冷却 -20%', note: '此配方触发冷却 -20%，单次伤害 -20%。更频繁地施加状态。', damage: .8, cooldown: .8
    }
} as const;
export type Mastery = keyof typeof MASTERY;
export const masteryKey = (recipe: Recipe): string | null => recipe.trigger && recipe.action && recipe.element ? `${recipe.action}/${recipe.element}` : null;
/** At most two pair-bound choices per standard run; editing trigger/slot cannot duplicate them. */
export class BuffMastery {
    readonly choices = new Map<string, Mastery>();
    private readonly pending = new Set<string>();
    reset(): void {
        this.choices.clear();
        this.pending.clear();
    }
    take(time: number, recipes: readonly Recipe[], level: (r: Recipe) => number): string | null {
        const count = this.choices.size + this.pending.size;
        if (count >= 2 || time < (count === 0 ? 240 : 420))
            return null;
        for (const recipe of recipes) {
            const key = masteryKey(recipe);
            if (key && level(recipe) >= 3 && !this.choices.has(key) && !this.pending.has(key)) {
                this.pending.add(key);
                return key;
            }
        }
        return null;
    }
    choose(pair: string, id: string): boolean {
        if (!Object.prototype.hasOwnProperty.call(MASTERY, id) || !this.pending.delete(pair))
            return false;
        this.choices.set(pair, id as Mastery);
        return true;
    }
    of(recipe: Recipe): Mastery | undefined { return this.choices.get(masteryKey(recipe) || ''); }
}

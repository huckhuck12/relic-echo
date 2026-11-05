import { ACTIONS, ELEMENTS } from '../buffs/buff-config.js';
import type { Action, Element } from '../buffs/buff-config.js';
export type BuffDamageSource = {
    kind: Action;
    element: Element;
};
export type DamageSource = 'storm' | 'blade' | 'flame' | 'thorns' | BuffDamageSource;
export interface DamageRow {
    id: string;
    name: string;
    damage: number;
    share: number;
}
/** Fixed catalog: no per-hit history, timers, display nodes or current-loadout lookup. */
export class DamageRanking {
    private totals = new Map<string, number>();
    reset(): void { this.totals.clear(); }
    record(value: number, source?: DamageSource): void {
        if (!Number.isFinite(value) || value <= 0)
            return;
        const id = typeof source === 'object' ? `${source.kind}/${source.element}` : source || 'other';
        this.totals.set(id, (this.totals.get(id) || 0) + value);
    }
    get total(): number {
        let total = 0;
        for (const value of this.totals.values())
            total += value;
        return total;
    }
    rows(): DamageRow[] {
        const names: Record<string, string> = {
            storm: '武器 · 雷杖', flame: '武器 · 炎炮', blade: '武器 · 环刃', thorns: '装备反伤', other: '其他伤害'
        };
        const total = this.total;
        return [...this.totals].map(([id, damage]) => {
            const [kind, element] = id.split('/');
            return { id, damage, share: damage / total, name: names[id] || `${ELEMENTS.find(e => e.id === element)?.name} · ${ACTIONS.find(a => a.id === kind)?.name}` };
        }).sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));
    }
}

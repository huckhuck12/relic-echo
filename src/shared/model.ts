import { Bonuses, GEARS, Item, Quality, Slot, SLOTS, UPGRADES, Weapon, gear, multiplier } from '../progression/config.js';
import { RUN } from '../game/pace.js';
export interface Stats {
    hp: number;
    damage: number;
    element: number;
    speed: number;
    attackSpeed: number;
    crit: number;
    reduction: number;
    dash: number;
    pickup: number;
}
export type Loadout = Record<Slot, Item | null>;
export const emptyLoadout = (weapon: Weapon): Loadout => ({ weapon: { id: weapon, quality: 0 }, head: null, armor: null, back: null });
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
/** 从装备/升级重新汇总属性；负面属性不受品质放大，最后应用速度/减伤等上限。 */
export function resolveStats(loadout: Loadout, levels: Record<string, number>): Stats {
    const s: Stats = {
        hp: 100, damage: 0, element: 0, speed: 0, attackSpeed: 0, crit: .05, reduction: 0, dash: 0, pickup: 0
    };
    const add = (bonus: Bonuses, mult: number) => {
        for (const [key, value] of Object.entries(bonus))
            s[key as keyof Stats] += value! * (value! < 0 ? 1 : mult);
    };
    for (const slot of SLOTS) {
        const item = loadout[slot];
        if (item)
            add(gear(item).bonus, multiplier(item.quality));
    }
    for (const upgrade of UPGRADES)
        if (upgrade.bonus)
            add(upgrade.bonus, levels[upgrade.id] || 0);
    s.speed = clamp(s.speed, -.5, .5);
    s.attackSpeed = clamp(s.attackSpeed, 0, 1);
    s.reduction = clamp(s.reduction, 0, .6);
    s.crit = clamp(s.crit, 0, 1);
    return s;
}
/** 返回新装备表、截断后的当前生命及旧装备分解经验，不直接改变外部状态。 */
export function equip(loadout: Loadout, item: Item, hp: number, levels: Record<string, number>): {
    loadout: Loadout;
    hp: number;
    xp: number;
} {
    const slot = gear(item).slot, old = loadout[slot];
    const next = { ...loadout, [slot]: { ...item } };
    return { loadout: next, hp: Math.min(hp, resolveStats(next, levels).hp), xp: old ? salvage(old.quality) : 0 };
}
export const salvage = (q: Quality): number => [5, 10, 20][q];
export const nextXP = (level: number): number => 10 + 4 * (level - 1);
export const project = (x: number, y: number): {
    x: number;
    y: number;
} => ({ x: (x - y) * .7071, y: (x + y) * .3536 });
export const unproject = (x: number, y: number): {
    x: number;
    y: number;
} => ({ x: x / (2 * .7071) + y / (2 * .3536), y: y / (2 * .3536) - x / (2 * .7071) });
export function screenInput(x: number, y: number): {
    x: number;
    y: number;
} {
    const a = x / (2 * .7071) + y / (2 * .3536), b = y / (2 * .3536) - x / (2 * .7071), len = Math.hypot(a, b);
    return len ? { x: a / len, y: b / len } : { x: 0, y: 0 };
}
export function candidates(levels: Record<string, number>, weapon: Weapon, random = Math.random): string[] {
    const pool = UPGRADES.filter(u => (levels[u.id] || 0) < u.max && (!u.weapon || u.weapon === weapon)).map(u => u.id);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.length ? pool.slice(0, 3) : ['heal'];
}
export function rollItem(time: number, loadout: Loadout, guaranteedEmpty = false, random = Math.random): Item {
    const pool = guaranteedEmpty ? GEARS.filter(g => g.slot !== 'weapon' && !loadout[g.slot]) : GEARS;
    const chosen = (pool.length ? pool : GEARS)[Math.floor(random() * (pool.length || GEARS.length))];
    const r = random(), quality: Quality = time >= RUN.qualityAt ? (r < .45 ? 0 : r < .85 ? 1 : 2) : (r < .7 ? 0 : r < .95 ? 1 : 2);
    return { id: chosen.id, quality };
}
export class PauseGate {
    private reasons = new Set<string>();
    add(reason: string): void { this.reasons.add(reason); }
    remove(reason: string): void { this.reasons.delete(reason); }
    clear(): void { this.reasons.clear(); }
    get paused(): boolean { return this.reasons.size > 0; }
}
/** 复用桶数组的空间网格；查询只遍历相交网格，不能替换成每帧全敌人扫描。
 * nearest 同距时保留先遇到的对象，以稳定技能选敌和固定种子回归。
 */
export class SpatialGrid<T extends {
    x: number;
    y: number;
}> {
    private cells = new Map<string, T[]>();
    private buckets: T[][] = [];
    constructor(private size = 120) { }
    rebuild(items: T[]): void {
        for (const cell of this.cells.values()) {
            cell.length = 0;
            this.buckets.push(cell);
        }
        this.cells.clear();
        for (const item of items) {
            const key = `${Math.floor(item.x / this.size)},${Math.floor(item.y / this.size)}`;
            let cell = this.cells.get(key);
            if (!cell) {
                cell = this.buckets.pop() || [];
                this.cells.set(key, cell);
            }
            cell.push(item);
        }
    }
    query(x: number, y: number, r: number, limit = Infinity, exclude?: T): T[] {
        const found: T[] = [];
        if (limit <= 0)
            return found;
        for (let a = Math.floor((x - r) / this.size); a <= Math.floor((x + r) / this.size); a++)
            for (let b = Math.floor((y - r) / this.size); b <= Math.floor((y + r) / this.size); b++) {
                const cell = this.cells.get(`${a},${b}`);
                if (cell)
                    for (const item of cell)
                        if (item !== exclude && (item.x - x) ** 2 + (item.y - y) ** 2 <= r * r) {
                            found.push(item);
                            if (found.length >= limit)
                                return found;
                        }
            }
        return found;
    }
    nearest(x: number, y: number, r: number, accept: (item: T) => boolean): T | undefined {
        let best: T | undefined, distance = r * r;
        for (let a = Math.floor((x - r) / this.size); a <= Math.floor((x + r) / this.size); a++)
            for (let b = Math.floor((y - r) / this.size); b <= Math.floor((y + r) / this.size); b++) {
                const cell = this.cells.get(`${a},${b}`);
                if (cell)
                    for (const item of cell) {
                        const d = (item.x - x) ** 2 + (item.y - y) ** 2;
                        if (d <= distance && accept(item)) {
                            if (best && d === distance)
                                continue;
                            best = item;
                            distance = d;
                        }
                    }
            }
        return best;
    }
}

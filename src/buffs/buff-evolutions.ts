import type { Action, Element, Recipe, BuffHost, BuffTarget } from './buff-types.js';
/** 行为与元素共同决定进化，触发碎片继续决定释放时机/冷却，不增加第四种槽位。 */
export const EVOLUTIONS = [
    {
        id: 'thunderMark', action: 'bolt', element: 'lightning', name: '雷印引爆', note: '雷电弹丸对同一敌人 9 秒内叠满 3 印：引爆 160%，传导附近 3 敌各 80%。'
    },
    {
        id: 'fireLinks', action: 'field', element: 'fire', name: '火种连线', note: '火种持续 6 秒，连接 260 范围内火种；燃烧带每 0.5 秒伤害 65%，交叉不叠加。'
    },
    {
        id: 'frostShatter', action: 'orbit', element: 'ice', name: '冰层碎裂', note: '冰霜环绕对同一敌人 3 秒内叠满 3 层：碎裂伤害 120%，附近敌人减速 2 秒。'
    },
] as const;
export type Evolution = typeof EVOLUTIONS[number]['id'];
export function evolutionOf(recipe: Pick<Recipe, 'action' | 'element'>) {
    return EVOLUTIONS.find(e => e.action === recipe.action && e.element === recipe.element);
}
export const EVOLUTION_LIMITS = { targets: 200, seeds: 6, links: 8, shatterTargets: 8 };
export interface EvolutionSource {
    kind: Action;
    element: Element;
    damage: number;
    level?: number;
}
export interface EvolutionMark {
    stacks: number;
    life: number;
    lock: number;
}
export interface FireSeed {
    x: number;
    y: number;
    life: number;
    damage: number;
    level: number;
}
export interface FireLink {
    a: FireSeed;
    b: FireSeed;
    damage: number;
    level: number;
}
interface EvolutionHooks<T> {
    slow(target: T, seconds: number): void;
    /** 爆发反馈进入 BuffRuntime 原有反馈预算，不单开无上限粒子数组。 */
    burst(kind: 'detonate' | 'shatter', x: number, y: number, level: number): void;
    arc(x: number, y: number, tx: number, ty: number): void;
}
/**
 * 三种进化的模拟状态，和普通 Buff 冷却分开；不引用 Game、Laya 或显示节点。
 * 只接受基础 Buff 的一次实际接触，进化伤害直接走 host.damage，不递归调用 hit。
 * 标记分别最多 200 个，死亡/超时清理；种子/连线有独立硬上限，暂停不调用 update。
 */
export class BuffEvolutions<T extends BuffTarget> {
    readonly thunder = new Map<T, EvolutionMark>();
    readonly frost = new Map<T, EvolutionMark>();
    readonly seeds: FireSeed[] = [];
    readonly links: FireLink[] = [];
    /** 调试/预览计数，不控制规则；即使关闭粒子也能确认实际爆发是否发生。 */
    detonations = 0;
    shatters = 0;
    private linkTick = 0;
    constructor(private readonly host: BuffHost<T>, private readonly hooks: EvolutionHooks<T>) { }
    clear(): void {
        this.thunder.clear();
        this.frost.clear();
        this.seeds.length = 0;
        this.links.length = 0;
        this.linkTick = 0;
        this.detonations = 0;
        this.shatters = 0;
    }
    /** 两配方共享同类叠层；来源伤害在 Buff 生成时快照，本次命中决定爆发伤害。 */
    hit(target: T, source: EvolutionSource): void {
        if (target.dead)
            return;
        if (source.kind === 'bolt' && source.element === 'lightning') {
            // 9 秒覆盖受击触发的 4 秒冷却，所有触发碎片都有机会完成三次命中。
            if (!this.stack(this.thunder, target, 9, 1))
                return;
            this.detonations++;
            this.hooks.burst('detonate', target.x, target.y, source.level || 1);
            // 先重置标记再回调，防止外部死亡逻辑重入时重复引爆。
            this.host.damage(target, source.damage * 1.6, true, true);
            let count = 0;
            for (const other of this.host.query(target.x, target.y, 180)) {
                if (other === target || other.dead)
                    continue;
                this.host.damage(other, source.damage * .8, true, true);
                this.hooks.arc(target.x, target.y, other.x, other.y);
                if (++count === 3)
                    break;
            }
        }
        else if (source.kind === 'orbit' && source.element === 'ice') {
            if (!this.stack(this.frost, target, 3, 1))
                return;
            this.shatters++;
            this.hooks.burst('shatter', target.x, target.y, source.level || 1);
            let count = 0;
            for (const other of this.host.query(target.x, target.y, 110)) {
                if (other.dead)
                    continue;
                this.host.damage(other, source.damage * 1.2, true, true);
                if (!other.dead)
                    this.hooks.slow(other, 2);
                if (++count === EVOLUTION_LIMITS.shatterTargets)
                    break;
            }
        }
    }
    private stack(map: Map<T, EvolutionMark>, target: T, seconds: number, lock: number): boolean {
        let mark = map.get(target);
        if (!mark) {
            if (map.size >= EVOLUTION_LIMITS.targets)
                return false;
            mark = { stacks: 0, life: seconds, lock: 0 };
            map.set(target, mark);
        }
        if (mark.lock > 0)
            return false;
        // 时限从第一层开始，不在后续接触时刷新，保证确实需要在窗口内连续叠满。
        if (++mark.stacks < 3)
            return false;
        mark.stacks = 0;
        mark.lock = lock;
        mark.life = lock;
        return true;
    }
    /** 火种保留 6 秒，允许慢触发配方连接；重复近点只刷新火种，不制造零长连线。 */
    seed(x: number, y: number, damage: number, level = 1): void {
        const existing = this.seeds.find(s => Math.hypot(s.x - x, s.y - y) < 32);
        if (existing) {
            existing.life = 6;
            existing.damage = Math.max(existing.damage, damage);
            existing.level = Math.max(existing.level, level);
            return;
        }
        if (this.seeds.length >= EVOLUTION_LIMITS.seeds) {
            const old = this.seeds.shift()!;
            this.removeLinks(old);
        }
        const near = this.seeds.filter(s => Math.hypot(s.x - x, s.y - y) <= 260)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 2);
        const seed: FireSeed = {
            x, y, damage, life: 6, level
        };
        this.seeds.push(seed);
        for (const other of near) {
            if (this.links.length >= EVOLUTION_LIMITS.links)
                break;
            this.links.push({ a: other, b: seed, damage: Math.min(other.damage, damage) * .65, level: Math.min(other.level, level) });
        }
    }
    private removeLinks(seed: FireSeed): void {
        for (let i = this.links.length - 1; i >= 0; i--)
            if (this.links[i].a === seed || this.links[i].b === seed)
                this.links.splice(i, 1);
    }
    update(dt: number): void {
        for (const map of [this.thunder, this.frost])
            for (const [target, mark] of map) {
                mark.life -= dt;
                mark.lock = Math.max(0, mark.lock - dt);
                if (target.dead || mark.life <= 0)
                    map.delete(target);
            }
        for (let i = this.seeds.length - 1; i >= 0; i--) {
            const seed = this.seeds[i];
            seed.life -= dt;
            if (seed.life <= 0) {
                this.removeLinks(seed);
                this.seeds.splice(i, 1);
            }
        }
        this.linkTick -= dt;
        if (this.links.length === 0 || this.linkTick > 0)
            return;
        this.linkTick = .5;
        // 同一伤害脉冲的交叉/重叠连线只命中一次，取所有接触线中最高伤害，顺序不影响结果。
        const hits = new Map<T, number>();
        for (const link of this.links) {
            const { a, b } = link, length = Math.hypot(b.x - a.x, b.y - a.y);
            for (const target of this.host.query((a.x + b.x) / 2, (a.y + b.y) / 2, length / 2 + 24)) {
                if (!hits.has(target) && hits.size >= EVOLUTION_LIMITS.targets)
                    continue;
                if (!target.dead && segmentDistance(target.x, target.y, a.x, a.y, b.x, b.y) <= 24)
                    hits.set(target, Math.max(hits.get(target) || 0, link.damage));
            }
        }
        for (const [target, damage] of hits)
            if (!target.dead)
                this.host.damage(target, damage, true, true);
    }
}
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

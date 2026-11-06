import type { Action, Element, Recipe, BuffHost, BuffTarget, BuffBranch } from './buff-types.js';
import { BUFF_RULES } from './buff-config.js';
/** 行为与元素共同决定进化，触发碎片继续决定释放时机/冷却，不增加第四种槽位。 */
export const EVOLUTIONS = [
    {
        id: 'thunderMark', action: 'bolt', element: 'lightning', name: '雷印引爆', note: '雷丸播种，武器命中已有雷印每敌 0.5 秒充一印，全局间隔 0.12 秒；三印引爆 160%，附近 3 敌各 80%。冰霜导冷加一印，每敌 1 秒一次；引爆锁 1 秒。击杀余电在 180 内继承，每印放电 40%，不能自行引爆或连续继承。'
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
export const EVOLUTION_LIMITS = {
    targets: 200, seeds: 6, links: 8, shatterTargets: 8, frostBurstsPerStep: 16, thunderBurstsPerStep: 16,
    thunderInheritsPerStep: 16, thunderInheritRadius: 180, thunderRemnantDamage: .4
};
export interface EvolutionSource {
    kind: Action;
    element: Element;
    damage: number;
    level?: number;
    slot?: number;
    branch?: BuffBranch;
    reactionDamage?: number;
}
export interface EvolutionMark {
    stacks: number;
    life: number;
    lock: number;
    source?: EvolutionSource;
    conductiveLock?: number;
    /** Inherited energy cannot travel again until a new bolt or rate-limited weapon hit invests. */
    inherited?: boolean;
    weaponLock?: number;
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
    burst(kind: 'detonate' | 'shatter', x: number, y: number, level: number, branch?: BuffBranch): void;
    arc(x: number, y: number, tx: number, ty: number, branch?: BuffBranch): void;
    shard?(x: number, y: number, tx: number, ty: number, level: number): void;
}
/**
 * 三种进化的模拟状态，和普通 Buff 冷却分开；不引用 Game、Laya 或显示节点。
 * 接受基础 Buff 实际接触及限频武器充能，进化伤害直接走 host.damage，不递归调用 hit。
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
    frostRejected = 0;
    thunderRejected = 0;
    inheritances = 0;
    weaponCharges = 0;
    private weaponGate = 0;
    private inheritanceBudget: number = EVOLUTION_LIMITS.thunderInheritsPerStep;
    private thunderBudget: number = EVOLUTION_LIMITS.thunderBurstsPerStep;
    private frostBudget: number = EVOLUTION_LIMITS.frostBurstsPerStep;
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
        this.frostRejected = 0;
        this.thunderRejected = 0;
        this.inheritances = 0;
        this.weaponCharges = 0;
        this.weaponGate = 0;
        this.inheritanceBudget = EVOLUTION_LIMITS.thunderInheritsPerStep;
        this.thunderBudget = EVOLUTION_LIMITS.thunderBurstsPerStep;
        this.frostBudget = EVOLUTION_LIMITS.frostBurstsPerStep;
    }
    /** 两配方共享同类叠层；来源伤害在 Buff 生成时快照，本次命中决定爆发伤害。 */
    hit(target: T, source: EvolutionSource, conductive = false): void {
        if (target.dead)
            return;
        if (source.element === 'force') {
            this.breakFrost(target, source);
            return;
        }
        if (source.kind === 'bolt' && source.element === 'lightning')
            this.stackThunder(target, source, conductive);
        else if (source.kind === 'orbit' && source.element === 'ice')
            this.stackFrost(target, source);
    }
    /** Weapons charge an existing seed, never create one. Shared gate bounds multi-target/DoT weapons. */
    weaponHit(target: T): void {
        const mark = this.thunder.get(target);
        if (target.dead || !mark?.source || mark.life <= 0 || mark.lock > 0 || (mark.weaponLock || 0) > 0 || this.weaponGate > 0)
            return;
        const threshold = mark.source.branch === 'charge' ? 5 : 3;
        if (mark.stacks + 1 >= threshold && this.thunderBudget <= 0)
            return;
        mark.weaponLock = .5;
        this.weaponGate = .12;
        this.weaponCharges++;
        this.stackThunder(target, mark.source, false, true);
    }
    /** Called once by authoritative death settlement, with a direct source only for a lethal base bolt.
     * Reserve/remove ownership before callbacks. No hit dispatch, random draws or deferred deaths.
     */
    killed(target: T, direct?: EvolutionSource): boolean {
        if (!target.dead)
            return false;
        const mark = this.thunder.get(target);
        this.thunder.delete(target);
        const live = mark && mark.life > 0 && mark.lock <= 0 && mark.stacks > 0;
        const source = direct || (live ? mark.source : undefined);
        if (target.kind === 4 || !source || (!direct && (!live || mark.inherited)) || this.inheritanceBudget <= 0)
            return false;
        // A locked mark cannot pay out a second time just because a bolt kills during the lock.
        if (mark && mark.lock > 0)
            return false;
        const stacks = Math.min(source.branch === 'charge' ? 4 : 2, (live ? mark.stacks : 0) + (direct ? direct.branch === 'charge' ? 2 : 1 : 0));
        if (!stacks)
            return false;
        this.inheritanceBudget--;
        const recipients: T[] = [];
        for (const other of this.host.query(target.x, target.y, EVOLUTION_LIMITS.thunderInheritRadius)) {
            const distance = Math.hypot(other.x - target.x, other.y - target.y), existing = this.thunder.get(other);
            if (other === target || other.dead || distance > EVOLUTION_LIMITS.thunderInheritRadius || existing && (existing.lock > 0 || existing.inherited) || !existing && this.thunder.size >= EVOLUTION_LIMITS.targets)
                continue;
            recipients.push(other);
        }
        recipients.sort((a, b) => (source.branch === 'charge' ? (b.kind || 0) - (a.kind || 0) : 0) || Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
        if (!recipients.length)
            return false;
        this.inheritances++;
        const cap = source.branch === 'spread' ? (source.level || 1) >= 5 ? 5 : 3 : 1;
        for (const recipient of recipients.slice(0, cap)) {
            if (recipient.dead || !this.thunder.has(recipient) && this.thunder.size >= EVOLUTION_LIMITS.targets)
                continue;
            const existing = this.thunder.get(recipient);
            const owner = existing?.source || { ...source };
            const threshold = owner.branch === 'charge' ? 5 : 3;
            this.thunder.set(recipient, {
                stacks: Math.min(threshold - 1, (existing?.stacks || 0) + stacks),
                life: Math.min(existing?.life ?? 9, live ? mark.life : 9), lock: 0,
                source: owner, conductiveLock: existing?.conductiveLock || 0, weaponLock: existing?.weaponLock || 0, inherited: true
            });
            this.hooks.arc(target.x, target.y, recipient.x, recipient.y, source.branch);
            this.host.damage(recipient, source.damage * stacks * EVOLUTION_LIMITS.thunderRemnantDamage, true, true, source);
        }
        return true;
    }
    private stackFrost(target: T, source: EvolutionSource): void {
        let mark = this.frost.get(target);
        if (!mark) {
            if (this.frost.size >= EVOLUTION_LIMITS.targets)
                return;
            mark = { stacks: 0, life: source.branch === 'prison' ? 4 : 3, lock: 0 };
            this.frost.set(target, mark);
        }
        if (mark.lock > 0)
            return;
        mark.source = {
            kind: source.kind, element: source.element, damage: source.reactionDamage ?? source.damage, level: source.level, slot: source.slot, branch: source.branch
        };
        mark.stacks = Math.min(source.branch === 'prison' ? 5 : 3, mark.stacks + 1);
        if (source.branch === 'prison' || mark.stacks < (source.branch === 'shards' ? BUFF_RULES.frost.shardsStacks : 3))
            return;
        this.consumeFrost(target, mark, false);
    }
    /** Direct cross-slot force only. Reserve the mark before damage callbacks; secondary damage never re-enters hit. */
    harvestFrost(target: T, force: EvolutionSource): boolean {
        return !target.dead && force.element === 'force' && this.breakFrost(target, force);
    }
    private breakFrost(target: T, force: EvolutionSource): boolean {
        const mark = this.frost.get(target);
        if (!mark || mark.lock > 0 || mark.life <= 0 || mark.stacks < 1 || force.slot === undefined || mark.source?.slot === undefined || force.slot === mark.source.slot)
            return false;
        return this.consumeFrost(target, mark, true);
    }
    private consumeFrost(target: T, mark: EvolutionMark, manual: boolean): boolean {
        if (this.frostBudget <= 0) {
            this.frostRejected++;
            return false;
        }
        this.frostBudget--;
        const source = mark.source!, stacks = mark.stacks;
        mark.stacks = 0;
        mark.lock = 1;
        mark.life = 1;
        this.shatters++;
        this.hooks.burst('shatter', target.x, target.y, source.level || 1, source.branch);
        if (manual) {
            const multiplier = source.branch === 'prison' && (source.level || 1) >= 5 && stacks >= 4 ? 1.25 : 1;
            this.host.damage(target, source.damage * stacks * .4 * multiplier, true, true, source);
            let count = 0;
            for (const other of this.host.query(target.x, target.y, 90)) {
                if (other === target || other.dead)
                    continue;
                this.host.damage(other, source.damage * .4, true, true, source);
                this.hooks.shard?.(target.x, target.y, other.x, other.y, source.level || 1);
                if (++count === 4)
                    break;
            }
        }
        else if (source.branch === 'shards') {
            // A lone elite/Boss also receives the payoff after real orbit contacts.
            this.host.damage(target, source.damage * .7, true, true, source);
            let count = 0;
            for (const other of this.host.query(target.x, target.y, 110)) {
                if (other === target || other.dead)
                    continue;
                this.host.damage(other, source.damage * .7, true, true, source);
                this.hooks.shard?.(target.x, target.y, other.x, other.y, source.level || 1);
                if (++count === ((source.level || 1) >= 5 ? 5 : 3))
                    break;
            }
        }
        else {
            let count = 0;
            for (const other of this.host.query(target.x, target.y, 110)) {
                if (other.dead)
                    continue;
                this.host.damage(other, source.damage * 1.2, true, true, source);
                if (!other.dead)
                    this.hooks.slow(other, 2);
                if (++count === EVOLUTION_LIMITS.shatterTargets)
                    break;
            }
        }
        return true;
    }
    /** Propagation only prepares targets; bolts and rate-limited weapon contacts can detonate. */
    private stackThunder(target: T, source: EvolutionSource, conductive: boolean, weapon = false): void {
        let mark = this.thunder.get(target);
        if (!mark) {
            if (this.thunder.size >= EVOLUTION_LIMITS.targets)
                return;
            mark = { stacks: 0, life: 9, lock: 0 };
            this.thunder.set(target, mark);
        }
        if (mark.lock > 0)
            return;
        const extra = conductive && (mark.conductiveLock || 0) <= 0;
        const threshold = source.branch === 'charge' ? 5 : 3;
        const direct = !weapon && source.branch === 'charge' ? 2 : 1;
        const stacks = Math.min(threshold, mark.stacks + direct + (extra ? 1 : 0));
        // Budget rejection leaves marks and both locks untouched; no deferred queue.
        if (stacks >= threshold && this.thunderBudget <= 0) {
            this.thunderRejected++;
            return;
        }
        mark.source = {
            kind: source.kind, element: source.element, damage: source.damage, level: source.level, slot: source.slot, branch: source.branch
        };
        mark.stacks = stacks;
        mark.inherited = false;
        // 蓄雷靠持续直击保留积累；导冷/传播不能独立续期，也不穿过爆发锁。
        if (!weapon && source.branch === 'charge')
            mark.life = 9;
        if (extra)
            mark.conductiveLock = 1;
        if (stacks < threshold)
            return;
        this.thunderBudget--;
        mark.stacks = 0;
        mark.lock = 1;
        mark.life = 1;
        this.detonations++;
        this.hooks.burst('detonate', target.x, target.y, source.level || 1, source.branch);
        const multiplier = source.branch === 'charge' ? ((source.level || 1) >= 5 ? 3.5 : 3) : source.branch === 'spread' ? 1.2 : 1.6;
        this.host.damage(target, source.damage * multiplier, true, true, source);
        if (source.branch === 'charge')
            return;
        let count = 0;
        const cap = source.branch === 'spread' && (source.level || 1) >= 5 ? 5 : 3;
        for (const other of this.host.query(target.x, target.y, 180)) {
            if (other === target || other.dead)
                continue;
            if (source.branch === 'spread') {
                let next = this.thunder.get(other);
                if (next?.lock || !next && this.thunder.size >= EVOLUTION_LIMITS.targets)
                    continue;
                if (!next) {
                    next = { stacks: 0, life: 9, lock: 0, source: { ...mark.source } };
                    this.thunder.set(other, next);
                }
                const limit = next.source?.branch === 'charge' ? 5 : 3;
                next.stacks = Math.min(limit - 1, next.stacks + 2);
            }
            else
                this.host.damage(other, source.damage * .8, true, true, source);
            this.hooks.arc(target.x, target.y, other.x, other.y, source.branch);
            if (++count === cap)
                break;
        }
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
        this.weaponGate = Math.max(0, this.weaponGate - dt);
        this.frostBudget = EVOLUTION_LIMITS.frostBurstsPerStep;
        this.thunderBudget = EVOLUTION_LIMITS.thunderBurstsPerStep;
        this.inheritanceBudget = EVOLUTION_LIMITS.thunderInheritsPerStep;
        for (const map of [this.thunder, this.frost])
            for (const [target, mark] of map) {
                mark.life -= dt;
                mark.conductiveLock = Math.max(0, (mark.conductiveLock || 0) - dt);
                mark.weaponLock = Math.max(0, (mark.weaponLock || 0) - dt);
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
                this.host.damage(target, damage, true, true, { kind: 'field', element: 'fire' });
    }
}
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

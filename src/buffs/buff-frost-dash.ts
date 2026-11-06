import { BUFF_RULES } from './buff-config.js';
import { segmentDistance } from './buff-effects.js';
import type { EvolutionMark } from './buff-evolutions.js';
import type { BuffEffect, BuffTarget } from './buff-types.js';
export function harvestableFrost(target: BuffTarget, mark: EvolutionMark | undefined, slot?: number): boolean {
    return !target.dead && !!mark && mark.life > 0 && mark.lock <= 0 && mark.stacks > 0 && mark.source?.slot !== undefined && (slot === undefined || mark.source.slot !== slot);
}
/** Only actual travelled segments collect targets; no straight shortcut through blocked movement.
 * One dash owns a bounded set; queued effects retain contacts weakly and revalidate on settlement.
 */
export class FrostDash<T extends BuffTarget> {
    private last?: {
        x: number;
        y: number;
    };
    private readonly contacts = new Set<T>();
    private pending = new WeakMap<BuffEffect, readonly T[]>();
    begin(x: number, y: number): void {
        this.contacts.clear();
        this.last = { x, y };
    }
    trace(x: number, y: number, marks: ReadonlyMap<T, EvolutionMark>): void {
        if (!this.last)
            return;
        for (const target of this.contacts)
            if (!harvestableFrost(target, marks.get(target)))
                this.contacts.delete(target);
        for (const [target, mark] of marks) {
            if (this.contacts.size >= BUFF_RULES.frost.dashTargets)
                break;
            if (harvestableFrost(target, mark) && segmentDistance(target.x, target.y, this.last.x, this.last.y, x, y) <= BUFF_RULES.frost.dashRadius)
                this.contacts.add(target);
        }
        this.last = { x, y };
    }
    queue(effect: BuffEffect, marks: ReadonlyMap<T, EvolutionMark>): void {
        if (!this.last || effect.kind !== 'blast' || effect.element !== 'force' || effect.slot === undefined)
            return;
        const targets = [...this.contacts].filter(t => harvestableFrost(t, marks.get(t), effect.slot));
        for (const [target, mark] of marks) {
            if (targets.length >= BUFF_RULES.frost.dashTargets)
                break;
            if (!targets.includes(target) && harvestableFrost(target, mark, effect.slot) && Math.hypot(target.x - effect.x, target.y - effect.y) <= BUFF_RULES.blast.radius)
                targets.push(target);
        }
        if (targets.length)
            this.pending.set(effect, targets);
    }
    finish(): void {
        this.last = undefined;
        this.contacts.clear();
    }
    clear(): void {
        this.finish();
        this.pending = new WeakMap();
    }
    resolve(effects: readonly BuffEffect[], consume: (target: T, effect: BuffEffect) => void): void {
        for (const effect of [...effects]) {
            const targets = this.pending.get(effect);
            this.pending.delete(effect); // Reserve ownership before synchronous death callbacks.
            if (!targets || effect.life <= 0)
                continue;
            for (const target of targets) {
                if (!effects.includes(effect))
                    break;
                consume(target, effect);
            }
        }
    }
}

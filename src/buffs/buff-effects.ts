import { BUFF_ACTIONS, BUFF_LIMITS, BUFF_RULES } from './buff-config.js';
import type { BuffEffect, BuffHost, BuffTarget, CompleteRecipe, Trigger } from './buff-types.js';
/** 决定释放原点和弹道，不接触 UI、节点或随机源。damage/level 由编排层一起快照。 */
export function createBuffEffect<T extends BuffTarget>(host: BuffHost<T>, recipe: CompleteRecipe, event: Trigger, x: number, y: number, damage: number, level: number, priority: (target: T) => number = () => 0): BuffEffect {
    const player = host.player;
    const origin = recipe.action === 'bolt' || recipe.action === 'orbit' ? player : event === 'hit' || event === 'kill' ? { x, y } : player;
    let vx = 0, vy = 0;
    if (recipe.action === 'bolt') {
        let target: T | undefined, bestPriority = -Infinity, bestDistance = Infinity;
        for (const enemy of host.query(origin.x, origin.y, BUFF_RULES.bolt.seek)) {
            const distance = Math.hypot(enemy.x - origin.x, enemy.y - origin.y);
            if (enemy.dead || distance > BUFF_RULES.bolt.seek)
                continue;
            const rank = priority(enemy);
            if (rank > bestPriority || rank === bestPriority && distance < bestDistance) {
                target = enemy;
                bestPriority = rank;
                bestDistance = distance;
            }
        }
        const dx = target ? target.x - origin.x : player.dx, dy = target ? target.y - origin.y : player.dy;
        const distance = Math.hypot(dx, dy) || 1;
        vx = dx / distance * BUFF_RULES.bolt.speed;
        vy = dy / distance * BUFF_RULES.bolt.speed;
    }
    return {
        kind: recipe.action, x: recipe.action === 'orbit' ? player.x : origin.x,
        y: recipe.action === 'orbit' ? player.y : origin.y, vx, vy,
        life: BUFF_ACTIONS[recipe.action].life, tick: 0, age: 0, damage, element: recipe.element, level
    };
}
// Weak ownership releases contact history when a cast expires or the scene clears.
const orbitContacts = new WeakMap<BuffEffect, Map<BuffTarget, number>>();
function updateOrbit<T extends BuffTarget>(effect: BuffEffect, host: BuffHost<T>, elapsed: number, apply: (target: T, effect: BuffEffect) => void): void {
    const rules = BUFF_RULES.orbit, oldAge = effect.age - elapsed;
    let contacts = orbitContacts.get(effect);
    if (!contacts) {
        contacts = new Map();
        orbitContacts.set(effect, contacts);
    }
    for (const [target, time] of contacts)
        if (target.dead || time <= oldAge)
            contacts.delete(target);
    const oldX = effect.x, oldY = effect.y;
    // Small arc chords follow both rotation and player translation; never sweep a disk at the new centre.
    const steps = Math.max(1, Math.ceil(elapsed * rules.speed / .15));
    for (let step = 0; step < steps; step++) {
        const a = step / steps, b = (step + 1) / steps, time = oldAge + elapsed * b;
        for (let n = 0; n < rules.count; n++) {
            const angleA = (oldAge + elapsed * a) * rules.speed + n * Math.PI;
            const angleB = time * rules.speed + n * Math.PI;
            const ax = oldX + (host.player.x - oldX) * a + Math.cos(angleA) * rules.radius;
            const ay = oldY + (host.player.y - oldY) * a + Math.sin(angleA) * rules.radius;
            const bx = oldX + (host.player.x - oldX) * b + Math.cos(angleB) * rules.radius;
            const by = oldY + (host.player.y - oldY) * b + Math.sin(angleB) * rules.radius;
            const radius = rules.hitRadius + rules.radius * (1 - Math.cos((angleB - angleA) / 2));
            for (const target of host.query((ax + bx) / 2, (ay + by) / 2, radius + Math.hypot(bx - ax, by - ay) / 2)) {
                if (target.dead || (contacts.get(target) || 0) > time + 1e-9 || segmentDistance(target.x, target.y, ax, ay, bx, by) > radius)
                    continue;
                // Do not admit untracked contacts at capacity: that would bypass the cooldown.
                if (!contacts.has(target) && contacts.size >= BUFF_LIMITS.targets)
                    continue;
                contacts.set(target, time + rules.tick);
                apply(target, effect);
            }
        }
    }
    effect.x = host.player.x;
    effect.y = host.player.y;
}
/** Earliest circle entry, rather than spatial-grid enumeration order. */
function boltContact<T extends BuffTarget>(targets: T[], ax: number, ay: number, bx: number, by: number): T | undefined {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy, radius = BUFF_RULES.bolt.hitRadius;
    let first: T | undefined, earliest = Infinity;
    for (const target of targets) {
        if (target.dead)
            continue;
        const x = ax - target.x, y = ay - target.y, c = x * x + y * y - radius * radius;
        let time = 0;
        if (c > 0) {
            if (!length2)
                continue;
            const dot = x * dx + y * dy, discriminant = dot * dot - length2 * c;
            if (discriminant < 0)
                continue;
            time = (-dot - Math.sqrt(discriminant)) / length2;
            if (time < 0 || time > 1)
                continue;
        }
        if (time < earliest) {
            earliest = time;
            first = target;
        }
    }
    return first;
}
/** 沿线段检查弹丸，不能只测末端，否则低帧率会穿过敌人。 */
export function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
/** 反向遍历并在命中后回收，保持同帧命中/击杀/奖励顺序；apply 是唯一结算入口。 */
export function updateBuffEffects<T extends BuffTarget>(effects: BuffEffect[], host: BuffHost<T>, dt: number, apply: (target: T, effect: BuffEffect) => void): void {
    const contacts = new Map<number, Set<T>>();
    for (let index = effects.length - 1; index >= 0; index--) {
        const effect = effects[index], elapsed = Math.min(dt, effect.life);
        effect.life -= dt;
        effect.age += elapsed;
        effect.tick -= elapsed;
        if (effect.kind === 'orbit') {
            updateOrbit(effect, host, elapsed, apply);
        }
        else if (effect.kind === 'bolt') {
            const oldX = effect.x, oldY = effect.y;
            effect.x += effect.vx * elapsed;
            effect.y += effect.vy * elapsed;
            const radius = BUFF_RULES.bolt.queryPadding + BUFF_RULES.bolt.speed * elapsed * .5;
            const target = boltContact(host.query((oldX + effect.x) / 2, (oldY + effect.y) / 2, radius), oldX, oldY, effect.x, effect.y);
            if (target) {
                apply(target, effect);
                effect.life = 0;
            }
        }
        else if (effect.tick <= 0) {
            effect.tick = BUFF_RULES[effect.kind].tick;
            {
                let hit = effect.branch === 'trail' && effect.cast !== undefined ? contacts.get(effect.cast) : undefined;
                if (!hit && effect.branch === 'trail' && effect.cast !== undefined) {
                    hit = new Set<T>();
                    contacts.set(effect.cast, hit);
                }
                for (const target of host.query(effect.x, effect.y, effect.radius || BUFF_RULES[effect.kind].radius)) {
                    if (target.dead || hit?.has(target))
                        continue;
                    hit?.add(target);
                    apply(target, effect);
                }
            }
        }
        if (effect.life <= 0)
            effects.splice(index, 1);
    }
}

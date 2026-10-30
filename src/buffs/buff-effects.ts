import { BUFF_ACTIONS, BUFF_RULES } from './buff-config.js';
import type { BuffEffect, BuffHost, BuffTarget, CompleteRecipe, Trigger } from './buff-types.js';
/** 决定释放原点和弹道，不接触 UI、节点或随机源。damage/level 由编排层一起快照。 */
export function createBuffEffect<T extends BuffTarget>(host: BuffHost<T>, recipe: CompleteRecipe, event: Trigger, x: number, y: number, damage: number, level: number): BuffEffect {
    const player = host.player;
    const origin = recipe.action === 'bolt' || recipe.action === 'orbit' ? player : event === 'hit' || event === 'kill' ? { x, y } : player;
    let vx = 0, vy = 0;
    if (recipe.action === 'bolt') {
        const target = host.query(origin.x, origin.y, BUFF_RULES.bolt.seek).find(enemy => !enemy.dead);
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
/** 沿线段检查弹丸，不能只测末端，否则低帧率会穿过敌人。 */
export function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
/** 反向遍历并在命中后回收，保持同帧命中/击杀/奖励顺序；apply 是唯一结算入口。 */
export function updateBuffEffects<T extends BuffTarget>(effects: BuffEffect[], host: BuffHost<T>, dt: number, apply: (target: T, effect: BuffEffect) => void): void {
    for (let index = effects.length - 1; index >= 0; index--) {
        const effect = effects[index], elapsed = Math.min(dt, effect.life);
        effect.life -= dt;
        effect.age += elapsed;
        effect.tick -= elapsed;
        if (effect.kind === 'orbit') {
            effect.x = host.player.x;
            effect.y = host.player.y;
        }
        if (effect.kind === 'bolt') {
            const oldX = effect.x, oldY = effect.y;
            effect.x += effect.vx * elapsed;
            effect.y += effect.vy * elapsed;
            const radius = BUFF_RULES.bolt.queryPadding + BUFF_RULES.bolt.speed * elapsed * .5;
            const target = host.query((oldX + effect.x) / 2, (oldY + effect.y) / 2, radius)
                .find(enemy => !enemy.dead && segmentDistance(enemy.x, enemy.y, oldX, oldY, effect.x, effect.y) < BUFF_RULES.bolt.hitRadius);
            if (target) {
                apply(target, effect);
                effect.life = 0;
            }
        }
        else if (effect.tick <= 0) {
            effect.tick = BUFF_RULES[effect.kind].tick;
            if (effect.kind === 'orbit') {
                effect.x = host.player.x;
                effect.y = host.player.y;
                const hit = new Set<T>();
                for (let n = 0; n < BUFF_RULES.orbit.count; n++) {
                    const angle = effect.age * BUFF_RULES.orbit.speed + n * Math.PI;
                    const x = effect.x + Math.cos(angle) * BUFF_RULES.orbit.radius, y = effect.y + Math.sin(angle) * BUFF_RULES.orbit.radius;
                    for (const target of host.query(x, y, BUFF_RULES.orbit.hitRadius)) {
                        if (target.dead || hit.has(target))
                            continue;
                        hit.add(target);
                        apply(target, effect);
                    }
                }
            }
            else
                for (const target of host.query(effect.x, effect.y, BUFF_RULES[effect.kind].radius))
                    apply(target, effect);
        }
        if (effect.life <= 0)
            effects.splice(index, 1);
    }
}

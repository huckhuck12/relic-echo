import type { BuffRuntime, BuffTarget } from '../buffs/buffs.js';
import type { Point } from '../shared/entities.js';
import { BUFF_RULES } from '../buffs/buff-config.js';
/** Each profile is tested with all three weapons before advancing to the next. */
export const AUTO_BUILDS = [
    { build: 'fire', branch: 'trail', name: '火径' },
    { build: 'fire', branch: 'furnace', name: '炉心' },
    { build: 'ice', branch: 'shards', name: '碎冰' },
    { build: 'ice', branch: 'prison', name: '寒牢' },
    { build: 'thunder', branch: 'spread', name: '传印' },
    { build: 'thunder', branch: 'charge', name: '蓄雷' },
] as const;
export function autoBuildProfile(round: number) {
    return AUTO_BUILDS[Math.floor(Math.max(0, round - 1) / 3) % AUTO_BUILDS.length];
}
export interface BuildTactics {
    orbit: boolean;
    attackRange?: number;
    maxHp?: number;
    waypoint?: Point;
    focus?: Point;
    dashTarget?: Point;
    dashRadius?: number;
}
/** Read only, bounded by existing enemy/effect/mark caps; never deals damage or grants fragments. */
export function buildTactics<T extends BuffTarget>(buffs: BuffRuntime<T>, player: Point, enemies: readonly T[]): BuildTactics {
    const active = buffs.recipes.filter(r => r.trigger && r.action && r.element);
    const orbit = active.some(r => r.action === 'orbit' && r.element === 'ice');
    let focus: T | undefined, best = Infinity;
    for (const e of enemies) {
        if (e.dead)
            continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < best) {
            best = d;
            focus = e;
        }
    }
    const dash = active.find(r => r.trigger === 'dash');
    let dashTarget: Point | undefined;
    if (dash && buffs.cooldowns[buffs.recipes.indexOf(dash)] > 0)
        return { orbit, focus };
    if (dash?.element === 'force' && dash.action === 'blast') {
        let nearest = Infinity;
        const slot = buffs.recipes.indexOf(dash);
        for (const [enemy, mark] of buffs.evolutions.frost) {
            const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            if (!enemy.dead && mark.stacks >= 1 && mark.lock <= 0 && mark.life > 0 && mark.source?.slot !== undefined && mark.source.slot !== slot && distance < 260 && distance < nearest) {
                nearest = distance;
                dashTarget = enemy;
            }
        }
    }
    else if (dash?.action === 'field' && focus && best < 260)
        dashTarget = focus;
    return { orbit, focus, dashTarget, dashRadius: dash?.action === 'blast' ? BUFF_RULES.blast.radius : dash && buffs.branchOf(dash) === 'furnace' ? 70 : BUFF_RULES.field.radius };
}

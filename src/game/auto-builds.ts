import type { BuffRuntime, BuffTarget } from '../buffs/buffs.js';
import type { Point } from '../shared/entities.js';
import { BUFF_RULES } from '../buffs/buff-config.js';
import { harvestableFrost } from '../buffs/buff-frost-dash.js';
import { COMBAT } from '../progression/config.js';
/** Each profile is tested with all three weapons before advancing to the next. */
export const AUTO_BUILDS = [
    { build: 'fire', branch: 'trail', name: '火径' },
    { build: 'fire', branch: 'furnace', name: '炉心' },
    { build: 'ice', branch: 'shards', name: '碎冰' },
    { build: 'ice', branch: 'prison', name: '寒牢' },
    { build: 'thunder', branch: 'spread', name: '传印' },
    { build: 'thunder', branch: 'charge', name: '蓄雷' },
] as const;
export type AutoBuildBranch = typeof AUTO_BUILDS[number]['branch'];
export interface AutoPlaySelection {
    branch?: AutoBuildBranch;
    rotateWeapons?: boolean;
}
export function autoBuildProfile(round: number, selection: AutoPlaySelection = {}) {
    const fixed = AUTO_BUILDS.find(profile => profile.branch === selection.branch);
    return fixed || AUTO_BUILDS[Math.floor(Math.max(0, round - 1) / (selection.rotateWeapons === false ? 1 : 3)) % AUTO_BUILDS.length];
}
export interface BuildTactics {
    orbit: boolean;
    attackRange?: number;
    maxHp?: number;
    waypoint?: Point;
    waypointRadius?: number;
    focus?: Point;
    dashTarget?: Point;
    dashTargets?: readonly Point[];
    dashPathRadius?: number;
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
        const slot = buffs.recipes.indexOf(dash);
        const candidates: {
            enemy: T;
            stacks: number;
            distance: number;
        }[] = [];
        for (const [enemy, mark] of buffs.evolutions.frost) {
            const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            if (!harvestableFrost(enemy, mark, slot) || mark.life <= COMBAT.dashDuration || distance >= 260)
                continue;
            const candidate = { enemy, stacks: mark.stacks, distance };
            const index = candidates.findIndex(c => candidate.stacks > c.stacks || candidate.stacks === c.stacks && distance < c.distance);
            candidates.splice(index < 0 ? candidates.length : index, 0, candidate);
            if (candidates.length > BUFF_RULES.frost.dashTargets)
                candidates.pop();
        }
        const dashTargets = candidates.map(c => c.enemy);
        return {
            orbit, focus, dashTarget: dashTargets[0], dashTargets, dashRadius: BUFF_RULES.blast.radius, dashPathRadius: BUFF_RULES.frost.dashRadius
        };
    }
    else if (dash?.action === 'field' && focus && best < 260)
        dashTarget = focus;
    return { orbit, focus, dashTarget, dashRadius: dash?.action === 'blast' ? BUFF_RULES.blast.radius : dash && buffs.branchOf(dash) === 'furnace' ? 70 : BUFF_RULES.field.radius };
}

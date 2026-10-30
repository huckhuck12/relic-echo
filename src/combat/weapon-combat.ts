import { WEAPONS, multiplier } from '../progression/config.js';
import { project, unproject, clamp } from '../shared/model.js';
import { CAST_DURATION, faceToward, playerDirection, weaponSocket } from '../rendering/player-pose.js';
import type { Loadout, Stats, SpatialGrid } from '../shared/model.js';
import { weaponOf } from '../rendering/appearance.js';
import { SHOT_LIMIT } from '../game/difficulty.js';
import type { Player, Enemy, Shot, Field, Effect, Point } from '../shared/entities.js';
import { paintFlameShot } from '../rendering/skill-visuals.js';
import type { DamageOptions } from './combat-system.js';
import { paintHostileShot } from '../rendering/projectile-presentation.js';
/**
 * 武器模拟的显式状态，不保存 Game 引用，也不访问 UI 或计时器。
 * 调用前空间索引须已重建；玩家/敌人原地更新，shots/fields 筛选后会替换。
 * 调用方须写回 shots、fields 与 recoil；不要跨局缓存本对象。
 */
export interface WeaponState {
    player: Player;
    loadout: Loadout;
    levels: Record<string, number>;
    stats: Stats;
    grid: SpatialGrid<Enemy>;
    shots: Shot[];
    fields: Field[];
    pillars: readonly Point[];
    time: number;
    overdrive: number;
    recoil: number;
}
/** 伤害通过回调进入 combat-system；DamageOptions 显式表达暴击、持续伤害与表现来源。 */
export interface WeaponHooks {
    hit(enemy: Enemy, damage: number, options?: DamageOptions): void;
    hurt(damage: number): void;
    acquire(): any;
    release(node: any): void;
    line(x: number, y: number, tx: number, ty: number, color: string, sourceLift?: number): void;
    effect(kind: Effect['kind'], x: number, y: number, color: string, life: number, tx?: number, ty?: number): void;
    kick(strength: number, duration: number): void;
    beep(frequency: number, duration: number, volume?: number): void;
}
/** 三武器共享目标查询，具体群攻、衰减与伤害仍在这里决定，渲染器不做命中。 */
export function attack(state: WeaponState, hooks: WeaponHooks): void {
    const weapon = weaponOf(state.loadout), config = WEAPONS[weapon], p = state.player;
    const range = weapon === 'blade' ? config.range * (1 + .2 * (state.levels.orbit || 0)) : config.range;
    const target = state.grid.nearest(p.x, p.y, range, e => !e.dead);
    if (!target)
        return;
    faceToward(p, target.x - p.x, target.y - p.y);
    const base = config.damage * multiplier(state.loadout.weapon!.quality) * (1 + state.stats.damage + (weapon !== 'blade' ? state.stats.element : 0)) * (state.overdrive > 0 ? 1.25 : 1);
    state.recoil = .1;
    // 命中仍在本步结算。动作独立计时，从释放姿态进入随动与收招，不阻塞移动或下一次攻击。
    p.castWeapon = weapon;
    p.castTime = CAST_DURATION[weapon];
    // 高度只参与画面投影。挂载点快照不写回玩家或弹道的地面碰撞坐标。
    const socket = weaponSocket(weapon, playerDirection(p), state.recoil, p.castTime);
    const offset = unproject(socket.x, socket.y);
    // 短促施放反馈与伤害分离；tx 保存世界瞄准角，ty 标记武器材质，不增加伤害延迟。
    hooks.effect('cast', p.x + offset.x, p.y + offset.y, config.color, .12, Math.atan2(target.y - p.y, target.x - p.x), weapon === 'storm' ? 0 : weapon === 'flame' ? 1 : 2);
    if (weapon === 'storm') {
        hooks.hit(target, base, { canCrit: true, feedback: { weapon: 'storm', dx: target.x - p.x, dy: target.y - p.y } });
        let previous = target;
        const used = new Set<Enemy>([target]);
        hooks.line(p.x + offset.x, p.y + offset.y, target.x, target.y, config.color, 0);
        for (let i = 0; i < 2 + 2 * (state.levels.chain || 0); i++) {
            const next = state.grid.nearest(previous.x, previous.y, 210 + 40 * (state.levels.conductor || 0), e => !e.dead && !used.has(e));
            if (!next)
                break;
            hooks.hit(next, base * Math.pow(1 - (.24 - .08 * (state.levels.conductor || 0)), i + 1), { feedback: { weapon: 'storm', dx: next.x - previous.x, dy: next.y - previous.y } });
            hooks.line(previous.x, previous.y, next.x, next.y, config.color);
            used.add(next);
            previous = next;
        }
        hooks.beep(640, .035, .012);
    }
    else if (weapon === 'flame') {
        const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
        const count = state.shots.length;
        shoot(state, hooks, p.x, p.y, dx / (d || 1) * 680, dy / (d || 1) * 680, base, false, config.color, true);
        if (state.shots.length > count) {
            const shot = state.shots[state.shots.length - 1];
            shot.launchX = socket.x;
            shot.launchY = socket.y + 18;
        }
        hooks.beep(170, .06, .018);
    }
    else {
        for (const enemy of state.grid.query(p.x, p.y, range))
            if (!enemy.dead && enemy.bladeCd <= 0) {
                hooks.hit(enemy, base * (1 + .2 * (state.levels.blades || 0)), { canCrit: true, feedback: { weapon: 'blade', dx: -(enemy.y - p.y), dy: enemy.x - p.x } });
                enemy.bladeCd = .12;
            }
        hooks.effect('slash', p.x, p.y, config.color, .2, range, state.time * 9 + (p.bladeSpin || 0));
        hooks.beep(420, .03, .01);
    }
}
/** 为玩家预留 32 个弹道名额；伤害、燃烧和范围在发射时快照保存。 */
export function shoot(state: WeaponState, hooks: WeaponHooks, x: number, y: number, vx: number, vy: number, damage: number, hostile: boolean, color: string, flame = false): void {
    if (state.shots.length >= (hostile ? SHOT_LIMIT - 32 : SHOT_LIMIT))
        return;
    const node = hooks.acquire();
    if (hostile) {
        paintHostileShot(node.graphics, vx, vy, color);
    }
    else if (flame) {
        paintFlameShot(node.graphics, vx, vy);
    }
    else {
        const trail = project(-vx * .035, -vy * .035);
        node.graphics.drawLine(trail.x, trail.y - 18, 0, -18, color, 7);
        node.graphics.drawRect(-7, -25, 14, 14, color, '#ffdc9d', 1);
        node.graphics.drawRect(-3, -21, 6, 6, '#fff4d2');
    }
    const scale = multiplier(state.loadout.weapon!.quality) * (1 + state.stats.damage + state.stats.element) * (state.overdrive > 0 ? 1.25 : 1);
    state.shots.push({
        x, y, vx, vy, life: hostile ? 6 : 1.2, damage: damage * (flame ? 1 + .15 * (state.levels.burn || 0) : 1), hostile, color, flame, burn: (6 + 5 * (state.levels.burn || 0)) * scale, radius: 105 * (1 + .2 * (state.levels.ground || 0)), fieldLife: 2 + (state.levels.ground || 0), node
    });
}
/** 沿上一坐标到新坐标做线段碰撞，防止高速弹道一帧跨过目标却没有命中。 */
export function updateShots(state: WeaponState, hooks: WeaponHooks, dt: number): void {
    state.shots = state.shots.filter(s => {
        const oldX = s.x, oldY = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        let detonated = false;
        let consumed = s.life <= 0 || Math.abs(s.x) > 1200 || Math.abs(s.y) > 1200;
        if (state.pillars.some(p => Math.hypot(p.x - s.x, p.y - s.y) < 35))
            consumed = true;
        if (!consumed && s.hostile) {
            if (segmentDistance(state.player.x, state.player.y, oldX, oldY, s.x, s.y) < 22) {
                hooks.hurt(s.damage);
                consumed = true;
            }
        }
        else if (!consumed) {
            const enemy = state.grid.query(s.x, s.y, 75).find(e => !e.dead && segmentDistance(e.x, e.y, oldX, oldY, s.x, s.y) < e.radius + 9);
            if (enemy) {
                if (s.flame) {
                    explode(state, hooks, s, enemy.x, enemy.y);
                    detonated = true;
                }
                else
                    hooks.hit(enemy, s.damage, { canCrit: true });
                consumed = true;
            }
        }
        if (consumed) {
            if (s.flame && !detonated)
                explode(state, hooks, s, s.x, s.y);
            hooks.release(s.node);
            return false;
        }
        return true;
    });
}
/** 使用发射时的快照结算爆炸与燃烧；每枚弹道只在命中或回收时爆炸一次。 */
export function explode(state: WeaponState, hooks: WeaponHooks, s: Shot, x: number, y: number): void {
    hooks.effect('blast', x, y, s.color, .32, s.radius);
    hooks.kick(4, .11);
    hooks.beep(85, .1, .028);
    for (const e of state.grid.query(x, y, s.radius + 55))
        if (!e.dead && Math.hypot(e.x - x, e.y - y) <= s.radius + e.radius) {
            // 正在飞行的炎炮即使途中换装，也保持火焰反馈；中心命中沿来弹方向。
            const centered = Math.hypot(e.x - x, e.y - y) < .001;
            hooks.hit(e, s.damage, { canCrit: true, feedback: { weapon: 'flame', dx: centered ? s.vx : e.x - x, dy: centered ? s.vy : e.y - y } });
            e.burn = 3;
            e.burnD = Math.max(e.burnD, s.burn);
        }
    if (state.fields.length < 20)
        state.fields.push({
            x, y, life: s.fieldLife, tick: .4, damage: s.burn, radius: s.radius * .8
        });
}
/** 重叠火焰地面在同一 tick 对同一敌人只结算一次，避免区域堆叠失控。 */
export function updateFields(state: WeaponState, hooks: WeaponHooks, dt: number): void {
    for (const f of state.fields) {
        f.life -= dt;
        f.tick -= dt;
    }
    const ticked = new Set<Enemy>();
    for (const field of state.fields)
        if (field.tick <= 0) {
            field.tick = .4;
            for (const e of state.grid.query(field.x, field.y, field.radius))
                if (!e.dead && !ticked.has(e)) {
                    hooks.hit(e, field.damage * .4, { impact: false });
                    ticked.add(e);
                }
        }
    state.fields = state.fields.filter(f => f.life > 0);
}
/** 点到有限线段的距离；零长度时退化为点距离，避免除零产生 NaN。 */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

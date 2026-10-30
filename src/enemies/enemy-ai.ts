import { clamp } from '../shared/model.js';
import type { SpatialGrid } from '../shared/model.js';
import { difficultyAt } from '../game/difficulty.js';
import { progressionTime } from '../game/pace.js';
import type { Player, Enemy, Point } from '../shared/entities.js';
import { startEnemyAction } from './enemy-actions.js';
import type { DamageOptions } from '../combat/combat-system.js';
/**
 * 一步 AI 的只读集合视图；敌人本身原地更新，不增删数组、不回收节点。
 * 时间/速度/碰撞使用世界坐标与秒，不读取摄像机或节点 visible，屏幕外也正常模拟。
 * 调用前 Game 已重建空间索引并完成玩家攻击；查询必须跳过已标记 dead 的实体。
 */
export interface EnemyAIState {
    time: number;
    player: Readonly<Pick<Player, 'x' | 'y'>>;
    enemies: readonly Enemy[];
    pillars: readonly Point[];
    grid: SpatialGrid<Enemy>;
}
/**
 * 伤害与发射回到已有统一入口，避免 AI 重复维护暴击、Buff、无敌和弹道预算。
 * isBattle 必须实时读取模式：hurt 可能结束对局，不能在函数开始时保存旧布尔值。
 */
export interface EnemyAIHooks {
    speedMultiplier(enemy: Enemy): number;
    hit(enemy: Enemy, damage: number, options: DamageOptions): void;
    hurt(damage: number): void;
    shoot(x: number, y: number, vx: number, vy: number, damage: number, hostile: boolean, color: string, source?: Enemy): void;
    ring(x: number, y: number, color: string): void;
    isBattle(): boolean;
}
const LIMIT = 1120;
/**
 * 顺序保持：状态计时/灼烧 → 距离策略 → 蓄力/冲锋/攻击 → 移动与击退 → 碰撞/分离 → 接触伤害。
 * 死亡仅作标记，步末由 Game 回收。灼烧致死后不得继续攻击；玩家死亡后中止后续敌人。
 * 不把这些分支合成循环：蓄力结束的本步不立刻多推进一段冲锋，原有预警时长因此保留。
 */
export function updateEnemies(state: EnemyAIState, hooks: EnemyAIHooks, dt: number): void {
    const p = state.player, difficulty = difficultyAt(state.time);
    for (const e of state.enemies) {
        if (e.dead)
            continue;
        const x = p.x - e.x, y = p.y - e.y, d = Math.hypot(x, y) || 1;
        e.flash = Math.max(0, e.flash - dt);
        if (e.hitReaction)
            e.hitReaction.life = Math.max(0, e.hitReaction.life - dt);
        e.bladeCd = Math.max(0, e.bladeCd - dt);
        e.cooldown -= dt;
        e.actionTime = Math.max(0, (e.actionTime || 0) - dt);
        // 按 dt 累积持续伤害，不做逐帧取整，也不产生普通命中击退/反馈。
        if (e.burn > 0) {
            e.burn -= dt;
            hooks.hit(e, e.burnD * dt, { impact: false, round: false });
            if (e.dead)
                continue;
        }
        let speed = e.speed * hooks.speedMultiplier(e);
        // 远程怪在中距离停步，过近则后退；冰霜对追击、后退和冲锋均生效。
        if (e.kind === 1 && d < 340)
            speed = (d < 210 ? -25 : 0) * hooks.speedMultiplier(e);
        if (e.wind > 0) {
            speed = 0;
            e.wind -= dt;
            if (e.wind <= 0) {
                if (e.kind === 1) {
                    startEnemyAction(e, 'cast');
                    aimedVolley(state, hooks, e);
                }
                if (e.kind === 2) {
                    e.charge = .45;
                    startEnemyAction(e, 'launch');
                }
                else if (e.kind === 4 && e.charge === 1) {
                    startEnemyAction(e, 'slam');
                    // Boss 以蓄力开始时的 dx/dy 落点结算，期间移动可躲开。
                    if (Math.hypot(p.x - e.dx, p.y - e.dy) < 145)
                        hooks.hurt(e.damage);
                    hooks.ring(e.dx, e.dy, '#f6ac82');
                    e.charge = 0;
                }
            }
        }
        else if (e.kind === 2 && e.charge > 0) {
            e.x += e.dx * 540 * (1 + difficulty.late * .25) * hooks.speedMultiplier(e) * dt;
            e.y += e.dy * 540 * (1 + difficulty.late * .25) * hooks.speedMultiplier(e) * dt;
            e.charge -= dt;
            if (e.charge <= 0)
                startEnemyAction(e, 'brake');
            speed = 0;
        }
        else if (e.cooldown <= 0) {
            e.cooldown = (e.kind === 4 ? (e.hp < e.max * .5 ? 1.5 : 2.1) : e.kind === 3 ? 3.2 : 2.5) * difficulty.attackInterval;
            if (e.kind === 1) {
                e.wind = .45;
                e.dx = x / d;
                e.dy = y / d;
            }
            if (e.kind === 2 && d < 550) {
                e.wind = .75;
                e.dx = x / d;
                e.dy = y / d;
            }
            if (e.kind === 3)
                radial(state, hooks, e, progressionTime(state.time) >= 360 ? 14 : 10, 155 * difficulty.projectileSpeed);
            // Boss 每轮只抽一次：落点攻击或环形弹幕；半血后加快攻击并增加弹幕。
            if (e.kind === 4) {
                if (Math.random() < .5) {
                    e.wind = .85;
                    e.charge = 1;
                    e.dx = p.x;
                    e.dy = p.y;
                }
                else
                    radial(state, hooks, e, e.hp < e.max * .5 ? 24 : 16, (e.hp < e.max * .5 ? 205 : 170) * difficulty.projectileSpeed);
            }
        }
        e.x = clamp(e.x + (x / d * speed + e.kx) * dt, -LIMIT, LIMIT);
        e.y = clamp(e.y + (y / d * speed + e.ky) * dt, -LIMIT, LIMIT);
        e.kx *= Math.exp(-12 * dt);
        e.ky *= Math.exp(-12 * dt);
        for (const pillar of state.pillars) {
            const px = e.x - pillar.x, py = e.y - pillar.y, dist = Math.hypot(px, py), min = 35 + e.radius;
            if (dist < min && dist > 0) {
                e.x = pillar.x + px / dist * min;
                e.y = pillar.y + py / dist * min;
            }
        }
        // 最多查询 8 个邻居做轻量分离，避免高密度战斗退化为全量两两碰撞。
        for (const other of state.grid.query(e.x, e.y, e.radius + 26, 8, e)) {
            if (other === e || other.dead)
                continue;
            const a = e.x - other.x, b = e.y - other.y, len = Math.hypot(a, b), min = (e.radius + other.radius) * .8;
            if (len > 0 && len < min) {
                e.x += a / len * 25 * dt;
                e.y += b / len * 25 * dt;
            }
        }
        if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius + 15)
            hooks.hurt(e.damage);
        if (!hooks.isBattle())
            return;
    }
}
/** 使用蓄力时保存的方向，不追踪玩家新位置；后期改为对称三发散射。 */
function aimedVolley(state: EnemyAIState, hooks: EnemyAIHooks, e: Enemy): void {
    const angle = Math.atan2(e.dy, e.dx), count = progressionTime(state.time) >= 240 ? 3 : 1, speed = 210 * difficultyAt(state.time).projectileSpeed;
    for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * .18;
        hooks.shoot(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, e.damage, true, '#c99bef', e);
    }
}
/** 精英/Boss 共用环形弹幕，随局内时间旋转起始角；弹道上限由 shoot 统一执行。 */
function radial(state: EnemyAIState, hooks: EnemyAIHooks, e: Enemy, count: number, speed: number): void {
    startEnemyAction(e, 'burst');
    for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2 + state.time * .3;
        hooks.shoot(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, e.damage, true, e.kind === 4 ? '#efab82' : '#c29ce4');
    }
}

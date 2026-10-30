import type { Enemy, Player, Point } from '../shared/entities.js';
import type { HitFeedback } from '../rendering/hit-feedback.js';
import { difficultyAt } from '../game/difficulty.js';
/**
 * 伤害意图使用具名选项，禁止再用多个布尔位置参数表达不同来源。
 * 默认是普通直接命中；暴击须明确开启。持续伤害使用 impact=false，
 * 按秒累积再加 round=false；Buff/反伤使用 triggerBuffs=false 阻止递归。
 */
export interface DamageOptions {
    canCrit?: boolean;
    impact?: boolean;
    round?: boolean;
    triggerBuffs?: boolean;
    /** 仅压制白闪、粒子和数字；不取消物理击退、暴击停顿或伤害。 */
    quiet?: boolean;
    /** 实际命中来源的纯画面快照，不参与伤害计算。 */
    feedback?: HitFeedback;
}
export interface DamageResult {
    value: number;
    critical: boolean;
    impact: boolean;
    quiet: boolean;
    feedback?: HitFeedback;
}
export interface EnemyDamageState {
    player: Readonly<Point>;
    time: number;
    crit: number;
}
export interface EnemyDamageHooks {
    recordDamage(value: number): void;
    present(enemy: Enemy, result: DamageResult): void;
    /** 敌人已标记 dead。先结算击杀与掉落；返回 true 表示 Boss 终局，停止后续命中派发。 */
    killed(enemy: Enemy, triggerBuffs: boolean): boolean;
    triggerHit(x: number, y: number): void;
}
/**
 * 敌人伤害唯一规则入口。不依赖 Game、Laya、节点池或渲染器。
 * 顺序必须保持：暴击抽样 → 扣血/统计 → 击退/表现 → 死亡奖励 → 命中 Buff。
 * 死亡先置位再回调，递归 Buff 再命中同一敌人时不能重复奖励。
 */
export function damageEnemy(state: EnemyDamageState, hooks: EnemyDamageHooks, enemy: Enemy, base: number, options: DamageOptions = {}): void {
    if (enemy.dead)
        return;
    const { canCrit = false, impact = true, round = true, triggerBuffs = true, quiet = false, feedback } = options;
    // canCrit=false 时不得消耗随机数，持续伤害和连锁依赖这一约定保持随机序列。
    const critical = canCrit && Math.random() < state.crit;
    const value = round ? Math.max(1, Math.round(base * (critical ? 1.5 : 1))) : base;
    enemy.hp -= value;
    hooks.recordDamage(value);
    if (impact) {
        const dx = enemy.x - state.player.x, dy = enemy.y - state.player.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = enemy.kind === 4 ? 20 : enemy.kind === 3 ? 65 : 210 * difficultyAt(state.time).knockback;
        enemy.kx += dx / distance * force;
        enemy.ky += dy / distance * force;
    }
    hooks.present(enemy, {
        value, critical, impact, quiet, feedback
    });
    if (enemy.hp <= 0) {
        enemy.dead = true;
        if (hooks.killed(enemy, triggerBuffs))
            return;
    }
    // 普通致死命中仍派发 hit；Boss 致死命中在上方终局返回，不派发。
    if (triggerBuffs && impact)
        hooks.triggerHit(enemy.x, enemy.y);
}
export interface PlayerDamageState {
    player: Player;
    battle: boolean;
    training: boolean;
    reduction: number;
    /** 未装备反伤或冷却中为 undefined；数值由当前装备与属性计算。 */
    thornDamage?: number;
}
export interface PlayerDamageHooks {
    present(): void;
    /** 调用方必须先设置反伤冷却再遍历敌人，反伤不得再次触发 Buff。 */
    retaliate(damage: number): void;
    finish(): void;
    triggerHurt(x: number, y: number): void;
}
/** 训练只给无敌窗口；真实扣血后先反伤，再判死亡，存活才派发受击 Buff。 */
export function damagePlayer(state: PlayerDamageState, hooks: PlayerDamageHooks, damage: number): void {
    const player = state.player;
    if (player.inv > 0 || !state.battle)
        return;
    if (state.training) {
        player.inv = .5;
        return;
    }
    player.hp = Math.max(0, player.hp - Math.max(1, Math.round(damage * (1 - state.reduction))));
    player.inv = .5;
    hooks.present();
    if (state.thornDamage !== undefined)
        hooks.retaliate(state.thornDamage);
    if (player.hp <= 0)
        hooks.finish();
    else
        hooks.triggerHurt(player.x, player.y);
}

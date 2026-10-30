import type { DamageResult } from './combat-system.js';
import type { Enemy, DamageLabel, Effect } from '../shared/entities.js';
import type { VisualSettings } from '../rendering/quality.js';
import { HIT_SECONDS } from '../rendering/hit-feedback.js';
import { project } from '../shared/model.js';
export interface CombatFeedbackState {
    enemyCount: number;
    labels: DamageLabel[];
    visuals: Pick<VisualSettings, 'labels'>;
}
export interface CombatFeedbackHooks {
    acquireLabel(): any;
    effect(kind: Effect['kind'], x: number, y: number, color: string, life: number, tx?: number, ty?: number): void;
    kick(strength: number, duration: number): void;
    freeze(duration: number): void;
}
/**
 * 伤害结果转为有限的画面反馈。不扣血、不击退、不发 Buff，也不读取当前武器。
 * effect 回调统一应用 FX 预算，数字单独使用 labels 上限；不自行创建计时器或节点。
 * labels 传入当前数组并原地追加，重开后调用方必须重新提供状态，不能缓存旧数组。
 */
export function presentEnemyHit(state: CombatFeedbackState, hooks: CombatFeedbackHooks, enemy: Enemy, result: DamageResult): void {
    const { value, critical, impact, quiet, feedback } = result;
    if (impact) {
        if (!quiet) {
            enemy.flash = .09;
            if (feedback) {
                const life = HIT_SECONDS[feedback.weapon];
                enemy.hitReaction = { ...feedback, life };
                const direction = project(feedback.dx, feedback.dy);
                const variant = feedback.weapon === 'storm' ? 0 : feedback.weapon === 'flame' ? 1 : 2;
                // 用武器反馈替换通用 impact，不重复占用名额。FX 满时身体姿态仍然生效。
                hooks.effect('weaponHit', enemy.x, enemy.y, '#fff0dc', life, Math.atan2(direction.y, direction.x), variant);
            }
            else {
                hooks.effect('impact', enemy.x, enemy.y, critical ? '#ffe5a6' : '#d2fff1', .16, critical ? 26 : 16);
            }
        }
        // quiet 沿用原约定：压制装饰，不取消实际暴击停顿和震屏。
        if (critical) {
            hooks.kick(2, .06);
            hooks.freeze(.025);
        }
    }
    const showLabel = impact && !quiet && (critical || enemy.kind >= 3 || state.enemyCount < 80 || state.labels.length < 4);
    if (!showLabel || state.labels.length >= state.visuals.labels)
        return;
    const node = hooks.acquireLabel();
    node.text = `${critical ? '✦ ' : ''}${Math.round(value)}`;
    node.fontSize = critical ? 23 : 16;
    node.color = critical ? '#ffe0a0' : '#d2e5df';
    node.bold = critical;
    node.stroke = 2;
    node.strokeColor = '#10252c';
    state.labels.push({
        node, x: enemy.x, y: enemy.y, rise: 48, life: .65
    });
}

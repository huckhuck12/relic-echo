import { BUFF_LIMITS, BUFF_RULES } from './buff-config.js';
import type { BuffEffect, BuffFeedbackSink, BuffHost, BuffStatus, BuffTarget } from './buff-types.js';
/** 状态表有上限；容量不足的提前返回语义也要保留，不能在重构中改变进化触发。 */
function ensureStatus<T extends BuffTarget>(statuses: Map<T, BuffStatus>, target: T): BuffStatus | undefined {
    let status = statuses.get(target);
    if (!status) {
        if (statuses.size >= BUFF_LIMITS.targets)
            return;
        status = { burn: 0, burnDamage: 0, burnTick: BUFF_RULES.burn.tick, slow: 0 };
        statuses.set(target, status);
    }
    return status;
}
/** 碎裂扩散只续减速，不回到普通命中入口，防止传播伤害递归叠层。 */
export function applyBuffSlow<T extends BuffTarget>(statuses: Map<T, BuffStatus>, target: T, seconds: number): void {
    if (target.dead)
        return;
    const status = ensureStatus(statuses, target);
    if (status)
        status.slow = Math.max(status.slow, seconds);
}
/** 基础伤害先由调用方扣除；此处附加元素，返回 false 时不再派发进化。 */
export function applyBuffElement<T extends BuffTarget>(host: BuffHost<T>, statuses: Map<T, BuffStatus>, target: T, effect: BuffEffect, feedback: BuffFeedbackSink): boolean {
    feedback('impact', effect.element, target.x, target.y, effect.x, effect.y);
    if (effect.element === 'fire')
        feedback('scorch', effect.element, target.x, target.y);
    if (effect.element === 'lightning') {
        let count = 0;
        for (const other of host.query(target.x, target.y, BUFF_RULES.chain.radius)) {
            if (other === target || other.dead)
                continue;
            host.damage(other, effect.damage * BUFF_RULES.chain.damage, true, true);
            feedback('arc', 'lightning', target.x, target.y, other.x, other.y);
            if (++count === BUFF_RULES.chain.count)
                break;
        }
    }
    else if (effect.element === 'force')
        host.knock(target, BUFF_RULES.knockback, effect.x, effect.y);
    else if (!target.dead) {
        const status = ensureStatus(statuses, target);
        if (!status)
            return false;
        if (effect.element === 'ice')
            status.slow = BUFF_RULES.slow.duration;
        else {
            status.burn = BUFF_RULES.burn.duration;
            status.burnDamage = Math.max(status.burnDamage, effect.damage * BUFF_RULES.burn.damage);
        }
    }
    return true;
}
/** 先清死亡，再推进减速/灼烧；灼烧不使用冲击反馈，不回到普通 Buff 触发入口。 */
export function updateBuffStatuses<T extends BuffTarget>(statuses: Map<T, BuffStatus>, host: BuffHost<T>, dt: number): void {
    for (const [target, status] of statuses) {
        if (target.dead) {
            statuses.delete(target);
            continue;
        }
        status.slow = Math.max(0, status.slow - dt);
        if (status.burn > 0) {
            const elapsed = Math.min(dt, status.burn);
            status.burn = Math.max(0, status.burn - dt);
            status.burnTick -= elapsed;
            if (status.burnTick <= 0) {
                status.burnTick += BUFF_RULES.burn.tick;
                host.damage(target, status.burnDamage, false);
            }
        }
        if (target.dead || status.slow <= 0 && status.burn <= 0)
            statuses.delete(target);
    }
}

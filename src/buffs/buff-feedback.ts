import { BUFF_FEEDBACK } from './buff-config.js';
import type { BuffFeedback, Element } from './buff-types.js';
/** 近点/短时聚合密集反馈，只做装饰，不能访问伤害系统或消耗随机数。 */
export function enqueueBuffFeedback(items: BuffFeedback[], budget: number, kind: BuffFeedback['kind'], element: Element, x: number, y: number, tx = x, ty = y, level = 1): void {
    if (budget === 0)
        return;
    if (kind !== 'arc' && items.some(item => item.kind === kind && item.element === element
        && item.age < BUFF_FEEDBACK.mergeAge && Math.hypot(item.x - x, item.y - y) < BUFF_FEEDBACK.mergeRadius))
        return;
    if (items.length >= budget) {
        const index = items.findIndex(item => item.kind !== 'arc');
        if (index < 0)
            return;
        items.splice(index, 1);
    }
    const life = BUFF_FEEDBACK.lifetime[kind];
    items.push({
        kind, element, x, y, tx, ty, life, max: life, age: 0, level
    });
}
export function updateBuffFeedback(items: BuffFeedback[], dt: number): void {
    for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index];
        item.life -= dt;
        item.age += dt;
        if (item.life <= 0)
            items.splice(index, 1);
    }
}

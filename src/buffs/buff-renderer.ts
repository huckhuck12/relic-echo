import { glyph, ring, arc, drawBuffEffect, elementImpact } from './buff-visuals.js';
import { drawEvolutionState, drawEvolutionBurst } from './buff-evolution-visuals.js';
import type { BuffEvolutions } from './buff-evolutions.js';
import type { BuffEffect, BuffFeedback, BuffStatus, BuffTarget } from './buff-types.js';
export interface BuffRenderState<T extends BuffTarget> {
    effects: readonly BuffEffect[];
    feedback: readonly BuffFeedback[];
    statuses: ReadonlyMap<T, BuffStatus>;
    evolutions: BuffEvolutions<T>;
    visualBudget: number;
    visualTime: number;
}
/** 只读绘制适配器：地面范围在 floor，弹头/标记在 overlay，不修改模拟状态。 */
export function renderBuffs<T extends BuffTarget>(state: BuffRenderState<T>, overlay: any, project: (x: number, y: number) => {
    x: number;
    y: number;
}, floor: any, visible: (x: number, y: number) => boolean): void {
    const detail = state.visualBudget >= 30 ? 8 : state.visualBudget >= 20 ? 5 : 3;
    for (const effect of state.effects)
        if (visible(effect.x, effect.y))
            drawBuffEffect(overlay, floor, project, effect, detail);
    drawEvolutionState(overlay, floor, project, state.evolutions, visible, detail);
    let statusCount = 0;
    for (const [target, status] of state.statuses) {
        if (target.dead || !visible(target.x, target.y))
            continue;
        if (statusCount++ >= detail * 2)
            break;
        const q = project(target.x, target.y);
        if (status.slow > 0) {
            glyph(overlay, q.x - 13, q.y - 5, 'ice', 7);
            glyph(overlay, q.x + 13, q.y - 8, 'ice', 5);
        }
        if (status.burn > 0)
            glyph(overlay, q.x, q.y - 18 - (Math.sin(state.visualTime * 13 + target.x) + 1) * 3, 'fire', 6);
    }
    for (const feedback of state.feedback) {
        if (!visible(feedback.x, feedback.y) && !visible(feedback.tx, feedback.ty))
            continue;
        const t = 1 - feedback.life / feedback.max;
        if (feedback.kind === 'detonate' || feedback.kind === 'shatter')
            drawEvolutionBurst(overlay, floor, project, feedback.kind, feedback.x, feedback.y, t, feedback.level, detail);
        else if (feedback.kind === 'arc') {
            arc(overlay, project, feedback.x, feedback.y, feedback.tx, feedback.ty, feedback.age);
            const end = project(feedback.tx, feedback.ty);
            glyph(overlay, end.x, end.y - 27, 'lightning', 8 * (1 - t) + 2);
        }
        else if (feedback.kind === 'scorch')
            ring(floor, project, feedback.x, feedback.y, 12 + t * 15, t < .5 ? '#76442c' : '#4a3b2e', 3 * (1 - t) + 1);
        else
            elementImpact(overlay, floor, project, feedback.x, feedback.y, feedback.tx, feedback.ty, feedback.element, t, detail);
    }
}

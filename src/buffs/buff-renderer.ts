import { ring, drawBuffEffect, elementImpact } from './buff-visuals.js';
import { drawBuffStatus, drawBuffTransfer } from './buff-state-visuals.js';
import { drawEvolutionState, drawEvolutionBurst } from './buff-evolution-visuals.js';
import { paintVfx } from '../rendering/vfx-atlas.js';
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
        drawBuffStatus(overlay, floor, project, target, status, state.visualTime);
    }
    for (const feedback of state.feedback) {
        if (!visible(feedback.x, feedback.y) && !visible(feedback.tx, feedback.ty))
            continue;
        const t = 1 - feedback.life / feedback.max;
        if (t >= 1)
            continue;
        if (feedback.kind === 'detonate' || feedback.kind === 'shatter')
            drawEvolutionBurst(overlay, floor, project, feedback.kind, feedback.x, feedback.y, t, feedback.level, detail, feedback.branch);
        else if (feedback.kind === 'arc' || feedback.kind === 'reforge' || feedback.kind === 'shard' || feedback.kind === 'harvest')
            drawBuffTransfer(overlay, floor, project, feedback);
        else if (feedback.kind === 'scorch') {
            const q = project(feedback.x, feedback.y);
            if (!paintVfx(floor, 'field', 'fire', q.x, q.y, 28 + t * 22, 28 + t * 22, 0, .5 * (1 - t)))
                ring(floor, project, feedback.x, feedback.y, 12 + t * 15, t < .5 ? '#76442c' : '#4a3b2e', 3 * (1 - t) + 1);
        }
        else
            elementImpact(overlay, floor, project, feedback.x, feedback.y, feedback.tx, feedback.ty, feedback.element, t, detail);
    }
}

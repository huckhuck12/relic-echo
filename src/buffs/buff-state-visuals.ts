import type { BuffFeedback, BuffStatus, BuffTarget } from './buff-types.js';
import type { EvolutionMark } from './buff-evolutions.js';
import { glyph } from './buff-visuals.js';
import { clamp } from '../shared/model.js';
import { directionalShape, lightningStroke } from '../rendering/skill-visuals.js';
type Project = (x: number, y: number) => {
    x: number;
    y: number;
};
/** Separate lanes and silhouettes keep simultaneous ice/thunder marks readable. No frozen state is invented. */
export function drawBuffMark(g: any, x: number, y: number, element: 'ice' | 'lightning', mark: EvolutionMark, kind = 0): void {
    const ice = element === 'ice', slots = mark.source?.branch === (ice ? 'prison' : 'charge') ? 5 : 3;
    // Health bars occupy y-65 (ordinary) / y-90 (elite); keep both mark lanes above them.
    const row = y - (ice ? 79 : 94) - (kind >= 3 ? 25 : 0), color = ice ? '#a8e6ed' : '#d6b5ee';
    g.drawPoly(x - 27, row, ice ? [0, -5, 3, -2, 0, 4, -3, -2] : [1, -5, -3, 0, 0, 0, -1, 5, 4, -1, 1, -1], color);
    for (let i = 0; i < slots; i++) {
        const filled = i < mark.stacks, px = x - (slots - 1) * 4 + i * 8;
        const bright = filled && mark.stacks >= slots - 1 && mark.lock <= 0;
        g.drawPoly(px, row, ice ? [-2, 3, -3, -2, 0, -5, 3, -2, 2, 3] : [-3, 2, 0, -4, 3, -2, 1, 0, 3, 0, -1, 4], filled ? bright ? '#f4edda' : color : '#293d40', color, .7);
    }
    if (mark.lock > 0)
        g.drawLine(x - 16, row + 7, x - 16 + 32 * Math.min(1, mark.lock), row + 7, '#748d8b', 1);
}
/** Slow stays near the feet; burn sits to one side, leaving the mark lanes above the body free. */
export function drawBuffStatus(g: any, floor: any, project: Project, target: BuffTarget, status: BuffStatus, time: number): void {
    const q = project(target.x, target.y);
    if (status.slow > 0) {
        for (const side of [-1, 1])
            floor.drawLines(q.x, q.y, [side * 8, -2, side * 16, 0, side * 11, 3, side * 20, 4], '#8dbbc6', 1.2);
    }
    if (status.burn > 0)
        glyph(g, q.x + 13, q.y - 17 - Math.sin(time * 7 + target.x) * 2, 'fire', 5);
}
/** Cross-slot reactions use the actual origin/destination snapshots, never query combat or add FX. */
export function drawBuffTransfer(g: any, floor: any, project: Project, feedback: BuffFeedback): void {
    const t = clamp(1 - feedback.life / feedback.max, 0, 1);
    if (t >= 1)
        return;
    const to = project(feedback.x, feedback.y), from = project(feedback.tx, feedback.ty), ease = 1 - (1 - t) ** 3;
    if (feedback.kind === 'reforge') {
        // Target -> furnace: an inward tether, not the outward push of a normal force hit.
        const dx = from.x - to.x, dy = from.y - to.y, f = .15 + .7 * ease;
        directionalShape(g, to.x + dx * f, to.y - 18 * (1 - f) + dy * f, dx, dy + 18, [-14 * (1 - t), 0, 0, -3 * (1 - t), 8 * (1 - t), 0, 0, 3 * (1 - t)], '#efbe7c');
        floor.drawPoly(from.x, from.y, [0, -4 * (1 - t), 8 * (1 - t), 0, 0, 4 * (1 - t), -8 * (1 - t), 0], null, '#c38a58', 1);
        if (t < .4)
            glyph(g, to.x, to.y - 20, 'fire', 7 * (1 - t / .4));
    }
    else if (feedback.kind === 'shard') {
        const f = .25 + .75 * ease, x = from.x + (to.x - from.x) * f, y = from.y + (to.y - from.y) * f - 26;
        directionalShape(g, x, y, to.x - from.x, to.y - from.y, [-13 * (1 - t), 0, -3, -2 * (1 - t), 7 * (1 - t), 0, -3, 2 * (1 - t)], '#bceaf0');
        if (t < .35)
            glyph(g, to.x, to.y - 26, 'ice', 5 * (1 - t / .35));
    }
    else {
        lightningStroke(g, to.x, to.y - 27, from.x, from.y - 27, feedback.age, 1 - t, '#b79bd6', false);
        if (feedback.branch === 'spread') {
            const f = .3 + .7 * ease;
            directionalShape(g, to.x + (from.x - to.x) * f, to.y + (from.y - to.y) * f - 27, from.x - to.x, from.y - to.y, [-5 * (1 - t), -3 * (1 - t), 3 * (1 - t), 0, -5 * (1 - t), 3 * (1 - t), -2 * (1 - t), 0], '#ead3ff');
        }
    }
}

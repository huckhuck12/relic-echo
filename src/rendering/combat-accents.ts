import type { Effect } from '../shared/entities.js';
import { clamp, project } from '../shared/model.js';
import { directionalShape } from './skill-visuals.js';
/** Frame-local decoration budget; warnings, attack paths and damage bounds never enter it. */
export class CombatAccentBudget {
    private hits = 0;
    private trails = 0;
    private impacts = 0;
    detail = 3;
    reset(detail: number, effects: number, shots: number): void {
        this.detail = effects >= 24 || shots >= 60 ? Math.min(3, detail) : detail;
        this.hits = Math.min(18, Math.max(6, this.detail * 3));
        this.trails = 4;
        this.impacts = 8;
    }
    take(kind: Effect['kind']): boolean {
        if (kind === 'weaponHit')
            return this.hits-- > 0;
        if (kind === 'dash')
            return this.trails-- > 0;
        if (kind === 'impact' || kind === 'burst')
            return this.impacts-- > 0;
        return true;
    }
}
/** Two tapered cloth-like strokes, aligned to the captured dash direction. */
export function dashWake(g: any, effect: Effect): void {
    const t = clamp(1 - effect.life / effect.max, 0, 1);
    if (t >= 1)
        return;
    const q = project(effect.x, effect.y), d = project(Math.cos(effect.tx), Math.sin(effect.tx));
    const scale = (1 - t) * (1 - t), tail = 16 + 25 * t;
    directionalShape(g, q.x, q.y - 25, d.x, d.y, [-tail, 0, -8, -7 * scale, 9, -2 * scale, 3, 2 * scale, -10, 4 * scale], '#76a993');
    directionalShape(g, q.x, q.y - 16, d.x, d.y, [-tail * .8, 0, -5, -3 * scale, 10, 0, -6, 2 * scale], '#c8dfb6');
}
/** Small pointed flecks with ease-out drift and a short upward arc; no square confetti. */
export function impactFlecks(g: any, effect: Effect, detail: number): void {
    const t = clamp(1 - effect.life / effect.max, 0, 1);
    if (t >= 1)
        return;
    const q = project(effect.x, effect.y), ease = 1 - (1 - t) * (1 - t);
    const count = Math.min(effect.kind === 'impact' ? 4 : 6, detail);
    for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count + .4, distance = ease * (effect.tx || 24);
        const x = q.x + Math.cos(a) * distance, y = q.y - 24 + Math.sin(a) * distance * .5 - Math.sin(t * Math.PI) * 8;
        const size = 3 * (1 - t) + .5;
        directionalShape(g, x, y, Math.cos(a), Math.sin(a), [-size * 1.7, 0, 0, -size * .6, size, 0, 0, size * .6], effect.color);
    }
}

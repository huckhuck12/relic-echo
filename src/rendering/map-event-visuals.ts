import { project } from '../shared/model.js';
import { SEAL_RULES } from '../game/map-events.js';
import type { SealEvent } from '../game/map-events.js';
const CIRCLE = Array.from({ length: 49 }, (_, i) => {
    const angle = i * Math.PI / 24;
    return project(Math.cos(angle), Math.sin(angle));
});
/** Friendly ground rune, drawn before combat fields and danger telegraphs. No nodes or textures. */
export function drawMapEvents(graphics: any, sites: readonly SealEvent[]): void {
    for (const site of sites) {
        if (site.state !== 'available' && site.state !== 'active')
            continue;
        const q = project(site.x, site.y), radius = SEAL_RULES.holdRadius, color = site.state === 'active' ? '#92d7bd' : '#e1cc89';
        graphics.drawPoly(0, 0, CIRCLE.flatMap(p => [q.x + p.x * radius, q.y + p.y * radius]), null, color, 2);
        graphics.drawPoly(q.x, q.y, [0, -14, 22, 0, 0, 14, -22, 0], '#365b4d', color, 2);
        if (site.state === 'active') {
            const segments = Math.floor(site.progress / SEAL_RULES.holdSeconds * 48);
            for (let n = 0; n < segments; n++) {
                const a = CIRCLE[n], b = CIRCLE[n + 1];
                graphics.drawLine(q.x + a.x * (radius - 8), q.y + a.y * (radius - 8), q.x + b.x * (radius - 8), q.y + b.y * (radius - 8), color, 4);
            }
        }
    }
}

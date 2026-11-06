import { project } from '../shared/model.js';
import { sealRule, sealRelayPoints } from '../game/map-events.js';
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
        const q = project(site.x, site.y), rule = sealRule(site), radius = site.objective === 'relay' ? 160 : rule.radius, color = site.state === 'active' ? '#92d7bd' : '#e1cc89';
        if (site.objective === 'relay' && site.state === 'active') {
            const nodes = sealRelayPoints(site), current = Math.min(2, Math.floor(site.progress / 4));
            for (let i = 0; i < nodes.length; i++) {
                const p = project(nodes[i].x, nodes[i].y), tone = i < current ? '#92d7bd' : i === current ? '#e1cc89' : '#748d78';
                graphics.drawPoly(0, 0, CIRCLE.flatMap(v => [p.x + v.x * rule.radius, p.y + v.y * rule.radius]), null, tone, i === current ? 3 : 1);
                graphics.drawPoly(p.x, p.y, [0, -10, 14, 0, 0, 10, -14, 0], i < current ? tone : '#365b4d', tone, 2);
                if (i < nodes.length - 1) {
                    const next = project(nodes[i + 1].x, nodes[i + 1].y);
                    graphics.drawLine(p.x, p.y, next.x, next.y, '#748d78', 1);
                }
            }
            const target = project(nodes[current].x, nodes[current].y), fraction = site.progress / 4 - current;
            graphics.drawLine(target.x - 20, target.y + 17, target.x - 20 + 40 * fraction, target.y + 17, '#92d7bd', 3);
            continue;
        }
        graphics.drawPoly(0, 0, CIRCLE.flatMap(p => [q.x + p.x * radius, q.y + p.y * radius]), null, color, 2);
        graphics.drawPoly(q.x, q.y, [0, -14, 22, 0, 0, 14, -22, 0], '#365b4d', color, 2);
        if (site.objective === 'clear')
            graphics.drawPoly(q.x, q.y, [-10, -5, 10, 5, 7, 8, -13, -2, -10, -5, -7, -8, 13, 2, 10, 5], color);
        if (site.objective === 'guardian')
            graphics.drawPoly(q.x, q.y, [-12, 5, -13, -8, -5, -2, 0, -12, 5, -2, 13, -8, 12, 5], color);
        if (site.state === 'active') {
            const segments = Math.floor(site.progress / rule.goal * 48);
            for (let n = 0; n < segments; n++) {
                const a = CIRCLE[n], b = CIRCLE[n + 1];
                graphics.drawLine(q.x + a.x * (radius - 8), q.y + a.y * (radius - 8), q.x + b.x * (radius - 8), q.y + b.y * (radius - 8), color, 4);
            }
        }
    }
}

import { project } from '../shared/model.js';
import { SEAL_SITES } from '../game/map-events.js';
/** Muted floor materials; bright mint/gold belongs to active seals, red belongs to danger. */
export const MAP_REGIONS = [
    {
        id: 'grove', base: '#647e60', stone: '#87977a', ink: '#526d55', accent: '#a0ab80'
    },
    {
        id: 'court', base: '#858b76', stone: '#a3a58b', ink: '#6b7967', accent: '#c1baa0'
    },
    {
        id: 'spring', base: '#667f76', stone: '#8da69a', ink: '#516e65', accent: '#a9bcb0'
    },
    {
        id: 'gate', base: '#837e6c', stone: '#a8a086', ink: '#686c5b', accent: '#c0b18b'
    },
] as const;
/** Authored flat scenery: recorded once into the static ground, never collision geometry. */
export function drawMapRegions(g: any): void {
    const poly = (cx: number, cy: number, points: number[], fill: string, line?: string, width = 1) => {
        const out: number[] = [];
        for (let i = 0; i < points.length; i += 2) {
            const p = project(cx + points[i], cy + points[i + 1]);
            out.push(p.x, p.y);
        }
        g.drawPoly(0, 0, out, fill, line, width);
    };
    const line = (cx: number, cy: number, points: number[], color: string, width = 2) => {
        const out: number[] = [];
        for (let i = 0; i < points.length; i += 2) {
            const p = project(cx + points[i], cy + points[i + 1]);
            out.push(p.x, p.y);
        }
        g.drawLines(0, 0, out, color, width);
    };
    for (const [index, site] of SEAL_SITES.entries()) {
        const palette = MAP_REGIONS[index], x = site.x, y = site.y;
        // Broken irregular perimeter stays outside the 160-unit objective circle.
        poly(x, y, [-260, -100, -208, -231, -55, -264, 115, -230, 250, -98, 270, 68, 170, 235, -20, 265, -205, 178], palette.base);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 + .1, r = 212 + i % 3 * 11;
            const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
            poly(px, py, [-24, -15, 17, -18, 29, 0, 13, 17, -25, 12], palette.stone);
            line(px, py, [-17, 9, 10, 12, 22, 0], palette.ink, 1.5);
        }
        // Faint, segmented spokes guide exploration without imitating an active range ring.
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4;
            line(x, y, [Math.cos(a) * 110, Math.sin(a) * 110, Math.cos(a) * 178, Math.sin(a) * 178], palette.stone, 3);
        }
        if (site.id === 'grove') {
            // Pressed-leaf mosaics and fern fans, no opaque canopy above combatants.
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, px = x + Math.cos(a) * 175, py = y + Math.sin(a) * 175;
                for (const side of [-1, 1])
                    poly(px, py, [0, 12, side * 24, -2, side * 29, -24, side * 8, -12], i % 2 ? palette.ink : palette.accent);
            }
            line(x, y, [-42, 20, 0, -31, 42, 20, 0, 48, -42, 20], palette.stone, 4);
            line(x, y, [0, -31, 0, 48], palette.stone, 2);
        }
        else if (site.id === 'court') {
            // Three fragmented flat plinth prints communicate a ruined colonnade.
            for (const dx of [-130, 0, 130]) {
                poly(x + dx, y - 130, [-37, -27, 31, -30, 40, 20, 8, 31, -35, 24], palette.stone);
                line(x + dx, y - 130, [-22, 17, -18, -13, 20, -15, 22, 8], palette.ink, 3);
                line(x + dx, y - 130, [0, -26, -7, -1, 13, 27], palette.base, 4);
            }
            line(x, y, [-49, 36, -49, -36, 49, -36, 49, 36], palette.stone, 5);
            line(x, y, [-22, 36, -22, -8, 22, -8, 22, 36], palette.accent, 3);
        }
        else if (site.id === 'spring') {
            // Dry ripple inlay, not water: no promise of swimming or healing terrain.
            for (let i = 0; i < 3; i++) {
                const r = 58 + i * 36;
                const points: number[] = [];
                for (let n = 0; n <= 14; n++) {
                    const a = -.4 + n / 14 * Math.PI * 1.35;
                    points.push(Math.cos(a) * r, Math.sin(a) * r);
                }
                line(x, y, points, i === 0 ? palette.accent : palette.stone, 3);
            }
            poly(x, y, [-18, 0, 0, -27, 18, 0, 0, 22], palette.ink, palette.stone, 2);
        }
        else {
            // A threshold mosaic and outward chevrons, all flush with the ground.
            for (const dx of [-150, 150]) {
                poly(x + dx, y, [-22, -130, 22, -124, 22, 113, -22, 130], palette.stone);
                for (let n = -2; n <= 2; n++)
                    line(x + dx, y + n * 44, [-10, 9, 0, -5, 10, 9], palette.ink, 3);
            }
            for (const dy of [-145, 145])
                line(x, y + dy, [-96, 0, -40, 7, 0, -5, 40, 7, 96, 0], palette.accent, 4);
            line(x, y, [-36, 28, 0, -40, 36, 28, 0, 7, -36, 28], palette.stone, 4);
        }
        // Low-contrast stepping stones lead back to the central crossroad.
        const distance = Math.hypot(x, y), ux = x / distance, uy = y / distance;
        for (let d = 290, i = 0; d < distance - 160; d += 95, i++) {
            const px = x - ux * d - uy * (i % 2 ? 9 : -9), py = y - uy * d + ux * (i % 2 ? 9 : -9);
            poly(px, py, [-22, -12, 14, -17, 25, 3, 7, 15, -20, 9], palette.stone);
        }
    }
}

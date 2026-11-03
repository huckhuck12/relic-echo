import { experienceShapes, fragmentShapes, chestShapes } from './loot-presentation.js';
import { QUALITY_COLOR } from '../progression/config.js';
import { project, unproject } from '../shared/model.js';
import { oval, polygon } from './painted-art.js';
import type { Shape } from './voxel.js';
import { paintHostileShot } from './projectile-presentation.js';
import { paintFlameShot } from './skill-visuals.js';
export function pillarShapes(): Shape[] {
    return [oval(0, 3, 39, 12, '#364b3e', '#364b3e'),
        polygon([-32, 4, -36, -7, -24, -16, 24, -15, 35, -5, 31, 5], '#8f9880'),
        polygon([-23, -9, -25, -74, -18, -82, 21, -80, 24, -10], '#a4ac91'),
        polygon([9, -11, 10, -77, 21, -80, 24, -10], '#778976'),
        polygon([-30, -76, -33, -86, -21, -94, 23, -93, 32, -84, 29, -76], '#c3c6a5'),
        polygon([-18, -68, -5, -66, -9, -51, 1, -43, -2, -32], '#788b77'),
        polygon([-22, -18, -10, -24, -2, -19, 5, -24, 13, -16, 19, -20, 24, -9, -23, -9], '#708f63'),
        oval(-11, -73, 7, 2, '#d8d6b0', '#d8d6b0'),
        polygon([-4, -59, 2, -65, 8, -59, 2, -52], '#d5c28e')];
}
export function terrainShapes(index: number): Shape[] {
    const path = index < 3, variant = index % 3;
    const base = path ? ['#8d9477', '#91977a', '#889173'][variant] : ['#607d62', '#668266', '#5b765e'][variant];
    const a = project(120, 0), b = project(120, 120), c = project(0, 120);
    const s: Shape[] = [{ type: 'poly', p: [0, 0, a.x, a.y, b.x, b.y, c.x, c.y], fill: base }];
    for (let i = 0; i < 8; i++) {
        const q = project(12 + (i * 37 + variant * 19) % 96, 12 + (i * 29 + variant * 11) % 96);
        if (path)
            s.push(oval(q.x, q.y, 9 + i % 3 * 3, 2 + i % 2, variant === 1 ? '#9da187' : '#7d896d', variant === 1 ? '#9da187' : '#7d896d'));
        else
            s.push({ type: 'poly', p: [q.x - 4, q.y + 1, q.x - 4, q.y - 3, q.x - 1, q.y - 1, q.x + 1, q.y - 5, q.x + 2, q.y, q.x + 6, q.y - 2, q.x + 4, q.y + 2], fill: i % 3 === 0 ? '#819575' : '#70896b' });
    }
    return s;
}
/** 16 directions are a visual quantization only; velocity and collision remain exact. */
export function shotTile(hostile: boolean, flame: boolean, vx: number, vy: number, color: string): string {
    const d = project(vx, vy), angle = ((Math.round(Math.atan2(d.y, d.x) * 8 / Math.PI) + 16) % 16);
    return `shot:${hostile ? 'hostile' : flame ? 'flame' : 'plain'}:${hostile ? color : 'base'}:${angle}`;
}
export function actorAtlasFrames(): {
    key: string;
    shapes: Shape[];
}[] {
    const frames = [{ key: 'pillar', shapes: pillarShapes() }];
    for (const kind of ['#c99bef', '#c29ce4', '#efab82', 'flame'])
        for (let angle = 0; angle < 16; angle++) {
            const a = angle * Math.PI / 8, v = unproject(Math.cos(a) * 600, Math.sin(a) * 600), shapes: Shape[] = [];
            const g = { drawPoly(x: number, y: number, p: number[], fill: string) { shapes.push({ type: 'poly', p: p.map((n, i) => n + (i % 2 ? y : x)), fill }); } };
            const hostile = kind.startsWith('#'), flame = kind === 'flame', color = hostile ? kind : '#d3a4ff';
            if (hostile)
                paintHostileShot(g, v.x, v.y, color);
            else if (flame)
                paintFlameShot(g, v.x, v.y);
            else {
                shapes.push(oval(0, -18, 9, 7, '#edc68c'));
                shapes.push(oval(1, -19, 4, 3, '#fff2ce'));
            }
            frames.push({ key: shotTile(hostile, flame, v.x, v.y, color), shapes });
        }
    frames.push({ key: 'xp', shapes: experienceShapes() }, { key: 'heal', shapes: experienceShapes(true) }, { key: 'fragment', shapes: fragmentShapes() });
    for (let quality = 0; quality < 3; quality++)
        frames.push({ key: `chest:${quality}`, shapes: chestShapes(QUALITY_COLOR[quality]) });
    return frames;
}

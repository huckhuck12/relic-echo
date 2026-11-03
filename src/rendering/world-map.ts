import { project } from '../shared/model.js';
import { drawShapes } from './appearance.js';
import { pillarShapes, terrainShapes } from './painted-world.js';
import { ShapeAtlas } from './shape-atlas.js';
import type { EnemyAtlas } from './enemy-atlas.js';
import type { Point } from '../shared/entities.js';
/** Small repeatable meadow/path textures, never a world-sized backing store. */
export function buildWorldMap(ground: any, actors: any, pillars: readonly Point[], actorAtlas?: EnemyAtlas): {
    nodes: any[];
    bytes: number;
} {
    const terrain = new ShapeAtlas(Array.from({ length: 6 }, (_, i) => ({ key: String(i), shapes: terrainShapes(i) })), 1.5);
    const g = ground.graphics;
    for (let x = -1200; x < 1200; x += 120)
        for (let y = -1200; y < 1200; y += 120) {
            const seed = ((x + 1200) / 120 * 37 + (y + 1200) / 120 * 53) % 17;
            const index = (Math.abs(x) < 120 || Math.abs(y) < 120 ? 0 : 3) + seed % 3, q = project(x, y);
            if (!terrain.paint(g, String(index), q.x, q.y, false)) {
                const node = new Laya.Sprite();
                node.pos(q.x, q.y);
                drawShapes(node.graphics, terrainShapes(index));
                ground.addChild(node);
            }
        }
    for (let n = -1200; n < 1200; n += 120)
        for (const pos of [{ x: 1200, y: n }, { x: n, y: 1200 }]) {
            const a = project(pos.x, pos.y), b = project(pos.x + (pos.x === 1200 ? 0 : 120), pos.y + (pos.x === 1200 ? 120 : 0));
            g.drawPoly(0, 0, [a.x, a.y, b.x, b.y, b.x, b.y + 32, a.x, a.y + 32], '#71634f');
        }
    for (const r of [74, 110]) {
        const pts = [project(-r, -r), project(r, -r), project(r, r), project(-r, r)];
        g.drawPoly(0, 0, pts.flatMap(p => [p.x, p.y]), null, '#c8bc8d', 2);
    }
    g.drawPoly(0, 0, [-24, 0, 0, -12, 24, 0, 0, 12], '#c1bf9c', '#697b69', 2);
    g.drawPoly(0, -9, [-8, 0, 0, -13, 8, 0, 0, 7], '#e5ce92', '#7d8e71', 1);
    const nodes = pillars.map(pillar => {
        const node = new Laya.Sprite(), q = project(pillar.x, pillar.y);
        node.pos(q.x, q.y);
        node.zOrder = pillar.x + pillar.y;
        node.name = 'pillar';
        if (!actorAtlas?.paintKey(node.graphics, 'pillar'))
            drawShapes(node.graphics, pillarShapes());
        actors.addChild(node);
        return node;
    });
    return { nodes, bytes: terrain.bytes };
}

/** 静态程序地图只构建一次；碰撞和柱子遮挡共用传入的世界坐标。 */
import { project } from '../shared/model.js';
import { block, shade } from './voxel.js';
import { drawShapes } from './appearance.js';
import type { Point } from '../shared/entities.js';
declare const Laya: any;
export function buildWorldMap(ground: any, actors: any, pillars: readonly Point[]): any[] {
    const pillarNodes: any[] = [];
    const g = ground.graphics;
    // 确定性纹理不消耗战斗随机数；地图只建一次，不在渲染帧重画。
    const tile = (x: number, y: number, size: number, color: string) => {
        const a = project(x, y), b = project(x + size, y), c = project(x + size, y + size), d = project(x, y + size);
        g.drawPoly(0, 0, [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], color);
    };
    for (let x = -1200; x < 1200; x += 120)
        for (let y = -1200; y < 1200; y += 120) {
            const ix = (x + 1200) / 120, iy = (y + 1200) / 120, seed = (ix * 37 + iy * 53) % 17, path = Math.abs(x) < 120 || Math.abs(y) < 120;
            const color = path ? ['#495143', '#4d5546', '#454f40'][seed % 3] : ['#304a32', '#344e35', '#2e4530'][seed % 3];
            tile(x, y, 120, color);
            for (let k = 0; k < 1; k++) {
                const px = x + 12 + ((seed * 13 + k * 29) % 84), py = y + 12 + ((seed * 19 + k * 31) % 84);
                tile(px, py, 12 + (k % 2) * 6, shade(color, k % 2 ? 1.12 : .87));
            }
        }
    // 隆起土层仅位于碰撞边界之外，视觉高度不引入额外可行走区域。
    for (let n = -1200; n < 1200; n += 120) {
        for (const pos of [{ x: 1200, y: n }, { x: n, y: 1200 }]) {
            const a = project(pos.x, pos.y), b = project(pos.x + (pos.x === 1200 ? 0 : 120), pos.y + (pos.x === 1200 ? 120 : 0));
            g.drawPoly(0, 0, [a.x, a.y, b.x, b.y, b.x, b.y + 32, a.x, a.y + 32], '#674a30', '#483a29', 1);
        }
    }
    const center = new Laya.Sprite();
    ground.addChild(center);
    const cg = center.graphics;
    for (const r of [74, 110]) {
        const pts = [project(-r, -r), project(r, -r), project(r, r), project(-r, r)];
        cg.drawPoly(0, 0, pts.flatMap(p => [p.x, p.y]), null, '#a4a46b', 3);
    }
    const altar = new Laya.Sprite();
    center.addChild(altar);
    drawShapes(altar.graphics, [...block(-17, 0, 30, 7, 12, '#688273'), ...block(-7, -7, 10, 6, 4, '#c5b96a')]);
    for (const pillar of pillars) {
        const node = new Laya.Sprite(), p = project(pillar.x, pillar.y);
        node.pos(p.x, p.y);
        node.zOrder = pillar.x + pillar.y;
        const shapes = [...block(-34, 5, 52, 14, 17, '#6b7159')];
        for (let layer = 0; layer < 3; layer++) {
            shapes.push(...block(-24, -9 - layer * 23, 34, 22, 14, layer % 2 ? '#78816a' : '#68765d'));
            shapes.push({ type: 'rect' as const, p: [-19, -25 - layer * 23, 8, 5], fill: layer === 1 ? '#8aba70' : '#899076' });
        }
        shapes.push(...block(-31, -78, 47, 12, 18, '#8d9478'));
        drawShapes(node.graphics, shapes);
        actors.addChild(node);
        node.name = 'pillar';
        pillarNodes.push(node);
    }
    for (let i = 0; i < 64; i++) {
        const x = Math.sin(i * 13.77) * 1080, y = Math.cos(i * 8.91) * 1080;
        if (Math.abs(x) < 130 || Math.abs(y) < 130)
            continue;
        const p = project(x, y);
        if (i % 4 === 0) {
            for (const shape of block(p.x, p.y, 9, 5, 4, '#6f795d')) {
                if (shape.type === 'poly')
                    g.drawPoly(0, 0, shape.p, shape.fill);
                else
                    g.drawRect(...shape.p, shape.fill);
            }
        }
        else {
            g.drawRect(p.x, p.y - 7, 3, 8, '#60844b');
            g.drawRect(p.x - 4, p.y - 4, 3, 5, '#769151');
        }
    }
    return pillarNodes;
}

import type { Element, Action } from './buff-types.js';
import { directionalShape, lightningStroke, spark } from '../rendering/skill-visuals.js';
type Project = (x: number, y: number) => {
    x: number;
    y: number;
};
export const ELEMENT_COLOR = { fire: '#ff9951', ice: '#85ddff', lightning: '#d6b0ff', force: '#ffe3a0' };
/** 三档只改变材质和局部符纹；等级由生成时快照提供，渲染不查询当前配方。 */
export function buffVisualTier(level = 1): 0 | 1 | 2 { return level >= 5 ? 2 : level >= 3 ? 1 : 0; }
export const RANK_CORE = { fire: '#fff1b0', ice: '#ecfdff', lightning: '#f6e9ff', force: '#fff6d6' };
const RANK_TINT = { fire: '#ffd48a', ice: '#bcf0ff', lightning: '#e9d4ff', force: '#fff0c4' };
/** 局部封印：低画质最多一个图元，满级用八角轮廓替换四角轮廓，不堆粒子。
 * radius 是世界半径，调用方始终给出小于实际范围的值；动画不向范围外扩散。
 */
export function buffRankSeal(g: any, project: Project, x: number, y: number, element: Element, level: number, age: number, radius: number, detail: number): void {
    const tier = buffVisualTier(level);
    if (!tier)
        return;
    const points: number[] = [], count = tier === 2 ? 8 : 4;
    for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count, r = tier === 2 && i % 2 ? radius * .55 : radius;
        const q = project(x + Math.cos(a) * r, y + Math.sin(a) * r);
        points.push(q.x, q.y);
    }
    g.drawPoly(0, 0, points, null, tier === 2 ? RANK_CORE[element] : ELEMENT_COLOR[element], tier === 2 ? 2 : 1.5);
    if (detail >= 5) {
        const q = project(x, y);
        g.drawPoly(q.x, q.y, [0, -3, 4, 0, 0, 3, -4, 0], RANK_CORE[element]);
        // 仅释放前 140ms 的小范围闪纹；复用主效果寿命，不新建 FX/计时器。
        if (tier === 2 && age < .14)
            ring(g, project, x, y, radius * (.4 + age * 3), RANK_CORE[element], 2);
    }
}
export function ring(g: any, project: Project, x: number, y: number, r: number, color: string, width = 2): void {
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) {
        const a = i * Math.PI / 10, p = project(x + Math.cos(a) * r, y + Math.sin(a) * r);
        pts.push(p.x, p.y);
    }
    g.drawLines(0, 0, pts, color, width);
}
/** Elements differ in silhouette as well as color. */
export function glyph(g: any, x: number, y: number, element: Element, size: number, phase = 0): void {
    const c = ELEMENT_COLOR[element];
    if (element === 'fire') {
        g.drawPoly(x, y, [-size * 1.2, 0, -size * .8, -size * .9, -size * .2, -size * .6, size * .2, -size * 1.9, size, -size * .7, size * 1.2, 0], '#8e443c');
        g.drawPoly(x, y, [-size, 0, -size * .7, -size * .8, -size * .2, -size * .5, size * .2, -size * 1.8, size * .8, -size * .6, size, 0], c);
        g.drawPoly(x, y, [-size * .4, 0, size * .1, -size, size * .4, 0], '#fff1b0');
    }
    else if (element === 'ice') {
        g.drawPoly(x, y, [0, -size * 1.7, size * .75, -size * .5, 0, size * .4, -size * .75, -size * .5], '#4689bc', '#d8f7ff', 1);
        g.drawPoly(x, y, [0, -size * 1.7, size * .75, -size * .5, 0, size * .4], c);
        g.drawLine(x, y - size * 1.3, x, y + size * .1, '#f0fdff', 1);
    }
    else if (element === 'lightning') {
        g.drawPoly(x, y, [size * .2, -size * 1.6, -size * .7, -size * .3, 0, -size * .3, -size * .3, size * .7, size * .8, -size * .6, size * .1, -size * .6], c, '#f9ebff', 1);
        g.drawLine(x + size * .1, y - size * 1.15, x - size * .1, y - size * .2, '#ffffff', 2);
    }
    else {
        const d = size * (.7 + Math.sin(phase) * .1);
        g.drawPoly(x, y, [-d, 0, 0, -d, d, 0, 0, d], null, c, 2);
        g.drawLine(x - d * .4, y, x + d * .4, y, '#fff8df', 2);
    }
}
export function arc(g: any, project: Project, x: number, y: number, tx: number, ty: number, age: number): void {
    const a = project(x, y), b = project(tx, ty);
    lightningStroke(g, a.x, a.y - 27, b.x, b.y - 27, age, Math.max(.1, 1 - age / .24), '#cfadff');
}
/** Buff 图形快照，不包含伤害、查询或回调；渲染器无法触发新命中。 */
export interface BuffVisualEffect {
    kind: Action;
    element: Element;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    level?: number;
}
/**
 * 让行为决定运动方式、元素决定材质轮廓；复用现有运行时与装饰预算。
 * 地面区域与轨道只画在 floor，爆发/弹头画在 overlay，不将所有组合都画成圆圈撒图标。
 */
export function drawBuffEffect(overlay: any, floor: any, project: Project, e: BuffVisualEffect, detail: number): void {
    const c = ELEMENT_COLOR[e.element], q = project(e.x, e.y), tier = buffVisualTier(e.level);
    if (e.kind === 'bolt') {
        const back = project(e.x - e.vx * .075, e.y - e.vy * .075), dx = q.x - back.x, dy = q.y - back.y;
        directionalShape(overlay, q.x, q.y - 24, dx, dy, [-44, 0, -14, -8, 5, -8, 15, 0, 5, 8, -14, 8], e.element === 'fire' ? '#9a493b' : '#384d75');
        directionalShape(overlay, q.x, q.y - 24, dx, dy, [-32, 0, -8, -5, 10, 0, -8, 5], tier === 2 ? RANK_CORE[e.element] : tier === 1 ? RANK_TINT[e.element] : c);
        glyph(overlay, q.x, q.y - 24, e.element, 10, e.age * 12);
        if (detail >= 5)
            spark(overlay, back.x, back.y - 24, 3, c);
        if (tier) {
            directionalShape(overlay, q.x, q.y - 24, dx, dy, [-25, 0, -9, -2, 7, 0, -9, 2], RANK_CORE[e.element]);
            if (tier === 2)
                directionalShape(overlay, q.x, q.y - 24, dx, dy, [-30, -5, -13, -7, -19, -3, -13, 0, -19, 3, -13, 7, -30, 5, -25, 0], c);
            if (tier === 2 && detail >= 5 && e.age < .14)
                spark(overlay, q.x, q.y - 24, 8 * (1 - e.age / .14), RANK_CORE[e.element]);
        }
    }
    else if (e.kind === 'orbit') {
        ring(floor, project, e.x, e.y, 90, c, 1);
        for (let n = 0; n < 2; n++) {
            const tail: number[] = [];
            for (let j = detail; j >= 0; j--) {
                const a = e.age * 6 + n * Math.PI - j * .13, v = project(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
                tail.push(v.x, v.y - 22);
            }
            overlay.drawLines(0, 0, tail, e.element === 'fire' ? '#9e533f' : '#4c526f', 7);
            overlay.drawLines(0, 0, tail, tier === 2 ? RANK_CORE[e.element] : tier === 1 ? RANK_TINT[e.element] : c, 3);
            const a = e.age * 6 + n * Math.PI, tip = project(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
            glyph(overlay, tip.x, tip.y - 22, e.element, 14, e.age * 12);
            spark(overlay, tip.x, tip.y - 25, 4, '#fff4d2');
            if (tier) {
                // 符纹沿既有双轨道运动，既不新增环绕物，也不延长轨迹。
                overlay.drawPoly(tip.x, tip.y - 22, tier === 2 ? [-8, 0, -4, -3, 0, -8, 4, -3, 8, 0, 4, 3, 0, 8, -4, 3] : [0, -5, 5, 0, 0, 5, -5, 0], null, RANK_CORE[e.element], tier === 2 ? 2 : 1);
                if (tier === 2 && detail >= 5)
                    overlay.drawLine(tip.x - 3, tip.y - 22, tip.x + 3, tip.y - 22, RANK_CORE[e.element], 2);
            }
        }
    }
    else if (e.kind === 'field') {
        ring(floor, project, e.x, e.y, 90, c, 2);
        // 内部纹路低亮、边界高亮，保留可读范围而不糊成整块高亮色。
        const dim = { fire: '#81503b', ice: '#3d6c86', lightning: '#65547d', force: '#77664a' }[e.element];
        ring(floor, project, e.x, e.y, 76, dim, 1);
        for (let i = 0; i < detail; i++) {
            const a = i * Math.PI * 2 / detail, v = project(e.x + Math.cos(a) * 66, e.y + Math.sin(a) * 66);
            const pulse = .5 + .5 * Math.sin(e.age * 7 + i * 2);
            if (e.element === 'lightning') {
                const end = project(e.x + Math.cos(a + .25) * 35, e.y + Math.sin(a + .25) * 35);
                floor.drawLines(0, 0, [v.x, v.y, (v.x + end.x) / 2 + 6, (v.y + end.y) / 2 - 3, end.x, end.y], i % 2 ? dim : c, 1.5);
            }
            else if (e.element === 'force') {
                const d = project(Math.cos(a), Math.sin(a));
                directionalShape(floor, v.x, v.y, d.x, d.y, [-7, -5, 4, -5, 10, 0, 4, 5, -7, 5, -1, 0], dim);
            }
            else
                glyph(floor, v.x, v.y - 2, e.element, e.element === 'ice' ? 9 : 5 + pulse * 5, e.age * 8);
        }
        if (e.element === 'force')
            ring(floor, project, e.x, e.y, 90 * ((e.age * 1.5) % 1), c, 2);
        buffRankSeal(floor, project, e.x, e.y, e.element, e.level || 1, e.age, 32, detail);
    }
    else {
        const t = Math.min(1, e.age / .25), r = 110 * (1 - Math.pow(1 - t, 3));
        ring(floor, project, e.x, e.y, r, c, 4 * (1 - t) + 1);
        if (e.element === 'force') {
            ring(floor, project, e.x, e.y, r * .7, '#fff0c4', 2 * (1 - t) + 1);
            for (let i = 0; i < detail; i++) {
                const a = i * Math.PI * 2 / detail, v = project(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r), d = project(Math.cos(a), Math.sin(a));
                directionalShape(overlay, v.x, v.y - 12, d.x, d.y, [-16, -6, 0, -6, 10, 0, 0, 6, -16, 6, -7, 0], c);
            }
        }
        else if (e.element === 'lightning') {
            for (let i = 0; i < Math.min(4, detail); i++) {
                const a = i * Math.PI * 2 / Math.min(4, detail), v = project(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
                lightningStroke(overlay, q.x, q.y - 23, v.x, v.y - 23, e.age, 1 - t, c);
            }
        }
        else {
            for (let i = 0; i < detail; i++) {
                const a = i * Math.PI * 2 / detail, v = project(e.x + Math.cos(a) * r * .72, e.y + Math.sin(a) * r * .72);
                glyph(overlay, v.x, v.y - 5 - Math.sin(t * Math.PI) * 22, e.element, (e.element === 'ice' ? 18 : 22) * (1 - t) + 3, e.age * 12);
            }
        }
        if (t < .45)
            spark(overlay, q.x, q.y - 22, 26 * (1 - t / .45), '#fff4dc');
        buffRankSeal(floor, project, e.x, e.y, e.element, e.level || 1, e.age, Math.min(40, r * .5), detail);
    }
}
/** 元素命中采用短促白芯与各自的碎片；持续场反馈已由运行时聚合，避免每目标喷一整套特效。 */
export function elementImpact(g: any, floor: any, project: Project, x: number, y: number, tx: number, ty: number, element: Element, t: number, detail: number): void {
    const c = ELEMENT_COLOR[element], q = project(x, y), angle = Math.atan2(y - ty, x - tx);
    if (t < .35)
        spark(g, q.x, q.y - 24, 12 * (1 - t / .35), '#fff5da');
    for (let i = 0; i < detail; i++) {
        const a = element === 'force' ? angle + (i / (detail - 1) - .5) * 1.1 : i * Math.PI * 2 / detail, d = 10 + t * 40, v = project(x + Math.cos(a) * d, y + Math.sin(a) * d);
        if (element === 'force') {
            const direction = project(Math.cos(a), Math.sin(a));
            directionalShape(g, v.x, v.y - 20, direction.x, direction.y, [-9, -2, 7, -2, 11, 0, 7, 2, -9, 2], c);
        }
        else
            glyph(g, v.x, v.y - 17 - t * 14, element, 6 * (1 - t) + 1, t * 8);
    }
    if (element === 'force')
        ring(floor, project, x, y, 12 + t * 38, c, 2 * (1 - t) + 1);
}

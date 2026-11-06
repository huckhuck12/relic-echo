import type { BuffTarget, BuffBranch } from './buff-types.js';
import type { BuffEvolutions } from './buff-evolutions.js';
import { ring, buffRankSeal, buffVisualTier, RANK_CORE } from './buff-visuals.js';
import { paintVfx } from '../rendering/vfx-atlas.js';
import { drawBuffMark } from './buff-state-visuals.js';
import { directionalShape } from '../rendering/skill-visuals.js';
import { clamp } from '../shared/model.js';
type Project = (x: number, y: number) => {
    x: number;
    y: number;
};
/**
 * 进化只读显示：火种/燃烧带在地面层，叠层在受影响敌人附近。
 * 所有节点、标记、线段都来自已完成的模拟状态，绘制不能产生伤害或消耗随机数。
 */
export function drawEvolutionState<T extends BuffTarget>(overlay: any, floor: any, project: Project, state: BuffEvolutions<T>, visible: (x: number, y: number) => boolean, detail: number): void {
    // 连线是实际伤害范围，所有画质都保留轮廓；最多 8 线/6 火种，不受粒子开关影响。
    for (const { a, b, level } of state.links) {
        if (!visible(a.x, a.y) && !visible(b.x, b.y) && !visible((a.x + b.x) / 2, (a.y + b.y) / 2))
            continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * 24, ny = dx / d * 24;
        const corners = [[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]].flatMap(([x, y]) => {
            const q = project(x, y);
            return [q.x, q.y];
        });
        floor.drawPoly(0, 0, corners, null, '#bd7846', 1);
        const p = project(a.x, a.y), q = project(b.x, b.y);
        const tier = buffVisualTier(level);
        floor.drawLine(p.x, p.y, q.x, q.y, tier === 2 ? RANK_CORE.fire : tier === 1 ? '#ffd28d' : '#efb26b', tier === 2 ? 2 : 1.5);
        for (let i = 0; i < 3; i++) {
            const f = (i + .5) / 3;
            paintVfx(floor, 'focus', 'fire', p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, 13 + tier * 2, 13 + tier * 2, 0, .7);
        }
    }
    for (const seed of state.seeds)
        if (visible(seed.x, seed.y)) {
            const q = project(seed.x, seed.y);
            const tier = buffVisualTier(seed.level);
            // 替换原两枚图元，满级火种为冠状符纹；不增加数量或改变燃烧带宽度。
            if (!paintVfx(floor, 'focus', 'fire', q.x, q.y - 2, 24 + tier * 3)) {
                floor.drawPoly(q.x, q.y, tier === 2 ? [-10, 0, -5, -2, 0, -5, 5, -2, 10, 0, 5, 2, 0, 5, -5, 2] : [0, -5, 10, 0, 0, 5, -10, 0], '#66452c', tier ? RANK_CORE.fire : '#e5ad69', 1);
                floor.drawPoly(q.x, q.y, [0, -3, 5, 0, 0, 3, -5, 0], tier ? '#fff1b0' : '#e5ad69');
            }
        }
    for (const [element, map] of [['lightning', state.thunder], ['ice', state.frost]] as const) {
        let count = 0;
        for (const [target, mark] of map) {
            if (target.dead || mark.life <= 0 || mark.stacks === 0 && mark.lock <= 0 || !visible(target.x, target.y))
                continue;
            if (count++ >= detail)
                break;
            const q = project(target.x, target.y);
            drawBuffMark(overlay, q.x, q.y, element, mark, target.kind);
        }
    }
}
/** 爆发和普通元素反馈共用上限；满级高画质每次最多 7 个图元，不堆叠全屏亮斑。 */
export function drawEvolutionBurst(g: any, floor: any, project: Project, kind: 'detonate' | 'shatter', x: number, y: number, t: number, level = 1, detail = 3, branch?: BuffBranch): void {
    t = clamp(t, 0, 1);
    if (t >= 1)
        return;
    const element = kind === 'detonate' ? 'lightning' : 'ice', q = project(x, y), color = kind === 'detonate' ? '#cba3ed' : '#8bd3e6';
    const charge = branch === 'charge', ease = 1 - (1 - t) ** 3;
    if (charge)
        floor.drawPoly(q.x, q.y, [0, -7, 15, 0, 0, 7, -15, 0], null, color, 1.5 * (1 - t));
    else
        ring(floor, project, x, y, 14 + ease * (kind === 'detonate' ? 60 : 72), color, 1.5 * (1 - t) + .3);
    const flash = Math.max(0, 1 - t / .55), size = 38 + ease * 20;
    if (!paintVfx(g, 'impact', element, q.x, q.y - 27, charge ? 28 : size, charge ? size * 1.25 : size, 0, flash * flash) && flash > 0)
        g.drawPoly(q.x, q.y - 27, kind === 'shatter' ? [-8 * flash, 0, 0, -16 * flash, 8 * flash, 0, 0, 8 * flash] : [3 * flash, -20 * flash, -9 * flash, 1, 1, 1, -3 * flash, 16 * flash, 11 * flash, -4, 2, -4], color);
    if (detail >= 5)
        for (const side of [-1, 1]) {
            const a = side < 0 ? -.7 : 2.4, spread = charge ? 9 : 12 + ease * 26;
            directionalShape(g, q.x + Math.cos(a) * spread, q.y - 27 + Math.sin(a) * spread * .5, Math.cos(a), Math.sin(a), [-9 * (1 - t), 0, 0, -3 * (1 - t), 6 * (1 - t), 0, 0, 3 * (1 - t)], color);
        }
    buffRankSeal(floor, project, x, y, element, level, t * .3, 18 + t * 12, detail);
}

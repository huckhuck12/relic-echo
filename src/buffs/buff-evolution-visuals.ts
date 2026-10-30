import type { BuffTarget } from './buff-types.js';
import type { BuffEvolutions } from './buff-evolutions.js';
import { glyph, ring, buffRankSeal, buffVisualTier, RANK_CORE } from './buff-visuals.js';
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
        floor.drawPoly(0, 0, corners, '#503c2d', '#bd7846', 1);
        const p = project(a.x, a.y), q = project(b.x, b.y);
        const tier = buffVisualTier(level);
        floor.drawLine(p.x, p.y, q.x, q.y, tier === 2 ? RANK_CORE.fire : tier === 1 ? '#ffd28d' : '#efb26b', tier === 2 ? 2 : 1.5);
    }
    for (const seed of state.seeds)
        if (visible(seed.x, seed.y)) {
            const q = project(seed.x, seed.y);
            const tier = buffVisualTier(seed.level);
            // 替换原两枚图元，满级火种为冠状符纹；不增加数量或改变燃烧带宽度。
            floor.drawPoly(q.x, q.y, tier === 2 ? [-10, 0, -5, -2, 0, -5, 5, -2, 10, 0, 5, 2, 0, 5, -5, 2] : [0, -5, 10, 0, 0, 5, -10, 0], '#66452c', tier ? RANK_CORE.fire : '#e5ad69', 1);
            floor.drawPoly(q.x, q.y, [0, -3, 5, 0, 0, 3, -5, 0], tier ? '#fff1b0' : '#e5ad69');
        }
    let count = 0;
    for (const [element, map] of [['lightning', state.thunder], ['ice', state.frost]] as const)
        for (const [target, mark] of map) {
            if (target.dead || mark.stacks === 0 || !visible(target.x, target.y))
                continue;
            if (count++ >= detail * 2)
                return;
            const q = project(target.x, target.y), color = element === 'ice' ? '#91dcf3' : '#d2adf3';
            glyph(overlay, q.x - 14, q.y - 48, element, 5);
            for (let i = 0; i < 3; i++)
                overlay.drawPoly(q.x - 5 + i * 7, q.y - 53, [0, -3, 3, 0, 0, 3, -3, 0], i < mark.stacks ? color : '#283f42', color, 1);
        }
}
/** 爆发和普通元素反馈共用上限；满级高画质每次最多 7 个图元，不堆叠全屏亮斑。 */
export function drawEvolutionBurst(g: any, floor: any, project: Project, kind: 'detonate' | 'shatter', x: number, y: number, t: number, level = 1, detail = 3): void {
    const element = kind === 'detonate' ? 'lightning' : 'ice', q = project(x, y), color = kind === 'detonate' ? '#cba3ed' : '#8bd3e6';
    ring(floor, project, x, y, 20 + t * (kind === 'detonate' ? 75 : 90), color, 2 * (1 - t) + .5);
    glyph(g, q.x, q.y - 30 - t * 8, element, 14 * (1 - t) + 2);
    buffRankSeal(floor, project, x, y, element, level, t * .3, 18 + t * 12, detail);
}

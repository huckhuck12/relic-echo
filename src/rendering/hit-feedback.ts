import type { Weapon } from '../progression/config.js';
import type { Effect } from '../shared/entities.js';
import { clamp, project } from '../shared/model.js';
/** 武器命中的纯画面快照。方向来自实际连锁来源/爆心/轨道切线，不能用当前装备倒推。 */
export interface HitFeedback {
    weapon: Weapon;
    dx: number;
    dy: number;
}
export const HIT_SECONDS: Record<Weapon, number> = { storm: .18, flame: .24, blade: .14 };
/** 最多六条图形，无随机数、滤镜、节点或伤害；和普通 FX 共用数量预算。 */
export function drawHitFeedback(g: any, effect: Effect): void {
    const q = project(effect.x, effect.y), t = clamp(1 - effect.life / effect.max, 0, 1);
    if (t >= 1)
        return;
    const dx = Math.cos(effect.tx), dy = Math.sin(effect.tx), x = q.x, y = q.y - 26;
    if (effect.ty === 0) {
        // 身体两侧的短电弧按离散阶段换折点，强调抽动，不用全屏白闪。
        const phase = Math.floor(t * 4);
        for (const side of [-1, 1])
            g.drawLines(x, y, [side * 4, -16, side * (12 + phase), -7, side * 7, 1, side * (16 - phase), 10, side * 5, 17], t < .5 ? '#b9f8ff' : '#608cab', 2 * (1 - t) + .5);
        if (t < .35)
            g.drawRect(x - 3, y - 5, 6, 10, '#f0ffff');
    }
    else if (effect.ty === 1) {
        // 爆炸本体已有焰冠；此处只画每个受击点的短亮芯和向外飞散余烬。
        if (t < .25)
            g.drawPoly(x, y, [0, -9, 7, 0, 0, 9, -7, 0], '#fff2bb');
        for (let i = 0; i < 3; i++) {
            const a = effect.tx + (i - 1) * .7, d = 5 + 22 * t, size = 3 * (1 - t) + 1;
            g.drawRect(x + Math.cos(a) * d, y + Math.sin(a) * d - 10 * t, size, size, t < .4 ? '#ffd084' : '#bd6545');
        }
    }
    else {
        // 三层短切痕沿实际飞刃切线展开；尾屑只有两片，不画大面积扫光。
        const reach = 9 + 17 * t, points = [x - dx * reach, y - dy * reach, x + dx * reach, y + dy * reach];
        g.drawLines(0, 0, points, '#59416d', 5 * (1 - t) + 1);
        g.drawLines(0, 0, points, t < .4 ? '#fff0ff' : '#b399d1', 2 * (1 - t) + .5);
        for (const side of [-1, 1])
            g.drawRect(x + dx * reach * side - dy * 8 * t, y + dy * reach * side + dx * 8 * t, 3 * (1 - t) + 1, 2, '#c3abd9');
    }
}

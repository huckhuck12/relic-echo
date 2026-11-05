import type { Weapon } from '../progression/config.js';
import type { Effect } from '../shared/entities.js';
import { clamp, project } from '../shared/model.js';
import { paintVfx } from './vfx-atlas.js';
import { directionalShape } from './skill-visuals.js';
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
        // One compact strike core, then two short residual arcs around the target.
        const flash = Math.max(0, 1 - t / .4);
        const painted = paintVfx(g, 'impact', 'lightning', x, y, 20, 20, 0, flash * flash);
        const phase = Math.floor(t * 3);
        for (const side of [-1, 1])
            g.drawLines(x, y, [side * 4, -12, side * (10 + phase), -6, side * 6, 1, side * (13 - phase), 7, side * 4, 12], t < .3 ? '#d2efff' : '#7c83a7', 1.6 * (1 - t) + .25);
        if (!painted && flash > 0)
            g.drawPoly(x, y - 2, [0, -7 * flash, 3 * flash, 0, 0, 7 * flash, -3 * flash, 0], '#f0ffff');
    }
    else if (effect.ty === 1) {
        // 爆炸本体已有焰冠；此处只画每个受击点的短亮芯和向外飞散余烬。
        const flash = Math.max(0, 1 - t / .35);
        const painted = paintVfx(g, 'impact', 'fire', x, y, 18 + 8 * t, 18 + 8 * t, 0, flash * flash);
        if (!painted && flash > 0)
            g.drawPoly(x, y, [0, -9 * flash, 7 * flash, 0, 0, 9 * flash, -7 * flash, 0], '#fff2bb');
        for (let i = 0; i < 3; i++) {
            const a = effect.tx + (i - 1) * .7, ease = 1 - (1 - t) * (1 - t), d = 4 + 18 * ease, size = 3 * (1 - t);
            directionalShape(g, x + Math.cos(a) * d, y + Math.sin(a) * d - Math.sin(t * Math.PI) * 9, Math.cos(a), Math.sin(a), [-size * 1.6, 0, 0, -size * .5, size, 0, 0, size * .5], t < .35 ? '#ffd084' : '#bd6545');
        }
    }
    else {
        // 三层短切痕沿实际飞刃切线展开；尾屑只有两片，不画大面积扫光。
        const ease = 1 - (1 - t) ** 3, reach = 8 + 18 * ease, width = 3 * (1 - t) ** 2;
        directionalShape(g, x, y, dx, dy, [-reach, 0, -reach * .35, -width, reach, 0, reach * .25, width * .6], '#59416d');
        directionalShape(g, x, y, dx, dy, [-reach * .8, 0, -reach * .2, -width * .45, reach * .9, 0, reach * .2, width * .25], t < .35 ? '#fff0ff' : '#b399d1');
        for (const side of [-1, 1])
            directionalShape(g, x + dx * reach * side - dy * 7 * ease * side, y + dy * reach * side + dx * 7 * ease * side, dx, dy, [-3 * (1 - t), 0, 0, -(1 - t), 3 * (1 - t), 0, 0, 1 - t], '#c3abd9');
    }
}

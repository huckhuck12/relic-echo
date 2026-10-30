import { clamp, project } from '../shared/model.js';
import { bladeOrbit } from './player-pose.js';
/**
 * 原生 Graphics 技能绘图工具：只接受画面快照，不保存节点、不创建计时器。
 * 用深色轮廓、主色、亮芯建立层次，不使用模糊滤镜/全屏闪光；怪潮中仍能读到主体。
 * 所有抖动由参数确定，不能调用 Math.random，避免表现改变战斗随机序列。
 */
export function spark(g: any, x: number, y: number, r: number, color: string): void {
    g.drawPoly(x, y, [0, -r, r * .22, -r * .22, r, 0, r * .22, r * .22, 0, r, -r * .22, r * .22, -r, 0, -r * .22, -r * .22], color);
}
/** 有限段数的折线电弧：远距离也最多 10 段，外缘/主色/亮芯共用同一条路径。 */
export function lightningStroke(g: any, ax: number, ay: number, bx: number, by: number, phase: number, strength = 1, color = '#80e6ff'): void {
    const dx = bx - ax, dy = by - ay, distance = Math.hypot(dx, dy) || 1;
    const steps = Math.max(3, Math.min(10, Math.ceil(distance / 28))), points: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, jitter = i === 0 || i === steps ? 0 : Math.sin(i * 8.17 + Math.floor(phase * 30)) * Math.min(15, distance * .1);
        points.push(ax + dx * t - dy / distance * jitter, ay + dy * t + dx / distance * jitter);
    }
    const power = clamp(strength, .08, 1);
    g.drawLines(0, 0, points, '#25466c', 8 * power + 1);
    g.drawLines(0, 0, points, color, 4 * power + 1);
    g.drawLines(0, 0, points, '#f0fdff', 1.6 * power + .5);
    // 次级分叉只保留一条，避免连锁数量上升后线条数成倍扩张。
    if (power > .45) {
        const mid = Math.floor(steps / 2) * 2;
        g.drawLines(0, 0, [points[mid], points[mid + 1], points[mid] + dx * .08 - dy * .13, points[mid + 1] + dy * .08 + dx * .13, points[mid] + dx * .16 - dy * .08, points[mid + 1] + dy * .16 + dx * .08], color, 1.5);
    }
    spark(g, bx, by, 5 + 6 * power, '#edffff');
}
/** 定向叶片/弹头轮廓，用屏幕方向构造，保持等距投影后仍有明确的前后关系。 */
export function directionalShape(g: any, x: number, y: number, dx: number, dy: number, points: readonly number[], color: string): void {
    const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length, out: number[] = [];
    for (let i = 0; i < points.length; i += 2)
        out.push(x + ux * points[i] - uy * points[i + 1], y + uy * points[i] + ux * points[i + 1]);
    g.drawPoly(0, 0, out, color);
}
/** 火球在发射时画一次，后续仅平移节点。尾焰长度固定，不增加逐帧重绘或子节点。 */
export function paintFlameShot(g: any, vx: number, vy: number): void {
    const d = project(vx, vy);
    directionalShape(g, 0, -18, d.x, d.y, [-44, 0, -23, -8, -10, -13, 8, -10, 15, 0, 8, 10, -10, 13, -23, 8], '#75394a');
    directionalShape(g, 0, -18, d.x, d.y, [-37, 0, -17, -6, -5, -10, 9, -7, 13, 0, 9, 7, -5, 10, -17, 6], '#ff813f');
    directionalShape(g, 0, -18, d.x, d.y, [-24, 0, -7, -5, 5, -6, 10, 0, 5, 6, -7, 5], '#ffd66e');
    directionalShape(g, 0, -18, d.x, d.y, [-9, 0, 2, -3, 7, 0, 2, 3], '#fff7d4');
}
/** 短促的施放亮芯先于尾迹消失；不延迟命中、不扩大真实攻击范围。 */
export function castFlash(g: any, x: number, y: number, angle: number, variant: number, t: number, color: string, mounted = false): void {
    const q = project(x, y), d = project(Math.cos(angle), Math.sin(angle)), length = Math.hypot(d.x, d.y) || 1;
    const px = q.x + (mounted ? 0 : d.x / length * 24), py = q.y + (mounted ? 0 : -35 + d.y / length * 16);
    const strength = Math.max(0, 1 - t), size = 18 * strength;
    if (variant === 2) {
        // 御刃器释放符纹，不再用近战劈砍的枪口式闪光。
        const r = 10 + 8 * t;
        g.drawPoly(px, py, [0, -r, r * .7, 0, 0, r, -r * .7, 0], null, t < .5 ? '#eee2ff' : '#9d82c2', 1.5);
    }
    else if (variant === 1)
        directionalShape(g, px, py, d.x, d.y, [-6, -size * .45, size * 1.5, -size * .6, size, 0, size * 1.5, size * .6, -6, size * .45], '#ffac58');
    else
        spark(g, px, py, size, color);
    spark(g, px, py, size * .5, '#fff5db');
}
/** 具有厚度渐变的扫切面，亮边沿实际世界范围投影；只表示既有范围伤害。 */
export function slashRibbon(g: any, x: number, y: number, radius: number, angle: number, progress: number): void {
    const q = project(x, y), t = clamp(progress, 0, 1), sweep = Math.PI * 1.55;
    const outer: number[] = [], edge: number[] = [];
    for (let i = 0; i <= 16; i++) {
        const f = i / 16, a = angle + sweep * f + t * .65;
        const p = project(Math.cos(a) * radius, Math.sin(a) * radius);
        outer.push(q.x + p.x, q.y + p.y - 18);
        edge.push(q.x + p.x, q.y + p.y - 18);
    }
    // 内边按点逆序回程，避免扫切面片自交。
    const inside: number[] = [];
    for (let i = 16; i >= 0; i--) {
        const f = i / 16, a = angle + sweep * f + t * .65, r = radius * (1 - Math.sin(f * Math.PI) * (.2 * (1 - t) + .04));
        const p = project(Math.cos(a) * r, Math.sin(a) * r);
        inside.push(q.x + p.x, q.y + p.y - 18);
    }
    g.drawPoly(0, 0, [...outer, ...inside], t < .55 ? '#7561bb' : '#49446d');
    g.drawLines(0, 0, edge, '#c5b5ff', 4 * (1 - t) + 1);
    g.drawLines(0, 0, edge, '#f6eaff', 1.5 * (1 - t) + .5);
    const tip = project(Math.cos(angle + sweep + t * .65) * radius, Math.sin(angle + sweep + t * .65) * radius);
    if (t < .5)
        spark(g, q.x + tip.x, q.y + tip.y - 18, 8 * (1 - t), '#fff1d4');
}
/** 环刃本体沿轨道切线摆放，刀尖/背刃/刃脊各有独立轮廓，替代旋转十字。 */
export function orbitBlade(g: any, x: number, y: number, angle: number): void {
    const d = project(-Math.sin(angle), Math.cos(angle));
    directionalShape(g, x, y, d.x, d.y, [-14, -2, 11, -6, 24, 0, 9, 3, -4, 6], '#675094');
    directionalShape(g, x, y, d.x, d.y, [-9, -2, 11, -5, 24, 0, 8, 1, -1, 3], '#c6bbf4');
    directionalShape(g, x, y, d.x, d.y, [-4, -1, 12, -3, 23, 0, 10, 0], '#f4f0ff');
}
/** 三段断开的御刃轨迹，保持范围圆轮廓，避免整块近战扫切面盖住怪群。 */
export function bladePulse(g: any, x: number, y: number, radius: number, angle: number, progress: number): void {
    const q = project(x, y), t = clamp(progress, 0, 1);
    for (let blade = 0; blade < 3; blade++) {
        const points: number[] = [];
        for (let i = 0; i <= 8; i++) {
            const a = angle + blade * Math.PI * 2 / 3 + i / 8 * .85 + t * .9, p = project(Math.cos(a) * radius, Math.sin(a) * radius);
            points.push(q.x + p.x, q.y + p.y - 18);
        }
        g.drawLines(0, 0, points, t < .4 ? '#c5b5ff' : '#806899', 2 * (1 - t) + .5);
        if (t < .4)
            g.drawLines(0, 0, points, '#eee5ff', .8);
    }
}
/** 正式场景和预览共用同一轨道绘制，最多 7 枚飞刃，每枚 3 个面片及 1 根短尾迹。 */
export function drawBladeOrbit(g: any, x: number, y: number, time: number, castTime: number, radius: number, count: number, spin = 0): void {
    const orbit = bladeOrbit(time, castTime, radius, spin), blades = Math.min(7, Math.max(3, count));
    for (let i = 0; i < blades; i++) {
        const a = orbit.phase + i / blades * Math.PI * 2, q = project(x + Math.cos(a) * orbit.radius, y + Math.sin(a) * orbit.radius);
        if (orbit.power > .05) {
            const tail = project(x + Math.cos(a - .32) * orbit.radius, y + Math.sin(a - .32) * orbit.radius);
            g.drawLine(tail.x, tail.y - 18, q.x, q.y - 18, '#9581bb', 1 + orbit.power);
        }
        orbitBlade(g, q.x, q.y - 18, a);
    }
}
/** 火焰爆炸：先亮芯，后焰冠与外抛火星；数值预算仅控制装饰数量。 */
export function flameBurst(g: any, x: number, y: number, radius: number, progress: number, detail: number): void {
    const q = project(x, y), t = clamp(progress, 0, 1), expand = 1 - Math.pow(1 - t, 3);
    const count = Math.min(8, Math.max(3, detail));
    for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count, v = project(Math.cos(a) * radius * .62 * expand, Math.sin(a) * radius * .62 * expand);
        const w = (13 + radius * .08) * (1 - t) + 2, h = (28 + radius * .22) * (1 - t) + 4;
        const px = q.x + v.x, py = q.y + v.y - 10 - Math.sin(t * Math.PI) * 18;
        g.drawPoly(px, py, [-w, 0, -w * .7, -h * .5, -w * .2, -h * .35, w * .15, -h, w * .7, -h * .4, w, 0], '#e76e36');
        if (i % 2 === 0)
            g.drawPoly(px, py, [-w * .45, 0, 0, -h * .62, w * .4, 0], '#ffda78');
    }
    if (t < .24)
        spark(g, q.x, q.y - 24, (24 + radius * .15) * (1 - t / .24), '#fff4cd');
}
/** 燃烧地面只画低亮底纹与少量火舌，位于角色下层，危险预警始终在最上层。 */
export function burningGround(g: any, x: number, y: number, radius: number, time: number, detail: number): void {
    const count = Math.min(5, detail);
    for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count + 1.1, v = project(x + Math.cos(a) * radius * .62, y + Math.sin(a) * radius * .62);
        const h = 7 + (Math.sin(time * 9 + i * 2) + 1) * 4;
        g.drawPoly(v.x, v.y, [-5, 0, -3, -h * .4, 1, -h, 5, 0], '#b86938');
        g.drawLine(v.x - 6, v.y + 2, v.x + 6, v.y + 2, '#80533a', 2);
    }
}

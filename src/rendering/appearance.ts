import { QUALITY_COLOR, Weapon, gear } from '../progression/config.js';
import { Loadout } from '../shared/model.js';
import { Shape, block, pixel } from './voxel.js';
import { Facing8, weaponPoint } from './player-pose.js';
export type { Shape } from './voxel.js';
export function avatarShapes(loadout: Loadout, back = false, facing = 1, phase = 0, direction?: Facing8, castTime = 0): Shape[] {
    const dir = direction ?? (back ? (facing < 0 ? 5 : 7) : (facing < 0 ? 3 : 1));
    const angle = dir * Math.PI / 4, lookX = Math.cos(angle), lookY = Math.sin(angle);
    back = dir >= 5;
    facing = lookX < -.01 ? -1 : 1;
    const s: Shape[] = [{ type: 'poly', p: [-20, 0, 0, -9, 22, 0, 0, 9], fill: '#14291f' }];
    const head = loadout.head?.id, armor = loadout.armor?.id, rear = loadout.back?.id, weapon = loadout.weapon?.id || 'storm';
    const step = Math.round(Math.sin(phase) * 3), swing = Math.round(Math.sin(phase) * 2);
    const posedArms = new Set<Shape>();
    const box = (x: number, y: number, w: number, h: number, d: number, c: string) => s.push(...block(x, y, w, h, d, c));
    const rearParts = () => {
        if (rear === 'cape') {
            box(-17, -12, 30, 34, 3, '#278d68');
            s.push(pixel(-13, -43, 5, 26, '#53b58c'), pixel(1, -43, 5, 26, '#53b58c'));
        }
        if (rear === 'pack') {
            box(-17, -21, 29, 28, 9, '#476b83');
            box(-13, -23, 20, 10, 4, '#7ba3ae');
            box(7, -49, 4, 12, 3, '#8de6cd');
        }
        if (rear === 'thorn') {
            box(-17, -25, 28, 22, 6, '#75543b');
            for (const x of [-24, 18]) {
                box(x, -31, 7, 15, 4, '#c59866');
                box(x, -20, 7, 6, 3, '#e0c28d');
            }
        }
    };
    if (!back)
        rearParts();
    box(-12, -1 + step, 9, 17, 5, '#405f75');
    box(3, -1 - step, 9, 17, 5, '#405f75');
    box(-13, 1 + step, 11, 6, 5, '#483e34');
    box(2, 1 - step, 11, 6, 5, '#483e34');
    const torso = armor === 'light' ? '#3eac8d' : armor === 'heavy' ? '#8b9eab' : armor === 'energy' ? '#8062aa' : '#3f8ba3';
    box(-14, -18, 27, 27, 7, torso);
    s.push(pixel(-12, -43, 5, 20, armor === 'heavy' ? '#b8c8c6' : '#69bcb0'), pixel(-13, -22, 26, 4, '#604a32'));
    if (armor === 'heavy') {
        box(-21, -34, 9, 14, 6, '#a5b5bc');
        box(13, -34, 9, 14, 6, '#a5b5bc');
        box(-7, -25, 13, 15, 3, '#5b7488');
    }
    if (armor === 'energy') {
        box(-6, -27, 11, 12, 3, '#bf9cff');
        s.push(pixel(-3, -36, 5, 6, '#f6e4ff'));
    }
    if (armor === 'light')
        s.push(pixel(-3, -42, 6, 13, '#d7e8b8'));
    // 施放时手臂连接肩膀与真实握把，避免只有武器旋转、手仍垂在身体两侧。
    // 火炮双手托持，雷杖/御刃器只驱动主手；非施放状态保留原有走路摆臂。
    for (const side of [-1, 1]) {
        const active = castTime > 0 && (weapon === 'flame' || side === facing);
        if (!active) {
            const x = side < 0 ? -21 : 15, offset = side < 0 ? swing : -swing;
            box(x, -20 + offset, 7, 24, 5, torso);
            box(x, -17 + offset, 7, 8, 4, '#d4a878');
            continue;
        }
        const grip = weaponPoint({ x: side === facing ? 23 : 32, y: -24 }, weapon as Weapon, dir, castTime);
        const start = s.length;
        const shoulder = { x: side * 17 * (.72 + .28 * Math.abs(lookY)), y: -39 }, elbow = { x: (shoulder.x + grip.x) / 2 + side * 4, y: (shoulder.y + grip.y) / 2 + 5 };
        const limb = (a: {
            x: number;
            y: number;
        }, b: {
            x: number;
            y: number;
        }, width: number, color: string) => {
            const length = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / length * width, ny = (b.x - a.x) / length * width;
            s.push({ type: 'poly', p: [a.x + nx, a.y + ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny, a.x - nx, a.y - ny], fill: color });
        };
        limb(shoulder, elbow, 4, torso);
        limb(elbow, grip, 3.5, '#d4a878');
        s.push(pixel(grip.x - 3, grip.y - 3, 6, 6, '#e4bb8b'));
        for (let i = start; i < s.length; i++)
            posedArms.add(s[i]);
    }
    box(-14, -46, 26, 23, 7, back ? '#755139' : '#d6ad7d');
    box(-15, -64, 27, 7, 7, '#674632');
    s.push(pixel(-14, -61, 6, 9, '#674632'));
    // 正面双眼、斜面偏移五官、纯侧面单眼；背面不画五官，避免八向只是武器在转。
    if (!back) {
        const shift = Math.round(lookX * 6);
        if (dir !== 0 && dir !== 4)
            s.push(pixel(-9 + shift, -59, 4, 4, '#243b39'));
        s.push(pixel(4 + shift, -59, 4, 4, '#243b39'), pixel(-3 + shift, -50, 8, 3, '#87583b'));
    }
    if (head === 'helmet') {
        box(-17, -61, 31, 12, 8, '#9eafba');
        box(-18, -49, 5, 13, 5, '#8097a7');
        box(12, -49, 5, 13, 5, '#8097a7');
        s.push(pixel(-4, -76, 6, 10, '#dae3cc'));
    }
    if (head === 'hood') {
        box(-18, -63, 32, 11, 8, '#8663a2');
        box(-18, -46, 6, 18, 6, '#73558e');
        box(12, -46, 6, 18, 6, '#73558e');
        if (back)
            box(-17, -46, 31, 18, 6, '#73558e');
    }
    if (head === 'visor') {
        box(-17, -55, 32, 7, 5, '#d3a540');
        if (!back)
            s.push(pixel(-12, -60, 24, 3, '#fff1b0'));
    }
    if (back)
        rearParts();
    // 侧面收窄身体、斜向保留部分侧面。只改横坐标，不压扁头身的竖直高度。
    const profile = .72 + .28 * Math.abs(lookY);
    // 动作手臂已经使用屏幕握把坐标，不再缩窄；其余身体面片保持八向侧面比例。
    for (let i = 1; i < s.length; i++) {
        const shape = s[i];
        if (posedArms.has(shape))
            continue;
        if (shape.type === 'rect') {
            shape.p[0] *= profile;
            shape.p[2] *= profile;
        }
        else
            for (let j = 0; j < shape.p.length; j += 2)
                shape.p[j] *= profile;
    }
    const weaponStart = s.length, hand = 23;
    if (weapon === 'storm') {
        box(hand - 2, -9, 4, 48, 3, '#936839');
        box(hand - 7, -55, 14, 15, 5, '#48b9c3');
        box(hand - 3, -60, 6, 6, 2, '#dbfff3');
    }
    if (weapon === 'flame') {
        box(hand - 9, -24, 25, 13, 7, '#a46035');
        box(hand + 12, -21, 10, 20, 8, '#d68b47');
        s.push(pixel(hand + 14, -37, 6, 12, '#ffd087'));
        box(hand - 1, -36, 6, 7, 4, '#efb457');
    }
    if (weapon === 'blade') {
        // 小型御刃器由掌托与悬浮菱晶组成，去掉长剑、剑柄和护手，明确角色在操控远端飞刃。
        box(hand - 6, -21, 12, 7, 3, '#6d5988');
        s.push({
            type: 'poly', p: [hand, -43, hand + 8, -34, hand, -26, hand - 8, -34], fill: '#8e78be', line: '#d8caff', width: 1
        });
        s.push({ type: 'poly', p: [hand, -39, hand + 4, -34, hand, -30, hand - 4, -34], fill: '#eee4ff' });
    }
    const held = s.splice(weaponStart).map(shape => {
        // 矩形转为四点多边形，八向旋转后仍由原生 Graphics 绘制，不增加显示节点。
        const p = shape.type === 'rect' ? [shape.p[0], shape.p[1], shape.p[0] + shape.p[2], shape.p[1], shape.p[0] + shape.p[2], shape.p[1] + shape.p[3], shape.p[0], shape.p[1] + shape.p[3]] : shape.p;
        const out: number[] = [];
        for (let i = 0; i < p.length; i += 2) {
            const q = weaponPoint({ x: p[i], y: p[i + 1] }, weapon as Weapon, dir, castTime);
            out.push(q.x, q.y);
        }
        return { ...shape, type: 'poly' as const, p: out };
    });
    // 向上瞄准时武器位于身体后方；背包、披风仍由上方的前后绘制顺序控制。
    if (back)
        s.splice(1, 0, ...held);
    else
        s.push(...held);
    for (const item of Object.values(loadout))
        if (item && item.quality > 0) {
            const slot = gear(item).slot, y = slot === 'head' ? -67 : slot === 'armor' ? -30 : slot === 'back' ? -42 : weapon === 'blade' ? -30 : -50;
            const q = slot === 'weapon' ? weaponPoint({ x: hand, y }, weapon as Weapon, dir, castTime) : { x: slot === 'back' ? -18 : 0, y };
            s.push(pixel(q.x - 2, q.y, 4 + item.quality, 4 + item.quality, QUALITY_COLOR[item.quality]));
            if (item.quality === 2)
                s.push(pixel(q.x - 2, q.y + 7, 5, 2, '#fff0b3'));
        }
    return s;
}
export function drawShapes(graphics: any, shapes: Shape[]): void {
    graphics.clear();
    for (const s of shapes) {
        const p = s.p;
        if (s.type === 'poly')
            graphics.drawPoly(0, 0, p, s.fill, s.line || null, s.width ?? (s.line ? 1 : 0));
        if (s.type === 'rect')
            graphics.drawRect(p[0], p[1], p[2], p[3], s.fill, s.line || null, s.line ? 1 : 0);
        if (s.type === 'circle')
            graphics.drawCircle(p[0], p[1], p[2], s.fill, s.line || null, s.line ? 1 : 0);
    }
}
export const weaponOf = (loadout: Loadout): Weapon => gear(loadout.weapon!).weapon!;

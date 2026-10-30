/** Small screen-space cuboids. Shared by the world, actors and equipment previews. */
export interface Shape {
    type: 'poly' | 'circle' | 'rect' | 'ellipse';
    p: number[];
    fill: string;
    line?: string;
    width?: number;
    part?: 'staff' | 'leftArm' | 'rightArm';
}
import type { enemyArtPose } from '../enemies/enemy-actions.js';
const shades = new Map<string, string>();
export function shade(color: string, factor: number): string {
    const key = color + factor, cached = shades.get(key);
    if (cached)
        return cached;
    const n = parseInt(color.slice(1), 16), channel = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) * factor)).toString(16).padStart(2, '0');
    const value = '#' + channel(16) + channel(8) + channel(0);
    shades.set(key, value);
    return value;
}
export const pixel = (x: number, y: number, w: number, h: number, fill: string): Shape => ({ type: 'rect', p: [x, y, w, h], fill });
/** x/y is the bottom-left front corner; depth projects up and right. */
export function block(x: number, y: number, w: number, h: number, depth: number, color: string): Shape[] {
    const dx = depth, dy = -depth * .5;
    return [
        { type: 'poly', p: [x, y - h, x + dx, y - h + dy, x + w + dx, y - h + dy, x + w, y - h], fill: shade(color, 1.22) },
        { type: 'poly', p: [x + w, y - h, x + w + dx, y - h + dy, x + w + dx, y + dy, x + w, y], fill: shade(color, .65) },
        pixel(x, y - h, w, h, color),
    ];
}
function enemyBaseShapes(kind: number, flash = false, detail = true): Shape[] {
    const s: Shape[] = [{ type: 'poly', p: [-22, 0, 0, -10, 25, 0, 0, 10], fill: '#152b24' }];
    if (!detail && kind < 3) {
        const color = flash ? '#effff1' : ['#87b45b', '#c2a6df', '#d89152'][kind];
        const body = kind === 0 ? [-17, -2, 29, 22, 7] : kind === 1 ? [-11, -4, 20, 34, 5] : [-23, -8, 38, 25, 8];
        s.push(...block(body[0], body[1], body[2], body[3], body[4], color));
        if (kind === 0)
            s.push(pixel(-12, -31, 5, 7, flash ? '#ffffff' : '#b9d77e'), pixel(-5, -33, 8, 4, flash ? '#ffffff' : '#648d40'), pixel(-4, -9, 7, 3, '#365235'));
        if (kind === 1) {
            s.push(...block(-13, -38, 23, 19, 5, flash ? '#effff1' : '#e0d5b9'), ...tag([pixel(19, -49, 5, 47, '#75568f'), pixel(16, -51, 11, 10, '#d3a4ff')], 'staff'), pixel(-9, -31, 4, 20, '#77558e'), pixel(5, -31, 4, 20, '#77558e'));
            s.push(...tag(block(-17, -23, 6, 20, 3, '#77558e'), 'leftArm'), ...tag(block(13, -23, 6, 20, 3, '#77558e'), 'rightArm'));
        }
        if (kind === 2)
            s.push(pixel(-23, -24, 5, 12, '#fff0ca'), pixel(9, -24, 5, 12, '#fff0ca'), pixel(-9, -22, 13, 7, flash ? '#ffffff' : '#a85e43'), pixel(-9, -39, 17, 4, flash ? '#ffffff' : '#77513c'));
        const y = kind === 1 ? -50 : kind === 2 ? -28 : -17;
        s.push(pixel(-9, y, 4, 4, '#24312d'), pixel(3, y, 4, 4, '#24312d'));
        return s;
    }
    const box = (x: number, y: number, w: number, h: number, d: number, c: string) => s.push(...block(x, y, w, h, d, flash ? '#effff1' : c));
    const eye = (x: number, y: number, w = 4, h = 4) => s.push(pixel(x, y, w, h, '#fff2a3'));
    if (kind === 0) { // Low silhouette: moss slime.
        box(-17, -2, 29, 22, 7, '#83af4b');
        s.push(pixel(-13, -20, 7, 5, flash ? '#ffffff' : '#8fbd66'));
        eye(-10, -15);
        eye(3, -15);
        s.push(pixel(-5, -7, 8, 3, '#294831'), pixel(-12, -31, 5, 7, flash ? '#ffffff' : '#b9d77e'), pixel(-5, -33, 8, 4, flash ? '#ffffff' : '#648d40'));
    }
    else if (kind === 1) { // Tall skeletal caster, purple staff.
        box(-13, 0, 7, 14, 4, '#777d68');
        box(5, 0, 7, 14, 4, '#777d68');
        box(-11, -14, 20, 19, 5, '#a99f84');
        box(-14, -34, 23, 21, 6, '#ddd2b2');
        s.push(pixel(-10, -49, 6, 6, '#343948'), pixel(1, -49, 6, 6, '#343948'), pixel(-6, -37, 12, 3, '#5d5865'), pixel(-9, -29, 4, 15, '#77558e'), pixel(5, -29, 4, 15, '#77558e'));
        s.push(...tag([...block(20, -3, 4, 41, 3, '#665077'), ...block(16, -43, 12, 10, 4, flash ? '#effff1' : '#ba82e5')], 'staff'), ...tag(block(-17, -23, 6, 20, 3, '#77558e'), 'leftArm'), ...tag(block(13, -23, 6, 20, 3, '#77558e'), 'rightArm'));
    }
    else if (kind === 2) { // Wide tusked boar, orange charge silhouette.
        box(-23, -1, 8, 12, 5, '#68452d');
        box(10, -1, 8, 12, 5, '#68452d');
        box(-22, -11, 37, 23, 9, '#bb7846');
        box(-19, -31, 27, 16, 7, '#d29356');
        s.push(pixel(-18, -36, 5, 4, '#4b2929'), pixel(0, -36, 5, 4, '#4b2929'), pixel(-9, -22, 13, 7, flash ? '#ffffff' : '#a85e43'));
        box(-25, -18, 6, 12, 3, '#e6d6af');
        box(9, -18, 6, 12, 3, '#e6d6af');
    }
    else { // Heavy golems, elite and core share a stone construction.
        const b = kind === 4 ? 1.6 : 1;
        box(-22 * b, 0, 15 * b, 20 * b, 7 * b, '#536660');
        box(8 * b, 0, 15 * b, 20 * b, 7 * b, '#536660');
        box(-24 * b, -20 * b, 43 * b, 35 * b, 10 * b, kind === 4 ? '#76624d' : '#7d8d76');
        box(-20 * b, -55 * b, 32 * b, 23 * b, 9 * b, '#9aab8b');
        s.push(...tag(block(-38 * b, -25 * b, 12 * b, 29 * b, 7 * b, flash ? '#effff1' : '#61765f'), 'leftArm'), ...tag(block(27 * b, -25 * b, 12 * b, 29 * b, 7 * b, flash ? '#effff1' : '#61765f'), 'rightArm'));
        s.push(pixel(-14 * b, -69 * b, 8 * b, 5 * b, '#ffce6b'), pixel(2 * b, -69 * b, 8 * b, 5 * b, '#ffce6b'));
        box(-9 * b, -29 * b, 15 * b, 16 * b, 4 * b, '#e7ae51');
        s.push(pixel(-5 * b, -42 * b, 7 * b, 9 * b, '#fff1ac'));
        // 石缝与肩甲刻痕强化远距离辨识；固定四条细节，不给怪群增加逐帧重绘。
        s.push(pixel(-18 * b, -47 * b, 3 * b, 10 * b, '#3d5048'), pixel(10 * b, -32 * b, 7 * b, 3 * b, '#425548'), ...tag([pixel(-34 * b, -50 * b, 4 * b, 9 * b, '#c4cb93')], 'leftArm'), ...tag([pixel(30 * b, -50 * b, 4 * b, 9 * b, '#c4cb93')], 'rightArm'));
        if (kind === 4) {
            box(-24 * b, -80 * b, 8 * b, 13 * b, 5 * b, '#b48b4c');
            box(12 * b, -80 * b, 8 * b, 13 * b, 5 * b, '#b48b4c');
        }
    }
    return s;
}
/** 明确标记可动部件，避免渲染时依靠颜色/坐标猜测法杖或手臂。 */
function tag(shapes: Shape[], part: NonNullable<Shape['part']>): Shape[] {
    for (const s of shapes)
        s.part = part;
    return shapes;
}
export function enemyPartPoint(x: number, y: number, part: NonNullable<Shape['part']>, kind: number, pose: ReturnType<typeof enemyArtPose>): {
    x: number;
    y: number;
} {
    if (kind === 1 && part === 'rightArm') {
        // 持杖手的末端直接连接动画握把，避免举杖时法杖与手臂分离；横向厚度保持不变。
        const grip = enemyPartPoint(22, -24, 'staff', kind, pose), dx = grip.x - 16, dy = grip.y + 39, length = Math.hypot(dx, dy) || 1;
        return { x: 16 + (x - 16) * dy / length + (y + 39) / 16 * dx, y: -39 - (x - 16) * dx / length + (y + 39) / 16 * dy };
    }
    const b = kind === 4 ? 1.6 : 1, staff = part === 'staff';
    const px = staff ? 22 : (part === 'leftArm' ? -32 : 33) * b, py = staff ? -35 : (kind === 1 ? -39 : -50 * b);
    const pivotX = kind === 1 && !staff ? (part === 'leftArm' ? -14 : 16) : px;
    const a = staff ? pose.staffAngle : part === 'leftArm' ? pose.leftArmAngle : pose.rightArmAngle;
    const lift = staff ? pose.staffLift : pose.armLift * b, dx = x - pivotX, dy = y - py;
    return { x: pivotX + dx * Math.cos(a) - dy * Math.sin(a), y: py + dx * Math.sin(a) + dy * Math.cos(a) + lift };
}
/** 只有离散动作阶段改变才重建局部图元；追击仍复用缓存并只变换整体节点。 */
export function enemyShapes(kind: number, flash = false, detail = true, pose?: ReturnType<typeof enemyArtPose>): Shape[] {
    const shapes = enemyBaseShapes(kind, flash, detail);
    if (!pose)
        return shapes;
    for (const shape of shapes) {
        if (!shape.part)
            continue;
        const p = shape.p, vertices = shape.type === 'rect' ? [p[0], p[1], p[0] + p[2], p[1], p[0] + p[2], p[1] + p[3], p[0], p[1] + p[3]] : p;
        const out: number[] = [];
        for (let i = 0; i < vertices.length; i += 2) {
            const q = enemyPartPoint(vertices[i], vertices[i + 1], shape.part, kind, pose);
            out.push(q.x, q.y);
        }
        shape.type = 'poly';
        shape.p = out;
    }
    return shapes;
}

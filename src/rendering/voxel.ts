import { paintedEnemy } from './painted-art.js';
/** Small screen-space cuboids. Shared by the world, actors and equipment previews. */
export interface Shape {
    type: 'poly' | 'circle' | 'rect' | 'ellipse';
    p: number[];
    fill: string;
    line?: string;
    width?: number;
    part?: 'staff' | 'leftArm' | 'rightArm';
    avatarLayer?: 'head' | 'armor' | 'back' | 'weapon' | 'badge';
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
    return paintedEnemy(kind, flash, detail);
}
/** 明确标记可动部件，避免渲染时依靠颜色/坐标猜测法杖或手臂。 */
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
/** Shared palette rules for vector fallback and the ordinary-enemy atlas. */
export function enemyVisualShapes(kind: number, flash: boolean, frozen: boolean, detail: boolean, pose: ReturnType<typeof enemyArtPose>): Shape[] {
    const shapes = enemyShapes(kind, flash, detail, pose);
    if (frozen && !flash)
        for (let i = 1; i < shapes.length; i++) {
            const shape = shapes[i];
            if (!['#2a403b', '#394047', '#302f31', '#6b534b', '#435a42', '#766c70', '#fff0c5'].includes(shape.fill) && (shape.type === 'poly' || shape.p[2] > 10))
                shape.fill = shade('#8bcedf', shape.type === 'poly' ? .8 : 1);
        }
    return shapes;
}

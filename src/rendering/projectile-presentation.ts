import { project } from '../shared/model.js';
import { directionalShape } from './skill-visuals.js';
/**
 * 法师细针、精英晶锤、Boss 分叉冠刃，共用深边与危险红。
 * 只在发射时画四个多边形，后续平移节点；不用方形白芯、闪烁、滤镜或子节点。
 * 来源色仍区分法师/石像，危险红边是共用识别，不依赖颜色也能靠尖头和拖尾判断。
 * 所有点以弹头原中心 (0,-18) 为基准，不能将造型方向或高度写回世界碰撞坐标。
 */
export function paintHostileShot(g: any, vx: number, vy: number, color: string): void {
    const projected = project(vx, vy);
    // 零速度预览也保留可辨轮廓；真实弹道方向由发射快照决定，不逐帧旋转重画。
    const d = Math.hypot(projected.x, projected.y) > .001 ? projected : { x: 1, y: 0 };
    // 三个来源色已是 AI 的发射快照，也是图集键；未知来源沿用法师造型。
    const shapes = color === '#efab82' ? [
        [-27, -6, -14, -5, -5, 0, -14, 5, -27, 6, -19, 0],
        [13, 0, 2, -5, -8, -11, -5, 0, -8, 11, 2, 5],
        [10, 0, 1, -3, -5, -7, -2, 0, -5, 7, 1, 3],
        [7, 0, 0, -2, -1, 0, 0, 2]
    ] : color === '#c29ce4' ? [
        [-23, 0, -13, -5, -4, 0, -13, 5],
        [12, 0, 5, -9, -5, -10, -11, -4, -11, 4, -5, 10, 5, 9],
        [9, 0, 3, -6, -4, -7, -8, -3, -8, 3, -4, 7, 3, 6],
        [5, 0, 0, -4, -4, -3, -2, 2, 0, 3]
    ] : [
        [-36, 0, -17, -2, -5, 0, -17, 2],
        [14, 0, -10, -5, -5, 0, -10, 5],
        [11, 0, -7, -3, -3, 0, -7, 3],
        [7, 0, -4, -1, -2, 0, -4, 1]
    ];
    for (let i = 0; i < shapes.length; i++)
        directionalShape(g, 0, -18, d.x, d.y, shapes[i], ['#67404f', '#221e2b', '#ff778b', color][i]);
}
/** 出手轻微回弹；寿命末段只退少量亮度，危险弹头始终可见。只改节点，不重画。 */
export function hostileShotPose(life: number): {
    scale: number;
    alpha: number;
} {
    const launch = Math.max(0, Math.min(1, 1 - (6 - life) / .1));
    return { scale: 1 + .12 * launch * launch, alpha: .9 + .1 * Math.max(0, Math.min(1, life / .12)) };
}

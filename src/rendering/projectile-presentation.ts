import { project } from '../shared/model.js';
import { directionalShape } from './skill-visuals.js';
/**
 * 敌方弹道的统一危险轮廓：暗尾迹、深色外缘、红色尖头、来源色内芯。
 * 只在发射时画四个多边形，后续平移节点；不用方形白芯、闪烁、滤镜或子节点。
 * 来源色仍区分法师/石像，危险红边是共用识别，不依赖颜色也能靠尖头和拖尾判断。
 * 所有点以弹头原中心 (0,-18) 为基准，不能将造型方向或高度写回世界碰撞坐标。
 */
export function paintHostileShot(g: any, vx: number, vy: number, color: string): void {
    const projected = project(vx, vy);
    // 零速度预览也保留可辨轮廓；真实弹道方向由发射快照决定，不逐帧旋转重画。
    const d = Math.hypot(projected.x, projected.y) > .001 ? projected : { x: 1, y: 0 };
    directionalShape(g, 0, -18, d.x, d.y, [-33, 0, -12, -4, 2, 0, -12, 4], '#67404f');
    directionalShape(g, 0, -18, d.x, d.y, [12, 0, -8, -8, -4, 0, -8, 8], '#221e2b');
    directionalShape(g, 0, -18, d.x, d.y, [9, 0, -5, -5, -2, 0, -5, 5], '#ff778b');
    directionalShape(g, 0, -18, d.x, d.y, [5, 0, -3, -2, -1, 0, -3, 2], color);
}

import { project } from '../shared/model.js';
import type { Player, Point } from '../shared/entities.js';
import type { Weapon } from '../progression/config.js';
/** 屏幕顺时针八向：右、右下、下、左下、左、左上、上、右上。与世界移动轴分开保存。 */
export type Facing8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 纯表现时长（秒），不作为攻击冷却或伤害延迟。高速连发时从释放姿态重新开始。 */
export const CAST_DURATION: Record<Weapon, number> = { storm: .28, flame: .30, blade: .22 };
/** 离散成 12 个姿态，避免静止时每次 render 都重建角色图元；挂载点也用同一离散进度。 */
export function castFrame(weapon: Weapon, remaining: number): number {
    return remaining > 0 ? Math.min(11, Math.floor(Math.max(0, 1 - remaining / CAST_DURATION[weapon]) * 12)) : 12;
}
/** 抬杖下压、举枪后坐、抬手御刃各自有独立的角度与握把位移曲线。 */
export function castPose(weapon: Weapon, direction: Facing8, remaining = 0) {
    const t = castFrame(weapon, remaining) / 12, rest = Math.pow(1 - t, 2);
    const a = direction * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a), side = dx < -.01 ? -1 : 1;
    if (weapon === 'storm')
        return { angle: side * (-.48 * rest + .24 * Math.sin(t * Math.PI) * rest), x: dx * 5 * rest, y: -13 * rest };
    if (weapon === 'flame') {
        const kick = Math.sin(Math.min(1, t / .4) * Math.PI) * 7 * (1 - t);
        return { angle: -side * .16 * rest, x: -dx * kick, y: -8 * rest - dy * kick };
    }
    // 环刃用抬掌向外引导，手腕只小幅转动；不再挥动长剑横扫。
    return { angle: -side * .2 * rest, x: dx * 10 * rest, y: -15 * rest + dy * 4 * rest };
}
/**
 * 御刃轨道表现：释放瞬间到达真实攻击半径，随后收回待机轨道。
 * spin 是固定步累计的加速相位；连续施放只重置半径动画，不重置角度，避免飞刃跳回。
 * 中心半径始终不超过伤害范围。
 * 仅参与绘图，不据飞刃位置重复结算伤害，环刃仍按原间隔对范围内怪物即时命中。
 */
export function bladeOrbit(time: number, castTime: number, radius: number, spin = 0) {
    const t = Math.min(1, Math.max(0, 1 - castTime / CAST_DURATION.blade));
    const power = castTime > 0 ? Math.pow(1 - t, .65) : 0;
    return { radius: radius * (.68 + .32 * power), phase: time * 9 + spin, power, speed: 9 + power * 12 };
}
export function direction8(x: number, y: number): Facing8 {
    return ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8) as Facing8;
}
/** 零输入保留上次朝向；攻击只改变外观，不覆盖用于无输入冲刺的 dx/dy。 */
export function faceToward(p: Player, dx: number, dy: number): void {
    if (!dx && !dy)
        return;
    const q = project(dx, dy);
    p.direction = direction8(q.x, q.y);
    p.face = Math.cos(p.direction * Math.PI / 4) < -.01 ? -1 : 1;
    p.back = p.direction >= 5;
}
/** 兼容静态装备预览和旧存档；游戏中的玩家始终显式保存 direction。 */
export function playerDirection(p: Pick<Player, 'direction' | 'face' | 'back'>): Facing8 {
    return p.direction ?? (p.back ? (p.face < 0 ? 5 : 7) : (p.face < 0 ? 3 : 1));
}
/** 武器造型与挂载点共用同一变换。角色保持竖直，炎炮八向瞄准，雷杖/御刃器保留握持姿势。 */
export function weaponPoint(point: Point, weapon: Weapon, direction: Facing8, castTime = 0): Point {
    const a = direction * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a);
    const pose = castPose(weapon, direction, castTime);
    const angle = (weapon === 'flame' ? a : dx * .18) + pose.angle;
    const x = point.x - 23, y = point.y + 24;
    const side = weapon === 'flame' ? 1 : (dx < -.01 ? -1 : 1);
    return { x: dx * 22 + pose.x + Math.cos(angle) * x * side - Math.sin(angle) * y,
        y: -25 + dy * 7 - Math.max(0, -dy) * 18 + pose.y + Math.sin(angle) * x * side + Math.cos(angle) * y };
}
/** 与 SceneRenderer 的角色整体后坐力一致。返回投影平面的局部点，不包含镜头缩放。 */
export function weaponSocket(weapon: Weapon, direction: Facing8, recoil = 0, castTime = 0): Point {
    const source = weapon === 'storm' ? { x: 25, y: -63 } : weapon === 'flame' ? { x: 53, y: -31 } : { x: 23, y: -34 };
    const q = weaponPoint(source, weapon, direction, castTime);
    const face = Math.cos(direction * Math.PI / 4) < -.01 ? -1 : 1;
    const a = recoil * 18 * face * Math.PI / 180, x = q.x * (1 + recoil * .7), y = q.y * (1 - recoil * .6);
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

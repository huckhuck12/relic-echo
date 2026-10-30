import type { Enemy, Effect } from '../shared/entities.js';
import { clamp, project } from '../shared/model.js';
import { enemyArtPose, ENEMY_ACTION_SECONDS } from '../enemies/enemy-actions.js';
import { enemyPartPoint } from './voxel.js';
import { HIT_SECONDS } from './hit-feedback.js';
/**
 * 纯表现姿态：只读取战斗状态，绝不推进 AI、消耗随机数或修改碰撞半径。
 * 普通怪只改节点变换，形状仍缓存；使用局内时间，暂停时自然定格。
 * 坐标相位让同一批怪错开节拍，无需给每只怪增加计时器或子节点。
 */
export function enemyPose(e: Enemy, time: number, slowed: boolean) {
    const phase = time * (slowed ? 3 : 7) + e.x * .017 + e.y * .023;
    const beat = Math.sin(phase), hop = Math.max(0, beat);
    let sx = 1, sy = 1, lift = 0, rotation = 0;
    if (e.kind === 0) {
        // 苔藓史莱姆：弹跳时拉长、落地时压扁，脚底仍接近真实位置。
        sx = 1 - beat * .09;
        sy = 1 + beat * .1;
        lift = hop * 5;
    }
    else if (e.kind === 1) {
        lift = 2 + (beat + 1) * 2;
        rotation = beat * 2;
        if (e.wind > 0) {
            sx = .94;
            sy = 1.08;
            lift += 3;
        }
    }
    else if (e.kind === 2) {
        rotation = beat * 3;
        sy = 1 + beat * .035;
        if (e.wind > 0) {
            const wind = enemyWindProgress(e);
            sx = 1.05 + wind * .1;
            sy = .94 - wind * .13;
            rotation = 0;
        }
        else if (e.charge > 0) {
            sx = 1.16;
            sy = .9;
            lift = 2;
            rotation = e.dx > e.dy ? -5 : 5;
        }
    }
    else {
        // 石像采用小幅重踏，避免大型轮廓不停跳动影响读招。
        sy = 1 + beat * .025;
        rotation = beat * (e.kind === 4 ? .7 : 1.3);
        if (e.wind > 0) {
            sx = 1.05;
            sy = .95;
            rotation = 0;
        }
    }
    // 出手/刹停事件只叠加画面，不让怪物多走一步或延后攻击。局内计时保证暂停定格。
    const power = e.action && e.actionTime ? clamp(e.actionTime / ENEMY_ACTION_SECONDS[e.action], 0, 1) : 0;
    if (e.action === 'cast' && power > 0) {
        sy = 1 - .08 * power;
        rotation = -4 * power;
        lift += 2 * power;
    }
    if (e.action === 'launch' && power > 0) {
        sx += .07 * power;
        lift += 3 * power;
    }
    if (e.action === 'brake' && power > 0) {
        sx = 1 + .12 * power;
        sy = 1 - .12 * power;
        rotation = (e.dx > e.dy ? 4 : -4) * power;
        lift = 0;
    }
    if (e.action === 'burst' && power > 0) {
        sx = 1 + .08 * power;
        sy = 1 - .07 * power;
    }
    if (e.action === 'slam' && power > 0) {
        sx = 1 + .13 * power;
        sy = 1 - .14 * power;
        lift = 0;
        rotation = 0;
    }
    // 命中回弹与移动姿态叠加，不覆盖冰霜、蓄力或冲锋状态。
    if (e.flash > 0) {
        sx *= 1.12;
        sy *= .9;
    }
    const hit = e.hitReaction;
    if (hit && hit.life > 0) {
        const t = clamp(1 - hit.life / HIT_SECONDS[hit.weapon], 0, 1), power = 1 - t;
        // 大型敌人保留重量；只叠加旋转/伸缩，不让画面反应变成额外击退或眩晕。
        const weight = e.kind === 4 ? .2 : e.kind === 3 ? .45 : 1, dir = project(hit.dx, hit.dy);
        if (hit.weapon === 'storm')
            rotation += Math.sin(t * Math.PI * 6) * 5 * power * weight;
        else if (hit.weapon === 'flame') {
            rotation += (dir.x < 0 ? -1 : 1) * 9 * Math.sin(t * Math.PI) * weight;
            sy *= 1 - .08 * power * weight;
        }
        else {
            rotation += (dir.x < 0 ? -1 : 1) * 4 * power * weight;
            sx *= 1 - .06 * power * weight;
        }
    }
    return { sx, sy, lift, rotation };
}
/** 死亡碎块按固定方向飞散并下坠；复用已有 FX 预算，不创建尸体/计时器/显示节点。 */
export function drawEnemyDeath(g: any, effect: Effect, debris: number): void {
    const q = project(effect.x, effect.y), t = clamp(1 - effect.life / effect.max, 0, 1);
    const size = effect.tx || 30, count = effect.ty >= 3 ? debris : Math.min(5, debris);
    for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count + effect.ty * .6;
        const x = q.x + Math.cos(a) * size * t;
        const y = q.y - 15 + Math.sin(a) * size * t * .45 - Math.sin(t * Math.PI) * size * .7;
        const edge = (effect.ty >= 3 ? 8 : 5) * (1 - t) + 1;
        g.drawRect(Math.round(x), Math.round(y), edge, edge, i % 2 ? effect.color : '#e2d6ae');
    }
    // 短暂的碎裂中心先亮后收缩，普通怪也能读到击杀点，避免堆叠大光圈。
    if (t < .28) {
        const edge = 12 * (1 - t / .28);
        g.drawRect(q.x - edge / 2, q.y - 23 - edge / 2, edge, edge, '#fff0c4');
    }
}
/** 只控制蓄力显示比例；真实攻击何时释放仍完全由 AI.wind 决定。 */
export function enemyWindProgress(e: Enemy): number {
    return clamp(1 - e.wind / (e.kind === 1 ? .45 : e.kind === 2 ? .75 : .85), 0, 1);
}
/**
 * 远程瞄准：地面只有一条固定方向的虚线，法杖只保留局部聚能，避免两根实线像持续激光。
 * 使用 AI 已锁定的 dx/dy，不读取玩家位置、不推进蓄力；每只最多 8 段虚线+1 箭头+3 聚能图元。
 * floor 受怪物遮挡，g 表示杖头亮芯。无随机数/滤镜/额外节点，暂停时由相同状态重画。
 */
export function drawRangedWarning(g: any, floor: any, e: Enemy, time: number, detail: boolean): void {
    if (e.dead || e.kind !== 1 || e.wind <= 0)
        return;
    const progress = enemyWindProgress(e), q = project(e.x, e.y), direction = project(e.dx, e.dy);
    const length = Math.hypot(direction.x, direction.y);
    const color = progress < .45 ? '#79648f' : progress < .8 ? '#ac8ac8' : '#d8b7ed';
    if (length > 0) {
        // 点始终落在同一条世界方向线上；段与段间留空，整条线不会变成实心弹道。
        for (let i = 0; i < 8; i++) {
            const from = 22 + i * 68, to = from + 34 + progress * 9;
            floor.drawLine(q.x + direction.x * from, q.y + direction.y * from, q.x + direction.x * to, q.y + direction.y * to, color, 1 + progress * .4);
        }
        const ux = direction.x / length, uy = direction.y / length, tip = project(e.x + e.dx * 580, e.y + e.dy * 580);
        floor.drawLines(tip.x, tip.y, [-ux * 7 - uy * 4, -uy * 7 + ux * 4, 0, 0, -ux * 7 + uy * 4, -uy * 7 - ux * 4], color, 1.2);
    }
    // 两档造型的结晶中心不同，套用与怪物节点相同的浮动、缩放和受击旋转。
    const socket = enemyStaffSocket(e, time, detail), sx = socket.x, sy = socket.y;
    const radius = 12 - progress * 7;
    g.drawPoly(sx, sy, [0, -radius, radius * .65, 0, 0, radius, -radius * .65, 0], null, color, 1.2);
    const core = 2 + progress * 2;
    g.drawPoly(sx, sy, [0, -core, core, 0, 0, core, -core, 0], progress > .8 ? '#fff2ff' : '#d6b7ec');
    // 临发射才出现短十字，不使用整屏闪光或额外远距离亮线。
    if (progress > .8)
        g.drawLines(sx, sy, [-6, 0, 6, 0, 0, 0, 0, -6, 0, 6], '#f6e4ff', 1);
}
/** 与法杖局部动作、敌人整体节点共用的结晶挂载点，返回未叠加相机的投影坐标。 */
export function enemyStaffSocket(e: Enemy, time: number, detail: boolean) {
    const q = project(e.x, e.y), part = enemyPartPoint(detail ? 22 : 21.5, detail ? -48 : -46, 'staff', e.kind, enemyArtPose(e));
    const pose = enemyPose(e, time, e.icePaint === true), a = pose.rotation * Math.PI / 180, x = part.x * pose.sx, y = part.y * pose.sy;
    return { x: q.x + x * Math.cos(a) - y * Math.sin(a), y: q.y - pose.lift + x * Math.sin(a) + y * Math.cos(a) };
}
/** 橙色冲锋预警固定 3 个图元：暗中心线、逐渐变亮的边界和前进箭头，全部贴地。 */
export function drawChargeWarning(floor: any, e: Enemy): void {
    if (e.dead || e.kind !== 2 || e.wind <= 0)
        return;
    const progress = enemyWindProgress(e), q = project(e.x, e.y), width = e.radius + 15, nx = -e.dy * width, ny = e.dx * width;
    const color = progress < .45 ? '#8c664c' : progress < .8 ? '#bd865b' : '#e1aa75', lane: number[] = [];
    for (const [x, y] of [[e.x + nx, e.y + ny], [e.x + e.dx * 260 + nx, e.y + e.dy * 260 + ny], [e.x + e.dx * 260 - nx, e.y + e.dy * 260 - ny], [e.x - nx, e.y - ny]]) {
        const p = project(x, y);
        lane.push(p.x, p.y);
    }
    floor.drawPoly(0, 0, lane, null, color, 1 + progress * .5);
    const end = project(e.x + e.dx * 260, e.y + e.dy * 260);
    floor.drawLine(q.x, q.y, end.x, end.y, progress > .8 ? '#d6b388' : '#765c48', .8);
    const tip = project(e.x + e.dx * (80 + progress * 180), e.y + e.dy * (80 + progress * 180)), d = project(e.dx, e.dy), length = Math.hypot(d.x, d.y) || 1, ux = d.x / length, uy = d.y / length;
    floor.drawPoly(tip.x, tip.y, [ux * 8, uy * 8, -ux * 6 - uy * 5, -uy * 6 + ux * 5, -ux * 6 + uy * 5, -uy * 6 - ux * 5], progress > .8 ? '#ffe0a2' : '#ae8960');
}
/** 出手后的局部亮芯与地面尘点；每只最多 3 个图元，不占用新节点或随机粒子。 */
export function drawEnemyRelease(g: any, floor: any, e: Enemy, time: number, detail: boolean): void {
    if (!e.action || !e.actionTime || e.dead)
        return;
    const t = 1 - clamp(e.actionTime / ENEMY_ACTION_SECONDS[e.action], 0, 1), q = project(e.x, e.y);
    if (e.action === 'cast' && t < .45) {
        const p = enemyStaffSocket(e, time, detail), r = 9 * (1 - t / .45);
        g.drawPoly(p.x, p.y, [0, -r, r * .7, 0, 0, r, -r * .7, 0], '#efddff');
    }
    if (e.action === 'launch' || e.action === 'brake')
        for (let i = 0; i < 3; i++) {
            const p = project(e.x - e.dx * (12 + t * 26) + e.dy * (i - 1) * 12, e.y - e.dy * (12 + t * 26) - e.dx * (i - 1) * 12);
            floor.drawRect(p.x, p.y - 3 - t * 6, 4 * (1 - t) + 1, 3 * (1 - t) + 1, t < .5 ? '#c6a578' : '#87715a');
        }
    if (e.action === 'slam' && t < .8) {
        const p = project(e.dx, e.dy), points: number[] = [];
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2, v = project(Math.cos(a) * 145 * t, Math.sin(a) * 145 * t);
            points.push(p.x + v.x, p.y + v.y);
        }
        floor.drawPoly(0, 0, points, null, t < .35 ? '#f1c69a' : '#a67c58', 1.5);
    }
    if (e.action === 'burst' && t < .5)
        g.drawPoly(q.x, q.y - (e.kind === 4 ? 64 : 40), [0, -8 * (1 - t), 8 * (1 - t), 0, 0, 8 * (1 - t), -8 * (1 - t), 0], null, '#f8d6ac', 1.5);
}

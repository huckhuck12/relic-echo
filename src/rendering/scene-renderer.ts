import { ELEMENTS } from '../buffs/buffs.js';
import type { BuffRuntime } from '../buffs/buffs.js';
import { QUALITY_COLOR, WEAPONS } from '../progression/config.js';
import type { Loadout } from '../shared/model.js';
import { project, unproject, clamp } from '../shared/model.js';
import { avatarShapes, drawShapes, weaponOf } from './appearance.js';
import { enemyShapes, shade } from './voxel.js';
import { castFrame } from './player-pose.js';
import { enemyArtPose } from '../enemies/enemy-actions.js';
import { drawHitFeedback } from './hit-feedback.js';
import { lootPose } from './loot-presentation.js';
import { cameraZoom } from '../ui/layout.js';
import { buildWorldMap } from './world-map.js';
import { enemyPose, drawEnemyDeath, enemyWindProgress, drawRangedWarning, drawChargeWarning, drawEnemyRelease } from './enemy-presentation.js';
import { lightningStroke, bladePulse, flameBurst, burningGround, drawBladeOrbit, castFlash } from './skill-visuals.js';
import type { Player, Enemy, Shot, Drop, Field, Effect, DamageLabel, Point } from '../shared/entities.js';
import type { VisualSettings } from './quality.js';
import type { RunMode } from '../game/run-flow.js';
declare const Laya: any;
/**
 * 单帧输入契约。实体数组只读且不复制，避免怪群战斗时每帧分配数组。
 * 允许修改 node 与 flashPaint/icePaint 绘图缓存，禁止推进坐标、血量或冷却。
 * Buff 仅暴露状态查询和绘制接口，渲染器拿不到 trigger/update 等战斗入口。
 */
export interface SceneFrame {
    readonly player: Readonly<Player>;
    readonly loadout: Loadout;
    readonly levels: Readonly<Record<string, number>>;
    readonly enemies: readonly Enemy[];
    readonly shots: readonly Shot[];
    readonly drops: readonly Drop[];
    readonly fields: readonly Field[];
    readonly fx: readonly Effect[];
    readonly labels: readonly DamageLabel[];
    readonly buffs: Pick<BuffRuntime<Enemy>, 'render' | 'speedMultiplier' | 'recipes'>;
    readonly visuals: VisualSettings;
    readonly time: number;
    readonly walkPhase: number;
    readonly mode: RunMode;
    readonly paused: boolean;
    readonly mouseTarget: Readonly<Point> | null;
    readonly shake: boolean;
    readonly shakeTime: number;
    readonly shakeStrength: number;
    readonly recoil: number;
}
const RING_POINTS = Array.from({ length: 40 }, (_, i) => {
    const a = i * Math.PI / 20;
    return { x: (Math.cos(a) - Math.sin(a)) * .7071, y: (Math.cos(a) + Math.sin(a)) * .3536 };
});
/**
 * 场景显示树的唯一所有者：静态地面 → 地面效果 → 深度排序的实体 → 上层效果。
 * 冲锋路线属于地面层，受实体遮挡；上层预警最后绘制。UI 由 GameUI 单独管理。
 * 不导入 Game，不持有伤害或奖励回调，使战斗和画面可以独立演进。
 */
export class SceneRenderer {
    readonly world: any;
    readonly ground: any;
    readonly groundEffects: any;
    readonly actors: any;
    readonly effects: any;
    readonly playerNode: any;
    private readonly pillarNodes: any[];
    private lastAvatar = '';
    get avatarKey(): string { return this.lastAvatar; }
    /** 调用前必须完成 Laya.init；这里只构建节点与静态地图。 */
    constructor(private readonly pillars: readonly Point[]) {
        this.world = new Laya.Sprite();
        this.ground = new Laya.Sprite();
        this.groundEffects = new Laya.Sprite();
        this.actors = new Laya.Sprite();
        this.effects = new Laya.Sprite();
        this.playerNode = new Laya.Sprite();
        Laya.stage.addChild(this.world);
        this.world.addChild(this.ground);
        this.world.addChild(this.groundEffects);
        this.world.addChild(this.actors);
        this.world.addChild(this.effects);
        this.actors.addChild(this.playerNode);
        this.pillarNodes = buildWorldMap(this.ground, this.actors, pillars);
    }
    /** 鼠标反投影复用当前相机，缩放、震屏和横竖屏变化后仍与画面一致。 */
    screenToWorld(x: number, y: number): Point {
        return unproject((x - this.world.x) / this.world.scaleX, (y - this.world.y) / this.world.scaleY);
    }
    /** 8 世界单位分档，只有跨档才触发 Laya 的子节点排序。 */
    private depth(node: any, value: number): void {
        const order = Math.round(value / 8) * 8;
        if (node.zOrder !== order)
            node.zOrder = order;
    }
    /** 装备、朝向或离散走路姿态变化才重画，force 用于开局和主动换装。 */
    drawAvatar(loadout: Loadout, p: Readonly<Player>, walkPhase: number, force = false): void {
        const weapon = weaponOf(loadout), castTime = p.castWeapon === weapon ? (p.castTime || 0) : 0;
        const key = JSON.stringify(loadout) + p.face + p.back + ':' + p.direction + ':' + Math.floor((walkPhase % (Math.PI * 2)) * 3) + ':cast' + castFrame(weapon, castTime);
        if (!force && key === this.lastAvatar)
            return;
        this.lastAvatar = key;
        drawShapes(this.playerNode.graphics, avatarShapes(loadout, p.back, p.face, walkPhase, p.direction, castTime));
    }
    /** 受击、减速状态或画质变化才重建形状，避免每帧重画方块面片。 */
    paintEnemy(e: Enemy, buffs: Pick<BuffRuntime<Enemy>, 'speedMultiplier'>, visuals: VisualSettings): void {
        const art = enemyArtPose(e), frozen = buffs.speedMultiplier(e) < 1, shapes = enemyShapes(e.kind, e.flash > 0, visuals.detail, art);
        if (frozen && e.flash <= 0)
            for (let i = 1; i < shapes.length; i++) {
                const shape = shapes[i];
                if (shape.type === 'poly' || shape.p[2] > 10)
                    shape.fill = shade('#8bcedf', shape.type === 'poly' ? .8 : 1);
            }
        drawShapes(e.node.graphics, shapes);
        e.flashPaint = e.flash > 0;
        e.icePaint = frozen;
        e.actionPaint = art.key;
    }
    /** 每帧更新相机与显示；屏幕外只隐藏节点，不移除实体或停止 AI。 */
    render(state: SceneFrame): void {
        const { w, h, zoom } = this.updateCamera(state);
        const inView = (x: number, y: number, margin = 100) => x >= -margin && x <= w + margin && y >= -margin && y <= h + margin;
        this.syncActors(state, zoom, inView);
        const g = this.effects.graphics;
        g.clear();
        this.drawIndicators(state, g);
        const floor = this.groundEffects.graphics;
        floor.clear();
        this.drawGroundEffects(state, floor);
        this.drawCombatEffects(state, g);
        state.buffs.render(g, project, floor, (x, y) => {
            const q = project(x, y);
            return inView(q.x * zoom + this.world.x, q.y * zoom + this.world.y, 160);
        });
        this.drawEquipmentEffects(state, g);
        for (const e of state.enemies)
            if (e.node.visible)
                drawEnemyRelease(g, floor, e, state.time, state.visuals.detail);
        this.drawWarnings(state, g, floor);
    }
    /** 相机跟随、震屏和玩家姿态统一在此更新，输入通过 screenToWorld 读取相同变换。 */
    private updateCamera(state: SceneFrame): {
        w: number;
        h: number;
        zoom: number;
    } {
        const w = Laya.stage.width, h = Laya.stage.height, p = state.player, camera = project(p.x, p.y);
        let sx = 0, sy = 0;
        if (state.shake && state.shakeTime > 0) {
            sx = (Math.random() - .5) * state.shakeStrength;
            sy = (Math.random() - .5) * state.shakeStrength;
        }
        const zoom = cameraZoom(w, h);
        this.world.scale(zoom, zoom);
        this.world.pos(w / 2 - camera.x * zoom + sx, h * .56 - camera.y * zoom + sy);
        this.drawAvatar(state.loadout, state.player, state.walkPhase);
        const pp = project(p.x, p.y);
        this.playerNode.pos(pp.x, pp.y);
        this.depth(this.playerNode, p.x + p.y);
        this.playerNode.alpha = p.inv > 0 ? .55 + .35 * Math.sin(performance.now() * .04) : 1;
        this.playerNode.scale(1 + state.recoil * .7, 1 - state.recoil * .6);
        this.playerNode.rotation = state.recoil * 18 * p.face;
        return { w, h, zoom };
    }
    /** 只同步显示属性和绘图缓存；屏幕外节点保留，返回视野时直接重新显示。 */
    private syncActors(state: SceneFrame, zoom: number, inView: (x: number, y: number, margin?: number) => boolean): void {
        const pp = project(state.player.x, state.player.y);
        for (const e of state.enemies) {
            const q = project(e.x, e.y);
            e.node.visible = inView(q.x * zoom + this.world.x, q.y * zoom + this.world.y);
            if (!e.node.visible)
                continue;
            if (e.flashPaint !== (e.flash > 0) || e.icePaint !== (state.buffs.speedMultiplier(e) < 1) || e.actionPaint !== enemyArtPose(e).key)
                this.paintEnemy(e, state.buffs, state.visuals);
            const pose = enemyPose(e, state.time, e.icePaint === true);
            e.node.pos(q.x, q.y - pose.lift);
            this.depth(e.node, e.x + e.y);
            e.node.alpha = 1;
            e.node.scale(pose.sx, pose.sy);
            e.node.rotation = pose.rotation;
        }
        for (const s of state.shots) {
            const q = project(s.x, s.y);
            s.node.visible = inView(q.x * zoom + this.world.x, q.y * zoom + this.world.y, 40);
            if (!s.node.visible)
                continue;
            const launch = Math.max(0, 1 - ((s.launchLife ?? 1.2) - s.life) / .12);
            s.node.pos(q.x + (s.launchX || 0) * launch, q.y + (s.launchY || 0) * launch);
            this.depth(s.node, s.x + s.y + 5);
        }
        for (const d of state.drops) {
            const q = project(d.x, d.y);
            d.node.visible = inView(q.x * zoom + this.world.x, q.y * zoom + this.world.y, 40);
            if (!d.node.visible)
                continue;
            // 时间来自局内时钟，暂停时自然停住；只改节点变换，不逐帧重画 170 个掉落。
            const pose = lootPose(d, state.time);
            d.node.pos(q.x, q.y - pose.lift);
            d.node.scale(pose.sx, pose.sy);
            this.depth(d.node, d.x + d.y - 1);
        }
        for (const label of state.labels) {
            const q = project(label.x, label.y);
            label.node.pos(q.x, q.y - label.rise);
            label.node.zOrder = 100000;
            label.node.alpha = Math.min(1, label.life * 3);
        }
        for (let i = 0; i < this.pillars.length; i++) {
            const q = project(this.pillars[i].x, this.pillars[i].y);
            const hidden = pp.y < q.y && pp.y > q.y - 95 && Math.abs(pp.x - q.x) < 40;
            this.pillarNodes[i].alpha = hidden ? .35 : 1;
        }
    }
    /** 鼠标目的地、稀有掉落光柱位于实体上方，但仍低于危险预警。 */
    private drawIndicators(state: SceneFrame, g: any): void {
        if (state.mouseTarget && state.mode === 'battle' && !state.paused) {
            const marker = project(state.mouseTarget.x, state.mouseTarget.y);
            g.drawPoly(marker.x, marker.y, [0, -7, 14, 0, 0, 7, -14, 0], null, '#91d7b7', 1.5);
            g.drawCircle(marker.x, marker.y, 2, '#c2f2d3');
        }
        let markers = 0;
        for (const d of state.drops)
            if ((d.item || d.fragment) && d.node.visible) {
                // 宝箱本体始终显示；装饰光柱最多 24 组，避免特殊掉落堆积导致逐帧绘图暴涨。
                if (markers++ >= 24)
                    continue;
                const q = project(d.x, d.y), color = d.item ? QUALITY_COLOR[d.item.quality] : '#d7a6ff';
                const bob = Math.sin(state.time * 3 + d.x * .03) * 3;
                g.drawPoly(q.x, q.y, [0, -6, 17, 1, 0, 8, -17, 1], null, color, 1);
                g.drawLine(q.x, q.y - 24, q.x, q.y - 52 + bob, color, 2);
                g.drawPoly(q.x, q.y - 59 + bob, [0, -6, 5, 0, 0, 6, -5, 0], color, '#fff0ce', 1);
                g.drawLine(q.x - 7, q.y - 36 + bob, q.x - 7, q.y - 40 + bob, color, 1);
            }
    }
    /** 脚下定位圈和武器持续区域画在独立地面层，不盖住角色与怪物轮廓。 */
    private drawGroundEffects(state: SceneFrame, floor: any): void {
        const p = state.player;
        this.ellipse(floor, p.x, p.y, 27, null, '#bcecb0');
        for (const f of state.fields) {
            this.ellipse(floor, f.x, f.y, f.radius, '#503b2e', '#b87549');
            burningGround(floor, f.x, f.y, f.radius, state.time, state.visuals.debris);
        }
        // 爆炸冲击圈压在地面层，焰冠位于上层；不让大光斑整块覆盖怪物身体。
        for (const effect of state.fx)
            if (effect.kind === 'blast') {
                const t = clamp(1 - effect.life / effect.max, 0, 1);
                this.ellipse(floor, effect.x, effect.y, effect.tx * (1 - Math.pow(1 - t, 3)), null, t < .45 ? '#ffe1a0' : '#ac633c');
            }
    }
    /** 武器表现遵循画质粒子预算；这里只按剩余寿命绘图，不做碰撞或伤害结算。 */
    private drawCombatEffects(state: SceneFrame, g: any): void {
        for (const effect of state.fx) {
            const q = project(effect.x, effect.y), progress = 1 - effect.life / effect.max;
            if (effect.kind === 'weaponHit') {
                drawHitFeedback(g, effect);
            }
            else if (effect.kind === 'death') {
                drawEnemyDeath(g, effect, state.visuals.debris);
            }
            else if (effect.kind === 'cast') {
                castFlash(g, effect.x, effect.y, effect.tx, effect.ty, progress, effect.color, true);
            }
            else if (effect.kind === 'line') {
                const end = project(effect.tx, effect.ty);
                lightningStroke(g, q.x, q.y - (effect.sourceLift ?? 26), end.x, end.y - 26, progress * .17, 1 - progress, effect.color);
            }
            else if (effect.kind === 'ring')
                this.ellipse(g, effect.x, effect.y, 20 + progress * 80, null, effect.color);
            else if (effect.kind === 'dash') {
                g.drawRect(q.x - 13, q.y - 44, 26, 27, null, effect.color, 2 * (1 - progress));
                g.drawRect(q.x - 12, q.y - 69, 24, 23, null, effect.color, 2 * (1 - progress));
            }
            else if (effect.kind === 'slash') {
                // 保留 slash 数据契约，但改为跟随施法者的御刃轨迹，和当前环绕刃共享中心。
                if (weaponOf(state.loadout) === 'blade')
                    bladePulse(g, state.player.x, state.player.y, effect.tx, effect.ty, progress);
            }
            else if (effect.kind === 'blast') {
                flameBurst(g, effect.x, effect.y, effect.tx, progress, state.visuals.debris);
            }
            else {
                const count = effect.kind === 'impact' ? Math.min(5, state.visuals.debris) : state.visuals.debris;
                for (let i = 0; i < count; i++) {
                    const a = i * Math.PI * 2 / count, d = progress * (effect.tx || 45);
                    g.drawRect(Math.round(q.x + Math.cos(a) * d), Math.round(q.y - 24 + Math.sin(a) * d), 4 * (1 - progress) + 1, 4 * (1 - progress) + 1, effect.color);
                }
            }
        }
    }
    /** Buff 装置与飞刃仅表示装备状态；飞刃真实命中仍由 Game.attack 处理。 */
    private drawEquipmentEffects(state: SceneFrame, g: any): void {
        const p = state.player, pp = project(p.x, p.y);
        state.buffs.recipes.forEach((r, i) => {
            if (!r.trigger || !r.action || !r.element)
                return;
            const color = ELEMENTS.find(e => e.id === r.element)!.color;
            g.drawRect(pp.x + (i ? 22 : -30), pp.y - 53, 8, 10, color, '#fff0c0', 1);
        });
        if (weaponOf(state.loadout) === 'blade') {
            const count = 3 + 2 * (state.levels.blades || 0), r = WEAPONS.blade.range * (1 + .2 * (state.levels.orbit || 0));
            drawBladeOrbit(g, p.x, p.y, state.time, p.castWeapon === 'blade' ? (p.castTime || 0) : 0, r, count, p.bladeSpin || 0);
        }
    }
    /** 普通血条有数量预算，精英独立保留；蓄力预警不受装饰预算限制。 */
    private drawWarnings(state: SceneFrame, g: any, floor: any): void {
        let healthBars = 0;
        for (const e of state.enemies) {
            if (!e.node.visible && e.wind <= 0)
                continue;
            const q = project(e.x, e.y);
            if (e.node.visible && e.kind < 4 && e.hp < e.max && (e.kind >= 3 || healthBars++ < state.visuals.bars)) {
                g.drawRect(q.x - 17, q.y - 65 - (e.kind === 3 ? 25 : 0), 34, 3, '#17292d');
                g.drawRect(q.x - 17, q.y - 65 - (e.kind === 3 ? 25 : 0), 34 * clamp(e.hp / e.max, 0, 1), 3, '#d5b08a');
            }
            if (e.wind > 0 && e.kind === 1) {
                drawRangedWarning(g, floor, e, state.time, state.visuals.detail);
            }
            if (e.wind > 0 && e.kind === 2) {
                drawChargeWarning(floor, e);
            }
            if (e.wind > 0 && e.kind === 4 && e.charge === 1) {
                this.ellipse(g, e.dx, e.dy, 145, '#6e423d', '#e6a083');
                this.ellipse(g, e.dx, e.dy, 145 * (1 - enemyWindProgress(e)), null, '#ffe0a2');
                const target = project(e.dx, e.dy);
                // 四角向落点收拢，地面实线仍表示真实 145 世界单位伤害范围。
                const inset = 18 + 30 * (1 - enemyWindProgress(e));
                for (const side of [-1, 1])
                    g.drawPoly(target.x + side * inset, target.y - inset * .5, [0, -7, side * 7, 0, 0, 7, -side * 7, 0], null, '#ffe0a2', 1.5);
                g.drawLine(target.x - 10, target.y, target.x + 10, target.y, '#ffe5bb', 2);
                g.drawLine(target.x, target.y - 6, target.x, target.y + 6, '#ffe5bb', 2);
            }
        }
    }
    /** 地面圆环复用单位圆采样点，保持显示半径与战斗世界半径一致。 */
    private ellipse(g: any, x: number, y: number, r: number, fill: string | null, line: string): void {
        const q = project(x, y), points: number[] = [];
        for (const offset of RING_POINTS)
            points.push(q.x + offset.x * r, q.y + offset.y * r);
        g.drawPoly(0, 0, points, fill, line, 1.5);
    }
}

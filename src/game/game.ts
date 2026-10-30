import { InputController } from '../input/input-controller.js';
import { ReviveService } from '../platform/revive-provider.js';
import { GameLoop } from './game-loop.js';
import { RunProgression } from '../progression/run-progression.js';
import { FeedbackController } from '../combat/feedback-controller.js';
import * as EnemySpawner from '../enemies/enemy-spawner.js';
import * as EnemyAI from '../enemies/enemy-ai.js';
import { NodePool } from '../shared/node-pool.js';
import * as WeaponCombat from '../combat/weapon-combat.js';
import * as LootSystem from '../progression/loot-system.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { WORLD_RULES, WORLD_PILLARS } from './game-config.js';
import { readSettings, writeSettings, saveRunRecord } from '../platform/local-settings.js';
import { ProceduralAudio } from '../platform/procedural-audio.js';
import { bindViewport } from '../platform/viewport.js';
import { BuffRuntime, FRAGMENTS, Part, Trigger } from '../buffs/buffs.js';
import { COMBAT, GEARS, Item, SLOTS, WEAPONS, Weapon, multiplier } from '../progression/config.js';
import { Loadout, SpatialGrid, Stats, clamp, emptyLoadout, nextXP, project, resolveStats, rollItem } from '../shared/model.js';
import { weaponOf } from '../rendering/appearance.js';
import { faceToward, bladeOrbit } from '../rendering/player-pose.js';
import { enemyStaffSocket } from '../rendering/enemy-presentation.js';
import { damageEnemy, damagePlayer } from '../combat/combat-system.js';
import type { DamageOptions, EnemyDamageHooks, PlayerDamageHooks } from '../combat/combat-system.js';
import { presentEnemyHit } from '../combat/combat-feedback.js';
import type { CombatFeedbackHooks } from '../combat/combat-feedback.js';
import { SceneRenderer } from '../rendering/scene-renderer.js';
import { RunFlow } from './run-flow.js';
import type { Dialog } from './run-flow.js';
import type { Enemy, Shot, Drop, Field, Effect, DamageLabel, Player } from '../shared/entities.js';
export type { Dialog } from './run-flow.js';
import { RUN } from './pace.js';
import { difficultyAt } from './difficulty.js';
import { QUALITY_PRESETS, VisualQuality } from '../rendering/quality.js';
declare const Laya: any;
export interface Snapshot {
    time: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    need: number;
    kills: number;
    dash: number;
    dashMax: number;
    loadout: Loadout;
    levels: Record<string, number>;
    stats: Stats;
    weapon: Weapon;
    boss: Enemy | undefined;
    fps: number;
    enemies: number;
    damage: number;
    mode: string;
    combo: number;
    momentum: number;
    overdrive: number;
}
const LIMIT = WORLD_RULES.limit;
/**
 * 应用编排入口，持有本局状态、实体生命周期及系统之间的写回顺序。
 * InputController 管理输入，GameLoop 调度固定步，RunProgression 提交成长事务。
 * RunFlow 管理暂停与选择队列，FeedbackController 管理短暂停顿/震屏/装饰效果。
 * SceneRenderer 管理显示树和逐帧绘制。
 * 刷怪/AI/武器/掉落/伤害规则委托对应模块；受击表现独立，NodePool 管理节点复用。
 * 先完成状态事务再通知 UI，渲染只读取本轮已完成的战斗状态。
 */
export class Game {
    /** 控制器通过回调读取当前局，构造时只保存回调，不提前访问未初始化的状态。 */
    private readonly input: InputController = new InputController({
        active: () => this.mode === 'battle' && !this.gate.paused,
        inBattle: () => this.mode === 'battle', player: () => this.player,
        pillars: () => this.pillars,
        screenToWorld: (x, y) => this.scene.screenToWorld(x, y),
        enableAudio: () => this.enableAudio(), dash: () => this.dash(),
        toggleBuffs: () => this.toggleBuffs(), toggleInventory: () => this.toggleInventory(),
        togglePerformance: () => this.togglePerformance(), togglePause: () => this.togglePause(),
    });
    private readonly feedback: FeedbackController = new FeedbackController({ effects: () => this.fx, budget: () => this.visuals.particles });
    private readonly progression: RunProgression = new RunProgression(() => this, {
        groundFragments: () => this.drops.flatMap(drop => drop.fragment ? [drop.fragment] : []),
        resetRecoil: () => { this.recoil = 0; }, scheduleAttack: delay => { this.attackTimer = delay; },
        drawAvatar: force => this.drawAvatar(force), ring: (x, y, color) => this.ring(x, y, color),
        beep: (frequency, duration) => this.beep(frequency, duration),
        show: dialog => this.show(dialog), close: () => this.close(), onToast: message => this.onToast(message),
    });
    /** Buff 通过有限回调进入伤害系统，triggerBuffs=false 阻止 Buff 再触发 Buff。 */
    readonly buffs = new BuffRuntime<Enemy>({ player: this.playerProxy(), query: (x, y, r) => this.grid.query(x, y, r).filter(e => !e.dead), damage: (e, value, feedback = true, quiet = false) => {
            if (this.mode === 'battle')
                this.hit(e, value, { impact: feedback, triggerBuffs: false, quiet });
        }, knock: (e, force, x, y) => {
            if (e.dead)
                return;
            const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1, resist = e.kind === 4 ? .1 : e.kind === 3 ? .3 : 1;
            e.kx += dx / d * force * resist;
            e.ky += dy / d * force * resist;
        } });
    /** 重开会替换 player 对象；代理 getter 确保 Buff 始终读取新玩家，而非旧引用。 */
    private playerProxy() {
        const self = this;
        return { get x() { return self.player.x; }, get y() { return self.player.y; }, get dx() { return self.player.dx; }, get dy() { return self.player.dy; } };
    }
    private fragmentCooldown = 0;
    /** 按本局首次击杀精英判定，不借用刷怪序号；同时死亡也只能发放一次。 */
    private firstEliteFragment = false;
    onChange: () => void = () => { };
    onToast: (message: string) => void = () => { };
    /** 钩子在调用时读取 Game 最新状态，构造阶段不访问尚未初始化的输入或 UI。 */
    readonly flow: RunFlow = new RunFlow({
        beforeOpen: () => this.input.reset(),
        prepare: dialog => this.prepareDialog(dialog),
        changed: () => this.onChange(),
    });
    get dialog(): Dialog { return this.flow.dialog; }
    get mode() { return this.flow.mode; }
    get gate() { return this.flow.gate; }
    loadout: Loadout = emptyLoadout('storm');
    levels: Record<string, number> = {};
    stats: Stats = resolveStats(this.loadout, this.levels);
    player: Player = {
        x: 0, y: 0, hp: 100, inv: 0, dash: 0, dashTime: 0, dx: 0, dy: 1, face: 1, back: false, direction: 2
    };
    time = 0;
    xp = 0;
    level = 1;
    kills = 0;
    damage = 0;
    quality: VisualQuality = 'standard';
    get visuals() { return QUALITY_PRESETS[this.quality]; }
    sound = true;
    shake = true;
    /** 性能开关为本地设置；关闭后不采样，避免常驻诊断开销。 */
    showPerformance = false;
    private readonly performanceMonitor = new PerformanceMonitor();
    private readonly loop: GameLoop = new GameLoop({
        active: () => this.mode === 'battle' && !this.gate.paused, paused: () => this.gate.paused,
        measuring: () => this.showPerformance, consumeHitStop: dt => this.feedback.consumeHitStop(dt),
        update: dt => this.update(dt), render: () => this.render(), changed: () => this.onChange(),
        monitor: this.performanceMonitor,
    });
    training = false;
    readonly revival = new ReviveService();
    reviveUsed = false;
    private runGeneration = 0;
    reviveMessage = '';
    previewBack = false;
    /** 显示树归渲染器所有；对象池只借用 actors 容器挂接节点。 */
    readonly scene: SceneRenderer;
    private enemies: Enemy[] = [];
    private shots: Shot[] = [];
    private drops: Drop[] = [];
    private fields: Field[] = [];
    private fx: Effect[] = [];
    private labels: DamageLabel[] = [];
    private grid = new SpatialGrid<Enemy>();
    private readonly nodes: NodePool;
    private attackTimer = 0;
    private spawnTimer = 0;
    private walkPhase = 0;
    private bossSpawned = false;
    private eliteIndex = 0;
    private dropCooldown = 0;
    private thornCd = 0;
    private readonly audio = new ProceduralAudio();
    private pillars = WORLD_PILLARS.map(pillar => ({ ...pillar }));
    combo = 0;
    private comboTime = 0;
    private momentum = 0;
    overdrive = 0;
    private healDropCooldown = 0;
    private nextSurge = RUN.firstSurgeAt;
    private recoil = 0;
    private dashTrail = 0;
    private pickupTone = 0;
    constructor() {
        Laya.init(window.innerWidth, window.innerHeight, Laya.WebGL);
        bindViewport(Laya.stage);
        Laya.stage.bgColor = '#18291f';
        this.scene = new SceneRenderer(this.pillars);
        this.nodes = new NodePool(this.scene.actors);
        this.drawAvatar();
        Object.assign(this, readSettings());
        this.input.bind();
        window.addEventListener('blur', () => this.lostFocus());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden)
                this.lostFocus();
        });
        Laya.stage.on(Laya.Event.RESIZE, this, () => {
            this.performanceMonitor.reset();
            this.render();
        });
        Laya.timer.frameLoop(1, this.loop, this.loop.frame);
    }
    cancelMouseMovement(): void { this.input.clearMouse(); }
    /** 失焦立即清输入；恢复焦点不自动继续，避免玩家未准备好就受到攻击。 */
    private lostFocus(): void {
        this.performanceMonitor.suspend();
        this.input.reset();
        if (this.mode === 'battle' && !this.dialog) {
            this.show({ type: 'pause' });
        }
        this.gate.add('focus');
        this.onChange();
    }
    setStick(x: number, y: number): void { this.input.setStick(x, y); }
    /** 只在用户交互入口尝试恢复音频，浏览器拒绝或小游戏尚未适配时静默降级。 */
    enableAudio(): void {
        this.audio.enable();
    }
    private beep(freq: number, duration = .045, volume = .025): void {
        this.audio.play(this.sound, freq, duration, volume);
    }
    /** 本地设置不属于局内状态，重新开局保留；存储不可用不影响战斗。 */
    saveSettings(): void {
        writeSettings({ sound: this.sound, shake: this.shake, quality: this.quality, showPerformance: this.showPerformance });
    }
    /** 画质只改变绘图预算；切到较低档时立即回收超预算数字和装饰反馈。 */
    cycleVisualQuality(): void {
        const modes: VisualQuality[] = ['low', 'standard', 'high'];
        this.quality = modes[(modes.indexOf(this.quality) + 1) % modes.length];
        this.buffs.setVisualBudget(this.visuals.buffFeedback);
        for (const e of this.enemies)
            this.paintEnemy(e);
        this.fx.length = Math.min(this.fx.length, this.visuals.particles);
        while (this.labels.length > this.visuals.labels)
            this.release(this.labels.pop()!.node);
        this.saveSettings();
        this.onChange();
    }
    /**
     * 开局事务：先归还显示节点，再替换实体/角色与清除冷却，最后重置流程。
     * Buff 恢复基础配方；所有字段初始化完后才通知 UI，不能展示旧局奖励。
     */
    start(weapon: Weapon, training = false): void {
        this.revival.cancel();
        this.runGeneration++;
        this.reviveUsed = false;
        this.reviveMessage = '';
        this.performanceMonitor.reset();
        this.input.clearMouse();
        for (const e of this.enemies)
            this.release(e.node);
        for (const s of this.shots)
            this.release(s.node);
        for (const d of this.drops)
            this.release(d.node);
        for (const label of this.labels)
            this.release(label.node);
        this.enemies = [];
        this.shots = [];
        this.drops = [];
        this.fields = [];
        this.fx = [];
        this.labels = [];
        this.grid.rebuild([]);
        this.buffs.reset();
        this.buffs.install(0, 'trigger', 'hit');
        this.buffs.install(0, 'action', 'blast');
        this.buffs.install(0, 'element', 'fire');
        this.fragmentCooldown = 0;
        this.firstEliteFragment = false;
        this.loadout = emptyLoadout(weapon);
        this.levels = {};
        this.stats = resolveStats(this.loadout, this.levels);
        this.player = {
            x: 0, y: 0, hp: 100, inv: 0, dash: 0, dashTime: 0, dx: 0, dy: 1, face: 1, back: false, direction: 2
        };
        this.time = 0;
        this.xp = 0;
        this.level = 1;
        this.kills = 0;
        this.damage = 0;
        this.spawnTimer = 0;
        this.attackTimer = .08;
        this.bossSpawned = false;
        this.eliteIndex = 0;
        this.dropCooldown = 0;
        this.thornCd = 0;
        this.feedback.shakeTime = 0;
        this.walkPhase = 0;
        this.loop.accumulator = 0;
        this.training = training;
        this.flow.begin();
        this.input.keys.clear();
        this.input.stick = { x: 0, y: 0 };
        this.combo = 0;
        this.comboTime = 0;
        this.momentum = 0;
        this.overdrive = 0;
        this.nextSurge = RUN.firstSurgeAt;
        this.healDropCooldown = 0;
        this.feedback.hitStop = 0;
        this.feedback.hitStopCooldown = 0;
        this.feedback.shakeStrength = 0;
        this.recoil = 0;
        this.dashTrail = 0;
        this.pickupTone = 0;
        for (let i = 0; i < 7; i++)
            this.spawnEnemy(0, 190 + i * 19, i / 7 * Math.PI * 2);
        this.drawAvatar(true);
        this.enableAudio();
        this.beep(660, .15);
        this.onChange();
        this.onToast(training ? '试装模式：按 E 查看角色与换装工具' : '已装备命中 / 爆炸 / 火焰 Buff，按 B 或点击 Buff 自由重组。');
    }
    private prepareDialog(dialog: NonNullable<Dialog>): NonNullable<Dialog> { return this.progression.prepareDialog(dialog); }
    private show(dialog: NonNullable<Dialog>): void { this.flow.open(dialog); }
    close(): void { this.flow.close(); }
    /** UI 使用语义入口切换标题，不再分别写 dialog/mode 导致状态不同步。 */
    returnToTitle(): void {
        this.revival.cancel();
        this.runGeneration++;
        this.flow.title();
    }
    /** 监控细节按需进入暂停弹窗，战斗中只保留小尺寸 FPS 条。 */
    openPerformance(): void {
        if (this.mode === 'battle' && !this.dialog)
            this.show({ type: 'performance' });
    }
    /** 只允许真实倒下触发；主动退出、超时和胜利不会提供复活。 */
    private onPlayerDown(): void {
        if (this.mode !== 'battle')
            return;
        if (this.reviveUsed)
            this.finish(false, '探索者再次倒下了。');
        else {
            this.reviveMessage = '';
            this.flow.down();
        }
    }
    async requestRevive(): Promise<void> {
        if (this.mode !== 'downed' || this.reviveUsed || this.revival.busy)
            return;
        const generation = this.runGeneration;
        const pending = this.revival.request();
        this.reviveMessage = '';
        this.onChange();
        const outcome = await pending;
        if (generation !== this.runGeneration || this.mode !== 'downed')
            return;
        if (outcome !== 'rewarded') {
            this.reviveMessage = outcome === 'cancelled' ? '已取消或等待超时，可重新尝试。' : '暂时无法完成复活，请重试。';
            this.onChange();
            return;
        }
        // 先消费次数与恢复生命，再通知 UI；重复/迟到回调无法重复发奖。
        this.reviveUsed = true;
        this.player.hp = Math.max(1, Math.ceil(this.stats.hp * .5));
        this.player.inv = 3;
        this.player.dash = 0;
        this.player.dashTime = 0;
        for (const shot of this.shots)
            if (shot.hostile)
                this.release(shot.node);
        this.shots = this.shots.filter(shot => !shot.hostile);
        // 推开近身怪，避免无敌结束时仍被重叠包围，不改变 Boss 血量。
        for (const enemy of this.enemies) {
            enemy.wind = 0;
            enemy.charge = 0;
            enemy.actionTime = 0;
            enemy.cooldown = Math.max(1.2, enemy.cooldown);
            const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y, d = Math.hypot(dx, dy);
            if (!enemy.dead && d < 150) {
                enemy.x = clamp(this.player.x + (d ? dx / d : 1) * 150, -LIMIT, LIMIT);
                enemy.y = clamp(this.player.y + (d ? dy / d : 0) * 150, -LIMIT, LIMIT);
            }
        }
        this.grid.rebuild(this.enemies.filter(e => !e.dead));
        this.feedback.hitStop = 0;
        this.loop.accumulator = 0;
        this.input.reset();
        this.flow.revive();
        // 广告常引起失焦；回来后要求玩家明确继续，不能直接恢复敌人攻击。
        if (this.gate.paused)
            this.show({ type: 'pause' });
        this.ring(this.player.x, this.player.y, '#a6dc80');
        this.onToast('回响重燃 · 已恢复 50% 生命 · 无敌 3 秒');
    }
    /** 菜单切换不丢弃奖励；只有没有当前弹窗时，才允许打开普通暂停面板。 */
    togglePause(): void {
        if (this.dialog?.type === 'pause')
            this.close();
        else if (this.dialog?.type === 'inventory' || this.dialog?.type === 'buffs')
            this.close();
        else if (!this.dialog)
            this.show({ type: 'pause' });
    }
    toggleInventory(): void {
        if (this.dialog?.type === 'inventory')
            this.close();
        else if (!this.dialog)
            this.show({ type: 'inventory' });
    }
    toggleBuffs(): void {
        if (this.mode !== 'battle')
            return;
        if (this.dialog?.type === 'buffs')
            this.close();
        else if (!this.dialog)
            this.show({ type: 'buffs' });
    }
    /** 仅允许在已暂停的 Buff 面板编辑；运行时负责所有权校验及保留触发冷却。 */
    installBuff(slot: number, part: Part, id: string | null): void {
        if (this.dialog?.type !== 'buffs')
            return;
        if (this.buffs.install(slot, part, id)) {
            this.drawAvatar(true);
            this.onChange();
        }
    }
    unlockFragments(): void {
        if (!this.training || this.dialog?.type !== 'buffs')
            return;
        for (const f of FRAGMENTS)
            this.buffs.grant(f.id);
        this.onChange();
    }
    private triggerBuff(event: Trigger, x: number, y: number): void {
        this.buffs.setVisualBudget(this.visuals.buffFeedback);
        if (this.mode === 'battle')
            this.buffs.trigger(event, x, y, 1 + this.stats.damage + this.stats.element);
    }
    chooseFragment(id: string): void { this.progression.chooseFragment(id); }
    chooseUpgrade(id: string): void { this.progression.chooseUpgrade(id); }
    takeDrop(accept: boolean): void { this.progression.takeDrop(accept); }
    private putOn(item: Item): void { this.progression.putOn(item); }
    /** 练习专用：真实执行穿戴流程，正式局不开放试装切换。 */
    testGear(slot: string): void {
        if (!this.training)
            return;
        const pool = GEARS.filter(g => g.slot === slot), current = this.loadout[slot as keyof Loadout];
        const index = pool.findIndex(g => g.id === current?.id);
        this.putOn({ id: pool[(index + 1) % pool.length].id, quality: current?.quality || 0 });
        this.onChange();
    }
    testQuality(): void {
        if (!this.training)
            return;
        for (const slot of SLOTS)
            if (this.loadout[slot])
                this.loadout[slot]!.quality = ((this.loadout[slot]!.quality + 1) % 3) as 0 | 1 | 2;
        this.stats = resolveStats(this.loadout, this.levels);
        this.player.hp = Math.min(this.player.hp, this.stats.hp);
        this.drawAvatar(true);
        this.onChange();
    }
    testBoss(): void {
        if (!this.training)
            return;
        this.time = RUN.bossAt;
        this.spawnBoss();
        this.close();
    }
    /** 冲刺沿当前输入或最后朝向开始；固定总距离，不能随逻辑帧步长改变距离。 */
    dash(): void {
        if (this.mode !== 'battle' || this.gate.paused || this.player.dash > 0)
            return;
        const move = this.input.movement();
        const p = this.player;
        const direction = Math.hypot(move.x, move.y) > .01 ? move : { x: p.dx, y: p.dy };
        p.dx = direction.x;
        p.dy = direction.y;
        p.dashTime = COMBAT.dashDuration;
        p.dash = this.dashCooldown();
        p.inv = Math.max(p.inv, COMBAT.dashDuration);
        this.dashTrail = 0;
        this.ring(p.x, p.y, '#a9e9cd');
        this.beep(240, .08);
    }
    private dashCooldown(): number { return COMBAT.dashCooldown * (1 - this.stats.dash) * (weaponOf(this.loadout) === 'blade' ? 1 - .08 * (this.levels.orbit || 0) : 1); }
    /** 先抢占流程显示结算，再记录战绩；训练局不保存，重复结算请求直接忽略。 */
    finish(win: boolean, reason: string): void {
        if (this.mode !== 'battle' && this.mode !== 'downed')
            return;
        this.revival.cancel();
        this.runGeneration++;
        this.flow.finish(win, reason);
        this.beep(win ? 880 : 130, .35, .05);
        if (!this.training)
            saveRunRecord({
                win, time: Math.floor(this.time), kills: this.kills, level: this.level, date: new Date().toLocaleDateString()
            });
    }
    /** HUD 只查询当前状态，不通过此接口修改战斗；大型实体数组不传给 UI。 */
    snapshot(): Snapshot {
        return {
            time: this.time, hp: this.player.hp, maxHp: this.stats.hp, level: this.level, xp: this.xp, need: nextXP(this.level), kills: this.kills, dash: this.player.dash, dashMax: this.dashCooldown(), loadout: this.loadout, levels: this.levels, stats: this.stats, weapon: weaponOf(this.loadout), boss: this.enemies.find(e => e.kind === 4 && !e.dead), fps: this.loop.fps, enemies: this.enemies.length, damage: this.damage, mode: this.mode, combo: this.combo, momentum: this.momentum, overdrive: this.overdrive
        };
    }
    togglePerformance(): void {
        this.showPerformance = !this.showPerformance;
        this.performanceMonitor.reset();
        this.saveSettings();
        this.onChange();
    }
    /** 低频只读查询；数量包含离屏对象，弹道含敌我，效果计逻辑效果而非粒子/DrawCall。 */
    performanceSnapshot() {
        return {
            ...this.performanceMonitor.snapshot(), enemies: this.enemies.length, shots: this.shots.length,
            drops: this.drops.length, effects: this.fx.length + this.fields.length + this.buffs.effects.length,
            paused: this.gate.paused || this.mode !== 'battle', quality: this.visuals.name
        };
    }
    /**
     * 单步顺序是计时/移动 → 刷怪与流程节点 → 攻击 → AI/弹道/区域/Buff → 拾取。
     * 死亡/胜利立即中止后续战斗；实体先标记 dead，步末统一回收，避免遍历中漏项。
     */
    private update(dt: number): void {
        this.fragmentCooldown = Math.max(0, this.fragmentCooldown - dt);
        this.time += dt;
        const p = this.player;
        this.healDropCooldown = Math.max(0, this.healDropCooldown - dt);
        p.castTime = Math.max(0, (p.castTime || 0) - dt);
        if (weaponOf(this.loadout) === 'blade') {
            const orbit = bladeOrbit(this.time, p.castWeapon === 'blade' ? (p.castTime || 0) : 0, 1);
            p.bladeSpin = ((p.bladeSpin || 0) + (orbit.speed - 9) * dt) % (Math.PI * 2);
        }
        this.feedback.hitStopCooldown = Math.max(0, this.feedback.hitStopCooldown - dt);
        this.recoil = Math.max(0, this.recoil - dt);
        this.pickupTone = Math.max(0, this.pickupTone - dt);
        this.overdrive = Math.max(0, this.overdrive - dt);
        this.comboTime = Math.max(0, this.comboTime - dt);
        if (this.comboTime === 0) {
            this.combo = 0;
            this.momentum = 0;
        }
        p.inv = Math.max(0, p.inv - dt);
        p.dash = Math.max(0, p.dash - dt);
        this.dropCooldown = Math.max(0, this.dropCooldown - dt);
        this.thornCd = Math.max(0, this.thornCd - dt);
        this.feedback.shakeTime = Math.max(0, this.feedback.shakeTime - dt);
        const move = this.input.movement();
        let dx = move.x, dy = move.y;
        const dashStep = Math.min(dt, p.dashTime), dashing = p.dashTime > 0;
        if (dashing) {
            dx = p.dx;
            dy = p.dy;
            p.dashTime = Math.max(0, p.dashTime - dt);
            this.dashTrail -= dt;
            if (this.dashTrail <= 0) {
                this.dashTrail = .025;
                this.effect('dash', p.x, p.y, '#a9e9cd', .22);
            }
        }
        else if (dx || dy) {
            p.dx = dx;
            p.dy = dy;
        }
        let velocity = dashing ? COMBAT.dashDistance / COMBAT.dashDuration * dashStep / dt : 240 * (1 + this.stats.speed) * (this.overdrive > 0 ? 1.12 : 1);
        if (this.input.mouseTarget && !dashing)
            velocity = Math.min(velocity, Math.hypot(this.input.mouseTarget.x - p.x, this.input.mouseTarget.y - p.y) / dt);
        this.movePlayer(dx * velocity * dt, dy * velocity * dt);
        if (dashing && p.dashTime === 0)
            this.triggerBuff('dash', p.x, p.y);
        if (dx || dy) {
            this.walkPhase += dt * 13;
            faceToward(p, dx, dy);
        }
        // 波次先写回：Boss 可能清场换数组，精英序号也参与随后击杀的装备奖励。
        this.updateSpawns(dt);
        if (this.time >= RUN.duration) {
            this.finish(false, '遗迹封印已合拢，未能及时击败核心。');
            return;
        }
        if (this.time >= RUN.firstUpgradeAt && this.level === 1) {
            this.addXP(nextXP(1) - this.xp);
            if (this.gate.paused)
                return;
        }
        this.grid.rebuild(this.enemies.filter(e => !e.dead));
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
            this.attackTimer = WEAPONS[weaponOf(this.loadout)].interval / (1 + this.stats.attackSpeed) / (this.overdrive > 0 ? 1.6 : 1);
            this.attack();
        }
        this.updateEnemies(dt);
        if (this.mode !== 'battle')
            return;
        this.updateShots(dt);
        if (this.mode !== 'battle')
            return;
        this.updateFields(dt);
        if (this.mode !== 'battle')
            return;
        this.buffs.update(dt);
        if (this.mode !== 'battle')
            return;
        this.updateDrops(dt);
        this.enemies = this.enemies.filter(e => {
            if (e.dead) {
                this.release(e.node);
                return false;
            }
            return true;
        });
        for (const effect of this.fx)
            effect.life -= dt;
        this.fx = this.fx.filter(e => e.life > 0);
        this.labels = this.labels.filter(label => {
            label.life -= dt;
            label.rise += 40 * dt;
            if (label.life <= 0) {
                this.release(label.node);
                return false;
            }
            return true;
        });
    }
    private movePlayer(dx: number, dy: number): void {
        const p = this.player;
        p.x = clamp(p.x + dx, -LIMIT, LIMIT);
        p.y = clamp(p.y + dy, -LIMIT, LIMIT);
        for (const pillar of this.pillars) {
            const x = p.x - pillar.x, y = p.y - pillar.y, d = Math.hypot(x, y);
            if (d < WORLD_RULES.playerPillarRadius) {
                p.x = pillar.x + (d ? x / d : 1) * WORLD_RULES.playerPillarRadius;
                p.y = pillar.y + (d ? y / d : 0) * WORLD_RULES.playerPillarRadius;
            }
        }
    }
    /** 每次读取本局引用，重开会替换玩家和数组；不能跨步缓存此视图。 */
    private spawnState(): EnemySpawner.SpawnState {
        return {
            time: this.time, player: this.player, enemies: this.enemies, shots: this.shots, fields: this.fields, grid: this.grid,
            spawnTimer: this.spawnTimer, nextSurge: this.nextSurge, eliteIndex: this.eliteIndex, bossSpawned: this.bossSpawned
        };
    }
    /** 接回容量替换/Boss 清场的新数组，以及波次计时和精英进度，再进入攻击阶段。 */
    private applySpawnState(state: EnemySpawner.SpawnState): void {
        this.enemies = state.enemies;
        this.shots = state.shots;
        this.fields = state.fields;
        this.spawnTimer = state.spawnTimer;
        this.nextSurge = state.nextSurge;
        this.eliteIndex = state.eliteIndex;
        this.bossSpawned = state.bossSpawned;
    }
    /** 只提供显示/瞬态清理能力，不在回调中重入 start 或刷怪。 */
    private readonly spawnHooks: EnemySpawner.SpawnHooks = {
        acquire: () => this.acquire(), release: node => this.release(node), paintEnemy: e => this.paintEnemy(e),
        clearTransient: () => this.buffs.clearTransient(), ring: (...args) => this.ring(...args),
        onToast: message => this.onToast(message),
    };
    /** Game 保留超时、升级保底与暂停流程；生成模块只推进敌人时间轴。 */
    private updateSpawns(dt: number): void {
        const state = this.spawnState();
        EnemySpawner.updateSpawns(state, this.spawnHooks, dt);
        this.applySpawnState(state);
    }
    /** 伤害和弹道共用已有入口；isBattle 实时读取，避免死亡后继续处理后面的敌人。 */
    private readonly enemyAIHooks: EnemyAI.EnemyAIHooks = {
        speedMultiplier: e => this.buffs.speedMultiplier(e), hit: (...args) => this.hit(...args), hurt: damage => this.hurt(damage),
        shoot: (x, y, vx, vy, damage, hostile, color, source) => {
            const count = this.shots.length;
            this.shoot(x, y, vx, vy, damage, hostile, color);
            if (source?.kind === 1 && this.shots.length > count) {
                // 只移动出膛画面，敌方碰撞仍从原世界坐标发射，保留既有躲避规则。
                const socket = enemyStaffSocket({ ...source, icePaint: this.buffs.speedMultiplier(source) < 1 }, this.time, this.visuals.detail);
                const origin = project(x, y), shot = this.shots[this.shots.length - 1];
                shot.launchX = socket.x - origin.x;
                shot.launchY = socket.y - origin.y + 18;
                shot.launchLife = 6;
            }
        }, ring: (...args) => this.ring(...args), isBattle: () => this.mode === 'battle',
    };
    /** 默认随机距离/角度只在生成模块求值一次；保留开局与练习/压力场景的统一入口。 */
    private spawnEnemy(kind: number, distance?: number, angle?: number): void {
        const state = this.spawnState();
        EnemySpawner.spawnEnemy(state, this.spawnHooks, kind, distance, angle);
        this.applySpawnState(state);
    }
    /** Boss 登场清场及瞬态 Buff，但保留装备、已安装配方和它们的触发冷却。 */
    private spawnBoss(): void {
        const state = this.spawnState();
        EnemySpawner.spawnBoss(state, this.spawnHooks);
        this.applySpawnState(state);
    }
    /** AI 始终在世界坐标运行；屏幕外照常追击，蓄力/冲锋与渲染可见性无关。 */
    private updateEnemies(dt: number): void {
        EnemyAI.updateEnemies({
            time: this.time, player: this.player, enemies: this.enemies, pillars: this.pillars, grid: this.grid
        }, this.enemyAIHooks, dt);
    }
    /** 每次生成当前状态视图，禁止缓存：start 会替换玩家、装备和数组。 */
    private weaponState(): WeaponCombat.WeaponState {
        return {
            player: this.player, loadout: this.loadout, levels: this.levels, stats: this.stats,
            grid: this.grid, shots: this.shots, fields: this.fields, pillars: this.pillars,
            time: this.time, overdrive: this.overdrive, recoil: this.recoil
        };
    }
    /** 回调在执行时访问本局状态；伤害仍统一进入 hit/hurt，避免两套结算规则。 */
    private readonly weaponHooks: WeaponCombat.WeaponHooks = {
        hit: (...args) => this.hit(...args), hurt: damage => this.hurt(damage),
        acquire: () => this.acquire(), release: node => this.release(node),
        line: (...args) => this.line(...args), effect: (...args) => this.effect(...args),
        kick: (...args) => this.kick(...args), beep: (...args) => this.beep(...args),
    };
    /** 掉落模块只借用当前引用，数组筛选结果由包装方法写回。 */
    private lootState(): LootSystem.LootState {
        return {
            drops: this.drops, player: this.player, loadout: this.loadout, stats: this.stats, buffs: this.buffs
        };
    }
    private readonly lootHooks: LootSystem.LootHooks = {
        acquire: () => this.acquire(), release: node => this.release(node), addXP: amount => this.addXP(amount),
        show: dialog => this.show(dialog), onToast: message => this.onToast(message), onChange: () => this.onChange(),
        pickupSound: () => {
            if (this.pickupTone <= 0) {
                this.pickupTone = .08;
                this.beep(660 + this.xp * 13, .025, .009);
            }
        },
    };
    /** 攻击原地更新实体/弹道，后坐计时是值类型，需要单独写回。 */
    private attack(): void {
        const state = this.weaponState();
        WeaponCombat.attack(state, this.weaponHooks);
        this.recoil = state.recoil;
    }
    /** 为玩家预留 32 个弹道名额；伤害、燃烧和范围在发射时快照保存。 */
    private shoot(x: number, y: number, vx: number, vy: number, damage: number, hostile: boolean, color: string, flame = false): void {
        WeaponCombat.shoot(this.weaponState(), this.weaponHooks, x, y, vx, vy, damage, hostile, color, flame);
    }
    /** 沿上一坐标到新坐标做线段碰撞，防止高速弹道一帧跨过目标却没有命中。 */
    private updateShots(dt: number): void {
        const state = this.weaponState();
        WeaponCombat.updateShots(state, this.weaponHooks, dt);
        this.shots = state.shots;
    }
    /** 重叠火焰地面在同一 tick 对同一敌人只结算一次，避免区域堆叠失控。 */
    private updateFields(dt: number): void {
        const state = this.weaponState();
        WeaponCombat.updateFields(state, this.weaponHooks, dt);
        this.fields = state.fields;
    }
    /** 只连接表现模块和现有 FX/节点预算；不在这里再次计算伤害或判定死亡。 */
    private readonly combatFeedbackHooks: CombatFeedbackHooks = {
        acquireLabel: () => this.acquire(true),
        effect: (...args) => this.effect(...args),
        kick: (...args) => this.kick(...args), freeze: duration => this.freeze(duration),
    };
    private readonly enemyDamageHooks: EnemyDamageHooks = {
        recordDamage: value => { this.damage += value; },
        // 按调用时读取当前 labels 和画质；重开会替换数组，不能在构造时绑定旧引用。
        present: (enemy, result) => presentEnemyHit({ enemyCount: this.enemies.length, labels: this.labels, visuals: this.visuals }, this.combatFeedbackHooks, enemy, result),
        killed: (enemy, triggerBuffs) => this.onEnemyKilled(enemy, triggerBuffs),
        triggerHit: (x, y) => this.triggerBuff('hit', x, y),
    };
    /** 每次读取当前玩家/暴击率，换装和重开后不沿用旧快照；规则见 combat-system。 */
    private hit(enemy: Enemy, base: number, options: DamageOptions = {}): void {
        damageEnemy({ player: this.player, time: this.time, crit: this.stats.crit }, this.enemyDamageHooks, enemy, base, options);
    }
    /**
     * 这里只结算局内奖励。combat-system 已标记 dead，必须按原顺序统计连杀、
     * 提交碎裂、检查 Boss 终局，再生成掉落与派发击杀 Buff，保留随机数调用次序。
     */
    private onEnemyKilled(e: Enemy, triggerBuffs: boolean): boolean {
        this.kills++;
        this.onKill();
        if (e.kind >= 3) {
            this.kick(7, .2);
            this.freeze(.045);
        }
        this.deathBurst(e);
        if (e.kind === 4) {
            this.finish(true, '遗迹核心已摧毁，回响重新归于宁静。');
            return true;
        }
        this.dropXP(e.x, e.y, e.kind === 3 ? 18 : e.kind === 2 ? 4 : 3);
        if (e.kind === 3)
            this.dropGear(e.x, e.y, rollItem(this.time, this.loadout, this.eliteIndex === 1));
        else if (this.dropCooldown <= 0 && Math.random() < .01) {
            this.dropCooldown = 30;
            this.dropGear(e.x, e.y, rollItem(this.time, this.loadout));
        }
        if (e.kind === 3 || this.fragmentCooldown <= 0 && (this.kills === 5 || this.kills % RUN.fragmentEvery === 0)) {
            this.fragmentCooldown = RUN.fragmentCooldown;
            if (e.kind === 3 && !this.firstEliteFragment) {
                // 先占用本局标记，再打开/排队，避免击杀 Buff 连锁结算再次发放。
                this.firstEliteFragment = true;
                this.show({ type: 'fragment', choices: [] });
            }
            else
                this.dropFragment(e.x + 16, e.y + 8);
        }
        if (triggerBuffs)
            this.triggerBuff('kill', e.x, e.y);
        if (this.healDropCooldown <= 0 && Math.random() < .03) {
            this.healDropCooldown = difficultyAt(this.time).healCooldown;
            this.dropXP(e.x + 10, e.y + 10, -15);
        }
        return false;
    }
    /** 无敌/训练免伤先拦截；受击 Buff 只在实际扣血且存活时触发，反伤禁止递归。 */
    private readonly playerDamageHooks: PlayerDamageHooks = {
        present: () => {
            this.kick(6, .12);
            this.beep(100, .09, .04);
            this.ring(this.player.x, this.player.y, '#ec9c85');
        },
        retaliate: damage => {
            // 先占用冷却再遍历；反伤继续走统一入口，但关闭 Buff 派发以防递归。
            this.thornCd = 1;
            const p = this.player;
            this.ring(p.x, p.y, '#eab68b');
            for (const enemy of this.grid.query(p.x, p.y, 100))
                this.hit(enemy, damage, { triggerBuffs: false });
        },
        finish: () => this.onPlayerDown(),
        triggerHurt: (x, y) => this.triggerBuff('hurt', x, y),
    };
    /** 装备数值在调用时快照；无敌、训练、扣血、反伤与死亡顺序交由规则模块。 */
    private hurt(damage: number): void {
        const back = this.loadout.back;
        const thornDamage = back?.id === 'thorn' && this.thornCd <= 0
            ? 20 * multiplier(back.quality) * (1 + this.stats.damage) : undefined;
        damagePlayer({
            player: this.player, battle: this.mode === 'battle', training: this.training,
            reduction: this.stats.reduction, thornDamage,
        }, this.playerDamageHooks, damage);
    }
    /** 生成函数只原地追加/合并；掉落上限与腾位由模块统一执行。 */
    private dropXP(x: number, y: number, xp: number): void {
        LootSystem.dropXP(this.lootState(), this.lootHooks, x, y, xp);
    }
    private dropFragment(x: number, y: number): void {
        LootSystem.dropFragment(this.lootState(), this.lootHooks, x, y);
    }
    private dropGear(x: number, y: number, item: Item): void {
        LootSystem.dropGear(this.lootState(), this.lootHooks, x, y, item);
    }
    /** 普通经验/碎片吸取后持续追踪；装备近身才比较，重复低品直接分解不弹窗。 */
    private updateDrops(dt: number): void {
        const state = this.lootState();
        LootSystem.updateDrops(state, this.lootHooks, dt);
        this.drops = state.drops;
    }
    private addXP(amount: number): void { this.progression.addXP(amount); }
    private onKill(): void {
        this.combo++;
        this.comboTime = COMBAT.comboWindow;
        this.player.dash = Math.max(0, this.player.dash - .08);
        if (this.overdrive > 0)
            this.overdrive = Math.min(COMBAT.frenzyDuration, this.overdrive + .18);
        else if (++this.momentum >= COMBAT.frenzyKills) {
            this.momentum = 0;
            this.overdrive = COMBAT.frenzyDuration;
            this.attackTimer = 0;
            this.ring(this.player.x, this.player.y, '#ffd68e');
            this.beep(440, .2, .035);
            this.onToast('狂热！攻速 +60% · 伤害 +25%');
        }
    }
    private kick(strength: number, duration: number): void { this.feedback.kick(strength, duration); }
    private freeze(duration: number): void { this.feedback.freeze(duration); }
    private effect(kind: Effect['kind'], x: number, y: number, color: string, life: number, tx = 0, ty = 0): void { this.feedback.effect(kind, x, y, color, life, tx, ty); }
    /** 节点借出时恢复可见性与变换；数据实体不复用，避免旧伤害/状态泄漏到新怪。 */
    private acquire(text = false): any { return this.nodes.acquire(text); }
    /** 回收前移出显示树并清空文本/形状；超过池容量直接销毁，不无限积累节点。 */
    private release(node: any): void { this.nodes.release(node); }
    private line(x: number, y: number, tx: number, ty: number, color: string, sourceLift = 26): void { this.feedback.line(x, y, tx, ty, color, sourceLift); }
    private ring(x: number, y: number, color: string): void { this.feedback.ring(x, y, color); }
    private deathBurst(e: Enemy): void { this.feedback.deathBurst(e); }
    /** 每次传入当前数据，渲染器不保存 Game 或重开前的 player 引用。 */
    private drawAvatar(force = false): void {
        this.scene.drawAvatar(this.loadout, this.player, this.walkPhase, force);
    }
    private paintEnemy(enemy: Enemy): void {
        this.scene.paintEnemy(enemy, this.buffs, this.visuals);
    }
    private render(): void {
        this.scene.render({
            player: this.player, loadout: this.loadout, levels: this.levels,
            enemies: this.enemies, shots: this.shots, drops: this.drops,
            fields: this.fields, fx: this.fx, labels: this.labels,
            buffs: this.buffs, visuals: this.visuals,
            time: this.time, walkPhase: this.walkPhase, mode: this.mode, paused: this.gate.paused,
            mouseTarget: this.input.mouseTarget, shake: this.shake, shakeTime: this.feedback.shakeTime,
            shakeStrength: this.feedback.shakeStrength, recoil: this.recoil,
        });
    }
}

import { ELITE_TIMES } from '../progression/config.js';
import { clamp } from '../shared/model.js';
import type { SpatialGrid } from '../shared/model.js';
import { difficultyAt, enemyKind } from '../game/difficulty.js';
import { RUN, progressionTime } from '../game/pace.js';
import type { Player, Enemy, Shot, Field } from '../shared/entities.js';
/**
 * 敌人生成与时间轴所需的当前局状态；模块不导入 Game、不保存跨局引用。
 * time 已由 Game 增加本步 dt；本模块只推进刷怪计时，不再次推进局内时间。
 * 容量替换/Boss 登场会替换实体数组，计时与标记是值类型，调用后均须写回。
 */
export interface SpawnState {
    time: number;
    player: Readonly<Pick<Player, 'x' | 'y'>>;
    enemies: Enemy[];
    shots: Shot[];
    fields: Field[];
    grid: SpatialGrid<Enemy>;
    /** 普通波次/Boss 援军共用的剩余秒数。 */
    spawnTimer: number;
    /** 下次怪潮的绝对局内秒数，不是倒计时。 */
    nextSurge: number;
    /** 已触发的定时精英次数；同时用于首个精英的装备奖励规则。 */
    eliteIndex: number;
    bossSpawned: boolean;
}
/**
 * 仅借用节点、绘制和提示能力；生成不造成伤害，不直接打开弹窗或结束对局。
 * clearTransient 只清 Buff 瞬态，不重置配方、已解锁碎片及触发冷却。
 * 钩子在状态写回之前执行，应使用参数，不重入刷怪/重开操作。
 */
export interface SpawnHooks {
    acquire(): any;
    release(node: any): void;
    paintEnemy(enemy: Enemy): void;
    clearTransient(): void;
    ring(x: number, y: number, color: string): void;
    onToast(message: string): void;
}
const LIMIT = 1120;
/**
 * 到达同屏预算时普通怪跳过；精英/Boss 可替换普通怪，避免关键事件被容量吞掉。
 * distance/angle 的默认随机数在容量判断之前求值，即使生成被拒绝也会消耗；
 * 包装层必须原样传 undefined，不能再抽一次随机数，否则整局随机序列会变化。
 * 节点只绘制一次；空间索引留给 Game 在刷怪与流程节点结束后统一重建。
 */
export function spawnEnemy(state: SpawnState, hooks: SpawnHooks, kind: number, distance = 360 + Math.random() * 150, angle = Math.random() * Math.PI * 2): void {
    const difficulty = difficultyAt(state.time);
    if (state.enemies.length >= difficulty.maxEnemies) {
        if (kind < 3)
            return;
        const ordinary = state.enemies.find(e => e.kind < 3);
        if (!ordinary)
            return;
        hooks.release(ordinary.node);
        state.enemies = state.enemies.filter(e => e !== ordinary);
    }
    // 以玩家为圆心放置；被边界夹得过近时尝试反方向，沿用原有出生规则。
    const p = state.player, r = kind === 4 ? 420 : distance;
    let x = clamp(p.x + Math.cos(angle) * r, -LIMIT, LIMIT), y = clamp(p.y + Math.sin(angle) * r, -LIMIT, LIMIT);
    if (Math.hypot(x - p.x, y - p.y) < 150) {
        x = clamp(p.x - Math.cos(angle) * r, -LIMIT, LIMIT);
        y = clamp(p.y - Math.sin(angle) * r, -LIMIT, LIMIT);
    }
    const hp = kind === 4 ? 8400 : [28, 35, 45, 180][kind] * difficulty.hp;
    const node = hooks.acquire();
    const enemy: Enemy = {
        x, y, hp, max: hp, kind,
        // 表中索引依次是普通、远程、冲锋、精英、Boss，保持与实体 kind 契约一致。
        radius: [16, 18, 20, 31, 54][kind],
        speed: [78, 65, 90, 62, 60][kind] * difficulty.speed,
        damage: [9, 10, 15, 18, 24][kind] * difficulty.damage,
        // 初次攻击错峰；后续攻击间隔由 AI 按类型和 Boss 血量重新设置。
        cooldown: (1.5 + Math.random()) * (1 - difficulty.late * .65),
        wind: 0, dx: 0, dy: 0, charge: 0,
        flash: 0, flashPaint: false,
        kx: 0, ky: 0,
        burn: 0, burnD: 0, bladeCd: 0,
        node, dead: false,
    };
    state.enemies.push(enemy);
    hooks.paintEnemy(enemy);
}
/**
 * Boss 登场先清瞬态 Buff，再归还旧敌人与弹道节点、清火焰区域/空间索引，最后生成核心。
 * 掉落、伤害数字、装备和已安装配方保留；3 秒后进入首批援军，之后每 5 秒一批。
 * 由 updateSpawns 用 bossSpawned 防止重复登场，练习入口也可显式调用以重新布置 Boss。
 */
export function spawnBoss(state: SpawnState, hooks: SpawnHooks): void {
    hooks.clearTransient();
    state.bossSpawned = true;
    for (const e of state.enemies)
        hooks.release(e.node);
    state.enemies = [];
    for (const s of state.shots)
        hooks.release(s.node);
    state.shots = [];
    state.fields = [];
    state.grid.rebuild([]);
    spawnEnemy(state, hooks, 4);
    state.spawnTimer = 3;
    hooks.ring(state.player.x, state.player.y, '#d9a177');
    hooks.onToast('最终封印已开启 · 60 秒内击败遗迹核心');
}
/**
 * 每个固定步调用一次：普通波次 → 怪潮 → Boss 援军 → 定时精英 → Boss 登场。
 * 同一步命中多个节点时顺序不能交换；Boss 最后清场，随机抽样顺序也依赖此前步骤。
 * 每类事件每步最多一次，固定步外层负责追赶；此处不能改为 while 补刷。
 * 超时失败与首级经验保底仍由 Game 在本函数返回后处理，避免两处维护对局流程。
 */
export function updateSpawns(state: SpawnState, hooks: SpawnHooks, dt: number): void {
    const difficulty = difficultyAt(state.time);
    state.spawnTimer -= dt;
    if (state.time < RUN.bossAt && state.spawnTimer <= 0) {
        state.spawnTimer = difficulty.spawnInterval;
        for (let i = 0; i < difficulty.batch; i++)
            spawnEnemy(state, hooks, enemyKind(state.time));
    }
    if (state.time < RUN.bossAt - 10 && state.time >= state.nextSurge) {
        state.nextSurge += difficulty.surgeInterval;
        const direction = Math.random() * Math.PI * 2;
        for (let i = 0; i < difficulty.pack; i++)
            spawnEnemy(state, hooks, enemyKind(state.time), 340 + (i % 4) * 30, direction + i / difficulty.pack * Math.PI * 2);
        if (progressionTime(state.time) >= 240) {
            spawnEnemy(state, hooks, 3, 460, direction);
            if (progressionTime(state.time) >= 420)
                spawnEnemy(state, hooks, 3, 460, direction + Math.PI);
        }
        hooks.onToast(progressionTime(state.time) >= 240 ? '围攻怪潮 · 优先躲避远程与冲锋' : '怪潮涌入 · 连续击杀积蓄狂热');
    }
    // 核心登场后关闭普通波次，但保留远程/冲锋援军；封印时刻不再补援军。
    if (state.bossSpawned && state.time < RUN.duration && state.spawnTimer <= 0) {
        state.spawnTimer = 5;
        for (let i = 0; i < 3; i++)
            spawnEnemy(state, hooks, i % 2 ? 1 : 2, 460);
    }
    if (state.eliteIndex < ELITE_TIMES.length && state.time >= ELITE_TIMES[state.eliteIndex]) {
        state.eliteIndex++;
        spawnEnemy(state, hooks, 3);
        hooks.onToast('精英守卫已出现 · 击败后必定掉落装备');
    }
    if (state.time >= RUN.bossAt && !state.bossSpawned)
        spawnBoss(state, hooks);
}

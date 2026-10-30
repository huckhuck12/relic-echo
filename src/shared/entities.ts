/**
 * 战斗与渲染共享的数据契约，不导入 Game、UI 或 Laya 运行时代码。
 * x/y、速度与半径均使用世界坐标；屏幕投影只在渲染和输入边界发生。
 * Game 编排生命周期，武器/掉落模块推进对应实体；node 是 NodePool 借出的显示节点。
 */
import type { Item } from '../progression/config.js';
export interface Point {
    x: number;
    y: number;
}
/** direction 用于外观；dx/dy 保留最后移动方向，供无输入时冲刺使用。 */
export interface Player extends Point {
    hp: number;
    /** 无敌剩余秒数；dash 为冷却，dashTime 为冲刺运动剩余秒数。 */
    inv: number;
    dash: number;
    dashTime: number;
    dx: number;
    dy: number;
    face: number;
    back: boolean;
    /** 屏幕八向；dx/dy 仍是世界移动/冲刺向量。 */
    direction?: import('../rendering/player-pose.js').Facing8;
    /** 施放动作剩余秒数和对应武器；仅用于表现，暂停不推进，换武器时不沿用旧动作。 */
    castTime?: number;
    castWeapon?: import('../progression/config.js').Weapon;
    /** 御刃释放时累计的额外旋转相位；重新攻击不清零，避免高速连发时轨道倒跳。 */
    bladeSpin?: number;
}
export interface Enemy extends Point {
    hp: number;
    max: number;
    /** 0 史莱姆、1 远程、2 冲锋、3 精英、4 Boss。 */
    kind: number;
    radius: number;
    speed: number;
    damage: number;
    /** cooldown 到期后开始 wind 蓄力，再按 dx/dy 发射或冲锋。 */
    cooldown: number;
    wind: number;
    dx: number;
    dy: number;
    charge: number;
    flash: number;
    /** 纯视觉受击反应；不写回位置、击退速度、蓄力或攻击冷却。 */
    hitReaction?: import('../rendering/hit-feedback.js').HitFeedback & {
        life: number;
    };
    /** 纯表现的出手/收招事件，由 AI 既有攻击分支写入，不控制攻击时机。 */
    action?: import('../enemies/enemy-actions.js').EnemyAction;
    actionTime?: number;
    /** 当前局部动作图元缓存键；与 flashPaint/icePaint 一样仅供渲染使用。 */
    actionPaint?: string;
    /** 仅供渲染器使用的上次绘制状态；不参与伤害或 AI。 */
    flashPaint: boolean;
    icePaint?: boolean;
    /** 击退速度按时间指数衰减，与基础追击速度分开处理。 */
    kx: number;
    ky: number;
    burn: number;
    burnD: number;
    bladeCd: number;
    node: any;
    /** 先标记死亡，逻辑步末统一从数组移除并回收 node。 */
    dead: boolean;
}
/** 发射时保存伤害与范围，途中换装不能改变已发出的弹道。 */
export interface Shot extends Point {
    /** 出膛画面偏移；不把武器高度误当作地面坐标参与碰撞，前 0.12 秒平滑归入弹道。 */
    launchX?: number;
    launchY?: number;
    /** 出膛偏移对应的初始 life；玩家为 1.2，敌方弹道为 6。 */
    launchLife?: number;
    vx: number;
    vy: number;
    life: number;
    damage: number;
    hostile: boolean;
    color: string;
    flame: boolean;
    burn: number;
    radius: number;
    fieldLife: number;
    node: any;
}
/** item / fragment 存在时为特殊掉落；普通 xp<0 表示治疗。 */
export interface Drop extends Point {
    xp: number;
    collecting: boolean;
    item?: Item;
    fragment?: string;
    node: any;
}
/** 武器火焰地面，独立于 BuffRuntime 的自定义区域。 */
export interface Field extends Point {
    life: number;
    tick: number;
    damage: number;
    radius: number;
}
/** 纯表现数据，life/max 决定动画进度；不能反向产生伤害。 */
export interface Effect extends Point {
    /** 电弧起点高度；挂载点已包含高度时为 0，怪物连锁使用胸口高度 26。 */
    sourceLift?: number;
    tx: number;
    ty: number;
    life: number;
    max: number;
    color: string;
    /** death: tx=散裂半径、ty=敌人种类；cast: tx=世界瞄准角、ty=雷杖0/炎炮1/环刃2；weaponHit: tx=屏幕方向角、ty=相同武器编号；slash: tx=御刃范围、ty=释放相位。只参与绘图。 */
    kind: 'line' | 'ring' | 'burst' | 'impact' | 'blast' | 'slash' | 'dash' | 'death' | 'cast' | 'weaponHit';
}
export interface DamageLabel extends Point {
    node: any;
    life: number;
    rise: number;
}

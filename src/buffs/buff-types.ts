import type { Trigger, Action, Element } from './buff-config.js';
export type { Trigger, Action, Element, Part } from './buff-config.js';
/** 配方可以暂未填满；只有 CompleteRecipe 可进入效果生成。 */
export interface Recipe {
    trigger: Trigger | null;
    action: Action | null;
    element: Element | null;
}
export interface CompleteRecipe {
    trigger: Trigger;
    action: Action;
    element: Element;
}
export type FragmentReward = {
    kind: 'unlock';
} | {
    kind: 'upgrade';
    slot: number;
    level: number;
} | {
    kind: 'xp';
    amount: number;
} | {
    kind: 'invalid';
};
export interface BuffTarget {
    x: number;
    y: number;
    dead: boolean;
}
/** 与战斗编排层的唯一连接；damage 回调必须阻止 Buff 递归触发 Buff。 */
export interface BuffHost<T extends BuffTarget> {
    player: {
        x: number;
        y: number;
        dx: number;
        dy: number;
    };
    query(x: number, y: number, radius: number): T[];
    damage(target: T, value: number, feedback?: boolean, quiet?: boolean): void;
    knock(target: T, force: number, x: number, y: number): void;
}
/** damage/element/level 都在释放时快照，后续换配方或升级不会追溯修改。 */
export interface BuffEffect {
    kind: Action;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    tick: number;
    age: number;
    damage: number;
    element: Element;
    level: number;
}
export interface BuffFeedback {
    x: number;
    y: number;
    tx: number;
    ty: number;
    element: Element;
    kind: 'impact' | 'arc' | 'scorch' | 'detonate' | 'shatter';
    life: number;
    max: number;
    age: number;
    level: number;
}
export interface BuffStatus {
    burn: number;
    burnDamage: number;
    burnTick: number;
    slow: number;
}
export type BuffFeedbackSink = (kind: BuffFeedback['kind'], element: Element, x: number, y: number, tx?: number, ty?: number, level?: number) => void;

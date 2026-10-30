import type { Enemy } from '../shared/entities.js';
/** AI 在既有攻击时刻写入表现事件；这些计时绝不能影响 wind、charge、移动或伤害。 */
export type EnemyAction = 'cast' | 'launch' | 'brake' | 'burst' | 'slam';
export const ENEMY_ACTION_SECONDS: Record<EnemyAction, number> = {
    cast: .26, launch: .18, brake: .24, burst: .3, slam: .34
};
export function startEnemyAction(e: Enemy, action: EnemyAction): void {
    e.action = action;
    e.actionTime = ENEMY_ACTION_SECONDS[action];
}
/** 八段动作用于局部几何缓存；普通追击与冲锋仍只改变整体节点变换。 */
export function enemyArtPose(e: Enemy) {
    const wind = e.wind > 0 ? Math.min(7, Math.floor(Math.max(0, 1 - e.wind / (e.kind === 1 ? .45 : e.kind === 2 ? .75 : .85)) * 8)) : -1;
    const action = e.action && (e.actionTime || 0) > 0 ? e.action : undefined;
    const frame = action ? Math.min(7, Math.floor(Math.max(0, 1 - (e.actionTime || 0) / ENEMY_ACTION_SECONDS[action]) * 8)) : 8;
    const power = action ? Math.pow(1 - frame / 8, 2) : 0;
    let staffAngle = 0, staffLift = 0, leftArmAngle = 0, rightArmAngle = 0, armLift = 0;
    if (e.kind === 1) {
        if (wind >= 0) {
            const raise = .25 + wind / 7 * .75;
            staffAngle = -.35 * raise;
            staffLift = -9 * raise;
            rightArmAngle = -.75 * raise;
            leftArmAngle = .22 * raise;
        }
        if (action === 'cast') {
            staffAngle = .22 * power;
            staffLift = -5 * power;
            rightArmAngle = -1.1 * power;
            leftArmAngle = .4 * power;
        }
    }
    if (e.kind >= 3) {
        if (wind >= 0) {
            const raise = .25 + wind / 7 * .75;
            leftArmAngle = 1.5 * raise;
            rightArmAngle = -1.5 * raise;
            armLift = -10 * raise;
        }
        if (action === 'burst') {
            leftArmAngle = .85 * power;
            rightArmAngle = -.85 * power;
            armLift = -5 * power;
        }
        if (action === 'slam') {
            leftArmAngle = -.18 * power;
            rightArmAngle = .18 * power;
            armLift = 11 * power;
        }
    }
    const animated = e.kind === 1 || e.kind >= 3;
    return {
        staffAngle, staffLift, leftArmAngle, rightArmAngle, armLift, key: animated ? `${wind}:${action || 'idle'}:${frame}` : 'idle'
    };
}

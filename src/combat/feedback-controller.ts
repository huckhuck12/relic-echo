import type { Effect, Enemy } from '../shared/entities.js';
export interface FeedbackHost {
    effects(): Effect[];
    budget(): number;
}
/** 表现状态独立管理；重开后的效果数组通过 getter 获取，避免向旧数组写入。 */
export class FeedbackController {
    shakeTime = 0;
    shakeStrength = 0;
    hitStop = 0;
    hitStopCooldown = 0;
    constructor(private readonly host: FeedbackHost) { }
    /** 每显示帧消耗顿帧时长，返回应从固定步积累中扣除的秒数。 */
    consumeHitStop(dt: number): number {
        const stopped = Math.min(dt, this.hitStop);
        this.hitStop -= stopped;
        return stopped;
    }
    kick(strength: number, duration: number): void {
        this.shakeStrength = this.shakeTime > 0 ? Math.max(this.shakeStrength, strength) : strength;
        this.shakeTime = Math.max(this.shakeTime, duration);
    }
    /** 设冷却避免密集暴击连续锁死模拟；冷却由 Game 固定步推进，暂停时冻结。 */
    freeze(duration: number): void {
        if (this.hitStopCooldown > 0)
            return;
        this.hitStop = Math.max(this.hitStop, duration);
        this.hitStopCooldown = .18;
    }
    effect(kind: Effect['kind'], x: number, y: number, color: string, life: number, tx = 0, ty = 0): void {
        if (this.host.effects().length < this.host.budget())
            this.host.effects().push({
                kind, x, y, color, life, max: life, tx, ty
            });
    }
    line(x: number, y: number, tx: number, ty: number, color: string, sourceLift = 26): void {
        if (this.host.effects().length < this.host.budget())
            this.host.effects().push({
                x, y, tx, ty, life: .17, max: .17, color, kind: 'line', sourceLift
            });
    }
    ring(x: number, y: number, color: string): void {
        if (this.host.effects().length < this.host.budget())
            this.host.effects().push({
                x, y, tx: 0, ty: 0, life: .35, max: .35, color, kind: 'ring'
            });
    }
    /** 只提交死亡表现快照；原实体仍由 Game 在步末回收，不生成可碰撞尸体。 */
    deathBurst(e: Enemy): void {
        if (this.host.effects().length >= this.host.budget())
            return;
        const life = e.kind >= 3 ? .52 : .32;
        this.host.effects().push({
            x: e.x, y: e.y, tx: e.kind >= 3 ? 58 : 30, ty: e.kind,
            life, max: life, color: ['#93b962', '#c7a1e4', '#d79459', '#99aa7c', '#e2ae65'][e.kind], kind: 'death'
        });
    }
}

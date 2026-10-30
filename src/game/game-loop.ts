import { SIMULATION } from './game-config.js';
import type { PerformanceMonitor } from './performance-monitor.js';
/** 回调均读取当前局；循环不保存实体，不结算奖励或修改暂停原因。 */
export interface LoopHost {
    active(): boolean;
    paused(): boolean;
    measuring(): boolean;
    consumeHitStop(dt: number): number;
    update(dt: number): void;
    render(): void;
    changed(): void;
    readonly monitor: PerformanceMonitor;
}
/** 固定步调度：暂停清积累，顿帧扣除模拟时间，UI 按独立低频刷新。 */
export class GameLoop {
    accumulator = 0;
    last = performance.now();
    fps = 60;
    private uiTime = 0;
    private frameCount = 0;
    private fpsTime = 0;
    constructor(private readonly host: LoopHost) { }
    /**
     * 原始帧间隔用于 FPS，截断后的 dt 用于模拟；每帧最多追赶 maxSteps 步。
     * 单步中弹出奖励也会立即停止追赶；暂停不积累时间，不在恢复后补算伤害。
     * CPU 采样只覆盖 update/render 回调，不能视为 GPU 帧耗时。
     */
    frame(): void {
        const now = performance.now(), rawDt = Math.max(0, (now - this.last) / 1000), dt = Math.min(rawDt, SIMULATION.maxDelta);
        this.last = now;
        this.fpsTime += rawDt;
        this.frameCount++;
        if (this.fpsTime >= SIMULATION.fpsInterval) {
            this.fps = Math.round(this.frameCount / this.fpsTime);
            this.fpsTime = 0;
            this.frameCount = 0;
        }
        const measure = this.host.measuring() && !document.hidden && this.host.active();
        if (this.host.active()) {
            const stopped = this.host.consumeHitStop(dt);
            this.accumulator += dt - stopped;
            let count = 0;
            while (this.accumulator >= SIMULATION.fixedStep && count++ < SIMULATION.maxSteps && this.host.active()) {
                this.host.update(SIMULATION.fixedStep);
                this.accumulator -= SIMULATION.fixedStep;
            }
            if (this.host.paused())
                this.accumulator = 0;
        }
        else
            this.accumulator = 0;
        const updatedAt = this.host.measuring() ? performance.now() : now;
        this.host.render();
        if (measure && this.host.active())
            this.host.monitor.record(now, updatedAt - now, performance.now() - updatedAt);
        else
            this.host.monitor.suspend();
        this.uiTime += dt;
        if (this.uiTime > SIMULATION.uiInterval) {
            this.uiTime = 0;
            this.host.changed();
        }
    }
}

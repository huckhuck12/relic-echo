export interface FrameMetrics {
    samples: number;
    fps: number;
    frameMs: number;
    p95Ms: number;
    maxMs: number;
    updateMs: number;
    renderMs: number;
}
/** 最近 300 个前台战斗帧的有界环形采样。
 * 帧间隔使用真实时间，不受模拟 dt 的 100ms 截断影响；CPU 时间仅覆盖 Game 更新/绘图指令。
 * 不包装 Laya 私有循环，不声称测到了引擎提交、GPU 或显存。
 */
export class PerformanceMonitor {
    private frames: {
        frame: number;
        update: number;
        render: number;
    }[] = [];
    private cursor = 0;
    private previous: number | null = null;
    reset(): void {
        this.frames.length = 0;
        this.cursor = 0;
        this.previous = null;
    }
    /** 暂停期间保留最后结果，恢复首帧重建窗口，排除菜单/切后台产生的巨大间隔。 */
    suspend(): void { this.previous = null; }
    record(now: number, update: number, render: number): void {
        if (this.previous === null) {
            this.reset();
            this.previous = now;
            return;
        }
        const interval = now - this.previous;
        this.previous = now;
        if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(update) || !Number.isFinite(render))
            return;
        this.frames[this.cursor] = { frame: interval, update: Math.max(0, update), render: Math.max(0, render) };
        this.cursor = (this.cursor + 1) % 300;
    }
    /** 只在 HUD 低频刷新时聚合和排序；记录本身不排序、不创建显示节点。 */
    snapshot(): FrameMetrics {
        const n = this.frames.length;
        if (!n)
            return {
                samples: 0, fps: 0, frameMs: 0, p95Ms: 0, maxMs: 0, updateMs: 0, renderMs: 0
            };
        const sorted = this.frames.map(f => f.frame).sort((a, b) => a - b);
        const mean = (key: 'frame' | 'update' | 'render') => this.frames.reduce((sum, f) => sum + f[key], 0) / n;
        const frameMs = mean('frame');
        return {
            samples: n, fps: 1000 / frameMs, frameMs, p95Ms: sorted[Math.ceil(n * .95) - 1], maxMs: sorted[n - 1], updateMs: mean('update'), renderMs: mean('render')
        };
    }
}

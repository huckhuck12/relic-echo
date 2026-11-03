export interface FrameMetrics {
    samples: number;
    fps: number;
    frameMs: number;
    p95Ms: number;
    maxMs: number;
    updateMs: number;
    renderMs: number;
    simulationSteps: number;
    maxSimulationSteps: number;
    stepMs: number;
    engineSamples: number;
    engineMs: number;
    drawCalls: number;
}
/** 最近 300 个前台战斗帧的有界环形采样。
 * 帧间隔使用真实时间，不受模拟 dt 的 100ms 截断影响；更新/指令和引擎等 CPU 分开记录。
 * 公开 Stage.render 的外围采样不能测量 GPU 时间或进程总内存。
 */
export class PerformanceMonitor {
    private frames: {
        frame: number;
        update: number;
        render: number;
        steps: number;
        engine?: number;
        draws?: number;
    }[] = [];
    private cursor = 0;
    private previous: number | null = null;
    sequence = 0;
    reset(): void {
        this.frames.length = 0;
        this.cursor = 0;
        this.previous = null;
    }
    /** 暂停期间保留最后结果，恢复首帧重建窗口，排除菜单/切后台产生的巨大间隔。 */
    suspend(): void { this.previous = null; }
    record(now: number, update: number, render: number, steps = 0): void {
        if (this.previous === null) {
            this.reset();
            this.previous = now;
            return;
        }
        const interval = now - this.previous;
        this.previous = now;
        if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(update) || !Number.isFinite(render))
            return;
        this.frames[this.cursor] = { frame: interval, update: Math.max(0, update), render: Math.max(0, render), steps };
        this.cursor = (this.cursor + 1) % 300;
        this.sequence++;
    }
    /** Stage.render includes timers; subtract this same frame's game work, never call this GPU time. */
    finishStage(sequence: number, elapsed: number, draws: number): void {
        if (this.sequence !== sequence + 1 || !this.frames.length || !Number.isFinite(elapsed))
            return;
        const frame = this.frames[(this.cursor + 299) % 300];
        frame.engine = Math.max(0, elapsed - frame.update - frame.render);
        frame.draws = Math.max(0, draws);
    }
    /** 只在 HUD 低频刷新时聚合和排序；记录本身不排序、不创建显示节点。 */
    snapshot(): FrameMetrics {
        const n = this.frames.length;
        if (!n)
            return {
                samples: 0, fps: 0, frameMs: 0, p95Ms: 0, maxMs: 0, updateMs: 0, renderMs: 0,
                simulationSteps: 0, maxSimulationSteps: 0, stepMs: 0, engineSamples: 0, engineMs: 0, drawCalls: 0
            };
        const sorted = this.frames.map(f => f.frame).sort((a, b) => a - b);
        const mean = (key: 'frame' | 'update' | 'render') => this.frames.reduce((sum, f) => sum + f[key], 0) / n;
        const frameMs = mean('frame');
        const steps = this.frames.reduce((sum, f) => sum + f.steps, 0);
        const engine = this.frames.filter(f => f.engine !== undefined);
        return {
            samples: n, fps: 1000 / frameMs, frameMs, p95Ms: sorted[Math.ceil(n * .95) - 1], maxMs: sorted[n - 1], updateMs: mean('update'), renderMs: mean('render'),
            simulationSteps: steps / n, maxSimulationSteps: Math.max(...this.frames.map(f => f.steps)), stepMs: steps ? mean('update') * n / steps : 0,
            engineSamples: engine.length, engineMs: engine.length ? engine.reduce((sum, f) => sum + f.engine!, 0) / engine.length : 0,
            drawCalls: engine.length ? engine.reduce((sum, f) => sum + (f.draws || 0), 0) / engine.length : 0
        };
    }
}

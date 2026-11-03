import type { LayaStage, LayaRuntime } from '../platform/laya.js';
import type { PerformanceMonitor } from './performance-monitor.js';
import type { DrawCallProbe } from './draw-call-probe.js';
/** Pinned Laya 2.0.2 public Stage.render includes flush and timers. No private loop patch. */
export function profileEngine(stage: LayaStage, monitor: PerformanceMonitor, enabled: () => boolean, now: () => number, stats: LayaRuntime['Stat'], probe?: DrawCallProbe): void {
    const original = stage.render;
    if (!original)
        return;
    stage.render = function (context, x, y) {
        if (!enabled() && !probe?.active)
            return original.call(this, context, x, y);
        const start = now(), sequence = monitor.sequence, draws = stats?.renderBatches || 0;
        try {
            return original.call(this, context, x, y);
        }
        catch (error) {
            probe?.cancel('绘制失败，拆分测量已取消。');
            throw error;
        }
        finally {
            if (enabled())
                monitor.finishStage(sequence, now() - start, (stats?.renderBatches || 0) - draws);
            if (probe?.active)
                probe.record(stats ? stats.renderBatches - draws : NaN);
        }
    };
}

import type { LayaStage, LayaRuntime } from '../platform/laya.js';
import type { PerformanceMonitor } from './performance-monitor.js';
/** Pinned Laya 2.0.2 public Stage.render includes flush and timers. No private loop patch. */
export function profileEngine(stage: LayaStage, monitor: PerformanceMonitor, enabled: () => boolean, now: () => number, stats: LayaRuntime['Stat']): void {
    const original = stage.render;
    if (!original)
        return;
    stage.render = function (context, x, y) {
        if (!enabled())
            return original.call(this, context, x, y);
        const start = now(), sequence = monitor.sequence, draws = stats?.renderBatches || 0;
        try {
            return original.call(this, context, x, y);
        }
        finally {
            if (enabled())
                monitor.finishStage(sequence, now() - start, (stats?.renderBatches || 0) - draws);
        }
    };
}

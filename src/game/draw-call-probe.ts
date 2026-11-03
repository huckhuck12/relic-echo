export const DRAW_GROUPS = [
    ['enemies', '怪物本体'], ['shots', '弹道'], ['buffs', 'Buff 特效'],
    ['effects', '其他特效'], ['warnings', '血条/预警'], ['drops', '掉落/光柱'],
    ['labels', '飘字'], ['environment', '地图/柱子'], ['player', '玩家本体'], ['ui', '界面'],
] as const;
export type DrawGroup = typeof DRAW_GROUPS[number][0];
export const DRAW_CALL_KEY = 'relic-drawcall-report';
export interface DrawCallReport {
    capturedAt: number;
    context: Record<string, string | number>;
    baseline: number;
    finalBaseline: number;
    stable: boolean;
    rows: {
        group: DrawGroup;
        label: string;
        without: number;
        saved: number;
    }[];
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** Frozen-scene ablation, using actual whole-stage batches after flush, never per-node estimates. */
export class DrawCallProbe {
    active = false;
    showReport = false;
    report: DrawCallReport | null = null;
    error = '';
    private index = 0;
    private frame = 0;
    private values: number[] = [];
    private totals: number[] = [];
    private context: Record<string, string | number> = {};
    constructor(private readonly changed: () => void) { }
    get excluded(): DrawGroup | null { return this.active ? DRAW_GROUPS[this.index - 1]?.[0] ?? null : null; }
    start(context: Record<string, string | number>): void {
        if (this.active)
            return;
        this.context = context;
        this.index = this.frame = 0;
        this.values = [];
        this.totals = [];
        this.error = '';
        this.showReport = false;
        this.active = true;
        this.changed();
    }
    record(draws: number): void {
        if (!this.active)
            return;
        if (!Number.isFinite(draws) || draws < 0) {
            this.cancel('引擎未提供有效的 DrawCall 计数。');
            return;
        }
        // Two warm-up frames, then the median of three complete flushes per variant.
        if (++this.frame > 2)
            this.values.push(draws);
        if (this.frame < 5)
            return;
        this.totals.push(median(this.values));
        this.values = [];
        this.frame = 0;
        if (++this.index < DRAW_GROUPS.length + 2) {
            this.changed();
            return;
        }
        const baseline = this.totals[0], finalBaseline = this.totals[this.totals.length - 1];
        this.report = {
            capturedAt: Date.now(), context: this.context, baseline, finalBaseline,
            stable: Math.abs(finalBaseline - baseline) <= Math.max(2, baseline * .05),
            rows: DRAW_GROUPS.map(([group, label], i) => ({ group, label, without: this.totals[i + 1], saved: baseline - this.totals[i + 1] })),
        };
        this.active = false;
        this.showReport = true;
        this.changed();
    }
    cancel(reason = ''): void {
        if (!this.active)
            return;
        this.active = false;
        this.error = reason;
        this.changed();
    }
}

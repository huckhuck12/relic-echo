export const QUALITY_PRESETS = {
    low: {
        name: '流畅', particles: 20, labels: 8, bars: 12, debris: 3, detail: false, buffFeedback: 10
    },
    standard: {
        name: '标准', particles: 36, labels: 16, bars: 24, debris: 5, detail: false, buffFeedback: 24
    },
    high: {
        name: '精细', particles: 60, labels: 30, bars: 48, debris: 10, detail: true, buffFeedback: 48
    },
};
export type VisualQuality = keyof typeof QUALITY_PRESETS;
/** 渲染预算契约；场景渲染和 Buff 表现共享当前档位的同一份配置。 */
export type VisualSettings = typeof QUALITY_PRESETS[VisualQuality];
export function visualQuality(value: unknown): VisualQuality { return value === 'low' || value === 'high' ? value : 'standard'; }

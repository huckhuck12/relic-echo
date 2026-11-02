/** 广告适配器只报告观看结果，不直接修改生命或流程；取消信号用于离局清理。 */
export type ReviveOutcome = 'rewarded' | 'cancelled' | 'failed';
/** 小游戏不保证提供 DOM AbortController，只暴露复活请求所需的取消能力。 */
export interface ReviveSignal {
    readonly aborted: boolean;
    addEventListener(type: 'abort', listener: () => void, options?: {
        once?: boolean;
    }): void;
    removeEventListener(type: 'abort', listener: () => void): void;
}
class ReviveCancellation {
    private listeners = new Set<() => void>();
    readonly signal = {
        aborted: false,
        addEventListener: (_type: 'abort', listener: () => void, _options?: {
            once?: boolean;
        }) => { this.listeners.add(listener); },
        removeEventListener: (_type: 'abort', listener: () => void) => { this.listeners.delete(listener); },
    };
    abort(): void {
        if (this.signal.aborted)
            return;
        this.signal.aborted = true;
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch { /* SDK 清理失败不能阻止其他取消订阅者。 */ }
        }
        this.listeners.clear();
    }
}
export interface ReviveProvider {
    readonly label: string;
    readonly available?: boolean;
    request(signal: ReviveSignal): Promise<ReviveOutcome>;
}
/** 尚未接广告的开发入口，文案明确区分测试奖励与真实广告。 */
export const testReviveProvider: ReviveProvider = {
    label: '测试复活（未接广告）', request: async () => 'rewarded',
};
export const unavailableReviveProvider: ReviveProvider = {
    label: '复活暂未开放', available: false, request: async () => 'failed',
};
/** 同时只允许一个请求；超时/离局立即失效，迟到的 SDK 回调不能给新局发奖。 */
export class ReviveService {
    private controller: ReviveCancellation | null = null;
    constructor(public provider: ReviveProvider = testReviveProvider, private readonly timeoutMs = 45000) { }
    get busy(): boolean { return this.controller !== null; }
    cancel(): void {
        this.controller?.abort();
        this.controller = null;
    }
    async request(): Promise<ReviveOutcome> {
        if (this.busy || this.provider.available === false)
            return 'cancelled';
        const controller = new ReviveCancellation();
        this.controller = controller;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const cancelled = new Promise<ReviveOutcome>(resolve => {
                controller.signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
                timer = setTimeout(() => controller.abort(), this.timeoutMs);
            });
            return await Promise.race([Promise.resolve().then(() => controller.signal.aborted ? 'cancelled' as const : this.provider.request(controller.signal)), cancelled]);
        }
        catch {
            return 'failed';
        }
        finally {
            clearTimeout(timer);
            if (this.controller === controller)
                this.controller = null;
        }
    }
}

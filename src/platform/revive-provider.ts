/** 广告适配器只报告观看结果，不直接修改生命或流程；取消信号用于离局清理。 */
export type ReviveOutcome = 'rewarded' | 'cancelled' | 'failed';
export interface ReviveProvider {
    readonly label: string;
    request(signal: AbortSignal): Promise<ReviveOutcome>;
}
/** 尚未接广告的开发入口，文案明确区分测试奖励与真实广告。 */
export const testReviveProvider: ReviveProvider = {
    label: '测试复活（未接广告）', request: async () => 'rewarded',
};
/** 同时只允许一个请求；超时/离局立即失效，迟到的 SDK 回调不能给新局发奖。 */
export class ReviveService {
    private controller: AbortController | null = null;
    constructor(public provider: ReviveProvider = testReviveProvider, private readonly timeoutMs = 45000) { }
    get busy(): boolean { return this.controller !== null; }
    cancel(): void {
        this.controller?.abort();
        this.controller = null;
    }
    async request(): Promise<ReviveOutcome> {
        if (this.busy)
            return 'cancelled';
        const controller = new AbortController();
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

import { ToneVoices } from './tone-voices.js';
/** 程序音效适配器；只在用户手势中恢复音频，不依赖素材，不持有局内战斗状态。 */
export class BrowserAudio {
    private context: AudioContext | null = null;
    private readonly voices = new ToneVoices();
    suspend(): void {
        this.voices.clear();
        try {
            void this.context?.suspend()?.catch(() => { });
        }
        catch { }
    }
    enable(): void {
        try {
            if (!this.context)
                this.context = new AudioContext();
            // 浏览器拒绝 resume 时静默降级，避免未处理的 Promise 拒绝。
            void this.context.resume().catch(() => { });
        }
        catch { /* 无音频支持时照常游玩。 */ }
    }
    play(enabled: boolean, frequency: number, duration = .045, volume = .025): void {
        if (!enabled || !this.context || this.context.state !== 'running')
            return;
        this.voices.play(this.context, frequency, duration, volume);
    }
}

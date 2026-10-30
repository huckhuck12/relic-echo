/** 程序音效适配器；只在用户手势中恢复音频，不依赖素材，不持有局内战斗状态。 */
export class ProceduralAudio {
    private context: AudioContext | null = null;
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
        const now = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * .55), now + duration);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(.001, now + duration);
        oscillator.connect(gain);
        gain.connect(this.context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }
}

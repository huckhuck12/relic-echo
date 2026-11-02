/** Bounded native audio ownership. Completed, suspended and failed tones disconnect both nodes. */
export class ToneVoices {
    private readonly voices = new Set<{
        end: number;
        release: () => void;
    }>();
    play(context: AudioContext, frequency: number, duration: number, volume: number): void {
        const now = context.currentTime;
        // Some native implementations omit onended. Reclaim by audio clock as well.
        for (const voice of this.voices)
            if (voice.end <= now)
                voice.release();
        if (this.voices.size >= 8)
            return;
        let oscillator: OscillatorNode | undefined, gain: GainNode | undefined;
        const voice = { end: now + duration, release: () => {
                if (!this.voices.delete(voice))
                    return;
                if (oscillator) {
                    try {
                        oscillator.onended = null;
                    }
                    catch { }
                    try {
                        oscillator.stop();
                    }
                    catch { }
                    try {
                        oscillator.disconnect();
                    }
                    catch { }
                }
                try {
                    gain?.disconnect();
                }
                catch { }
            } };
        this.voices.add(voice);
        try {
            oscillator = context.createOscillator();
            gain = context.createGain();
            oscillator.onended = voice.release;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, now);
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * .55), now + duration);
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(.001, now + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(now);
            oscillator.stop(now + duration);
        }
        catch {
            voice.release();
        }
    }
    clear(): void {
        for (const voice of this.voices)
            voice.release();
    }
}

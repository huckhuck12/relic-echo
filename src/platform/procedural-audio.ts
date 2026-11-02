import { platform } from './runtime.js';
export class ProceduralAudio {
    private readonly backend = platform().createAudio();
    enable(): void { this.backend.enable(); }
    suspend(): void { this.backend.suspend(); }
    play(enabled: boolean, frequency: number, duration = .045, volume = .025): void { this.backend.play(enabled, frequency, duration, volume); }
}

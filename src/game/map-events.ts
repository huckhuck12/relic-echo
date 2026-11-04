import type { RunPace } from './pace.js';
export const SEAL_SITES = [
    {
        id: 'grove', name: '苔庭封印', x: -650, y: -520, at: 75
    },
    {
        id: 'court', name: '断柱封印', x: 650, y: -500, at: 210
    },
    {
        id: 'spring', name: '回响封印', x: -580, y: 620, at: 360
    },
    {
        id: 'gate', name: '古门封印', x: 600, y: 600, at: 480
    }
] as const;
export interface SealEvent {
    id: string;
    name: string;
    x: number;
    y: number;
    at: number;
    state: 'locked' | 'available' | 'active' | 'completed' | 'expired';
    progress: number;
    startedAt: number;
}
export const SEAL_RULES = {
    activateRadius: 95, holdRadius: 160, holdSeconds: 18, availableSeconds: 65, challengeSeconds: 45
} as const;
/** Simulation-only optional encounters. Leaving the circle pauses progress; it never resets the clock. */
export class MapEvents {
    readonly sites: SealEvent[] = [];
    reset(run: RunPace): void {
        this.sites.length = 0;
        if (run.id === 'standard')
            this.sites.push(...SEAL_SITES.map(site => ({ ...site, state: 'locked' as const, progress: 0, startedAt: 0 })));
    }
    update(time: number, player: {
        x: number;
        y: number;
    }, dt: number, run: RunPace, hooks: {
        start(site: SealEvent): void;
        complete(site: SealEvent): void;
        announce(message: string): void;
    }): void {
        for (const site of this.sites) {
            if (site.state === 'completed' || site.state === 'expired')
                continue;
            if (time >= run.bossAt) {
                site.state = 'expired';
                continue;
            }
            if (site.state === 'locked') {
                if (time < site.at)
                    continue;
                site.state = 'available';
                hooks.announce(`${site.name}已显现 · 前往守住封印，赢取碎片或治疗`);
            }
            const distance = Math.hypot(player.x - site.x, player.y - site.y);
            if (site.state === 'available') {
                if (time >= site.at + SEAL_RULES.availableSeconds) {
                    site.state = 'expired';
                    continue;
                }
                if (distance > SEAL_RULES.activateRadius)
                    continue;
                site.state = 'active';
                site.startedAt = time;
                hooks.start(site);
                hooks.announce(`${site.name}启动 · 圈内累计守护 18 秒，45 秒后关闭`);
                continue;
            }
            if (site.state !== 'active')
                continue;
            if (time >= site.startedAt + SEAL_RULES.challengeSeconds) {
                site.state = 'expired';
                hooks.announce(`${site.name}已关闭 · 可继续探索`);
                continue;
            }
            if (distance <= SEAL_RULES.holdRadius)
                site.progress = Math.min(SEAL_RULES.holdSeconds, site.progress + Math.max(0, dt));
            if (site.progress >= SEAL_RULES.holdSeconds - 1e-8) {
                site.state = 'completed';
                hooks.complete(site);
            }
        }
    }
    active(): SealEvent | undefined { return this.sites.find(site => site.state === 'active' || site.state === 'available'); }
}

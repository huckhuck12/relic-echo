import type { RunPace } from './pace.js';
import type { Enemy, Point } from '../shared/entities.js';
export type SealObjective = 'hold' | 'clear' | 'relay' | 'guardian';
export const SEAL_SITES = [
    {
        id: 'grove', name: '苔庭封印', x: -650, y: -520, at: 75, objective: 'hold'
    },
    {
        id: 'court', name: '断柱封印', x: 650, y: -500, at: 210, objective: 'clear'
    },
    {
        id: 'spring', name: '回响封印', x: -580, y: 620, at: 360, objective: 'relay'
    },
    {
        id: 'gate', name: '古门封印', x: 600, y: 600, at: 480, objective: 'guardian'
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
    objective: SealObjective;
}
export const SEAL_RULES = {
    activateRadius: 95, holdRadius: 160, holdSeconds: 18, availableSeconds: 65, challengeSeconds: 45
} as const;
export const SEAL_REWARDS = { fragmentHeal: .15, heal: .45, reliefSeconds: 20 } as const;
export const SEAL_OBJECTIVES = {
    hold: { name: '守护', goal: SEAL_RULES.holdSeconds, radius: SEAL_RULES.holdRadius, instruction: '圈内累计守护 18 秒' },
    clear: { name: '清剿', goal: 8, radius: 260, instruction: '圈内击败 8 名敌人' },
    relay: { name: '巡回', goal: 12, radius: 65, instruction: '依次点亮三处符石，每处驻留 4 秒' },
    guardian: { name: '守卫', goal: 1, radius: 260, instruction: '击败带冠标记的封印守卫' }
} as const;
/** 三点间距约 210–300 世界单位；投影落在角色前下方，避开左侧排行与底部摇杆。 */
export function sealRelayPoints(site: Point): Point[] {
    return [{ x: site.x - 70, y: site.y + 140 }, { x: site.x + 140, y: site.y - 70 }, { x: site.x + 140, y: site.y + 140 }];
}
export function sealRule(site: SealEvent) { return SEAL_OBJECTIVES[site.objective || 'hold']; }
export function sealTarget(site: SealEvent): Point {
    return site.state === 'active' && site.objective === 'relay' ? sealRelayPoints(site)[Math.min(2, Math.floor(site.progress / 4))] : site;
}
export function sealNavigationTarget(site: SealEvent, enemies: readonly Enemy[]): Point {
    return site.state === 'active' && site.objective === 'guardian' ? enemies.find(e => !e.dead && e.sealId === site.id) || site : sealTarget(site);
}
export function sealProgressText(site: SealEvent): string {
    if (site.objective === 'relay')
        return `符石 ${Math.min(3, Math.floor(site.progress / 4))}/3 · 驻留 ${(site.progress % 4).toFixed(0)}/4s`;
    return `${sealRule(site).name} ${site.progress.toFixed(0)}/${sealRule(site).goal}${site.objective === 'hold' ? 's' : ''}`;
}
/** Optional encounters retain progress when leaving; death credit arrives only from real combat. */
export class MapEvents {
    readonly sites: SealEvent[] = [];
    reliefUntil = 0;
    private credited = new WeakSet<Enemy>();
    reset(run: RunPace): void {
        this.sites.length = 0;
        this.reliefUntil = 0;
        this.credited = new WeakSet<Enemy>();
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
                hooks.announce(`${site.name}已显现 · ${sealRule(site).instruction}，可获补给`);
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
                hooks.announce(`${site.name}启动 · ${sealRule(site).instruction}，45 秒后关闭`);
                continue;
            }
            if (site.state !== 'active')
                continue;
            if (time >= site.startedAt + SEAL_RULES.challengeSeconds) {
                site.state = 'expired';
                hooks.announce(`${site.name}已关闭 · 可继续探索`);
                continue;
            }
            const rule = sealRule(site), target = sealTarget(site);
            if (site.objective === 'hold' && distance <= rule.radius)
                site.progress = Math.min(rule.goal, site.progress + Math.max(0, dt));
            if (site.objective === 'relay' && Math.hypot(player.x - target.x, player.y - target.y) <= rule.radius) {
                // 不让一个大 dt 穿过多个符石；剩余时间必须在下一点重新驻留。
                const next = Math.min(rule.goal, (Math.floor(site.progress / 4) + 1) * 4);
                site.progress = Math.min(next, site.progress + Math.max(0, dt));
            }
            if (site.progress >= rule.goal - 1e-8) {
                site.state = 'completed';
                this.reliefUntil = Math.min(run.bossAt, time + SEAL_REWARDS.reliefSeconds);
                hooks.announce(`${site.name}已稳定 · ${Math.ceil(this.reliefUntil - time)} 秒内新怪减缓，已有敌人仍会攻击`);
                hooks.complete(site);
            }
        }
    }
    recordKill(enemy: Enemy, player: Point, time: number, run: RunPace): void {
        if (!enemy.dead || enemy.kind === 4 || time >= run.bossAt || this.credited.has(enemy))
            return;
        this.credited.add(enemy);
        for (const site of this.sites) {
            if (site.state !== 'active' || time >= site.startedAt + SEAL_RULES.challengeSeconds)
                continue;
            const rule = sealRule(site);
            if (site.objective === 'guardian' && enemy.sealId === site.id)
                site.progress = 1;
            if (site.objective === 'clear' && Math.hypot(player.x - site.x, player.y - site.y) <= rule.radius && Math.hypot(enemy.x - site.x, enemy.y - site.y) <= rule.radius)
                site.progress = Math.min(rule.goal, site.progress + 1);
        }
    }
    active(): SealEvent | undefined { return this.sites.find(site => site.state === 'active' || site.state === 'available'); }
}

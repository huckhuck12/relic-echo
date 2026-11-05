import type { Point } from '../shared/entities.js';
import type { AutoPlayWorld } from './auto-play.js';
import type { SealEvent } from './map-events.js';
import { SEAL_RULES } from './map-events.js';
import { WORLD_RULES } from './game-config.js';
import { COMBAT } from '../progression/config.js';
function segmentDistance(x: number, y: number, dx: number, dy: number): number {
    const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x + dx * t, y + dy * t);
}
/** Check the swept pillar path and relative projectile motion, then the landing hazards. */
export function safeAutoDash(player: Point, direction: Point, world: AutoPlayWorld): boolean {
    const dx = direction.x * COMBAT.dashDistance, dy = direction.y * COMBAT.dashDistance;
    const x = player.x + dx, y = player.y + dy;
    if (Math.abs(x) >= WORLD_RULES.limit - 40 || Math.abs(y) >= WORLD_RULES.limit - 40)
        return false;
    for (const p of world.pillars)
        if (segmentDistance(player.x - p.x, player.y - p.y, dx, dy) < WORLD_RULES.playerPillarRadius + 8)
            return false;
    for (const s of world.shots) {
        if (!s.hostile)
            continue;
        const sx = player.x - s.x, sy = player.y - s.y;
        const rx = dx - s.vx * COMBAT.dashDuration, ry = dy - s.vy * COMBAT.dashDuration;
        // Allow escape from an existing overlap only when separation increases throughout.
        if (Math.hypot(sx, sy) < 30 && sx * rx + sy * ry >= 0 && Math.hypot(sx + rx, sy + ry) >= 50)
            continue;
        if (segmentDistance(sx, sy, rx, ry) < 30 || Math.hypot(sx + rx, sy + ry) < 50)
            return false;
    }
    for (const e of world.enemies) {
        if (e.dead)
            continue;
        if (e.kind === 4 && e.wind > 0 && e.charge === 1 && Math.hypot(x - e.dx, y - e.dy) < 210)
            return false;
        const margin = e.wind > 0 || e.charge > 0 ? 100 : 20;
        if (Math.hypot(x - e.x, y - e.y) < e.radius + margin)
            return false;
    }
    return true;
}
/** Optional goals must be reachable and leave time to finish; no state or clock mutation. */
export function pursueAutoSeal(player: Point & {
    hp: number;
}, maxHp: number, speed: number, site: SealEvent, time: number, world: AutoPlayWorld): boolean {
    if (site.state !== 'available' && site.state !== 'active')
        return false;
    const active = site.state === 'active';
    if (player.hp / Math.max(1, maxHp) < (active ? .3 : .55))
        return false;
    const radius = active ? SEAL_RULES.holdRadius : SEAL_RULES.activateRadius;
    const travel = Math.max(0, Math.hypot(site.x - player.x, site.y - player.y) - radius) / Math.max(1, speed) * 1.5;
    const remaining = active ? site.startedAt + SEAL_RULES.challengeSeconds - time : site.at + SEAL_RULES.availableSeconds - time;
    if (travel + (active ? SEAL_RULES.holdSeconds - site.progress : 0) + 3 >= remaining)
        return false;
    let pressure = 0;
    for (const e of world.enemies) {
        if (e.dead || Math.hypot(e.x - site.x, e.y - site.y) > 240)
            continue;
        if (e.kind === 4 || (e.kind === 2 && (e.wind > 0 || e.charge > 0)))
            return false;
        pressure += e.kind === 3 ? 3 : 1;
    }
    return pressure <= (active ? 12 : 7);
}

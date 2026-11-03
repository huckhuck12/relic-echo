import type { Game } from './game.js';
import type { Enemy, Shot, Drop, Point } from '../shared/entities.js';
import { gear, Weapon } from '../progression/config.js';
import { project } from '../shared/model.js';
import { WORLD_RULES } from './game-config.js';
import { platform } from '../platform/runtime.js';
export interface AutoPlayWorld {
    enemies: readonly Enemy[];
    shots: readonly Shot[];
    drops: readonly Drop[];
    pillars: readonly Point[];
}
export const AUTO_PLAY_KEY = 'relic-auto-play-report';
/** Test driver uses normal input/reward actions, never changes combat state or calls native touch APIs. */
export class AutoPlay {
    enabled = false;
    rounds = 0;
    decisions = 0;
    lastAction = '';
    private nextDecision = 0;
    private nextSample = 0;
    private nextSave = 0;
    private dialogId = -1;
    private dialogSince = 0;
    private recordedResult = -1;
    private startedAt = 0;
    private weapon: Weapon = 'storm';
    private run = {
        minFps: 0, maxP95: 0, peakEnemies: 0, peakShots: 0, decisions: 0
    };
    private readonly results: object[] = [];
    private readonly actions: {
        time: number;
        action: string;
    }[] = [];
    constructor(private readonly game: Game, private readonly world: () => AutoPlayWorld) { }
    start(weapon: Weapon): void {
        this.enabled = true;
        this.rounds = 0;
        this.decisions = 0;
        this.results.length = this.actions.length = 0;
        this.startedAt = Date.now();
        this.nextDecision = this.nextSample = this.nextSave = 0;
        this.game.showPerformance = true;
        this.begin(weapon);
    }
    stop(): void {
        this.enabled = false;
        this.game.setStick(0, 0);
        this.note('stop');
        this.save();
    }
    private begin(weapon: Weapon): void {
        this.weapon = weapon;
        this.rounds++;
        this.run = {
            minFps: 0, maxP95: 0, peakEnemies: 0, peakShots: 0, decisions: 0
        };
        this.dialogId = this.recordedResult = -1;
        this.game.start(weapon);
        this.note('start:' + weapon);
        this.save();
    }
    /** Called by the existing frame loop; no extra timer, catch-up or background work. */
    frame(now: number): void {
        if (!this.enabled || platform().hidden() || now < this.nextDecision)
            return;
        if (this.game.gate.paused && !this.game.gate.pausedOnlyBy('dialog'))
            return;
        this.nextDecision = now + 150;
        const g = this.game, dialog = g.dialog;
        if (dialog) {
            g.setStick(0, 0);
            if (g.flow.dialogId !== this.dialogId) {
                this.dialogId = g.flow.dialogId;
                this.dialogSince = now;
            }
            if (dialog.type === 'result' && this.recordedResult !== this.dialogId) {
                this.recordedResult = this.dialogId;
                this.results.push({
                    round: this.rounds, weapon: this.weapon, win: dialog.win, reason: dialog.reason, seconds: Math.round(g.time), kills: g.kills, ...this.run
                });
                if (this.results.length > 6)
                    this.results.shift();
                this.note('result:' + dialog.win);
                this.save();
            }
            const delay = now - this.dialogSince;
            if (dialog.type === 'result' && delay >= 1800) {
                const weapons: Weapon[] = ['storm', 'flame', 'blade'];
                this.begin(weapons[(weapons.indexOf(this.weapon) + 1) % weapons.length]);
            }
            else if (delay >= 650) {
                if (dialog.type === 'upgrade' || dialog.type === 'fragment') {
                    const id = dialog.type === 'upgrade' && g.player.hp < g.stats.hp * .65 && dialog.choices.includes('heal') ? 'heal' : dialog.choices[this.rounds % dialog.choices.length];
                    if (id && g.claimReward(this.dialogId, { type: dialog.type, id }))
                        this.note(dialog.type + ':' + id);
                }
                else if (dialog.type === 'drop') {
                    const old = g.loadout[gear(dialog.item).slot], accept = !old || dialog.item.quality >= old.quality;
                    if (g.claimReward(this.dialogId, { type: 'drop', accept }))
                        this.note('drop:' + accept);
                }
                else if (dialog.type === 'revive') {
                    // No automatic ads, purchases or test revival; exercise real death/restart.
                    g.finish(false, '自动试玩角色倒下');
                }
            }
            return;
        }
        this.dialogId = -1;
        if (g.mode !== 'battle' || g.gate.paused)
            return;
        const world = this.world(), intent = autoPlayIntent(g.player, world, g.time);
        const screen = project(intent.x, intent.y), length = Math.hypot(screen.x, screen.y) || 1;
        g.setStick(screen.x / length, screen.y / length);
        this.decisions++;
        this.run.decisions++;
        if (intent.dash && g.player.dash <= 0) {
            g.dash();
            this.note('dash');
        }
        if (now >= this.nextSample) {
            this.nextSample = now + 1000;
            const p = g.performanceSnapshot();
            if (p.samples >= 30) {
                this.run.minFps = this.run.minFps ? Math.min(this.run.minFps, p.fps) : p.fps;
                this.run.maxP95 = Math.max(this.run.maxP95, p.p95Ms);
            }
            this.run.peakEnemies = Math.max(this.run.peakEnemies, p.enemies);
            this.run.peakShots = Math.max(this.run.peakShots, p.shots);
        }
        if (now >= this.nextSave) {
            this.nextSave = now + 10000;
            this.save();
        }
    }
    private note(action: string): void {
        this.lastAction = action;
        this.actions.push({ time: Math.round(this.game.time * 10) / 10, action });
        if (this.actions.length > 24)
            this.actions.shift();
    }
    private save(): void {
        try {
            platform().writeStorage(AUTO_PLAY_KEY, JSON.stringify({
                schema: 1, startedAt: this.startedAt, savedAt: Date.now(), enabled: this.enabled, round: this.rounds, seconds: this.game.time, weapon: this.weapon, decisions: this.decisions, current: this.run, results: this.results, actions: this.actions
            }));
        }
        catch { /* Test reporting must never interrupt combat. */ }
    }
}
/** O(enemies + shots + drops), with short look-ahead and steering away from walls/pillars. */
export function autoPlayIntent(player: Point & {
    hp: number;
}, world: AutoPlayWorld, time: number) {
    let x = Math.cos(time * .19) * .5, y = Math.sin(time * .19) * .5, danger = false;
    const repel = (px: number, py: number, radius: number, strength: number) => {
        const dx = player.x - px, dy = player.y - py, d = Math.hypot(dx, dy);
        if (d >= radius)
            return;
        const force = strength * (1 - d / radius);
        x += (d > .01 ? dx / d : 1) * force;
        y += (d > .01 ? dy / d : 0) * force;
    };
    let target: Drop | undefined, best = Infinity;
    for (const d of world.drops) {
        if (d.collecting)
            continue;
        const distance = Math.hypot(player.x - d.x, player.y - d.y) / (d.xp < 0 && player.hp < 70 ? 3 : d.item || d.fragment ? 1.5 : 1);
        if (distance < best) {
            best = distance;
            target = d;
        }
    }
    if (target) {
        const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1;
        x += dx / d;
        y += dy / d;
    }
    for (const e of world.enemies) {
        if (e.dead)
            continue;
        const d = Math.hypot(player.x - e.x, player.y - e.y);
        if (d < e.radius + 55)
            danger = true;
        repel(e.x, e.y, e.radius + 125, 3);
        if (e.kind === 4 && e.wind > 0 && e.charge === 1) {
            repel(e.dx, e.dy, 210, 9);
            if (Math.hypot(player.x - e.dx, player.y - e.dy) < 180)
                danger = true;
        }
        if (e.kind === 2 && (e.wind > 0 || e.charge > 0))
            repel(e.x + e.dx * 80, e.y + e.dy * 80, 110, 4);
    }
    for (const s of world.shots) {
        if (!s.hostile)
            continue;
        const speed2 = s.vx * s.vx + s.vy * s.vy;
        const t = speed2 ? Math.max(0, Math.min(.4, ((player.x - s.x) * s.vx + (player.y - s.y) * s.vy) / speed2)) : 0;
        const px = s.x + s.vx * t, py = s.y + s.vy * t;
        repel(px, py, 95, 4);
        if (Math.hypot(player.x - px, player.y - py) < 50)
            danger = true;
    }
    for (const p of world.pillars)
        repel(p.x, p.y, WORLD_RULES.playerPillarRadius + 90, 5);
    const edge = WORLD_RULES.limit - 200;
    if (Math.abs(player.x) > edge)
        x -= Math.sign(player.x) * 4;
    if (Math.abs(player.y) > edge)
        y -= Math.sign(player.y) * 4;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, dash: danger };
}

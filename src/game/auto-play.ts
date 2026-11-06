import type { Game } from './game.js';
import type { Enemy, Shot, Drop, Point } from '../shared/entities.js';
import { COMBAT, gear, Weapon, WEAPONS } from '../progression/config.js';
import { project } from '../shared/model.js';
import { WORLD_RULES } from './game-config.js';
import { platform } from '../platform/runtime.js';
import { autoBuildProfile, buildTactics } from './auto-builds.js';
import type { AutoPlaySelection, BuildTactics } from './auto-builds.js';
import { pursueAutoSeal, safeAutoDash } from './auto-navigation.js';
import { sealNavigationTarget } from './map-events.js';
import { BuildRunMetrics } from './build-run-metrics.js';
import { GAME_VERSION } from '../shared/version.js';
export interface AutoPlayWorld {
    enemies: readonly Enemy[];
    shots: readonly Shot[];
    drops: readonly Drop[];
    pillars: readonly Point[];
}
export const AUTO_PLAY_KEY = 'relic-auto-play-report';
/** Uses normal input/reward actions; explicit stress mode alone enables lethal-damage protection. */
export class AutoPlay {
    metrics = new BuildRunMetrics();
    enabled = false;
    stress = false;
    rounds = 0;
    decisions = 0;
    lastAction = '';
    selection: Readonly<AutoPlaySelection> = { rotateWeapons: true };
    get profile() { return autoBuildProfile(this.rounds, this.selection); }
    private nextDecision = 0;
    private nextSample = 0;
    private nextSave = 0;
    private dialogId = -1;
    private dialogSince = 0;
    private recordedResult = -1;
    private startedAt = 0;
    private weapon: Weapon = 'storm';
    private run = {
        minFps: 0, maxP95: 0, peakEnemies: 0, peakShots: 0, decisions: 0,
        reachedBoss: false, bossSeconds: 0, bossMinFps: 0, bossMaxP95: 0
    };
    private readonly results: object[] = [];
    private readonly actions: {
        time: number;
        action: string;
    }[] = [];
    constructor(private readonly game: Game, private readonly world: () => AutoPlayWorld) { }
    start(weapon: Weapon, stress = false, selection: AutoPlaySelection = {}): void {
        this.selection = { branch: selection.branch, rotateWeapons: selection.rotateWeapons !== false };
        this.enabled = true;
        this.stress = stress;
        this.rounds = 0;
        this.decisions = 0;
        this.results.length = this.actions.length = 0;
        this.startedAt = Date.now();
        this.nextDecision = this.nextSample = this.nextSave = 0;
        this.game.showPerformance = true;
        this.begin(weapon);
    }
    stop(): void {
        this.observeBuild();
        this.enabled = false;
        this.game.setStick(0, 0);
        this.note('stop');
        this.save();
    }
    private begin(weapon: Weapon): void {
        this.metrics = new BuildRunMetrics();
        this.weapon = weapon;
        this.rounds++;
        this.run = {
            minFps: 0, maxP95: 0, peakEnemies: 0, peakShots: 0, decisions: 0,
            reachedBoss: false, bossSeconds: 0, bossMinFps: 0, bossMaxP95: 0
        };
        this.dialogId = this.recordedResult = -1;
        this.game.start(weapon);
        this.note((this.stress ? 'stress:' : 'start:') + weapon);
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
        this.observeBuild();
        if (dialog) {
            g.setStick(0, 0);
            if (g.flow.dialogId !== this.dialogId) {
                this.dialogId = g.flow.dialogId;
                this.dialogSince = now;
            }
            if (dialog.type === 'result' && this.recordedResult !== this.dialogId) {
                this.trackBoss();
                this.recordedResult = this.dialogId;
                this.results.push({
                    round: this.rounds, runKind: g.runKind, weapon: this.weapon, build: this.profile, selection: this.selection, equipped: this.equipped(), stress: this.stress, win: dialog.win, reason: dialog.reason, seconds: Math.round(g.time), kills: g.kills, ...this.run, balance: this.balanceReport()
                });
                if (this.results.length > 18)
                    this.results.shift();
                this.note('result:' + dialog.win);
                this.save();
            }
            const delay = now - this.dialogSince;
            if (dialog.type === 'result' && delay >= 1800) {
                const weapons: Weapon[] = ['storm', 'flame', 'blade'];
                this.begin(this.selection.rotateWeapons ? weapons[(weapons.indexOf(this.weapon) + 1) % weapons.length] : this.weapon);
            }
            else if (delay >= 650) {
                if (dialog.type === 'upgrade' || dialog.type === 'fragment' || dialog.type === 'build' || dialog.type === 'branch') {
                    const profile = this.profile;
                    let id = dialog.type === 'upgrade' && g.player.hp < g.stats.hp * .65 && dialog.choices.includes('heal') ? 'heal' : dialog.choices[this.rounds % dialog.choices.length];
                    if (dialog.type === 'build' && dialog.choices.includes(profile.build))
                        id = profile.build;
                    if (dialog.type === 'branch' && dialog.choices.includes(profile.branch))
                        id = profile.branch;
                    if (dialog.type === 'fragment') {
                        let best = -Infinity;
                        for (const candidate of dialog.choices) {
                            const target = g.buffs.upgradePreview(candidate);
                            const score = target ? (target.slot === 0 ? 20 : 10) - target.level : 0;
                            if (score > best) {
                                best = score;
                                id = candidate;
                            }
                        }
                    }
                    if (id && g.claimReward(this.dialogId, { type: dialog.type, id }))
                        this.note(dialog.type + ':' + id);
                }
                else if (dialog.type === 'mastery') {
                    if (g.claimReward(this.dialogId, { type: 'mastery', id: this.rounds % 2 ? 'power' : 'tempo' }))
                        this.note('mastery:' + dialog.pair);
                }
                else if (dialog.type === 'event') {
                    g.claimReward(this.dialogId, { type: 'event', id: g.player.hp < g.stats.hp * .65 ? 'heal' : 'fragment' });
                }
                else if (dialog.type === 'drop') {
                    const slot = gear(dialog.item).slot, old = g.loadout[slot];
                    const accept = (slot !== 'weapon' || dialog.item.id === this.weapon) && (!old || dialog.item.quality >= old.quality);
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
        this.trackBoss();
        const world = this.world(), tactics = buildTactics(g.buffs, g.player, world.enemies);
        tactics.attackRange = WEAPONS[this.weapon].range * (this.weapon === 'blade' ? 1 + .2 * (g.levels.orbit || 0) : 1);
        tactics.maxHp = g.stats.hp;
        const site = g.mapEvents.active();
        if (site && pursueAutoSeal(g.player, g.stats.hp, 240 * (1 + g.stats.speed), site, g.time, world)) {
            const target = sealNavigationTarget(site, world.enemies);
            if (site.state === 'active' && site.objective === 'guardian')
                tactics.focus = target;
            else
                tactics.waypoint = target;
            tactics.waypointRadius = site.state === 'active' && site.objective === 'relay' ? 20 : 55;
            tactics.dashTarget = undefined;
        }
        const intent = autoPlayIntent(g.player, world, g.time, tactics);
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
                // Game resets the sampling window at Boss entry for automated runs.
                if (this.run.reachedBoss) {
                    this.run.bossMinFps = this.run.bossMinFps ? Math.min(this.run.bossMinFps, p.fps) : p.fps;
                    this.run.bossMaxP95 = Math.max(this.run.bossMaxP95, p.p95Ms);
                }
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
        this.observeBuild();
        this.lastAction = action;
        this.actions.push({ time: Math.round(this.game.time * 10) / 10, action });
        if (this.actions.length > 24)
            this.actions.shift();
    }
    private trackBoss(): void {
        if (this.metrics.bossAppearedAt === null)
            return;
        if (!this.run.reachedBoss) {
            this.run.reachedBoss = true;
            this.note('boss:entered');
        }
        this.run.bossSeconds = Math.max(0, (this.metrics.bossKilledAt ?? this.game.time) - this.metrics.bossAppearedAt);
    }
    private observeBuild(): void {
        const g = this.game, active = g.buffs.recipes.filter(r => r.trigger && r.action && r.element);
        this.metrics.observe(g.time, g.buffs.starterChosen && active.length === 2, active.some(r => !!g.buffs.branchOf(r)), active.some(r => g.buffs.levelOf(r) >= 5), g.buffs.reforges > 0 || g.buffs.evolutions.shatters > 0 || g.buffs.evolutions.detonations > 0 || g.buffs.evolutions.links.length > 0);
    }
    balanceReport() {
        this.observeBuild();
        return this.metrics.snapshot(this.game.time, this.game.damageRanking);
    }
    private equipped() {
        return this.game.buffs.recipes.map(recipe => ({ ...recipe, level: this.game.buffs.levelOf(recipe), branch: this.game.buffs.branchOf(recipe) || null, mastery: this.game.buffs.mastery.of(recipe) || null }));
    }
    private save(): void {
        try {
            const report = {
                schema: 4, version: GAME_VERSION, runKind: this.game.runKind, startedAt: this.startedAt, savedAt: Date.now(), enabled: this.enabled, stress: this.stress, round: this.rounds, seconds: this.game.time, weapon: this.weapon, build: this.profile, selection: this.selection, equipped: this.equipped(), decisions: this.decisions, current: { ...this.run, balance: this.balanceReport() }, results: this.results, actions: this.actions
            };
            let serialized = JSON.stringify(report);
            while (serialized.length > 65536 && this.results.length > 1) {
                this.results.shift();
                serialized = JSON.stringify(report);
            }
            platform().writeStorage(AUTO_PLAY_KEY, serialized);
        }
        catch { /* Test reporting must never interrupt combat. */ }
    }
}
/** O(enemies + shots + drops), with short look-ahead and steering away from walls/pillars. */
export function autoPlayIntent(player: Point & {
    hp: number;
}, world: AutoPlayWorld, time: number, tactics?: BuildTactics) {
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
        const distance = Math.hypot(player.x - d.x, player.y - d.y) / (d.xp < 0 && player.hp < (tactics?.maxHp || 100) * .7 ? 3 : d.item || d.fragment ? 1.5 : 1);
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
        repel(e.x, e.y, e.radius + (tactics?.orbit || (tactics?.attackRange ?? 490) < 220 ? 60 : 125), 3);
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
    if (!danger && tactics?.waypoint) {
        const dx = tactics.waypoint.x - player.x, dy = tactics.waypoint.y - player.y, d = Math.hypot(dx, dy) || 1;
        const radius = tactics.waypointRadius ?? 55, tangent = radius < 55 ? .05 : .2;
        const approach = Math.max(-1, Math.min(1, (d - radius) / 70));
        x += (dx / d * approach - dy / d * tangent) * 6;
        y += (dy / d * approach + dx / d * tangent) * 6;
    }
    else if (!danger && tactics?.focus) {
        const dx = tactics.focus.x - player.x, dy = tactics.focus.y - player.y, d = Math.hypot(dx, dy) || 1;
        const desired = Math.min(tactics.orbit ? 105 : 220, (tactics.attackRange ?? 490) * .75);
        const approach = Math.max(-1, Math.min(1, (d - desired) / 80));
        // Emergency avoidance takes precedence over approaching the contact band.
        x += (dx / d * approach - dy / d * .55) * 3;
        y += (dy / d * approach + dx / d * .55) * 3;
    }
    for (const p of world.pillars)
        repel(p.x, p.y, WORLD_RULES.playerPillarRadius + 90, 5);
    const edge = WORLD_RULES.limit - 200;
    if (Math.abs(player.x) > edge)
        x -= Math.sign(player.x) * 4;
    if (Math.abs(player.y) > edge)
        y -= Math.sign(player.y) * 4;
    if (!danger && tactics?.dashTarget) {
        const dx = tactics.dashTarget.x - player.x, dy = tactics.dashTarget.y - player.y, d = Math.hypot(dx, dy);
        for (const angle of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]) {
            const direction = { x: (dx * Math.cos(angle) - dy * Math.sin(angle)) / (d || 1), y: (dy * Math.cos(angle) + dx * Math.sin(angle)) / (d || 1) };
            const landingDistance = Math.hypot(dx - direction.x * COMBAT.dashDistance, dy - direction.y * COMBAT.dashDistance);
            if (d > 1 && landingDistance <= (tactics.dashRadius ?? 110) && safeAutoDash(player, direction, world))
                return { ...direction, dash: true };
        }
    }
    const length = Math.hypot(x, y) || 1;
    const direction = { x: x / length, y: y / length };
    if (danger) {
        // Fixed candidate budget: prefer current escape heading, then nearby alternatives.
        for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
            const candidate = { x: direction.x * Math.cos(angle) - direction.y * Math.sin(angle), y: direction.x * Math.sin(angle) + direction.y * Math.cos(angle) };
            if (safeAutoDash(player, candidate, world))
                return { ...candidate, dash: true };
        }
    }
    return { ...direction, dash: false };
}

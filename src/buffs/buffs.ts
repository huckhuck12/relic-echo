import { BUFF_FEEDBACK, BUFF_LIMITS, BUFF_RULES, PARTS, START_FRAGMENTS, TRIGGERS } from './buff-config.js';
import { complete, emptyRecipe, fragment, recipeDamage } from './buff-recipes.js';
import { BuffEvolutions } from './buff-evolutions.js';
import { BUFF_BRANCHES, branchPair } from './buff-branches.js';
import { BuffUpgrades } from './buff-upgrades.js';
import { BuffMastery, MASTERY } from './buff-mastery.js';
import { createBuffEffect, updateBuffEffects } from './buff-effects.js';
import { applyBuffElement, applyBuffSlow, updateBuffStatuses } from './buff-status.js';
import { enqueueBuffFeedback, updateBuffFeedback } from './buff-feedback.js';
import { renderBuffs } from './buff-renderer.js';
import { FrostDash, harvestableFrost } from './buff-frost-dash.js';
import type { BuffEffect, BuffFeedback, BuffFeedbackSink, BuffHost, BuffStatus, BuffTarget, FragmentReward, BuffBranch, Part, Recipe, Trigger } from './buff-types.js';
// 公共导出兼容既有场景、测试和预览；内部模块应直接依赖 config/types，避免循环依赖。
export * from './buff-config.js';
export * from './buff-types.js';
export * from './buff-recipes.js';
/** Buff 编排入口，只拥有本局状态和调用顺序。
 * 主效果/碰撞、元素状态、装饰反馈和绘制各有独立模块，不能跨模块重复派发命中。
 */
export class BuffRuntime<T extends BuffTarget> {
    private readonly frostDash = new FrostDash<T>();
    dashShatters = 0;
    readonly control = { slowedEnemySeconds: 0, reductionEnemySeconds: 0 };
    controlSummary() {
        let slowed = 0;
        for (const [target, status] of this.statuses)
            if (!target.dead && status.slow > 0)
                slowed++;
        return { slowed, ...this.control };
    }
    readonly recipes: Recipe[] = [emptyRecipe(), emptyRecipe()];
    readonly owned = new Set<string>(START_FRAGMENTS);
    readonly cooldowns = [0, 0];
    readonly effects: BuffEffect[] = [];
    readonly evolutions: BuffEvolutions<T>;
    private readonly upgrades = new BuffUpgrades();
    readonly mastery = new BuffMastery();
    configureGrowth(standard: boolean): void { this.upgrades.gradual = standard; }
    private feedback: BuffFeedback[] = [];
    private visualBudget: number = BUFF_FEEDBACK.defaultBudget;
    private visualTime = 0;
    private statuses = new Map<T, BuffStatus>();
    private dispatching = false;
    private directThunderTarget?: T;
    /** Ordinary deaths settle immediately; a lethal base bolt merges its newly invested marks below. */
    enemyKilled(target: T): void {
        if (target !== this.directThunderTarget)
            this.evolutions.killed(target);
    }
    procs = 0;
    starterChosen = false;
    private starterRequested = false;
    requestStarter(): boolean {
        if (this.starterChosen || this.starterRequested)
            return false;
        this.starterRequested = true;
        return true;
    }
    private readonly branchRequested = new Set<string>();
    private castSequence = 0;
    private dashStart: {
        x: number;
        y: number;
    } | null = null;
    reforges = 0;
    beginDash(x: number, y: number): void {
        this.dashStart = { x, y };
        this.frostDash.begin(x, y);
    }
    traceDash(x: number, y: number): void { this.frostDash.trace(x, y, this.evolutions.frost); }
    /** Read-only hint; it never aims or activates a dash for the player. */
    frostDashTarget(): T | undefined {
        const slot = this.recipes.findIndex(r => r.trigger === 'dash' && r.action === 'blast' && r.element === 'force');
        if (slot < 0 || this.cooldowns[slot] > 0)
            return;
        let best: T | undefined, stacks = 0, distance = Infinity;
        for (const [target, mark] of this.evolutions.frost) {
            const d = Math.hypot(target.x - this.host.player.x, target.y - this.host.player.y);
            if (harvestableFrost(target, mark, slot) && d <= BUFF_RULES.orbit.radius + BUFF_RULES.orbit.hitRadius && (mark.stacks > stacks || mark.stacks === stacks && d < distance)) {
                best = target;
                stacks = mark.stacks;
                distance = d;
            }
        }
        return best;
    }
    branchOf(recipe: Recipe): BuffBranch | undefined {
        const pair = branchPair(recipe);
        return pair ? this.upgrades.branches.get(pair.pair) : undefined;
    }
    takeBranchRequest(pair = 'field/fire'): boolean {
        const definition = BUFF_BRANCHES.find(b => b.pair === pair);
        if (!definition || this.branchRequested.has(pair) || this.upgrades.level({ trigger: 'dash', action: definition.action, element: definition.element }) < 3 || this.upgrades.branches.has(pair))
            return false;
        this.branchRequested.add(pair);
        return true;
    }
    takeBranchReward(): {
        type: 'branch';
        pair: string;
        choices: string[];
    } | null {
        for (const definition of BUFF_BRANCHES)
            if (this.takeBranchRequest(definition.pair))
                return { type: 'branch', pair: definition.pair, choices: [...definition.choices] };
        return null;
    }
    chooseBranch(branch: string, pair = 'field/fire'): boolean {
        const definition = BUFF_BRANCHES.find(b => b.pair === pair);
        if (!definition || !this.branchRequested.has(pair) || this.upgrades.branches.has(pair) || !(definition.choices as readonly string[]).includes(branch))
            return false;
        this.upgrades.branches.set(pair, branch as BuffBranch);
        return true;
    }
    chooseStarter(id: string, iceAction: 'bolt' | 'orbit' = 'orbit'): boolean {
        if (this.starterChosen || !['fire', 'ice', 'thunder', 'free'].includes(id))
            return false;
        this.starterChosen = true;
        if (id === 'free')
            return true;
        const recipes: Recipe[] = id === 'fire' ? [{ trigger: 'dash', action: 'field', element: 'fire' }, { trigger: 'hit', action: 'blast', element: 'force' }]
            : id === 'ice' ? [{ trigger: 'hit', action: iceAction, element: 'ice' }, { trigger: 'dash', action: 'blast', element: 'force' }]
                : [{ trigger: 'hit', action: 'bolt', element: 'lightning' }, { trigger: 'dash', action: 'field', element: 'ice' }];
        recipes.forEach((r, slot) => {
            for (const part of PARTS) {
                this.grant(r[part]!);
                this.install(slot, part, r[part]);
            }
        });
        return true;
    }
    constructor(private readonly host: BuffHost<T>) {
        this.evolutions = new BuffEvolutions(host, {
            slow: (target, seconds) => applyBuffSlow(this.statuses, target, seconds),
            burst: (kind, x, y, level, branch) => this.feedbackAt(kind, kind === 'detonate' ? 'lightning' : 'ice', x, y, x, y, level, branch),
            arc: (x, y, tx, ty, branch) => this.feedbackAt('arc', 'lightning', x, y, tx, ty, 1, branch),
            shard: (x, y, tx, ty, level) => this.feedbackAt('shard', 'ice', tx, ty, x, y, level),
        });
    }
    levelOf(recipe: Recipe): number { return this.upgrades.level(recipe); }
    growthOf(recipe: Recipe) { return this.upgrades.growth(recipe); }
    upgradePreview(id: string) { return this.upgrades.target(id, this.recipes); }
    /** grant 仅解锁，供初始化/练习；正式奖励必须调用 receiveFragment。 */
    grant(id: string): boolean {
        if (!fragment(id) || this.owned.has(id))
            return false;
        this.owned.add(id);
        return true;
    }
    receiveFragment(id: string): FragmentReward {
        if (!fragment(id))
            return { kind: 'invalid' };
        if (this.grant(id))
            return { kind: 'unlock' };
        const target = this.upgrades.apply(id, this.recipes);
        return target ? target.progress !== undefined ? {
            kind: 'progress', slot: target.slot, level: target.level, progress: target.progress, required: target.required!
        } : { kind: 'upgrade', slot: target.slot, level: target.nextLevel } : { kind: 'xp', amount: BUFF_RULES.duplicateXP };
    }
    /** 清场只清瞬态；重开才清配方、解锁、等级和触发计数。 */
    reset(): void {
        this.recipes[0] = emptyRecipe();
        this.recipes[1] = emptyRecipe();
        this.owned.clear();
        for (const id of START_FRAGMENTS)
            this.owned.add(id);
        this.upgrades.clear();
        this.mastery.reset();
        this.cooldowns.fill(0);
        this.clearTransient();
        this.procs = 0;
        this.starterChosen = false;
        this.starterRequested = false;
        this.branchRequested.clear();
        this.castSequence = 0;
        this.reforges = 0;
        this.dashShatters = 0;
        this.control.slowedEnemySeconds = 0;
        this.control.reductionEnemySeconds = 0;
    }
    clearTransient(): void {
        this.effects.length = 0;
        this.dashStart = null;
        this.frostDash.clear();
        this.branchRequested.clear();
        if (!this.starterChosen)
            this.starterRequested = false;
        this.statuses.clear();
        this.feedback.length = 0;
        this.visualTime = 0;
        this.evolutions.clear();
    }
    install(slot: number, part: Part, id: string | null): boolean {
        if (!Number.isInteger(slot) || slot < 0 || slot >= BUFF_RULES.slots || !PARTS.includes(part))
            return false;
        if (id !== null && (!this.owned.has(id) || fragment(id)?.part !== part))
            return false;
        this.recipes[slot] = { ...this.recipes[slot], [part]: id };
        // 编辑不重置冷却，切换配方不能刷免费释放。
        return true;
    }
    /** Cooldown-ready contact is reliable; the optional callback remains for old tooling callers. */
    trigger(event: Trigger, x: number, y: number, scale: number, _random?: () => number): void {
        if (this.dispatching)
            return;
        this.dispatching = true;
        try {
            for (let slot = 0; slot < BUFF_RULES.slots; slot++) {
                const recipe = this.recipes[slot];
                if (!complete(recipe) || recipe.trigger !== event || this.cooldowns[slot] > 0)
                    continue;
                const level = this.levelOf(recipe);
                const branch = this.branchOf(recipe);
                const mastery = this.mastery.of(recipe), tuning = mastery ? MASTERY[mastery] : undefined;
                let effect = createBuffEffect(this.host, recipe, event, x, y, recipeDamage(recipe, scale, level) * (tuning?.damage || 1), level, target => {
                    if (recipe.action === 'bolt' && recipe.element === 'ice') {
                        const frost = this.evolutions.frost.get(target);
                        return (target.kind === 4 ? 100 : target.kind === 3 ? 50 : 0) + (frost && frost.life > 0 && frost.lock <= 0 ? frost.stacks : 0);
                    }
                    if (recipe.element !== 'lightning')
                        return 0;
                    const mark = this.evolutions.thunder.get(target);
                    const rank = mark && mark.life > 0 && mark.lock <= 0 && mark.stacks > 0 ? mark.stacks : 0;
                    return branch === 'charge' ? (target.kind === 4 ? 100 : target.kind === 3 ? 50 : 0) + rank : rank;
                });
                const refresh = branch === 'furnace' ? this.effects.find(e => e.slot === slot && e.branch === branch && Math.hypot(e.x - effect.x, e.y - effect.y) < 32) : undefined;
                const oldOrbit = recipe.action === 'orbit' ? this.effects.find(e => e.kind === 'orbit' && e.slot === slot) : undefined;
                if (!refresh && !oldOrbit && this.effects.filter(e => e.kind === recipe.action).length >= BUFF_LIMITS[recipe.action])
                    continue;
                if (oldOrbit) {
                    // Replace damage snapshot, but continue the orbit phase instead of stacking rings.
                    effect.age = oldOrbit.age;
                    Object.assign(oldOrbit, effect);
                    effect = oldOrbit;
                    this.effects.splice(this.effects.indexOf(oldOrbit), 1);
                }
                this.cooldowns[slot] = TRIGGERS.find(trigger => trigger.id === event)!.cooldown * (tuning?.cooldown || 1);
                effect.slot = slot;
                effect.cast = ++this.castSequence;
                effect.branch = this.branchOf(recipe);
                if (effect.branch === 'prison') {
                    effect.reactionDamage = effect.damage;
                    effect.damage *= .8;
                }
                if (effect.kind === 'field' && effect.element === 'fire' && effect.branch === 'furnace') {
                    effect.radius = 70;
                    effect.damage *= 1.35;
                    if (refresh)
                        this.effects.splice(this.effects.indexOf(refresh), 1);
                }
                const room = BUFF_LIMITS.field - this.effects.filter(e => e.kind === 'field').length;
                if (event === 'dash' && effect.kind === 'field' && effect.element === 'fire' && effect.branch === 'trail' && this.dashStart && room >= 3) {
                    effect.damage *= .85;
                    effect.life = level >= 5 ? 4 : 3;
                    for (const t of [0, .5])
                        this.effects.push({ ...effect, x: this.dashStart.x + (effect.x - this.dashStart.x) * t, y: this.dashStart.y + (effect.y - this.dashStart.y) * t });
                }
                if (event === 'dash')
                    this.frostDash.queue(effect, this.evolutions.frost);
                this.effects.push(effect);
                this.procs++;
                if (recipe.action === 'field' && recipe.element === 'fire')
                    this.evolutions.seed(effect.x, effect.y, effect.damage, level);
            }
        }
        finally {
            if (event === 'dash') {
                this.dashStart = null;
                this.frostDash.finish();
            }
            this.dispatching = false;
        }
    }
    setVisualBudget(count: number): void {
        this.visualBudget = Math.max(0, Math.min(BUFF_FEEDBACK.maxBudget, Math.floor(count)));
        if (this.feedback.length > this.visualBudget)
            this.feedback.splice(0, this.feedback.length - this.visualBudget);
    }
    private readonly feedbackAt: BuffFeedbackSink = (kind, element, x, y, tx = x, ty = y, level = 1, branch) => {
        enqueueBuffFeedback(this.feedback, this.visualBudget, kind, element, x, y, tx, ty, level, branch);
    };
    speedMultiplier(target: T): number {
        if (!((this.statuses.get(target)?.slow || 0) > 0))
            return 1;
        if (target.kind === 4)
            return .85;
        const frost = this.evolutions.frost.get(target);
        const layers = frost && frost.life > 0 && frost.lock <= 0 && frost.source?.branch === 'prison' ? frost.stacks : 0;
        return Math.max(BUFF_RULES.frost.prisonMinSpeed, BUFF_RULES.slow.multiplier - Math.max(0, layers - 1) * BUFF_RULES.frost.prisonSlowPerLayer);
    }
    /** 基础扣血→元素→进化；进化额外伤害不再调用 apply。 */
    private readonly apply = (target: T, effect: BuffEffect): void => {
        if (target.dead)
            return;
        // Sustained contact must not eject its own target; elemental force remains explicit below.
        const sustained = effect.kind === 'field' || effect.kind === 'orbit';
        const directThunder = effect.kind === 'bolt' && effect.element === 'lightning';
        const previous = this.directThunderTarget;
        if (directThunder)
            this.directThunderTarget = target;
        try {
            this.host.damage(target, effect.damage, !sustained, sustained, effect);
        }
        finally {
            this.directThunderTarget = previous;
        }
        if (target.dead) {
            if (directThunder)
                this.evolutions.killed(target, effect);
            return;
        }
        const status = this.statuses.get(target);
        if (effect.element === 'force' && effect.slot !== undefined && status && status.burn > 0 && status.burnSlot !== undefined && status.burnSlot !== effect.slot) {
            const field = this.effects.filter(e => e.life > 0 && e.kind === 'field' && e.element === 'fire' && e.slot === status.burnSlot && Math.hypot(e.x - target.x, e.y - target.y) <= (e.radius || BUFF_RULES.field.radius))
                .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
            if (field) {
                if (!(status.reforgeLock! > 0)) {
                    status.reforgeLock = 1;
                    this.reforges++;
                    if (target.kind !== 4)
                        this.host.knock(target, -BUFF_RULES.knockback, field.x, field.y);
                    this.feedbackAt('reforge', 'fire', target.x, target.y, field.x, field.y, field.level, field.branch);
                    if (field.branch === 'furnace' && field.level >= 5 && !(status.heatLock! > 0)) {
                        status.heatLock = 2;
                        this.host.damage(target, field.damage * .6, true, true, field);
                    }
                }
                return;
            }
        }
        if (applyBuffElement(this.host, this.statuses, target, effect, this.feedbackAt))
            this.evolutions.hit(target, effect, effect.slot === 0 ? (this.statuses.get(target)?.iceSlow1 || 0) > 0 : effect.slot === 1 && (this.statuses.get(target)?.iceSlow0 || 0) > 0);
    };
    /** 固定步顺序：反馈寿命→冷却→元素状态→进化→主效果。 */
    update(dt: number): void {
        this.visualTime += dt;
        updateBuffFeedback(this.feedback, dt);
        for (let slot = 0; slot < BUFF_RULES.slots; slot++)
            this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
        // Live-target seconds measure coverage, never inferred damage or avoided hits.
        for (const [target, status] of this.statuses) {
            if (target.dead || status.slow <= 0)
                continue;
            const seconds = Math.min(dt, status.slow);
            this.control.slowedEnemySeconds += seconds;
            this.control.reductionEnemySeconds += seconds * (1 - this.speedMultiplier(target));
        }
        updateBuffStatuses(this.statuses, this.host, dt);
        this.evolutions.update(dt);
        this.frostDash.resolve(this.effects, (target, effect) => {
            const source = this.evolutions.frost.get(target)?.source;
            if (this.evolutions.harvestFrost(target, effect)) {
                this.dashShatters++;
                this.feedbackAt('harvest', 'ice', target.x, target.y, effect.x, effect.y, source?.level, source?.branch);
            }
        });
        updateBuffEffects(this.effects, this.host, dt, this.apply);
    }
    render(overlay: any, project: (x: number, y: number) => {
        x: number;
        y: number;
    }, floor = overlay, visible: (x: number, y: number) => boolean = () => true): void {
        renderBuffs({
            effects: this.effects, feedback: this.feedback, statuses: this.statuses, evolutions: this.evolutions,
            visualBudget: this.visualBudget, visualTime: this.visualTime
        }, overlay, project, floor, visible);
    }
}

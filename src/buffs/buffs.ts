import { BUFF_FEEDBACK, BUFF_LIMITS, BUFF_RULES, PARTS, START_FRAGMENTS, TRIGGERS } from './buff-config.js';
import { complete, emptyRecipe, fragment, recipeDamage } from './buff-recipes.js';
import { BuffEvolutions } from './buff-evolutions.js';
import { BuffUpgrades } from './buff-upgrades.js';
import { createBuffEffect, updateBuffEffects } from './buff-effects.js';
import { applyBuffElement, applyBuffSlow, updateBuffStatuses } from './buff-status.js';
import { enqueueBuffFeedback, updateBuffFeedback } from './buff-feedback.js';
import { renderBuffs } from './buff-renderer.js';
import type { BuffEffect, BuffFeedback, BuffFeedbackSink, BuffHost, BuffStatus, BuffTarget, FragmentReward, Part, Recipe, Trigger } from './buff-types.js';
// 公共导出兼容既有场景、测试和预览；内部模块应直接依赖 config/types，避免循环依赖。
export * from './buff-config.js';
export * from './buff-types.js';
export * from './buff-recipes.js';
/** Buff 编排入口，只拥有本局状态和调用顺序。
 * 主效果/碰撞、元素状态、装饰反馈和绘制各有独立模块，不能跨模块重复派发命中。
 */
export class BuffRuntime<T extends BuffTarget> {
    readonly recipes: Recipe[] = [emptyRecipe(), emptyRecipe()];
    readonly owned = new Set<string>(START_FRAGMENTS);
    readonly cooldowns = [0, 0];
    readonly effects: BuffEffect[] = [];
    readonly evolutions: BuffEvolutions<T>;
    private readonly upgrades = new BuffUpgrades();
    private feedback: BuffFeedback[] = [];
    private visualBudget: number = BUFF_FEEDBACK.defaultBudget;
    private visualTime = 0;
    private statuses = new Map<T, BuffStatus>();
    private dispatching = false;
    procs = 0;
    constructor(private readonly host: BuffHost<T>) {
        this.evolutions = new BuffEvolutions(host, {
            slow: (target, seconds) => applyBuffSlow(this.statuses, target, seconds),
            burst: (kind, x, y, level) => this.feedbackAt(kind, kind === 'detonate' ? 'lightning' : 'ice', x, y, x, y, level),
            arc: (x, y, tx, ty) => this.feedbackAt('arc', 'lightning', x, y, tx, ty),
        });
    }
    levelOf(recipe: Recipe): number { return this.upgrades.level(recipe); }
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
        return target ? { kind: 'upgrade', slot: target.slot, level: target.nextLevel } : { kind: 'xp', amount: BUFF_RULES.duplicateXP };
    }
    /** 清场只清瞬态；重开才清配方、解锁、等级和触发计数。 */
    reset(): void {
        this.recipes[0] = emptyRecipe();
        this.recipes[1] = emptyRecipe();
        this.owned.clear();
        for (const id of START_FRAGMENTS)
            this.owned.add(id);
        this.upgrades.clear();
        this.cooldowns.fill(0);
        this.clearTransient();
        this.procs = 0;
    }
    clearTransient(): void {
        this.effects.length = 0;
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
    /** 保留槽序、概率判定和容量检查顺序；只有命中触发消耗概率随机数。 */
    trigger(event: Trigger, x: number, y: number, scale: number, random = Math.random): void {
        if (this.dispatching)
            return;
        this.dispatching = true;
        try {
            for (let slot = 0; slot < BUFF_RULES.slots; slot++) {
                const recipe = this.recipes[slot];
                if (!complete(recipe) || recipe.trigger !== event || this.cooldowns[slot] > 0)
                    continue;
                if (event === 'hit' && random() >= BUFF_RULES.hitChance)
                    continue;
                if (this.effects.filter(effect => effect.kind === recipe.action).length >= BUFF_LIMITS[recipe.action])
                    continue;
                this.cooldowns[slot] = TRIGGERS.find(trigger => trigger.id === event)!.cooldown;
                const level = this.levelOf(recipe);
                const effect = createBuffEffect(this.host, recipe, event, x, y, recipeDamage(recipe, scale, level), level);
                this.effects.push(effect);
                this.procs++;
                if (recipe.action === 'field' && recipe.element === 'fire')
                    this.evolutions.seed(effect.x, effect.y, effect.damage, level);
            }
        }
        finally {
            this.dispatching = false;
        }
    }
    setVisualBudget(count: number): void {
        this.visualBudget = Math.max(0, Math.min(BUFF_FEEDBACK.maxBudget, Math.floor(count)));
        if (this.feedback.length > this.visualBudget)
            this.feedback.splice(0, this.feedback.length - this.visualBudget);
    }
    private readonly feedbackAt: BuffFeedbackSink = (kind, element, x, y, tx = x, ty = y, level = 1) => {
        enqueueBuffFeedback(this.feedback, this.visualBudget, kind, element, x, y, tx, ty, level);
    };
    speedMultiplier(target: T): number { return (this.statuses.get(target)?.slow || 0) > 0 ? BUFF_RULES.slow.multiplier : 1; }
    /** 基础扣血→元素→进化；进化额外伤害不再调用 apply。 */
    private readonly apply = (target: T, effect: BuffEffect): void => {
        if (target.dead)
            return;
        this.host.damage(target, effect.damage, true, effect.kind === 'field' || effect.kind === 'orbit');
        if (applyBuffElement(this.host, this.statuses, target, effect, this.feedbackAt))
            this.evolutions.hit(target, effect);
    };
    /** 固定步顺序：反馈寿命→冷却→元素状态→进化→主效果。 */
    update(dt: number): void {
        this.visualTime += dt;
        updateBuffFeedback(this.feedback, dt);
        for (let slot = 0; slot < BUFF_RULES.slots; slot++)
            this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
        updateBuffStatuses(this.statuses, this.host, dt);
        this.evolutions.update(dt);
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

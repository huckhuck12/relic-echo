import { BUFF_ACTIONS, BUFF_RULES, ELEMENTS, FRAGMENTS, TRIGGERS } from './buff-config.js';
import { BUFF_UPGRADES, buffLevelMultiplier } from './buff-upgrades.js';
import { evolutionOf } from './buff-evolutions.js';
import type { CompleteRecipe, Recipe } from './buff-types.js';
/** 无副作用配方查询，供运行时、奖励提示和编辑面板共同使用。 */
export const emptyRecipe = (): Recipe => ({ trigger: null, action: null, element: null });
export function complete(recipe: Recipe): recipe is CompleteRecipe {
    return !!recipe.trigger && !!recipe.action && !!recipe.element;
}
export function fragment(id: string) { return FRAGMENTS.find(f => f.id === id); }
export function recipeDamage(recipe: Recipe, scale = 1, level = 1): number {
    return Math.round(BUFF_ACTIONS[recipe.action || 'blast'].damage * scale * buffLevelMultiplier(level));
}
export function recipeDescription(recipe: Recipe, scale = 1, level = 1): string {
    if (!complete(recipe))
        return '选择触发、行为、元素，组成完整配方。\n进化路线：雷电弹丸 / 火焰区域 / 冰霜环绕。';
    const trigger = TRIGGERS.find(t => t.id === recipe.trigger)!;
    const element = ELEMENTS.find(e => e.id === recipe.element)!;
    const damage = recipeDamage(recipe, scale, level);
    const action = {
        bolt: `发射弹丸，命中伤害 ${damage}`,
        blast: `半径 ${BUFF_RULES.blast.radius} 爆炸，伤害 ${damage}`,
        field: `半径 ${BUFF_RULES.field.radius} 区域，持续 ${BUFF_ACTIONS.field.life} 秒，每 ${BUFF_RULES.field.tick} 秒伤害 ${damage}`,
        orbit: `双环绕物持续 ${BUFF_ACTIONS.orbit.life} 秒，每 ${BUFF_RULES.orbit.tick} 秒接触伤害 ${damage}`,
    }[recipe.action];
    const evolution = evolutionOf(recipe);
    return `Lv.${level}/${BUFF_UPGRADES.maxLevel} · 伤害 +${Math.round((buffLevelMultiplier(level) - 1) * 100)}%\n${trigger.note} · 冷却 ${trigger.cooldown} 秒\n${action}；${element.note}。`
        + (evolution ? `\n进化 · ${evolution.name}：${evolution.note}` : '');
}

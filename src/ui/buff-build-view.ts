import { complete, fragment } from '../buffs/buff-recipes.js';
import type { Recipe } from '../buffs/buff-types.js';
import type { Part } from '../buffs/buff-config.js';
import { TRIGGERS } from '../buffs/buff-config.js';
import { evolutionOf } from '../buffs/buff-evolutions.js';
export function recipeChain(recipe: Recipe): string {
    return [recipe.trigger, recipe.action, recipe.element].map(id => id ? fragment(id)?.name || '未选择' : '未选择').join(' → ');
}
/** Pure candidate preview: never grant a fragment, install it, or touch cooldowns. */
export function fragmentChoicePreview(recipes: readonly Recipe[], slot: number, part: Part, id: string) {
    const f = fragment(id);
    if (!recipes[slot] || !f || f.part !== part)
        return null;
    const next = recipes.map((r, i) => i === slot ? { ...r, [part]: id } as Recipe : r);
    const before = buffSynergies(recipes), after = buffSynergies(next);
    const gained = after.filter((r, i) => r.ready && !before[i].ready).map(r => r.name);
    const lost = before.filter((r, i) => r.ready && !after[i].ready).map(r => r.name);
    const evolution = complete(next[slot]) ? evolutionOf(next[slot])?.name : undefined;
    const trigger = TRIGGERS.find(t => t.id === id);
    const usage = trigger ? `${trigger.note} · 基础冷却 ${trigger.cooldown}s` : 'note' in f ? f.note : ({ bolt: '发射弹丸，命中造成伤害', blast: '瞬时范围爆炸', field: '持续区域，定时伤害', orbit: '环绕接触，持续伤害' }[id as 'bolt' | 'blast' | 'field' | 'orbit']);
    const missing = (['trigger', 'action', 'element'] as const).filter(p => !next[slot][p]);
    const summary = [gained.length ? '新增 ' + gained.join('、') : '', lost.length ? '失去 ' + lost.join('、') : '', missing.length ? '配方尚未完整' : evolution ? '进化 ' + evolution : !gained.length && !lost.length ? '联动保持' : ''].filter(Boolean).join(' · ');
    return {
        usage, summary, gained, lost, evolution, chain: recipeChain(next[slot])
    };
}
/** Static compatibility, not evidence of an active status or a guaranteed reaction. */
export function buffSynergies(recipes: readonly Recipe[]) {
    const rules = [
        {
            id: 'fire', name: '火场回拉', source: (r: Recipe) => r.action === 'field' && r.element === 'fire', partner: (r: Recipe) => r.element === 'force', need: '火焰区域 ＋ 另一槽冲击', note: '燃烧目标仍在火场内时，另一槽冲击命中可回拉；每目标 1 秒一次，Boss 不回拉。'
        },
        {
            id: 'ice', name: '提前碎裂', source: (r: Recipe) => r.action === 'orbit' && r.element === 'ice', partner: (r: Recipe) => r.element === 'force', need: '冰霜环绕 ＋ 另一槽冲击', note: '同一目标至少 1 层冰霜后，另一槽冲击命中提前碎裂；每目标 1 秒一次。'
        },
        {
            id: 'thunder', name: '冰霜导冷', source: (r: Recipe) => r.action === 'bolt' && r.element === 'lightning', partner: (r: Recipe) => r.element === 'ice', need: '雷电弹丸 ＋ 另一槽冰霜', note: '目标受另一槽冰霜减速时，雷丸命中额外加一印；每敌 1 秒一次。'
        },
    ];
    return rules.map(rule => {
        const source = recipes.findIndex(r => complete(r) && rule.source(r));
        const partner = recipes.findIndex((r, slot) => slot !== source && complete(r) && rule.partner(r));
        const names = rule.id === 'fire' ? ['火焰区域', '冲击'] : rule.id === 'ice' ? ['冰霜环绕', '冲击'] : ['雷电弹丸', '冰霜'];
        const hint = source >= 0 ? `槽${source + 1}已有${names[0]}，另一槽需要完整${names[1]}配方` : partner >= 0 ? `槽${partner + 1}已有${names[1]}，另一槽需要完整${names[0]}配方` : '需要 ' + rule.need;
        const brief = rule.id === 'fire' ? '火场内燃烧目标受跨槽冲击可回拉；1秒/目标，Boss除外。' : rule.id === 'ice' ? '至少2层冰霜后，跨槽冲击提前碎裂；1秒/目标。' : '跨槽冰霜减速目标受雷丸命中多加一印；1秒/敌。';
        return {
            id: rule.id, name: rule.name, need: rule.need, note: rule.note, brief, hint, ready: source >= 0 && partner >= 0, source, partner
        };
    });
}

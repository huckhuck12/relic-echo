import type { BuffBranch, Recipe } from './buff-types.js';
/** Branch identity belongs to a pair, never to its current slot or trigger. */
export const BUFF_BRANCHES = [
    {
        pair: 'field/fire', action: 'field', element: 'fire', name: '火焰区域', choices: ['trail', 'furnace']
    },
    {
        pair: 'orbit/ice', action: 'orbit', element: 'ice', name: '冰霜环绕', choices: ['shards', 'prison']
    },
    {
        pair: 'bolt/lightning', action: 'bolt', element: 'lightning', name: '雷电弹丸', choices: ['spread', 'charge']
    },
] as const;
export const BRANCH_TEXT: Record<BuffBranch, {
    name: string;
    note: string;
}> = {
    trail: { name: '火径', note: '冲刺沿途铺 3 个火场，各 85% 伤害，持续 3 秒；重叠不叠伤。Lv.5 延长至 4 秒。' },
    furnace: { name: '炉心', note: '火场缩至半径 70，伤害 ×1.35；同处刷新。Lv.5 回炉追加 60% 火场伤害，每目标 2 秒一次。' },
    shards: { name: '碎冰', note: '三层碎裂对主目标造成 70% 伤害，并向附近 3 敌射出冰片，各 70% 伤害。Lv.5 最多 5 敌。跨槽冲击仍可提前碎裂。' },
    prison: { name: '寒牢', note: '储存最多 5 层、窗口 4 秒，不再自动碎裂；环绕直伤 ×0.8。需另一槽冲击引爆。Lv.5 消费至少 4 层时主目标爆发 ×1.25。' },
    spread: { name: '传印', note: '雷丸播种，武器可充能；三印引爆主目标 120% 伤害，向附近 3 敌传两印，替代引爆溅射；死亡余电亦传 3 敌。Lv.5 最多 5 敌。传播不能引爆。跨槽冰霜导冷加一印，每敌 1 秒一次。' },
    charge: { name: '蓄雷', note: '优先精英/Boss；五印引爆，雷丸叠两印，武器可充能。主目标 300% 伤害，取消引爆溅射；雷丸续存 9 秒。Lv.5 提高至 350%。死亡余电优先转给附近一名强敌。跨槽冰霜导冷额外一印，每目标 1 秒一次。' },
};
export const BRANCH_COMPACT: Record<BuffBranch, string> = {
    trail: '冲刺铺 3 场，各 85% 伤害，持续 3 秒；Lv.5 持续 4 秒。',
    furnace: '半径 70、伤害 ×1.35；Lv.5 回炉追加 60% 火场伤害。',
    shards: '三层主目标 70%，向 3 敌射冰片各 70%；Lv.5 最多 5 敌。',
    prison: '5 层/4 秒，直伤 ×0.8；跨槽冲击消耗 ≥1 层。Lv.5 消耗 ≥4 层爆发 ×1.25。',
    spread: '武器可充能；三印爆发 120%，引爆/死亡向 3 敌传印，Lv.5 为 5 敌；传播不能引爆。',
    charge: '优先强敌；五印爆发 300%，雷丸叠两印、武器充能；Lv.5 为 350%，死亡余电继承一敌。',
};
export function branchPair(recipe: Pick<Recipe, 'action' | 'element'>) {
    return BUFF_BRANCHES.find(b => b.action === recipe.action && b.element === recipe.element);
}

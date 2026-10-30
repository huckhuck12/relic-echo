/** Buff 静态目录与调参入口。距离为世界坐标，时间为秒，伤害倍率为小数。
 * 本文件不导入运行时或 Laya；玩法和说明从同一份数据读取，避免文案/机制分离。
 */
export const TRIGGERS = [
    { id: 'hit', name: '命中', note: '武器命中 30% 触发', cooldown: 2 },
    { id: 'dash', name: '冲刺', note: '冲刺结束触发', cooldown: 3 },
    { id: 'kill', name: '击杀', note: '击杀敌人触发', cooldown: 2.5 },
    { id: 'hurt', name: '受击', note: '实际受伤且存活时触发', cooldown: 4 },
] as const;
export const ACTIONS = [
    { id: 'bolt', name: '弹丸' }, { id: 'blast', name: '爆炸' },
    { id: 'field', name: '区域' }, { id: 'orbit', name: '环绕' },
] as const;
export const ELEMENTS = [
    { id: 'fire', name: '火焰', color: '#ffac60', note: '附加 3 秒灼烧' },
    { id: 'ice', name: '冰霜', color: '#8bdaff', note: '减速 35%，持续 2 秒' },
    { id: 'lightning', name: '雷电', color: '#dcbbff', note: '向附近 2 个敌人传导' },
    { id: 'force', name: '冲击', color: '#ffe5a0', note: '强力击退' },
] as const;
export type Trigger = typeof TRIGGERS[number]['id'];
export type Action = typeof ACTIONS[number]['id'];
export type Element = typeof ELEMENTS[number]['id'];
export type Part = 'trigger' | 'action' | 'element';
export const PART_NAMES: Record<Part, string> = { trigger: '触发', action: '行为', element: '元素' };
export const PARTS: Part[] = ['trigger', 'action', 'element'];
export const FRAGMENTS = [
    ...TRIGGERS.map(p => ({ ...p, part: 'trigger' as Part })),
    ...ACTIONS.map(p => ({ ...p, part: 'action' as Part })),
    ...ELEMENTS.map(p => ({ ...p, part: 'element' as Part })),
];
export const START_FRAGMENTS = ['hit', 'blast', 'fire'];
export const BUFF_LIMITS = {
    bolt: 24, blast: 8, field: 8, orbit: 8, targets: 600
};
/** 每种行为的基础伤害、寿命；范围/频率放在下方规则表，不能从视觉大小反推伤害。 */
export const BUFF_ACTIONS = {
    bolt: { damage: 26, life: 1.2 }, blast: { damage: 22, life: .25 },
    field: { damage: 10, life: 4 }, orbit: { damage: 12, life: 3 },
} as const;
export const BUFF_RULES = {
    hitChance: .3, duplicateXP: 5, slots: 2,
    bolt: { seek: 500, speed: 480, queryPadding: 40, hitRadius: 32 },
    blast: { radius: 110, tick: 1 },
    field: { radius: 90, tick: .5 },
    orbit: {
        radius: 90, hitRadius: 38, tick: .35, speed: 6, count: 2
    },
    burn: { duration: 3, tick: .5, damage: .2 },
    slow: { duration: 2, multiplier: .65 },
    chain: { radius: 135, count: 2, damage: .55 },
    knockback: 380,
} as const;
/** 装饰反馈预算独立于伤害；调整这些值不能改变冷却、命中或随机序列。 */
export const BUFF_FEEDBACK = {
    defaultBudget: 20, maxBudget: 48, mergeAge: .1, mergeRadius: 55,
    lifetime: {
        scorch: .65, arc: .24, impact: .3, detonate: .3, shatter: .3
    },
} as const;

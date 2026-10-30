export type Slot = 'weapon' | 'head' | 'armor' | 'back';
export type Weapon = 'storm' | 'flame' | 'blade';
export type Quality = 0 | 1 | 2;
export type Bonuses = Partial<Record<'damage' | 'element' | 'speed' | 'attackSpeed' | 'hp' | 'crit' | 'reduction' | 'dash' | 'pickup', number>>;
export interface Gear {
    id: string;
    slot: Slot;
    name: string;
    note: string;
    color: string;
    bonus: Bonuses;
    weapon?: Weapon;
}
export interface Item {
    id: string;
    quality: Quality;
}
export const SLOTS: Slot[] = ['weapon', 'head', 'armor', 'back'];
export const SLOT_NAME = { weapon: '武器', head: '头饰', armor: '护甲', back: '背饰' };
export const QUALITY = ['普通', '精良', '稀有'];
export const QUALITY_COLOR = ['#a1b4be', '#5fe1c5', '#e9be70'];
export const GEARS: Gear[] = [
    {
        id: 'storm', slot: 'weapon', name: '雷杖', note: '高速连锁 · 成片击碎', color: '#76dbea', bonus: {}, weapon: 'storm'
    },
    {
        id: 'flame', slot: 'weapon', name: '炎炮', note: '爆炸轰击 · 灼烧清群', color: '#ff9863', bonus: {}, weapon: 'flame'
    },
    {
        id: 'blade', slot: 'weapon', name: '环刃', note: '抬手御刃 · 环绕切割', color: '#b6a1ff', bonus: {}, weapon: 'blade'
    },
    {
        id: 'visor', slot: 'head', name: '战术目镜', note: '暴击率 +8%', color: '#f4ce77', bonus: { crit: .08 }
    },
    {
        id: 'hood', slot: 'head', name: '术士兜帽', note: '元素伤害 +12%', color: '#b49bff', bonus: { element: .12 }
    },
    {
        id: 'helmet', slot: 'head', name: '守卫头盔', note: '最大生命 +25', color: '#c3d3db', bonus: { hp: 25 }
    },
    {
        id: 'light', slot: 'armor', name: '轻型战衣', note: '移动速度 +12%', color: '#61dbc9', bonus: { speed: .12 }
    },
    {
        id: 'heavy', slot: 'armor', name: '重型胸甲', note: '减伤 +15% · 移速 -5%', color: '#a4b7c7', bonus: { reduction: .15, speed: -.05 }
    },
    {
        id: 'energy', slot: 'armor', name: '能量外衣', note: '所有伤害 +12%', color: '#b79aff', bonus: { damage: .12 }
    },
    {
        id: 'cape', slot: 'back', name: '疾行披风', note: '冲刺冷却 -20%', color: '#58cdb8', bonus: { dash: .2 }
    },
    {
        id: 'thorn', slot: 'back', name: '荆棘背架', note: '受伤时对周围敌人造成 20 伤害', color: '#ecad7b', bonus: {}
    },
    {
        id: 'pack', slot: 'back', name: '聚能背包', note: '经验拾取半径 +40%', color: '#79bde6', bonus: { pickup: .4 }
    }
];
export const gear = (item: Item | string): Gear => {
    const result = GEARS.find(g => g.id === (typeof item === 'string' ? item : item.id));
    if (!result)
        throw new Error('Unknown equipment');
    return result;
};
export const multiplier = (q: Quality): number => 1 + q * .2;
export const WEAPONS = {
    storm: {
        damage: 25, interval: .32, range: 490, name: '雷电', color: '#76dbea'
    },
    flame: {
        damage: 30, interval: .5, range: 460, name: '火焰', color: '#ff9863'
    },
    blade: {
        damage: 20, interval: .23, range: 150, name: '飞刃', color: '#b6a1ff'
    }
};
export const ELITE_TIMES = [45, 105, 165, 225];
export const COMBAT = {
    pickup: 145, dashCooldown: 2.2, dashDistance: 180, dashDuration: .16, comboWindow: 3.5, frenzyKills: 8, frenzyDuration: 5
};
export interface Upgrade {
    id: string;
    name: string;
    note: string;
    icon: string;
    max: number;
    bonus?: Bonuses;
    weapon?: Weapon;
}
export const UPGRADES: Upgrade[] = [
    {
        id: 'power', name: '力量共鸣', note: '所有伤害 +15%', icon: '✦', max: 5, bonus: { damage: .15 }
    },
    {
        id: 'haste', name: '急速脉冲', note: '攻击速度 +12%', icon: '»', max: 5, bonus: { attackSpeed: .12 }
    },
    {
        id: 'vital', name: '遗迹体魄', note: '最大生命 +20，并恢复 20 生命', icon: '✚', max: 3, bonus: { hp: 20 }
    },
    {
        id: 'speed', name: '轻盈步伐', note: '移动速度 +8%', icon: '↗', max: 3, bonus: { speed: .08 }
    },
    {
        id: 'crit', name: '精准打击', note: '暴击率 +5%', icon: '⌖', max: 3, bonus: { crit: .05 }
    },
    {
        id: 'magnet', name: '磁力场', note: '经验拾取半径 +25%', icon: '◎', max: 3, bonus: { pickup: .25 }
    },
    {
        id: 'chain', name: '雷电分叉', note: '连锁目标 +2', icon: 'ϟ', max: 2, weapon: 'storm'
    },
    {
        id: 'conductor', name: '超导回路', note: '弹射衰减降低 8%，连锁距离 +40', icon: '⌁', max: 2, weapon: 'storm'
    },
    {
        id: 'burn', name: '炽热余烬', note: '灼烧每秒伤害 +5，爆炸伤害 +15%', icon: '♨', max: 2, weapon: 'flame'
    },
    {
        id: 'ground', name: '不熄之火', note: '爆炸范围 +20%，燃烧时间 +1秒', icon: '◈', max: 2, weapon: 'flame'
    },
    {
        id: 'blades', name: '飞刃增殖', note: '环绕飞刃 +2，切割伤害 +20%', icon: '✧', max: 2, weapon: 'blade'
    },
    {
        id: 'orbit', name: '延展轨道', note: '切割范围 +20%，冲刺冷却 -8%', icon: '◌', max: 2, weapon: 'blade'
    }
];

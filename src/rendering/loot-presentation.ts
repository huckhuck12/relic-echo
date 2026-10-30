import { block, pixel, Shape } from './voxel.js';
import type { Drop } from '../shared/entities.js';
/**
 * 掉落生成时一次绘制，不用滤镜或额外节点。经验是低矮横向菱片，避免和飞行尖头混淆；
 * 使用绿/薄荷色，不画竖直白亮芯。治疗单独使用补给包和十字，不能只靠换色区分。
 */
export function experienceShapes(healing = false): Shape[] {
    if (healing)
        return [
            { type: 'poly', p: [-9, 2, 0, -2, 11, 2, 0, 6], fill: '#17362c' },
            ...block(-7, 1, 13, 11, 3, '#d2d4b4'),
            pixel(-2, -9, 3, 8, '#39856d'), pixel(-5, -6, 9, 3, '#39856d'),
        ];
    return [
        { type: 'poly', p: [-10, -2, 0, -7, 10, -2, 0, 4], fill: '#142f2b' },
        { type: 'poly', p: [-8, -3, 0, -7, 8, -3, 0, 1], fill: '#75d49b' },
        { type: 'poly', p: [-8, -3, 0, 1, 0, 3, -8, -1], fill: '#36795b' },
        { type: 'poly', p: [0, 1, 8, -3, 8, -1, 0, 3], fill: '#245c4c' },
        { type: 'poly', p: [-4, -3, 0, -5, 4, -3, 0, -1], fill: '#b4eac3' },
    ];
}
/** 碎片改为金边符牌，既不同于绿色经验，也不同于紫色怪弹；不依赖上层光柱辨认。 */
export function fragmentShapes(): Shape[] {
    return [
        { type: 'poly', p: [-11, 1, 0, -4, 12, 1, 0, 7], fill: '#20372c' },
        ...block(-8, 1, 15, 15, 3, '#c7a46c'),
        pixel(-5, -12, 9, 10, '#655875'),
        { type: 'poly', p: [-1, -11, 3, -7, -1, -3, -5, -7], fill: '#e1d9b9' },
        pixel(-2, -8, 2, 2, '#655875'),
    ];
}
/** 低矮浮动是奖励的辅助识别；时间只读模拟时钟，暂停定格，不新增逐帧绘图。 */
export function lootPose(drop: Pick<Drop, 'x' | 'y' | 'xp' | 'item' | 'fragment' | 'collecting'>, time: number) {
    const wave = Math.sin(time * (drop.item ? 3 : 4) + drop.x * .03 + drop.y * .02);
    if (drop.item) {
        const size = 1 + wave * .025;
        return { lift: 0, sx: size, sy: size };
    }
    if (drop.fragment) {
        const size = drop.collecting ? 1.12 : 1;
        return { lift: 2 + wave, sx: size, sy: size };
    }
    if (drop.xp < 0) {
        const size = drop.collecting ? 1.12 : 1;
        return { lift: 1 + wave * .6, sx: size, sy: size };
    }
    return { lift: .8 + wave * .6, sx: drop.collecting ? 1.2 : 1, sy: drop.collecting ? .88 : 1 };
}
/** 锁扣、包角和品质顶盖区分装备宝箱；品质同时体现在顶盖与上方菱形标记。 */
export function chestShapes(color: string): Shape[] {
    return [{ type: 'poly', p: [-17, 2, 0, -6, 20, 2, 0, 11], fill: '#23372e' },
        ...block(-12, 3, 22, 18, 7, '#694732'), ...block(-13, -12, 24, 6, 8, color),
        pixel(-11, -12, 3, 14, '#c09b60'), pixel(7, -12, 3, 14, '#c09b60'),
        pixel(-4, -10, 8, 10, '#382e2c'), pixel(-3, -10, 6, 7, '#ffe6a2'), pixel(-1, -8, 2, 3, '#795b3d')];
}

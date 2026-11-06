import { enemyKind } from '../game/difficulty.js';
import { RUN } from '../game/pace.js';
import type { RunPace } from '../game/pace.js';
/** Standard surges leave escape lanes; budgets and combat stats still come from difficultyAt. */
export function surgePattern(time: number, run: RunPace = RUN) {
    if (run.id === 'quick')
        return {
            name: '围攻怪潮', hint: '优先躲避远程与冲锋', lanes: 1, spread: Math.PI * 2, stage: 'quick'
        };
    if (time < 90)
        return {
            name: '庭院来袭', hint: '怪群从一侧涌入，向空侧绕行', lanes: 1, spread: 1.4, stage: 'entry'
        };
    if (time < 240)
        return {
            name: '两翼夹击', hint: '两侧怪群靠近，沿侧向空隙穿行', lanes: 2, spread: .8, stage: 'pincer'
        };
    if (time < 420)
        return {
            name: '侧翼远袭', hint: '远程混入两翼，优先打断施法', lanes: 2, spread: .6, stage: 'ranged'
        };
    return {
        name: '古门突围', hint: '三路混编靠近，留意冲锋预警', lanes: 3, spread: .6, stage: 'trial'
    };
}
/** Pure placement, one supplied roll per member; no hidden RNG or additional entities. */
export function surgeMember(time: number, index: number, count: number, direction: number, roll: number, run: RunPace = RUN): {
    kind: number;
    angle: number;
} {
    const pattern = surgePattern(time, run), ordinary = enemyKind(time, roll, run);
    if (run.id === 'quick')
        return { kind: ordinary, angle: direction + index / count * Math.PI * 2 };
    const lane = index % pattern.lanes, slot = Math.floor(index / pattern.lanes), slots = Math.ceil((count - lane) / pattern.lanes);
    const offset = slots <= 1 ? 0 : (slot / (slots - 1) - .5) * pattern.spread;
    return { kind: pattern.stage === 'ranged' && index % 3 === 0 ? 1 : pattern.stage === 'trial' && index % 4 === 0 ? 2 : ordinary, angle: direction + lane / pattern.lanes * Math.PI * 2 + offset };
}

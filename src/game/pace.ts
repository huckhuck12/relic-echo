/** 局内节奏使用真实秒数；只压缩成长节奏，不改变动作和输入速度。 */
export type RunKind = 'quick' | 'standard';
export interface RunPace {
    id: RunKind;
    name: string;
    duration: number;
    bossAt: number;
    firstUpgradeAt: number;
    firstSurgeAt: number;
    qualityAt: number;
    fragmentEvery: number;
    fragmentCooldown: number;
    eliteTimes: readonly number[];
}
export const RUN: RunPace = {
    id: 'quick', name: '快速探索', duration: 360, bossAt: 300, firstUpgradeAt: 20, firstSurgeAt: 12, qualityAt: 200, fragmentEvery: 18, fragmentCooldown: 8,
    eliteTimes: [45, 105, 165, 225]
};
export const RUNS: Readonly<Record<RunKind, RunPace>> = {
    quick: RUN,
    standard: {
        id: 'standard', name: '标准探索', duration: 720, bossAt: 600, firstUpgradeAt: 20, firstSurgeAt: 18,
        qualityAt: 400, fragmentEvery: 26, fragmentCooldown: 12, eliteTimes: [60, 150, 240, 330, 420, 510]
    }
};
/** 将原九分钟成长映射到当前五分钟 Boss 节点，供刷怪/装备成长统一查询。 */
export const progressionTime = (seconds: number, run: RunPace = RUN): number => Math.max(0, Math.min(seconds, run.bossAt)) * 540 / run.bossAt;
/** Authored quiet windows reduce new pressure without despawning enemies or slowing simulation. */
export function encounterBeat(seconds: number, run: RunPace = RUN): {
    name: string;
    recovery: boolean;
} {
    if (run.id === 'quick')
        return { name: seconds >= run.bossAt ? '核心决战' : '遗迹怪潮', recovery: false };
    if (seconds >= run.bossAt)
        return { name: '核心决战', recovery: false };
    if (seconds >= 570)
        return { name: '决战准备', recovery: true };
    const recovery = seconds >= 80 && seconds % 90 >= 80;
    return { name: recovery ? '整备间隙' : seconds < 90 ? '初探庭院' : seconds < 240 ? '构筑成长' : seconds < 420 ? '封印争夺' : '成型试炼', recovery };
}

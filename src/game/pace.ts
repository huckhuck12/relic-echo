/** 局内节奏使用真实秒数；只压缩成长节奏，不改变动作和输入速度。 */
export const RUN = {
    duration: 360, bossAt: 300, firstUpgradeAt: 20, firstSurgeAt: 12, qualityAt: 200, fragmentEvery: 18, fragmentCooldown: 8
};
/** 将原九分钟成长映射到当前五分钟 Boss 节点，供刷怪/装备成长统一查询。 */
export const progressionTime = (seconds: number): number => Math.max(0, Math.min(seconds, RUN.bossAt)) * 540 / RUN.bossAt;

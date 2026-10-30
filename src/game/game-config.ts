/** 应用级静态配置。战斗平衡数据仍按领域放在 config/pace/difficulty/buff-config 中。 */
export const SIMULATION = {
    fixedStep: 1 / 60, maxDelta: .1, maxSteps: 6, uiInterval: .12, fpsInterval: .5
} as const;
export const WORLD_RULES = { limit: 1120, mousePillarRadius: 56, playerPillarRadius: 54 } as const;
export const WORLD_PILLARS = [
    { x: -420, y: -380 }, { x: 440, y: -360 }, { x: -430, y: 420 }, { x: 420, y: 450 },
    { x: -780, y: 0 }, { x: 780, y: 0 }, { x: 0, y: -790 }, { x: 0, y: 790 },
] as const;
/** 兼容旧版 Laya keyCode；现代浏览器优先使用 nativeEvent.code。 */
export const KEY_CODES: Readonly<Record<number, string>> = {
    32: 'Space', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
    65: 'KeyA', 68: 'KeyD', 66: 'KeyB', 69: 'KeyE', 80: 'KeyP', 83: 'KeyS', 87: 'KeyW', 27: 'Escape',
};
export const STORAGE = { settings: 'relic-settings', records: 'relic-records', recordLimit: 10 } as const;

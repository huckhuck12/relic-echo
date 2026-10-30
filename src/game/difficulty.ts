import { clamp } from '../shared/model.js';
import { progressionTime } from './pace.js';
export const ENEMY_LIMIT = 240;
export const SHOT_LIMIT = 240;
// Time drives the curve; upgrading equipment never secretly strengthens enemies.
export function difficultyAt(time: number) {
    const t = progressionTime(time), late = clamp((t - 120) / 420, 0, 1);
    return {
        late,
        hp: 1 + t / 270 + late * 1.6,
        damage: 1 + late * 3.2,
        speed: 1 + late * .8,
        attackInterval: 1 - late * .28,
        projectileSpeed: 1 + late * .5,
        knockback: 1 / (1 + late * 2),
        spawnInterval: Math.max(.22, .45 - t * .0006),
        batch: t >= 420 ? 10 : t >= 300 ? 7 : t >= 180 ? 4 : t >= 90 ? 2 : 1,
        pack: Math.min(80, 8 + Math.floor(t / 30) * 5),
        surgeInterval: 24 - late * 12,
        maxEnemies: Math.min(ENEMY_LIMIT, 120 + Math.floor(late * 160)),
        healCooldown: 6 + late * 14,
    };
}
export function enemyKind(time: number, roll = Math.random()): number {
    const t = progressionTime(time);
    if (t < 60)
        return 0;
    if (t < 180)
        return roll < .7 ? 0 : 1;
    return roll < .45 ? 0 : roll < .72 ? 1 : 2;
}

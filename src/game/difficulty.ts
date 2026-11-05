import { clamp } from '../shared/model.js';
import { RUN, progressionTime } from './pace.js';
import type { RunPace } from './pace.js';
export const ENEMY_LIMIT = 240;
export const SHOT_LIMIT = 240;
// Time drives the curve; upgrading equipment never secretly strengthens enemies.
export function difficultyAt(time: number, run: RunPace = RUN) {
    const t = progressionTime(time, run), late = clamp((t - 120) / 420, 0, 1);
    const standard = run.id === 'standard';
    return {
        late,
        hp: 1 + t / (standard ? 330 : 270) + late * (standard ? 1.1 : 1.6),
        damage: 1 + late * (standard ? 2.2 : 3.2),
        speed: 1 + late * (standard ? .6 : .8),
        attackInterval: standard ? 1.15 - late * .15 : 1 - late * .28,
        projectileSpeed: 1 + late * (standard ? .35 : .5),
        knockback: 1 / (1 + late * 2),
        spawnInterval: standard ? Math.max(.28, .5 - t * .00045) : Math.max(.22, .45 - t * .0006),
        batch: standard ? t >= 420 ? 6 : t >= 300 ? 4 : t >= 180 ? 3 : t >= 90 ? 2 : 1 : t >= 420 ? 10 : t >= 300 ? 7 : t >= 180 ? 4 : t >= 90 ? 2 : 1,
        pack: standard ? Math.min(48, 8 + Math.floor(t / 45) * 3) : Math.min(80, 8 + Math.floor(t / 30) * 5),
        surgeInterval: standard ? 26 - late * 10 : 24 - late * 12,
        maxEnemies: Math.min(ENEMY_LIMIT, 120 + Math.floor(late * 160)),
        healCooldown: 6 + late * (standard ? 9 : 14),
    };
}
export function enemyKind(time: number, roll = Math.random(), run: RunPace = RUN): number {
    const t = progressionTime(time, run);
    if (t < 60)
        return 0;
    if (t < 180)
        return roll < .7 ? 0 : 1;
    return roll < .45 ? 0 : roll < .72 ? 1 : 2;
}

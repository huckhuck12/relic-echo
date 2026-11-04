import { enemyPartPoint } from './voxel.js';
import type { Shape } from './voxel.js';
import type { enemyArtPose } from '../enemies/enemy-actions.js';
/** Canonical right-side art is mirrored for left views; geometry and sockets share this mapping. */
export function enemyView(facing = 1) {
    const view = [2, 1, 0, 1, 2, 3, 4, 3][facing] ?? 1;
    return { view, flip: facing >= 3 && facing <= 5 ? -1 : 1, scale: view === 2 ? .65 : view === 1 || view === 3 ? .85 : 1 };
}
/** Apply the same view and shoulder correction to artwork and attached effects. */
export function enemyViewPartPoint(x: number, y: number, part: NonNullable<Shape['part']>, kind: number, pose: ReturnType<typeof enemyArtPose>, facing = 1) {
    const point = enemyPartPoint(x, y, part, kind, pose), v = enemyView(facing);
    point.x *= v.scale * v.flip;
    if (kind >= 3) {
        const b = kind === 4 ? 1.6 : 1, center = part === 'leftArm' ? -32 : 33;
        const mount = v.view === 2 ? 0 : v.view === 3 ? (part === 'leftArm' ? 18 : -18) : center * (v.view === 1 ? .78 : .84);
        point.x += (mount - center * v.scale) * b * v.flip;
        point.y -= 10 * b;
    }
    return point;
}

import { project } from '../shared/model.js';
import type { Facing8 } from '../rendering/player-pose.js';
/** Only visual direction: quantize the WORLD intent after the same projection used by the renderer. */
export function enemyDirection(x: number, y: number, previous: Facing8 = 1): Facing8 {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < .001)
        return previous;
    const q = project(x, y);
    const angle = Math.atan2(q.y, q.x);
    // Keep a small deadband around sector boundaries so close pursuit does not flicker between views.
    const delta = Math.atan2(Math.sin(angle - previous * Math.PI / 4), Math.cos(angle - previous * Math.PI / 4));
    if (Math.abs(delta) <= Math.PI / 8 + .06)
        return previous;
    return ((Math.round(angle / (Math.PI / 4)) + 8) % 8) as Facing8;
}

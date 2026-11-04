import type { Facing8 } from './player-pose.js';
import type { Point } from '../shared/entities.js';
import type { Weapon } from '../progression/config.js';
import { CAST_DURATION } from './player-pose.js';
// Measured on the normalized source, in logical pixels relative to its grounded foot origin.
// The far hand on profile poses becomes the casting hand; it must not jump to the other arm.
const HANDS: Record<number, Point[]> = {
    0: [{ x: 12, y: -28 }, { x: 15, y: -32 }, { x: 12, y: -28 }, { x: 15, y: -32 }, { x: 14, y: -46 }, { x: 25, y: -47 }, { x: 9, y: -28 }],
    1: [{ x: 15, y: -28 }, { x: 13, y: -32 }, { x: 15, y: -28 }, { x: 16, y: -34 }, { x: 16, y: -46 }, { x: 26, y: -45 }, { x: 17, y: -28 }],
    2: [{ x: 14, y: -27 }, { x: 13, y: -31 }, { x: 14, y: -27 }, { x: 12, y: -32 }, { x: 14, y: -45 }, { x: 22, y: -43 }, { x: 19, y: -27 }],
    6: [{ x: 14, y: -28 }, { x: 12, y: -33 }, { x: 14, y: -28 }, { x: 12, y: -33 }, { x: 15, y: -47 }, { x: 26, y: -46 }, { x: 15, y: -29 }],
    7: [{ x: 13, y: -29 }, { x: 18, y: -32 }, { x: 13, y: -29 }, { x: 18, y: -32 }, { x: 14, y: -46 }, { x: 27, y: -48 }, { x: 17, y: -28 }]
};
export function walkFrame(phase: number): number {
    return ((Math.floor(phase * 2 / Math.PI) % 4) + 4) % 4;
}
/** Attack damage is immediate: start at release, then recover into the exact idle silhouette. */
export function castBlend(frame: number) {
    const t = Math.max(0, Math.min(1, frame / 11));
    const k = t < .45 ? t / .45 : (t - .45) / .55;
    const mix = k * k * (3 - 2 * k);
    return t < .45 ? { from: 5, to: 6, mix } : { from: 6, to: 0, mix };
}
export function handPoint(direction: Facing8, pose: number): Point {
    const mirror = direction === 3 || direction === 4 || direction === 5;
    const row = direction === 3 ? 1 : direction === 4 ? 0 : direction === 5 ? 7 : direction;
    const p = HANDS[row][pose];
    return { x: mirror ? -p.x : p.x, y: p.y };
}
export function castHand(direction: Facing8, frame: number): Point {
    const blend = castBlend(frame), a = handPoint(direction, blend.from), b = handPoint(direction, blend.to);
    return { x: a.x + (b.x - a.x) * blend.mix, y: a.y + (b.y - a.y) * blend.mix };
}
export function weaponMount(weapon: Weapon, direction: Facing8, hand: Point) {
    const side = direction >= 3 && direction <= 5 ? -1 : 1;
    const angle = weapon === 'flame' ? Math.sin(direction * Math.PI / 4) * .30 * side : -.09 * side;
    // Source slots occupy the unused bottom of the shared decoded body image.
    const slot = weapon === 'storm' ? {
        sx: 640, sy: 800, sw: 21, sh: 96, width: 10.5, height: 48, offsetX: -3, offsetY: -32
    }
        : weapon === 'flame' ? {
            sx: 768, sy: 800, sw: 50, sh: 48, width: 22, height: 21.12, offsetX: -5.5, offsetY: -16
        }
            : {
                sx: 896, sy: 800, sw: 30, sh: 42, width: 12, height: 16.8, offsetX: -6, offsetY: -14
            };
    return {
        ...slot, x: hand.x, y: hand.y, angle, flip: side < 0
    };
}
export function mountedTip(weapon: Weapon, direction: Facing8, hand: Point): Point {
    const mount = weaponMount(weapon, direction, hand);
    const tip = weapon === 'storm' ? { x: 2, y: -31 } : weapon === 'flame' ? { x: 16, y: -10 } : { x: 0, y: -12 };
    const x = tip.x * (mount.flip ? -1 : 1), a = mount.angle;
    return { x: hand.x + Math.cos(a) * x - Math.sin(a) * tip.y, y: hand.y + Math.sin(a) * x + Math.cos(a) * tip.y };
}
export function heroSocket(weapon: Weapon, direction: Facing8, remaining = 0, moving = false, phase = 0): Point {
    const frame = Math.min(11, Math.max(0, Math.floor((1 - remaining / CAST_DURATION[weapon]) * 12)));
    const hand = remaining > 0 && !moving ? castHand(direction, frame) : handPoint(direction, moving ? walkFrame(phase) : 0);
    return mountedTip(weapon, direction, hand);
}

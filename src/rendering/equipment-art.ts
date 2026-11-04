import { EQUIPMENT_ART_FRAMES } from './equipment-art-frames.js';
import type { Facing8 } from './player-pose.js';
import type { Loadout } from '../shared/model.js';
import type { RasterLayer } from './shape-atlas.js';
import { castBlend } from './hero-motion.js';
type Wearable = keyof typeof EQUIPMENT_ART_FRAMES;
// Source views are independent front / quarter / profile / back-quarter / back.
// The three left-facing directions mirror their matching right-facing artwork.
const VIEWS = [2, 1, 0, 1, 2, 3, 4, 3];
const SIZE: Record<Wearable, {
    scale: number;
    bottom: number;
}> = {
    helmet: { scale: .57, bottom: -49 },
    hood: { scale: .60, bottom: -46 },
    visor: { scale: .50, bottom: -60 },
    light: { scale: .53, bottom: -16 },
    heavy: { scale: .57, bottom: -16 },
    energy: { scale: .55, bottom: -16 },
    cape: { scale: .60, bottom: -12 },
    pack: { scale: .54, bottom: -17 },
    thorn: { scale: .65, bottom: -15 }
};
function mount(id: Wearable, direction: Facing8, pose: number): RasterLayer {
    const frame = EQUIPMENT_ART_FRAMES[id][VIEWS[direction]], size = SIZE[id];
    const width = frame.sw * size.scale, height = frame.sh * size.scale;
    const side = direction >= 3 && direction <= 5 ? -1 : 1;
    // Measured on the existing normalized body. Gear follows its shoulders/head, never the foot shadow.
    const bob = pose === 1 || pose === 3 ? -.8 : pose === 4 || pose === 5 ? -.7 : 0;
    const head = id === 'helmet' || id === 'hood' || id === 'visor';
    const profile = direction === 0 || direction === 4;
    const x = head && profile ? 1.5 * side : 0;
    const rear = id === 'cape' || id === 'pack' || id === 'thorn';
    const rearShift = rear && (profile || direction % 2 === 1) ? -side * (profile ? 8 : 5) : 0;
    return {
        ...frame, x: x + rearShift, y: size.bottom + bob, width, height,
        angle: rear && id === 'cape' ? (pose === 1 ? -.035 : pose === 3 ? .035 : 0) * side : 0,
        flip: side < 0, offsetX: -width / 2, offsetY: -height
    };
}
/** Baked once per current loadout, using the SAME decoded source as the body and weapons. */
export function equipmentLayers(loadout: Loadout, direction: Facing8, pose: number, cast = -1) {
    const underlays: RasterLayer[] = [], overlays: RasterLayer[] = [];
    const add = (id: string | undefined, behind: boolean) => {
        if (!id || !(id in EQUIPMENT_ART_FRAMES))
            return;
        const target = behind ? underlays : overlays;
        if (cast < 0) {
            target.push(mount(id as Wearable, direction, pose));
        }
        else {
            const blend = castBlend(cast);
            const a = mount(id as Wearable, direction, blend.from), b = mount(id as Wearable, direction, blend.to);
            // The garment has one rigid torso view; interpolate its anchor with the body's cast blend.
            target.push({ ...a, x: a.x + (b.x - a.x) * blend.mix, y: a.y + (b.y - a.y) * blend.mix });
        }
    };
    // Front/side: accessory is behind torso. Back: it covers torso, below headgear and weapons.
    add(loadout.back?.id, direction < 5);
    add(loadout.armor?.id, false);
    if (direction >= 5 && overlays.length > 1)
        overlays.reverse();
    add(loadout.head?.id, false);
    let bodyClip: number[] | undefined;
    if (loadout.head?.id === 'helmet' || loadout.head?.id === 'hood') {
        const head = mount(loadout.head.id, direction, pose);
        const side = direction >= 3 && direction <= 5 ? -1 : 1;
        const profile = direction === 0 || direction === 4;
        const left = head.x - head.width * (profile && side > 0 ? .36 : .46);
        const right = head.x + head.width * (profile && side < 0 ? .36 : .46);
        bodyClip = [-50, -46, left, -46, left, head.y - head.height + 1, right, head.y - head.height + 1, right, -46, 50, -46, 50, 10, -50, 10];
    }
    return { underlays, overlays, bodyClip };
}

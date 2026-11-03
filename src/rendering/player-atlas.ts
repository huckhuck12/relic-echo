import { avatarShapes, weaponOf } from './appearance.js';
import { CAST_DURATION, castFrame, playerDirection } from './player-pose.js';
import type { Facing8 } from './player-pose.js';
import type { Loadout } from '../shared/model.js';
import type { Player } from '../shared/entities.js';
import type { LayaGraphics } from '../platform/laya.js';
import { ShapeAtlas } from './shape-atlas.js';
/** One equipment set, 128 poses, at most 8 MiB. Replaced sets are destroyed. */
export class PlayerAtlas {
    private sheet?: ShapeAtlas;
    private loadoutKey = '';
    get bytes(): number { return this.sheet?.bytes || 0; }
    paint(g: LayaGraphics, loadout: Loadout, p: Readonly<Player>, phase: number): boolean {
        // Test/unsupported renderers use the vector path without allocating a sheet.
        if (!g.drawTexture || !Laya.Texture2D)
            return false;
        const equipment = JSON.stringify(loadout), weapon = weaponOf(loadout);
        if (this.loadoutKey !== equipment) {
            this.sheet?.destroy();
            this.loadoutKey = equipment;
            const frames = [];
            for (let direction = 0; direction < 8; direction++) {
                for (let walk = 0; walk < 4; walk++)
                    frames.push({ key: `${direction}:walk:${walk}`, shapes: avatarShapes(loadout, false, 1, walk * Math.PI / 2, direction as Facing8) });
                for (let cast = 0; cast < 12; cast++)
                    frames.push({ key: `${direction}:cast:${cast}`, shapes: avatarShapes(loadout, false, 1, 0, direction as Facing8, CAST_DURATION[weapon] * (1 - (cast + .5) / 12)) });
            }
            this.sheet = new ShapeAtlas(frames, 1);
        }
        const remaining = p.castWeapon === weapon ? (p.castTime || 0) : 0;
        const walk = ((Math.round(phase * 2 / Math.PI) % 4) + 4) % 4;
        const key = `${playerDirection(p)}:${remaining > 0 ? 'cast:' + castFrame(weapon, remaining) : 'walk:' + walk}`;
        return this.sheet!.paint(g, key);
    }
}

import { avatarShapes, weaponOf } from './appearance.js';
import { CAST_DURATION, castFrame, playerDirection } from './player-pose.js';
import type { Facing8 } from './player-pose.js';
import type { Loadout } from '../shared/model.js';
import type { Player } from '../shared/entities.js';
import type { LayaGraphics } from '../platform/laya.js';
import { ShapeAtlas } from './shape-atlas.js';
import { heroArt, heroFrame } from './hero-art.js';
import type { AtlasRaster } from './shape-atlas.js';
import type { Shape } from './voxel.js';
/** One equipment set, 128 poses, at most 8 MiB. Replaced sets are destroyed. */
export class PlayerAtlas {
    private sheet?: ShapeAtlas;
    private loadoutKey = '';
    constructor(private readonly preview = false) { }
    get revision(): number { return heroArt().image ? 1 : 0; }
    get bytes(): number { return this.sheet?.bytes || 0; }
    get artStatus() {
        const art = heroArt();
        return { ready: !!art.image, error: art.error };
    }
    destroy(): void {
        this.sheet?.destroy();
        this.sheet = undefined;
        this.loadoutKey = '';
    }
    paint(g: LayaGraphics, loadout: Loadout, p: Readonly<Pick<Player, 'face' | 'back' | 'direction' | 'castWeapon' | 'castTime'>>, phase: number): boolean {
        // Test/unsupported renderers use the vector path without allocating a sheet.
        if (!g.drawTexture || !Laya.Texture2D)
            return false;
        const image = heroArt().image;
        const equipment = JSON.stringify(loadout) + ':' + !!image + (this.preview ? ':' + playerDirection(p) : ''), weapon = weaponOf(loadout);
        if (this.loadoutKey !== equipment) {
            this.sheet?.destroy();
            this.loadoutKey = equipment;
            const frames: {
                key: string;
                shapes: Shape[];
                raster?: AtlasRaster;
            }[] = [];
            const entry = (key: string, direction: Facing8, pose: number, phase: number, castTime = 0) => {
                const shapes = avatarShapes(loadout, false, 1, phase, direction, castTime);
                if (!image)
                    return { key, shapes };
                const back = direction >= 5;
                const behind = shapes.filter(s => s.avatarLayer === 'back' ? !back : s.avatarLayer === 'weapon' && back);
                const front = shapes.filter(s => s.avatarLayer && !behind.includes(s));
                // Ground shadow is below the painted body; equipment retains its original depth order.
                behind.unshift(shapes[0]);
                return { key, shapes: front, raster: { source: image, ...heroFrame(direction, pose), behind } };
            };
            const directions = this.preview ? [playerDirection(p)] : [0, 1, 2, 3, 4, 5, 6, 7];
            for (const direction of directions) {
                for (let walk = 0; walk < (this.preview ? 1 : 4); walk++)
                    frames.push(entry(`${direction}:walk:${walk}`, direction as Facing8, walk, walk * Math.PI / 2));
                for (let cast = 0; cast < (this.preview ? 0 : 12); cast++)
                    frames.push(entry(`${direction}:cast:${cast}`, direction as Facing8, 4 + (cast < 3 ? 0 : cast < 7 ? 1 : 2), 0, CAST_DURATION[weapon] * (1 - (cast + .5) / 12)));
            }
            this.sheet = new ShapeAtlas(frames, 1, this.preview ? 128 : 1024);
        }
        const remaining = !this.preview && p.castWeapon === weapon ? (p.castTime || 0) : 0;
        const walk = this.preview ? 0 : ((Math.round(phase * 2 / Math.PI) % 4) + 4) % 4;
        const key = `${playerDirection(p)}:${remaining > 0 ? 'cast:' + castFrame(weapon, remaining) : 'walk:' + walk}`;
        return this.sheet!.paint(g, key);
    }
}

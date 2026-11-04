import { avatarShapes, weaponOf } from './appearance.js';
import { CAST_DURATION, castFrame, playerDirection } from './player-pose.js';
import type { Facing8 } from './player-pose.js';
import type { Loadout } from '../shared/model.js';
import type { Player } from '../shared/entities.js';
import type { LayaGraphics } from '../platform/laya.js';
import { ShapeAtlas } from './shape-atlas.js';
import { heroArt, heroFrame } from './hero-art.js';
import { castBlend, castHand, handPoint, walkFrame, weaponMount } from './hero-motion.js';
import { oval } from './painted-art.js';
import type { AtlasRaster, RasterLayer } from './shape-atlas.js';
import type { Shape } from './voxel.js';
import { equipmentLayers } from './equipment-art.js';
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
    paint(g: LayaGraphics, loadout: Loadout, p: Readonly<Pick<Player, 'face' | 'back' | 'direction' | 'castWeapon' | 'castTime' | 'moving'>>, phase: number): boolean {
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
            const entry = (key: string, direction: Facing8, pose: number, phase: number, castTime = 0, cast = -1) => {
                const shapes = avatarShapes(loadout, false, 1, phase, direction, castTime);
                if (!image)
                    return { key, shapes };
                const back = direction >= 5;
                const behind: Shape[] = [];
                const front: Shape[] = [];
                // The painted feet rest on a compact contact shadow; recoil never transforms it.
                behind.unshift(oval(0, 0, 13, 3, '#354638', '#354638'));
                const hand = cast >= 0 ? castHand(direction, cast) : handPoint(direction, pose);
                const attachments = [weaponMount(weapon, direction, hand)];
                const equipment = equipmentLayers(loadout, direction, pose, cast);
                const fingers = back ? [] : [oval(hand.x, hand.y, 1.7, 2.2, '#dba878', '#a77555')];
                let layers: RasterLayer[] | undefined;
                if (cast >= 0) {
                    const blend = castBlend(cast), idle = heroFrame(direction, 0);
                    const upper = (frame: number, alpha: number): RasterLayer => ({
                        ...heroFrame(direction, frame), sh: 82, height: 82 / 1.5, alpha, add: true
                    });
                    // Reuse the exact idle legs through the whole cast; interpolate only the upper body.
                    layers = [{
                            ...idle, sy: idle.sy + 82, sh: 46, y: -28, height: 46 / 1.5
                        }, upper(blend.from, 1 - blend.mix), upper(blend.to, blend.mix)];
                }
                if (equipment.bodyClip)
                    layers = (layers || [heroFrame(direction, pose)]).map(layer => ({ ...layer, clip: equipment.bodyClip }));
                return { key, shapes: front, raster: {
                        source: image, ...heroFrame(direction, pose), layers, behind, ...equipment, attachments, fingers, attachmentsBehind: back
                    } };
            };
            const directions = this.preview ? [playerDirection(p)] : [0, 1, 2, 3, 4, 5, 6, 7];
            for (const direction of directions) {
                for (let walk = 0; walk < (this.preview ? 1 : 4); walk++)
                    frames.push(entry(`${direction}:walk:${walk}`, direction as Facing8, walk, walk * Math.PI / 2));
                for (let cast = 0; cast < (this.preview ? 0 : 12); cast++)
                    frames.push(entry(`${direction}:cast:${cast}`, direction as Facing8, 0, 0, CAST_DURATION[weapon] * (1 - (cast + .5) / 12), cast));
            }
            this.sheet = new ShapeAtlas(frames, 1, this.preview ? 128 : 1024);
        }
        const remaining = !this.preview && !p.moving && p.castWeapon === weapon ? (p.castTime || 0) : 0;
        const walk = this.preview || p.moving === false ? 0 : walkFrame(phase);
        const key = `${playerDirection(p)}:${remaining > 0 ? 'cast:' + castFrame(weapon, remaining) : 'walk:' + walk}`;
        return this.sheet!.paint(g, key);
    }
}

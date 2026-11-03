import type { LayaGraphics } from '../platform/laya.js';
import { enemyArtPose, ENEMY_ACTION_SECONDS } from '../enemies/enemy-actions.js';
import { enemyVisualShapes } from './voxel.js';
import type { Shape } from './voxel.js';
import { ShapeAtlas } from './shape-atlas.js';
import { actorAtlasFrames } from './painted-world.js';
/** Depth sorted enemies, pillars and projectiles share the same GPU page. */
export class EnemyAtlas {
    enabled = true;
    private readonly sheet: ShapeAtlas;
    private high?: EnemyAtlas;
    constructor(private readonly detail = false) {
        this.sheet = new ShapeAtlas([...ordinaryAtlasFrames(detail), ...actorAtlasFrames()], 1.25);
    }
    get bytes(): number { return this.sheet.bytes + (this.high?.bytes || 0); }
    snapshot(detail = false): {
        ready: boolean;
        bytes: number;
        error: string;
    } {
        if (detail !== this.detail)
            return this.high?.snapshot(true) || { ready: false, bytes: 0, error: 'not-created' };
        return this.sheet.snapshot();
    }
    paintKey(graphics: LayaGraphics, key: string, detail = false): boolean {
        if (!this.enabled)
            return false;
        if (detail !== this.detail) {
            if (!detail)
                return false;
            this.high ??= new EnemyAtlas(true);
            return this.high.paintKey(graphics, key, detail);
        }
        return this.sheet.paint(graphics, key);
    }
    paint(graphics: LayaGraphics, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, detail: boolean): boolean {
        if (kind < 0 || kind >= 3)
            return false;
        return this.paintKey(graphics, `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}:${pose.key}`, detail);
    }
}
export function ordinaryAtlasFrames(detail = false) {
    const frames: {
        key: string;
        shapes: Shape[];
    }[] = [];
    for (let kind = 0; kind < 3; kind++) {
        const poses = [enemyArtPose({ kind, wind: 0 })];
        if (kind === 1)
            for (let i = 0; i < 8; i++) {
                poses.push(enemyArtPose({ kind, wind: .45 * (1 - (i + .5) / 8) }));
                poses.push(enemyArtPose({ kind, wind: 0, action: 'cast', actionTime: ENEMY_ACTION_SECONDS.cast * (1 - (i + .5) / 8) }));
            }
        for (const pose of poses)
            for (const color of ['normal', 'ice', 'flash'])
                frames.push({ key: `${kind}:${color}:${pose.key}`, shapes: enemyVisualShapes(kind, color === 'flash', color === 'ice', detail, pose) });
    }
    return frames;
}

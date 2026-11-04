import type { LayaGraphics } from '../platform/laya.js';
import { enemyArtPose, ENEMY_ACTION_SECONDS } from '../enemies/enemy-actions.js';
import { enemyVisualShapes, enemyPartPoint } from './voxel.js';
import type { Shape } from './voxel.js';
import { ShapeAtlas } from './shape-atlas.js';
import { actorAtlasFrames } from './painted-world.js';
import { enemyArt, enemyRaster } from './enemy-art.js';
import type { AtlasRaster } from './shape-atlas.js';
/** Depth sorted enemies, pillars and projectiles share the same GPU page. */
export class EnemyAtlas {
    enabled = true;
    private sheet: ShapeAtlas;
    private sourceRevision = 0;
    private artAttempted = false;
    private high?: EnemyAtlas;
    constructor(private readonly detail = false) {
        const image = enemyArt().image;
        this.sheet = new ShapeAtlas([...ordinaryAtlasFrames(detail, image), ...guardianAtlasFrames(detail, image), ...actorAtlasFrames()], image ? 1.1 : 1.25);
        this.sourceRevision = image && this.sheet.bytes ? 1 : 0;
        this.artAttempted = !!image;
    }
    get revision(): number {
        this.syncArt();
        return this.sourceRevision;
    }
    private syncArt(): void {
        if (this.artAttempted || !enemyArt().image)
            return;
        this.artAttempted = true;
        const next = new ShapeAtlas([...ordinaryAtlasFrames(this.detail, enemyArt().image), ...guardianAtlasFrames(this.detail, enemyArt().image), ...actorAtlasFrames()], 1.1);
        if (!next.bytes)
            return;
        this.sheet.destroy();
        this.high?.destroy();
        this.high = undefined;
        this.sheet = next;
        this.sourceRevision = 1;
    }
    private destroy(): void {
        this.sheet.destroy();
        this.high?.destroy();
    }
    get bytes(): number { return this.sheet.bytes + (this.high?.bytes || 0); }
    snapshot(detail = false): {
        ready: boolean;
        bytes: number;
        error: string;
    } {
        this.syncArt();
        if (detail !== this.detail && !this.revision)
            return this.high?.snapshot(true) || { ready: false, bytes: 0, error: 'not-created' };
        return this.sheet.snapshot();
    }
    paintKey(graphics: LayaGraphics, key: string, detail = false): boolean {
        if (!this.enabled)
            return false;
        if (detail !== this.detail && !this.revision) {
            if (!detail)
                return false;
            this.high ??= new EnemyAtlas(true);
            return this.high.paintKey(graphics, key, detail);
        }
        this.syncArt();
        return this.sheet.paint(graphics, key);
    }
    paint(graphics: LayaGraphics, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, detail: boolean, gait = 0): boolean {
        if (kind < 0 || kind > 4)
            return false;
        if (kind >= 3) {
            if (!this.enabled || !Laya.Matrix)
                return false;
            if (detail !== this.detail && !this.revision) {
                if (!detail)
                    return false;
                this.high ??= new EnemyAtlas(true);
                return this.high.paint(graphics, kind, flash, frozen, pose, detail);
            }
            const key = `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}`;
            this.syncArt();
            if (!this.sheet.paint(graphics, `${key}:body`))
                return false;
            for (const part of ['leftArm', 'rightArm'] as const) {
                const origin = enemyPartPoint(0, 0, part, kind, pose);
                const x = enemyPartPoint(1, 0, part, kind, pose), y = enemyPartPoint(0, 1, part, kind, pose);
                const matrix = new Laya.Matrix(x.x - origin.x, x.y - origin.y, y.x - origin.x, y.y - origin.y, origin.x, origin.y);
                this.sheet.paint(graphics, `${key}:${part}`, 0, 0, false, matrix);
            }
            return true;
        }
        const key = `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}:${pose.key}`;
        if (this.revision && kind !== 1 && this.paintKey(graphics, `${key}:gait:${gait}`, detail))
            return true;
        return this.paintKey(graphics, key, detail);
    }
}
/** Body and articulated arms share the ordinary actors' page; no pose/instance textures. */
export function guardianAtlasFrames(detail = false, image?: HTMLImageElement) {
    const frames: {
        key: string;
        shapes: Shape[];
        raster?: AtlasRaster;
    }[] = [];
    for (const kind of [3, 4])
        for (const color of ['normal', 'ice', 'flash']) {
            const shapes = enemyVisualShapes(kind, color === 'flash', color === 'ice', detail, enemyArtPose({ kind, wind: 0 }));
            for (const part of ['body', 'leftArm', 'rightArm'])
                frames.push({ key: `${kind}:${color}:${part}`, shapes: image ? [] : shapes.filter(s => part === 'body' ? !s.part : s.part === part), raster: image ? enemyRaster(image, kind, color === 'flash', color === 'ice', enemyArtPose({ kind, wind: 0 }), 0, part as 'body' | 'leftArm' | 'rightArm') : undefined });
        }
    return frames;
}
export function ordinaryAtlasFrames(detail = false, image?: HTMLImageElement) {
    const frames: {
        key: string;
        shapes: Shape[];
        raster?: AtlasRaster;
    }[] = [];
    for (let kind = 0; kind < 3; kind++) {
        const poses = [enemyArtPose({ kind, wind: 0 })];
        if (kind === 1)
            for (let i = 0; i < 8; i++) {
                poses.push(enemyArtPose({ kind, wind: .45 * (1 - (i + .5) / 8) }));
                poses.push(enemyArtPose({ kind, wind: 0, action: 'cast', actionTime: ENEMY_ACTION_SECONDS.cast * (1 - (i + .5) / 8) }));
            }
        for (const pose of poses)
            for (const color of ['normal', 'ice', 'flash']) {
                const key = `${kind}:${color}:${pose.key}`;
                if (image && kind !== 1) {
                    for (let gait = 0; gait < 4; gait++)
                        frames.push({ key: `${key}:gait:${gait}`, shapes: [], raster: enemyRaster(image, kind, color === 'flash', color === 'ice', pose, gait) });
                }
                else
                    frames.push({ key, shapes: image ? [] : enemyVisualShapes(kind, color === 'flash', color === 'ice', detail, pose), raster: image ? enemyRaster(image, kind, color === 'flash', color === 'ice', pose) : undefined });
            }
    }
    return frames;
}

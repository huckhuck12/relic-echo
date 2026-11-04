import type { LayaGraphics } from '../platform/laya.js';
import { enemyArtPose, ENEMY_ACTION_SECONDS } from '../enemies/enemy-actions.js';
import { enemyVisualShapes, enemyPartPoint } from './voxel.js';
import type { Shape } from './voxel.js';
import { ShapeAtlas } from './shape-atlas.js';
import { actorAtlasFrames } from './painted-world.js';
import { enemyArt, enemyRaster } from './enemy-art.js';
import { enemyView, enemyViewPartPoint } from './enemy-view.js';
import type { AtlasRaster } from './shape-atlas.js';
/** Depth sorted enemies, pillars and projectiles share one page.
 * 341 directional parts/palettes retain painted detail; transforms remain runtime geometry. */
export class EnemyAtlas {
    enabled = true;
    private sheet: ShapeAtlas;
    private sourceRevision = 0;
    private artAttempted = false;
    private high?: EnemyAtlas;
    constructor(private readonly detail = false) {
        const image = enemyArt().image;
        this.sheet = new ShapeAtlas([...ordinaryAtlasFrames(detail, image), ...guardianAtlasFrames(detail, image), ...actorAtlasFrames()], 1.25, image ? 2048 : 1024, !!image);
        this.sourceRevision = image && this.sheet.bytes ? 1 : 0;
        if (this.sourceRevision && Laya.Matrix)
            enemyArt().directionalReady = true;
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
        const next = new ShapeAtlas([...ordinaryAtlasFrames(this.detail, enemyArt().image), ...guardianAtlasFrames(this.detail, enemyArt().image), ...actorAtlasFrames()], 1.25, 2048, true);
        if (!next.bytes)
            return;
        this.sheet.destroy();
        this.high?.destroy();
        this.high = undefined;
        this.sheet = next;
        this.sourceRevision = 1;
        if (Laya.Matrix)
            enemyArt().directionalReady = true;
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
    paint(graphics: LayaGraphics, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, detail: boolean, gait = 0, facing = 1): boolean {
        if (kind < 0 || kind > 4)
            return false;
        if (kind >= 3 || (kind === 1 && this.revision)) {
            if (!this.enabled || !Laya.Matrix)
                return false;
            if (detail !== this.detail && !this.revision) {
                if (!detail)
                    return false;
                this.high ??= new EnemyAtlas(true);
                return this.high.paint(graphics, kind, flash, frozen, pose, detail, gait, facing);
            }
            this.syncArt();
            const directional = this.revision > 0, v = enemyView(facing);
            const key = `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}${directional ? ':view:' + v.view : ''}`;
            const parts = kind === 1 ? ['leftArm', 'body', 'staff', 'rightArm'] as const : directional && (v.view === 2 || v.view === 3) ? ['rightArm', 'body', 'leftArm'] as const : ['body', 'leftArm', 'rightArm'] as const;
            graphics.clear();
            for (const part of parts) {
                let matrix;
                if (part === 'body')
                    matrix = new Laya.Matrix(directional ? v.flip : 1, 0, 0, 1, 0, 0);
                else {
                    const point = (x: number, y: number) => directional ? enemyViewPartPoint(x, y, part, kind, pose, facing) : enemyPartPoint(x, y, part, kind, pose);
                    const origin = point(0, 0), x = point(1, 0), y = point(0, 1);
                    matrix = new Laya.Matrix(x.x - origin.x, x.y - origin.y, y.x - origin.x, y.y - origin.y, origin.x, origin.y);
                }
                if (!this.sheet.paint(graphics, `${key}:${part}`, 0, 0, false, matrix))
                    return false;
            }
            return true;
        }
        if (this.revision) {
            if (!this.enabled || !Laya.Matrix)
                return false;
            const v = enemyView(facing), key = `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}:idle:view:${v.view}:gait:${gait}`;
            return this.sheet.paint(graphics, key, 0, 0, true, new Laya.Matrix(v.flip, 0, 0, 1, 0, 0));
        }
        return this.paintKey(graphics, `${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}:${pose.key}`, detail);
    }
}
/** Body and articulated arms share the ordinary actors' page; no pose/instance textures. */
export function guardianAtlasFrames(detail = false, image?: HTMLImageElement) {
    const frames: {
        key: string;
        shapes: Shape[];
        raster?: AtlasRaster;
    }[] = [];
    if (image)
        return directionalPartFrames(image);
    for (const kind of [3, 4])
        for (const color of ['normal', 'ice', 'flash']) {
            const shapes = enemyVisualShapes(kind, color === 'flash', color === 'ice', detail, enemyArtPose({ kind, wind: 0 }));
            for (const part of ['body', 'leftArm', 'rightArm'])
                frames.push({ key: `${kind}:${color}:${part}`, shapes: shapes.filter(s => part === 'body' ? !s.part : s.part === part) });
        }
    return frames;
}
export function ordinaryAtlasFrames(detail = false, image?: HTMLImageElement) {
    const frames: {
        key: string;
        shapes: Shape[];
        raster?: AtlasRaster;
    }[] = [];
    if (image) {
        for (const kind of [0, 2])
            for (const color of ['normal', 'ice', 'flash'])
                for (let view = 0; view < 5; view++)
                    for (let gait = 0; gait < 4; gait++)
                        frames.push({ key: `${kind}:${color}:idle:view:${view}:gait:${gait}`, shapes: [], raster: enemyRaster(image, kind, color === 'flash', color === 'ice', enemyArtPose({ kind, wind: 0 }), gait, undefined, view) });
        return frames;
    }
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
                frames.push({ key, shapes: enemyVisualShapes(kind, color === 'flash', color === 'ice', detail, pose) });
            }
    }
    return frames;
}
function directionalPartFrames(image: HTMLImageElement) {
    const frames: {
        key: string;
        shapes: Shape[];
        raster: AtlasRaster;
    }[] = [];
    for (const kind of [1, 3, 4])
        for (const color of ['normal', 'ice', 'flash'])
            for (let view = 0; view < 5; view++) {
                const parts = kind === 1 ? ['body', 'leftArm', 'rightArm', 'staff'] as const : ['body', 'leftArm', 'rightArm'] as const;
                for (const part of parts)
                    frames.push({ key: `${kind}:${color}:view:${view}:${part}`, shapes: [], raster: enemyRaster(image, kind, color === 'flash', color === 'ice', enemyArtPose({ kind, wind: 0 }), 0, part, view) });
            }
    return frames;
}

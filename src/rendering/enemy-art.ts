import type { Shape } from './voxel.js';
import type { AtlasRaster, RasterLayer } from './shape-atlas.js';
import { enemyPartPoint } from './voxel.js';
import { oval } from './painted-art.js';
import { ENEMY_ART_FRAMES } from './enemy-art-frames.js';
import type { enemyArtPose } from '../enemies/enemy-actions.js';
/** One decoded source per engine; baked into the existing enemy/prop/projectile page. */
class EnemyArt {
    image?: HTMLImageElement;
    error = '';
    constructor() {
        try {
            const image = Laya.Browser?.createElement('img');
            if (!image || !('src' in image)) {
                this.error = 'enemy-art-unsupported';
                return;
            }
            image.onload = () => {
                image.onload = image.onerror = null;
                if (image.width === 1024 && image.height === 1024)
                    this.image = image;
                else
                    this.error = 'enemy-art-size';
            };
            image.onerror = () => {
                image.onload = image.onerror = null;
                this.error = 'enemy-art-load';
            };
            image.src = 'assets/enemies/ruin-creatures.png';
        }
        catch {
            this.error = 'enemy-art-unavailable';
        }
    }
}
const sources = new WeakMap<object, EnemyArt>();
export function enemyArt(): EnemyArt {
    let source = sources.get(Laya);
    if (!source) {
        source = new EnemyArt();
        sources.set(Laya, source);
    }
    return source;
}
export function enemyGaitFrame(kind: number, time: number, x = 0, y = 0, slowed = false): number {
    if (kind !== 0 && kind !== 2)
        return 0;
    return ((Math.floor(time * (slowed ? 3 : 6) + x * .017 + y * .023) % 4) + 4) % 4;
}
function cell(kind: number, column: number, size: number, x: number, y: number): RasterLayer {
    const crop = ENEMY_ART_FRAMES[kind * 4 + column];
    return {
        ...crop, x: x + (crop.sx - column * 192) / 192 * size, y: y + (crop.sy - kind * 192) / 192 * size, width: crop.sw / 192 * size, height: crop.sh / 192 * size
    };
}
function partLayer(kind: number, column: number, part: NonNullable<Shape['part']>, pose: ReturnType<typeof enemyArtPose>): RasterLayer {
    const b = kind === 4 ? 1.6 : 1;
    const layer = kind === 1
        ? part === 'staff' ? cell(kind, column, 64, -10, -62) : cell(kind, column, 24, (part === 'leftArm' ? -14 : 16) - 12, -41)
        : cell(kind, column, 40 * b, (part === 'leftArm' ? -32 : 33) * b - 20 * b, -59 * b);
    const o = enemyPartPoint(0, 0, part, kind, pose), x = enemyPartPoint(1, 0, part, kind, pose), y = enemyPartPoint(0, 1, part, kind, pose);
    layer.transform = {
        a: x.x - o.x, b: x.y - o.y, c: y.x - o.x, d: y.y - o.y, tx: o.x, ty: o.y
    };
    return layer;
}
/** Part coordinates remain in the old socket space, so warning/shot origins match animation. */
export function enemyRaster(source: HTMLImageElement, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, gait = 0, part?: 'body' | 'leftArm' | 'rightArm'): AtlasRaster {
    const size = kind === 0 ? 64 : kind === 1 ? 72 : kind === 2 ? 70 : kind === 4 ? 164 : 96;
    const body = cell(kind, kind === 0 || kind === 2 ? gait : 0, size, -size / 2, -size * 184 / 192);
    let layers: RasterLayer[] = [body];
    if (kind === 1)
        layers = [body, partLayer(kind, 1, 'leftArm', pose), partLayer(kind, 3, 'staff', pose), partLayer(kind, 2, 'rightArm', pose)];
    if (part && part !== 'body') {
        const b = kind === 4 ? 1.6 : 1;
        layers = [cell(kind, part === 'leftArm' ? 1 : 2, 40 * b, (part === 'leftArm' ? -32 : 33) * b - 20 * b, -59 * b)];
    }
    const shadow = !part || part === 'body';
    return {
        source, ...body, layers, behind: shadow ? [oval(0, 1, kind >= 3 ? size * .27 : kind === 1 ? 15 : 22, kind >= 3 ? 7 : 4, '#3d5848', '#3d5848')] : [], tint: flash ? '#fff5dc' : frozen ? '#8bcedf' : undefined, tintAlpha: flash ? .84 : .62
    };
}

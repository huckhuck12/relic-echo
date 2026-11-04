import type { Shape } from './voxel.js';
import type { AtlasRaster, RasterLayer } from './shape-atlas.js';
import { enemyPartPoint } from './voxel.js';
import { oval } from './painted-art.js';
import { ENEMY_DIRECTION_FRAMES } from './enemy-direction-frames.js';
import type { enemyArtPose } from '../enemies/enemy-actions.js';
/** One decoded source per engine; baked into the existing enemy/prop/projectile page. */
class EnemyArt {
    image?: HTMLImageElement;
    directionalReady = false;
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
function cell(kind: number, column: number, view = 1): RasterLayer {
    const crop = ENEMY_DIRECTION_FRAMES.find(f => f.kind === kind && f.part === column && f.view === view)!;
    const body = column === 0 || kind === 0 || kind === 2;
    const b = kind === 4 ? 1.6 : 1;
    const center = body ? 0 : kind === 1 ? column === 3 ? 22 : column === 1 ? -14 : 16 : (column === 1 ? -32 : 33) * b;
    const top = body ? -crop.height : kind === 1 ? column === 3 ? -62 : -41 : -59 * b;
    return {
        ...crop, x: center - crop.width / 2, y: top, width: crop.width, height: crop.height
    };
}
function partLayer(kind: number, column: number, part: NonNullable<Shape['part']>, pose: ReturnType<typeof enemyArtPose>, view = 1): RasterLayer {
    const layer = cell(kind, column, view);
    const o = enemyPartPoint(0, 0, part, kind, pose), x = enemyPartPoint(1, 0, part, kind, pose), y = enemyPartPoint(0, 1, part, kind, pose);
    layer.transform = {
        a: x.x - o.x, b: x.y - o.y, c: y.x - o.x, d: y.y - o.y, tx: o.x, ty: o.y
    };
    return layer;
}
/** Part coordinates remain in the old socket space, so warning/shot origins match animation. */
export function enemyRaster(source: HTMLImageElement, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, gait = 0, part?: 'body' | 'leftArm' | 'rightArm' | 'staff', view = 1): AtlasRaster {
    const size = kind === 0 ? 64 : kind === 1 ? 72 : kind === 2 ? 70 : kind === 4 ? 164 : 96;
    const body = cell(kind, kind === 0 || kind === 2 ? gait : 0, view);
    let layers: RasterLayer[] = [body];
    if (kind === 1)
        layers = [body, partLayer(kind, 1, 'leftArm', pose, view), partLayer(kind, 3, 'staff', pose, view), partLayer(kind, 2, 'rightArm', pose, view)];
    if (part && part !== 'body') {
        layers = [cell(kind, part === 'leftArm' ? 1 : part === 'staff' ? 3 : 2, view)];
    }
    if (part === 'body')
        layers = [body];
    const shadow = !part || part === 'body';
    return {
        source, ...body, layers, behind: shadow ? [oval(0, 1, kind >= 3 ? size * .27 : kind === 1 ? 15 : 22, kind >= 3 ? 7 : 4, '#3d5848', '#3d5848')] : [], tint: flash ? '#fff5dc' : frozen ? '#8bcedf' : undefined, tintAlpha: flash ? .84 : .62
    };
}

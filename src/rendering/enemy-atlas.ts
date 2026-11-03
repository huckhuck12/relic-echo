import type { LayaGraphics, LayaTexture, LayaTextureBitmap } from '../platform/laya.js';
import { enemyArtPose, ENEMY_ACTION_SECONDS } from '../enemies/enemy-actions.js';
import { enemyVisualShapes } from './voxel.js';
import type { Shape } from './voxel.js';
interface Tile {
    texture: LayaTexture;
    x: number;
    y: number;
    width: number;
    height: number;
}
/** One shared, bounded GPU atlas for ordinary enemies, including all caster action phases.
 * No per-enemy canvas/texture, downloads, readbacks or per-frame uploads. High detail stays vector.
 */
export class EnemyAtlas {
    enabled = true;
    private readonly tiles = new Map<string, Tile>();
    private bitmap: LayaTextureBitmap | undefined;
    private atlas: LayaTexture | undefined;
    bytes = 0;
    constructor() {
        const { Browser, Texture, Texture2D } = Laya;
        if (!Browser || !Texture || !Texture2D)
            return;
        let canvas: HTMLCanvasElement | undefined;
        try {
            const entries = ordinaryAtlasFrames();
            const width = 1024, scale = 2, padding = 2;
            let x = 0, y = 0, row = 0;
            const packed = entries.map(entry => {
                const bounds = shapeBounds(entry.shapes), w = (bounds.right - bounds.left) * scale + padding * 2, h = (bounds.bottom - bounds.top) * scale + padding * 2;
                if (x + w > width) {
                    x = 0;
                    y += row;
                    row = 0;
                }
                const tile = {
                    ...entry, ...bounds, x, y, w, h
                };
                x += w;
                row = Math.max(row, h);
                return tile;
            });
            const height = 2 ** Math.ceil(Math.log2(y + row));
            if (height > 2048)
                return;
            canvas = Browser.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context)
                return;
            for (const tile of packed) {
                context.setTransform(scale, 0, 0, scale, tile.x + padding - tile.left * scale, tile.y + padding - tile.top * scale);
                drawCanvasShapes(context, tile.shapes);
            }
            this.bitmap = new Texture2D(width, height, 1, false);
            this.bitmap.lock = true;
            this.bitmap.loadImageSource(canvas, true);
            const atlas = this.atlas = new Texture(this.bitmap);
            for (const tile of packed)
                this.tiles.set(tile.key, {
                    texture: Texture.createFromTexture(atlas, tile.x + padding, tile.y + padding, tile.w - padding * 2, tile.h - padding * 2),
                    x: tile.left, y: tile.top, width: tile.right - tile.left, height: tile.bottom - tile.top,
                });
            this.bytes = width * height * 4;
        }
        catch {
            for (const tile of this.tiles.values())
                tile.texture.destroy();
            this.tiles.clear();
            this.atlas?.destroy();
            this.atlas = undefined;
            this.bitmap?.destroy();
            this.bitmap = undefined;
        }
        finally {
            // Upload is synchronous. Release the native 2D backing store immediately.
            if (canvas) {
                canvas.width = 1;
                canvas.height = 1;
            }
        }
    }
    paint(graphics: LayaGraphics, kind: number, flash: boolean, frozen: boolean, pose: ReturnType<typeof enemyArtPose>, detail: boolean): boolean {
        if (!this.enabled || detail || !graphics.drawTexture)
            return false;
        const tile = this.tiles.get(`${kind}:${flash ? 'flash' : frozen ? 'ice' : 'normal'}:${pose.key}`);
        if (!tile)
            return false;
        graphics.clear();
        graphics.drawTexture(tile.texture, tile.x, tile.y, tile.width, tile.height);
        return true;
    }
}
export function ordinaryAtlasFrames() {
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
                frames.push({ key: `${kind}:${color}:${pose.key}`, shapes: enemyVisualShapes(kind, color === 'flash', color === 'ice', false, pose) });
    }
    return frames;
}
function shapeBounds(shapes: Shape[]) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const shape of shapes) {
        const p = shape.p, vertices = shape.type === 'rect' ? [p[0], p[1], p[0] + p[2], p[1] + p[3]] : p;
        for (let i = 0; i < vertices.length; i += 2) {
            left = Math.min(left, vertices[i]);
            right = Math.max(right, vertices[i]);
            top = Math.min(top, vertices[i + 1]);
            bottom = Math.max(bottom, vertices[i + 1]);
        }
    }
    return { left: Math.floor(left), top: Math.floor(top), right: Math.ceil(right), bottom: Math.ceil(bottom) };
}
function drawCanvasShapes(context: CanvasRenderingContext2D, shapes: Shape[]): void {
    for (const shape of shapes) {
        const p = shape.p;
        context.fillStyle = shape.fill;
        if (shape.type === 'rect')
            context.fillRect(p[0], p[1], p[2], p[3]);
        else if (shape.type === 'poly') {
            context.beginPath();
            context.moveTo(p[0], p[1]);
            for (let i = 2; i < p.length; i += 2)
                context.lineTo(p[i], p[i + 1]);
            context.closePath();
            context.fill();
        }
        else
            throw Error('Unsupported enemy atlas shape');
    }
}

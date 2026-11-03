import type { LayaGraphics, LayaTexture, LayaTextureBitmap } from '../platform/laya.js';
import type { Shape } from './voxel.js';
interface Tile {
    texture: LayaTexture;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface AtlasRaster {
    source: HTMLImageElement;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    x: number;
    y: number;
    width: number;
    height: number;
    behind: Shape[];
}
/** Shared, bounded GPU atlases for ordinary enemies, including all caster action phases.
 * High detail is created only on demand. No per-enemy textures or per-frame uploads.
 */
export class ShapeAtlas {
    enabled = true;
    private readonly tiles = new Map<string, Tile>();
    private bitmap: LayaTextureBitmap | undefined;
    private atlas: LayaTexture | undefined;
    private textureBytes = 0;
    private error = '';
    get bytes(): number { return this.textureBytes; }
    snapshot() { return { ready: this.textureBytes > 0, bytes: this.bytes, error: this.error }; }
    constructor(entries: {
        key: string;
        shapes: Shape[];
        raster?: AtlasRaster;
    }[], scale = 1.5, width = 1024) {
        const { Browser, Texture, Texture2D } = Laya;
        if (!Browser || !Texture || !Texture2D) {
            this.error = 'unsupported-engine';
            return;
        }
        let canvas: HTMLCanvasElement | undefined;
        try {
            // Tall frames first keep both quality sheets within 1024x1024.
            entries = entries.slice().sort((a, b) => {
                const ah = entryBounds(a), bh = entryBounds(b);
                return (bh.bottom - bh.top) - (ah.bottom - ah.top);
            });
            const padding = 2;
            let x = 0, y = 0, row = 0;
            const packed = entries.map(entry => {
                const bounds = entryBounds(entry), w = Math.ceil((bounds.right - bounds.left) * scale) + padding * 2, h = Math.ceil((bounds.bottom - bounds.top) * scale) + padding * 2;
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
            if (height > 2048) {
                this.error = 'atlas-budget';
                return;
            }
            canvas = Browser.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) {
                this.error = 'no-2d-context';
                return;
            }
            for (const tile of packed) {
                context.setTransform(scale, 0, 0, scale, tile.x + padding - tile.left * scale, tile.y + padding - tile.top * scale);
                if (tile.raster) {
                    const r = tile.raster;
                    drawCanvasShapes(context, r.behind);
                    context.drawImage(r.source, r.sx, r.sy, r.sw, r.sh, r.x, r.y, r.width, r.height);
                }
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
            this.textureBytes = width * height * 4;
        }
        catch (error) {
            this.error = String(error).slice(0, 160);
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
    paint(graphics: LayaGraphics, key: string, x = 0, y = 0, clear = true): boolean {
        if (!this.enabled || !graphics.drawTexture)
            return false;
        const tile = this.tiles.get(key);
        if (!tile)
            return false;
        if (clear)
            graphics.clear();
        graphics.drawTexture(tile.texture, x + tile.x, y + tile.y, tile.width, tile.height);
        return true;
    }
    destroy(): void {
        for (const tile of this.tiles.values())
            tile.texture.destroy();
        this.tiles.clear();
        this.atlas?.destroy();
        this.bitmap?.destroy();
        this.textureBytes = 0;
    }
}
function entryBounds(entry: {
    shapes: Shape[];
    raster?: AtlasRaster;
}) {
    if (!entry.raster)
        return shapeBounds(entry.shapes);
    const r = entry.raster;
    return shapeBounds([...entry.shapes, ...r.behind, { type: 'rect', p: [r.x, r.y, r.width, r.height], fill: '#000000' }]);
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
    return { left: Math.floor(left - 2), top: Math.floor(top - 2), right: Math.ceil(right + 2), bottom: Math.ceil(bottom + 2) };
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
            if (shape.line) {
                context.strokeStyle = shape.line;
                context.lineWidth = shape.width ?? 1;
                context.lineJoin = 'round';
                context.stroke();
            }
        }
        else
            throw Error('Unsupported enemy atlas shape');
    }
}

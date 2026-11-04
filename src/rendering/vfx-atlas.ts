import type { LayaGraphics, LayaTexture, LayaTextureBitmap } from '../platform/laya.js';
import type { Element } from '../buffs/buff-types.js';
export type VfxPart = 'projectile' | 'impact' | 'field' | 'focus';
const ELEMENTS: Element[] = ['fire', 'ice', 'lightning', 'force'];
const PARTS: VfxPart[] = ['projectile', 'impact', 'field', 'focus'];
/** One persistent 512x512 page per engine, shared by every weapon/Buff and quality level. */
class VfxAtlas {
    private readonly tiles: LayaTexture[] = [];
    private bitmap?: LayaTextureBitmap;
    private atlas?: LayaTexture;
    private error = '';
    get status() { return { ready: this.tiles.length === 16, bytes: this.bitmap ? 1048576 : 0, error: this.error }; }
    constructor() {
        try {
            if (!Laya.Browser || !Laya.Texture2D || !Laya.Texture) {
                this.error = 'unsupported-engine';
                return;
            }
            const image = Laya.Browser.createElement('img');
            image.onload = () => {
                image.onload = image.onerror = null;
                try {
                    if (image.width !== 512 || image.height !== 512)
                        throw Error('vfx-art-size');
                    this.bitmap = new Laya.Texture2D!(512, 512, 1, false);
                    this.bitmap.lock = true;
                    this.bitmap.loadImageSource(image, true);
                    this.atlas = new Laya.Texture!(this.bitmap);
                    for (let row = 0; row < 4; row++)
                        for (let col = 0; col < 4; col++)
                            this.tiles.push(Laya.Texture!.createFromTexture(this.atlas, col * 128, row * 128, 128, 128));
                }
                catch (error) {
                    for (const tile of this.tiles)
                        tile.destroy();
                    this.tiles.length = 0;
                    this.atlas?.destroy();
                    this.bitmap?.destroy();
                    this.bitmap = undefined;
                    this.error = String(error).slice(0, 120);
                }
                // The page is already uploaded; no source image is retained in the cache.
            };
            image.onerror = () => {
                image.onload = image.onerror = null;
                this.error = 'vfx-art-load';
            };
            image.src = 'assets/vfx/elements.png';
        }
        catch {
            this.error = 'vfx-art-unavailable';
        }
    }
    paint(g: LayaGraphics, part: VfxPart, element: Element, x: number, y: number, width: number, height = width, angle = 0, alpha = 1): boolean {
        const tile = this.tiles[PARTS.indexOf(part) * 4 + ELEMENTS.indexOf(element)];
        if (!tile || !g.drawTexture || (angle && !Laya.Matrix))
            return false;
        if (width <= 0 || height <= 0 || alpha <= 0)
            return true;
        if (angle) {
            const c = Math.cos(angle), s = Math.sin(angle);
            const matrix = new Laya.Matrix!(c, s, -s, c, x, y);
            g.drawTexture(tile, -width / 2, -height / 2, width, height, matrix, Math.min(1, alpha));
        }
        else
            g.drawTexture(tile, x - width / 2, y - height / 2, width, height, undefined, Math.min(1, alpha));
        return true;
    }
}
const pages = new WeakMap<object, VfxAtlas>();
const targets = new WeakMap<object, LayaGraphics>();
/** Layer-owned targets keep all textured accents together, with crisp vector bounds above. */
export function routeVfx(graphics: LayaGraphics, raster: LayaGraphics): void { targets.set(graphics, raster); }
export function vfxAtlas(): VfxAtlas | undefined {
    if (typeof Laya === 'undefined')
        return;
    let page = pages.get(Laya);
    if (!page) {
        page = new VfxAtlas();
        pages.set(Laya, page);
    }
    return page;
}
export function paintVfx(g: LayaGraphics, part: VfxPart, element: Element, x: number, y: number, width: number, height = width, angle = 0, alpha = 1): boolean {
    g = targets.get(g) || g;
    if (!g.drawTexture)
        return false;
    return vfxAtlas()?.paint(g, part, element, x, y, width, height, angle, alpha) || false;
}

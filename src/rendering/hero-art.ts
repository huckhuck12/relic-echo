/** One decoded source image per engine. It is composited offline from the render loop into PlayerAtlas. */
class HeroArt {
    image?: HTMLImageElement;
    error = '';
    private listeners: (() => void)[] = [];
    constructor() {
        try {
            const image = Laya.Browser?.createElement('img');
            if (!image || !('src' in image)) {
                this.error = 'hero-art-unsupported';
                return;
            }
            image.onload = () => {
                image.onload = image.onerror = null;
                if (image.width !== 1024 || image.height !== 1024)
                    this.error = 'hero-art-size';
                else
                    this.image = image;
                for (const callback of this.listeners.splice(0))
                    callback();
            };
            image.onerror = () => {
                image.onload = image.onerror = null;
                this.error = 'hero-art-load';
                for (const callback of this.listeners.splice(0))
                    callback();
            };
            image.src = 'assets/hero/ruin-apprentice.png';
        }
        catch {
            this.error = 'hero-art-unavailable';
        }
    }
    whenReady(callback: () => void): void {
        if (this.image || this.error)
            callback();
        else
            this.listeners.push(callback);
    }
}
const sources = new WeakMap<object, HeroArt>();
export function heroArt(): HeroArt {
    let art = sources.get(Laya);
    if (!art) {
        art = new HeroArt();
        sources.set(Laya, art);
    }
    return art;
}
/** Seven poses per direction: four walking, then anticipation / release / recovery. */
export function heroFrame(direction: number, pose: number) {
    const index = direction * 7 + pose;
    return {
        sx: index % 10 * 96, sy: Math.floor(index / 10) * 128, sw: 96, sh: 128,
        x: -32, y: -124 / 1.5, width: 64, height: 128 / 1.5
    };
}

import type { LayaSprite } from '../platform/laya.js';
import { platform } from '../platform/runtime.js';
interface Flash {
    node: LayaSprite;
    target: LayaSprite;
    started: number;
    duration: number;
    color: string;
}
/** UI 共用一条帧循环，最多 12 个矩形叠层，无滤镜/粒子；不改变命中区域或延迟选择回调。 */
export class UIEffects {
    private active: Flash[] = [];
    private readonly reduced = platform().reducedMotion();
    constructor() { Laya.timer.frameLoop(1, this, this.tick); }
    get count(): number { return this.active.length; }
    flash(target: LayaSprite, color: string, duration = 360): void {
        if (!target || this.reduced || platform().hidden())
            return;
        const existing = this.active.find(f => f.target === target);
        if (existing) {
            existing.started = platform().now();
            existing.color = color;
            return;
        }
        if (this.active.length >= 12)
            this.remove(this.active[0]);
        const node = new Laya.Sprite();
        node.mouseEnabled = false;
        node.name = 'ui-flash';
        target.addChild(node);
        const flash = {
            node, target, color, duration, started: platform().now()
        };
        this.active.push(flash);
        this.paint(flash, 0);
    }
    /** 销毁容器前取消整个子树的动画，避免引用旧卡片或旧 HUD。 */
    clear(root: LayaSprite): void {
        for (const flash of [...this.active]) {
            for (let p: LayaSprite | null = flash.target; p; p = p.parent) {
                if (p === root) {
                    this.remove(flash);
                    break;
                }
            }
        }
    }
    tick(now = platform().now()): void {
        if (!this.active.length)
            return;
        for (const flash of [...this.active]) {
            const t = (now - flash.started) / flash.duration;
            if (t >= 1 || !flash.target.parent || platform().hidden())
                this.remove(flash);
            else
                this.paint(flash, Math.max(0, t));
        }
    }
    private paint(f: Flash, t: number): void {
        const w = f.target.width, h = Math.max(6, f.target.height);
        f.node.alpha = (1 - t) * .18;
        f.node.graphics.clear();
        f.node.graphics.drawRect(1, 1, Math.max(1, w - 2), Math.max(2, h - 2), f.color);
    }
    private remove(flash: Flash): void {
        flash.node.destroy();
        this.active = this.active.filter(f => f !== flash);
    }
}

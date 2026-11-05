import type { LayaSprite } from '../platform/laya.js';
import { platform } from '../platform/runtime.js';
interface Flash {
    node: LayaSprite;
    target: LayaSprite;
    started: number;
    duration: number;
    color: string;
}
interface Entrance {
    panel: LayaSprite;
    shade: LayaSprite;
    x: number;
    y: number;
    started: number;
}
/** UI 共用一条帧循环，最多 12 个矩形叠层，无滤镜/粒子；不改变命中区域或延迟选择回调。 */
export class UIEffects {
    private active: Flash[] = [];
    private entrance: Entrance | null = null;
    private readonly reduced = platform().reducedMotion();
    constructor() { Laya.timer.frameLoop(1, this, this.tick); }
    get count(): number { return this.active.length; }
    get entering(): boolean { return !!this.entrance; }
    /** No input lock, extra node or timer. Scale starts above 1 so touch targets never shrink. */
    enter(panel: LayaSprite, shade: LayaSprite): void {
        this.finishEntrance();
        if (this.reduced || platform().hidden())
            return;
        this.entrance = {
            panel, shade, x: panel.x, y: panel.y, started: platform().now()
        };
        this.paintEntrance(0);
    }
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
        if (this.entrance) {
            for (let p: LayaSprite | null = this.entrance.panel; p; p = p.parent)
                if (p === root) {
                    this.finishEntrance();
                    break;
                }
        }
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
        if (!this.active.length && !this.entrance)
            return;
        if (this.entrance) {
            const t = Math.max(0, (now - this.entrance.started) / 180);
            if (t >= 1 || !this.entrance.panel.parent || this.entrance.panel.destroyed || platform().hidden())
                this.finishEntrance();
            else
                this.paintEntrance(t);
        }
        for (const flash of [...this.active]) {
            const t = (now - flash.started) / flash.duration;
            if (t >= 1 || !flash.target.parent || platform().hidden())
                this.remove(flash);
            else
                this.paint(flash, Math.max(0, t));
        }
    }
    private paintEntrance(t: number): void {
        const f = this.entrance!;
        const remaining = (1 - t) ** 3, scale = 1 + .012 * remaining;
        f.panel.pos(f.x - f.panel.width * (scale - 1) / 2, f.y + 6 * remaining - f.panel.height * (scale - 1) / 2);
        f.panel.scale(scale, scale);
        f.panel.alpha = 1 - .24 * remaining;
        f.shade.alpha = .9 - .22 * remaining;
    }
    private finishEntrance(): void {
        if (!this.entrance)
            return;
        const { panel, shade, x, y } = this.entrance;
        panel.pos(x, y);
        panel.scale(1, 1);
        panel.alpha = 1;
        shade.alpha = .9;
        this.entrance = null;
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

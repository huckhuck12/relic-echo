declare const Laya: any;
interface Flash {
    node: any;
    target: any;
    started: number;
    duration: number;
    color: string;
}
/** UI 共用一条帧循环，最多 12 个矩形叠层，无滤镜/粒子；不改变命中区域或延迟选择回调。 */
export class UIEffects {
    private active: Flash[] = [];
    private readonly reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    constructor() { Laya.timer.frameLoop(1, this, this.tick); }
    get count(): number { return this.active.length; }
    flash(target: any, color: string, duration = 360): void {
        if (!target || this.reduced || document.hidden)
            return;
        const existing = this.active.find(f => f.target === target);
        if (existing) {
            existing.started = performance.now();
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
            node, target, color, duration, started: performance.now()
        };
        this.active.push(flash);
        this.paint(flash, 0);
    }
    /** 销毁容器前取消整个子树的动画，避免引用旧卡片或旧 HUD。 */
    clear(root: any): void {
        for (const flash of [...this.active]) {
            for (let p = flash.target; p; p = p.parent) {
                if (p === root) {
                    this.remove(flash);
                    break;
                }
            }
        }
    }
    tick(now = performance.now()): void {
        if (!this.active.length)
            return;
        for (const flash of [...this.active]) {
            const t = (now - flash.started) / flash.duration;
            if (t >= 1 || !flash.target.parent || document.hidden)
                this.remove(flash);
            else
                this.paint(flash, Math.max(0, t));
        }
    }
    private paint(f: Flash, t: number): void {
        const w = f.target.width, h = Math.max(6, f.target.height);
        f.node.alpha = (1 - t) * .65;
        f.node.graphics.clear();
        f.node.graphics.drawRect(1, 1, Math.max(1, w - 2), Math.max(2, h - 2), null, f.color, 2);
        f.node.graphics.drawRect(Math.min(w - 10, w * t), 1, Math.min(10, w * .08), Math.max(2, h - 2), f.color);
    }
    private remove(flash: Flash): void {
        flash.node.destroy();
        this.active = this.active.filter(f => f !== flash);
    }
}

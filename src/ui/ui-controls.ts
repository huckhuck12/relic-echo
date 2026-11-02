import type { LayaSprite, LayaText, LayaEvent } from '../platform/laya.js';
export type LayaButton = LayaSprite & {
    caption: LayaText;
};
import type { Loadout } from '../shared/model.js';
import { UIEffects } from './ui-effects.js';
import { avatarShapes, drawShapes } from '../rendering/appearance.js';
export const C = {
    panel: '#1c2229', border: '#39414a', text: '#f1ede5', muted: '#a8adb3', mint: '#8fbeb0', gold: '#d8b77b',
    surface: '#242c35', ink: '#191d24'
};
/** 原生字体无需下载；iPhone 使用苹方，Android/桌面由系统选择中文黑体。 */
export const UI_FONT = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '') ? 'PingFang SC' : 'system-ui';
/**
 * 原生 Laya 控件工厂，仅负责显示节点与事件隔离，不读取 Game 或布局状态。
 * 所有尺寸为 UI 局部坐标，外层 GameUI 负责响应式重排。
 * 节点由调用方挂入容器，清理容器时一并销毁，不能放进战斗节点池。
 */
export class UIControls {
    readonly effects = new UIEffects();
    constructor(private readonly enableAudio: () => void) { }
    /** 空白区域允许点击穿透；承载具体按钮时由子节点处理输入。 */
    layer(parent: LayaSprite): LayaSprite {
        const node = new Laya.Sprite();
        node.mouseThrough = true;
        parent.addChild(node);
        return node;
    }
    clear(node: LayaSprite): void {
        this.effects.clear(node);
        node.destroyChildren();
        node.graphics.clear();
    }
    stopEvent(event: LayaEvent): void { event.stopPropagation(); }
    /** 阻止面板按下事件冒泡成场景移动指令。提示条需额外设置 mouseEnabled=false。 */
    block(node: LayaSprite): void {
        node.mouseEnabled = true;
        node.on(Laya.Event.MOUSE_DOWN, this, this.stopEvent);
    }
    panel(parent: LayaSprite, x: number, y: number, w: number, h: number, fill = C.panel, line = C.border): LayaSprite {
        const node = new Laya.Sprite();
        node.pos(x, y);
        node.size(w, h);
        node.graphics.drawRect(0, 0, w, h, fill, line, 1);
        parent.addChild(node);
        this.block(node);
        return node;
    }
    /** 文本不参与命中，点击整块按钮时不会被标签截住。 */
    text(parent: LayaSprite, value: string, x: number, y: number, w: number, size = 12, color = C.text, align = 'left'): LayaText {
        const label = new Laya.Text();
        label.text = value;
        label.font = UI_FONT;
        label.fontSize = size;
        label.color = color;
        label.width = w;
        label.wordWrap = true;
        label.leading = 5;
        label.bold = size >= 20;
        label.align = align;
        label.mouseEnabled = false;
        label.pos(x, y);
        parent.addChild(label);
        return label;
    }
    /** 点击先阻止冒泡、解锁用户手势音频，再执行动作；name 保持稳定供 UI 检查定位。 */
    button(parent: LayaSprite, label: string, x: number, y: number, w: number, h: number, action: () => void, primary = false, name = label): LayaButton {
        const node = this.panel(parent, x, y, w, h, primary ? C.gold : C.surface, primary ? C.gold : C.border);
        node.name = name;
        const caption = this.text(node, label, 8, (h - 20) / 2, w - 16, 13, primary ? C.ink : C.text, 'center');
        caption.bold = primary;
        node.on(Laya.Event.MOUSE_DOWN, this, () => this.effects.flash(node, C.text, 160));
        node.on(Laya.Event.CLICK, this, (event: LayaEvent) => {
            event.stopPropagation();
            this.enableAudio();
            action();
        });
        return Object.assign(node, { caption });
    }
    avatar(parent: LayaSprite, loadout: Loadout, x: number, y: number, scale = 1, back = false): LayaSprite {
        const node = new Laya.Sprite();
        drawShapes(node.graphics, avatarShapes(loadout, back));
        node.pos(x, y);
        node.scale(scale, scale);
        node.mouseEnabled = false;
        parent.addChild(node);
        return node;
    }
}

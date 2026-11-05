import type { LayaSprite, LayaText, LayaEvent } from '../platform/laya.js';
import { platform } from '../platform/runtime.js';
export type LayaButton = LayaSprite & {
    caption: LayaText;
};
import type { Loadout } from '../shared/model.js';
import { UIEffects } from './ui-effects.js';
import { avatarShapes, drawShapes } from '../rendering/appearance.js';
import { PlayerAtlas } from '../rendering/player-atlas.js';
import { heroArt } from '../rendering/hero-art.js';
export const C = {
    panel: '#eee5cd', border: '#8d927a', text: '#30443d', muted: '#64705e', mint: '#38624f', gold: '#86602d',
    surface: '#ded9bf', ink: '#fff4d7',
    hud: '#243d34', hudLine: '#73856b', hudText: '#f1e7cc', hudMuted: '#b5c2aa', hudGold: '#dbbd7e', hudMint: '#9ac8a3'
};
/** 原生字体无需下载；iPhone 使用苹方，Android/桌面由系统选择中文黑体。 */
export const UI_FONT = platform().font();
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
        const cut = Math.min(5, w / 8, h / 8);
        node.graphics.drawPoly(0, 0, [cut, 0, w - cut, 0, w, cut, w, h - cut, w - cut, h, cut, h, 0, h - cut, 0, cut], fill, line, 1);
        if (w > 140 && h > 70 && (fill === C.panel || fill === C.surface)) {
            node.graphics.drawLine(10, 5, w - 10, 5, '#fff7df', 1);
            node.graphics.drawLine(10, h - 5, w - 10, h - 5, '#c3b99a', 1);
        }
        parent.addChild(node);
        this.block(node);
        return node;
    }
    /** Compact field panels share one palette; decorative HUDs never intercept touch. */
    hudPanel(parent: LayaSprite, x: number, y: number, w: number, h: number): LayaSprite {
        const node = this.panel(parent, x, y, w, h, C.hud, C.hudLine);
        node.mouseEnabled = false;
        node.graphics.drawLine(10, 1, Math.min(w - 10, 44), 1, C.hudGold, 2);
        return node;
    }
    fieldButton(node: LayaButton, primary = false): void {
        const w = node.width, h = node.height, cut = 6;
        node.graphics.clear();
        node.graphics.drawPoly(0, 0, [cut, 0, w - cut, 0, w, cut, w, h - cut, w - cut, h, cut, h, 0, h - cut, 0, cut], primary ? '#395e49' : C.hud, primary ? C.hudGold : C.hudLine, 1);
        node.graphics.drawLine(10, h - 4, w - 10, h - 4, primary ? C.hudGold : '#536f59', 1);
        node.caption.color = primary ? C.ink : C.hudText;
    }
    /** Paper choices keep the entire card as one hit target, including its ornament. */
    choiceCard(node: LayaSprite, selected = false): void {
        const w = node.width, h = node.height, cut = 6;
        node.graphics.clear();
        node.graphics.drawPoly(0, 0, [cut, 0, w - cut, 0, w, cut, w, h - cut, w - cut, h, cut, h, 0, h - cut, 0, cut], selected ? '#e1e8d5' : '#f5eedb', selected ? C.mint : '#a5a78a', selected ? 2 : 1);
        node.graphics.drawLine(10, h - 5, w - 10, h - 5, selected ? '#8da283' : '#d5c9a8', 1);
        if (selected)
            node.graphics.drawRect(0, 9, 3, h - 18, C.mint);
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
        const button = Object.assign(node, { caption });
        if (label)
            this.fieldButton(button, primary);
        else
            this.choiceCard(button);
        return button;
    }
    avatar(parent: LayaSprite, loadout: Loadout, x: number, y: number, scale = 1, back = false): LayaSprite {
        const node = new Laya.Sprite();
        const atlas = new PlayerAtlas(true);
        const paint = () => {
            if (node.destroyed)
                return;
            if (!atlas.paint(node.graphics, loadout, { face: 1, back }, 0))
                drawShapes(node.graphics, avatarShapes(loadout, back));
        };
        // Previews own their generated equipment atlas; release it with the preview node.
        const destroy = node.destroy.bind(node);
        node.destroy = () => {
            atlas.destroy();
            destroy();
        };
        paint();
        if (!heroArt().image && !heroArt().error)
            heroArt().whenReady(paint);
        node.pos(x, y);
        node.scale(scale, scale);
        node.mouseEnabled = false;
        parent.addChild(node);
        return node;
    }
}

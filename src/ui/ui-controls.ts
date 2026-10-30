import type { Loadout } from '../shared/model.js';
import { avatarShapes, drawShapes } from '../rendering/appearance.js';
declare const Laya: any;
export const C = {
    panel: '#26372b', border: '#67765a', text: '#ede9d1', muted: '#acb99b', mint: '#a6dc80', gold: '#e8c975'
};
/**
 * 原生 Laya 控件工厂，仅负责显示节点与事件隔离，不读取 Game 或布局状态。
 * 所有尺寸为 UI 局部坐标，外层 GameUI 负责响应式重排。
 * 节点由调用方挂入容器，清理容器时一并销毁，不能放进战斗节点池。
 */
export class UIControls {
    constructor(private readonly enableAudio: () => void) { }
    /** 空白区域允许点击穿透；承载具体按钮时由子节点处理输入。 */
    layer(parent: any): any {
        const node = new Laya.Sprite();
        node.mouseThrough = true;
        parent.addChild(node);
        return node;
    }
    clear(node: any): void {
        node.destroyChildren();
        node.graphics.clear();
    }
    stopEvent(event: any): void { event.stopPropagation(); }
    /** 阻止面板按下事件冒泡成场景移动指令。提示条需额外设置 mouseEnabled=false。 */
    block(node: any): void {
        node.mouseEnabled = true;
        node.on(Laya.Event.MOUSE_DOWN, this, this.stopEvent);
    }
    panel(parent: any, x: number, y: number, w: number, h: number, fill = C.panel, line = C.border): any {
        const node = new Laya.Sprite();
        node.pos(x, y);
        node.size(w, h);
        node.graphics.drawRect(0, 0, w, h, fill, line, 1);
        parent.addChild(node);
        this.block(node);
        return node;
    }
    /** 文本不参与命中，点击整块按钮时不会被标签截住。 */
    text(parent: any, value: string, x: number, y: number, w: number, size = 12, color = C.text, align = 'left'): any {
        const label = new Laya.Text();
        label.text = value;
        label.font = 'Microsoft YaHei';
        label.fontSize = size;
        label.color = color;
        label.width = w;
        label.wordWrap = true;
        label.leading = 6;
        label.align = align;
        label.mouseEnabled = false;
        label.pos(x, y);
        parent.addChild(label);
        return label;
    }
    /** 点击先阻止冒泡、解锁用户手势音频，再执行动作；name 保持稳定供 UI 检查定位。 */
    button(parent: any, label: string, x: number, y: number, w: number, h: number, action: () => void, primary = false, name = label): any {
        const node = this.panel(parent, x, y, w, h, primary ? C.mint : '#1b333c', primary ? '#c5efcf' : C.border);
        node.name = name;
        this.text(node, label, 8, (h - 18) / 2, w - 16, 12, primary ? '#18352c' : C.text, 'center');
        node.on(Laya.Event.CLICK, this, (event: any) => {
            event.stopPropagation();
            this.enableAudio();
            action();
        });
        return node;
    }
    avatar(parent: any, loadout: Loadout, x: number, y: number, scale = 1, back = false): any {
        const node = new Laya.Sprite();
        drawShapes(node.graphics, avatarShapes(loadout, back));
        node.pos(x, y);
        node.scale(scale, scale);
        node.mouseEnabled = false;
        parent.addChild(node);
        return node;
    }
}

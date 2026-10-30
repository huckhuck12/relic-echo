import { KEY_CODES, WORLD_RULES } from '../game/game-config.js';
import { clamp, screenInput } from '../shared/model.js';
import type { Player } from '../shared/entities.js';
declare const Laya: any;
const LIMIT = WORLD_RULES.limit;
/** 只阻止会滚动页面的游戏按键；移动键另用于取消鼠标目标。 */
const PREVENT_DEFAULT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** 输入只读取当前角色和相机；菜单、暂停与战斗行为通过语义回调进入 Game。 */
export interface InputHost {
    active(): boolean;
    inBattle(): boolean;
    player(): Player;
    pillars(): readonly {
        x: number;
        y: number;
    }[];
    screenToWorld(x: number, y: number): {
        x: number;
        y: number;
    };
    enableAudio(): void;
    dash(): void;
    toggleBuffs(): void;
    toggleInventory(): void;
    togglePerformance(): void;
    togglePause(): void;
}
/** 键鼠/摇杆状态只有一个所有者；输出统一的世界方向，不直接移动角色。 */
export class InputController {
    readonly keys = new Set<string>();
    stick = { x: 0, y: 0 };
    mouseTarget: {
        x: number;
        y: number;
    } | null = null;
    mouseHeld = false;
    private mouseScreen = { x: 0, y: 0 };
    constructor(private readonly host: InputHost) { }
    /** Laya 初始化后绑定一次；事件 caller 使用控制器自身，保证方法中的 this 正确。 */
    bind(): void {
        Laya.stage.on(Laya.Event.KEY_DOWN, this, (event: any) => {
            const e = event.nativeEvent, code = this.keyCode(event);
            if (PREVENT_DEFAULT_KEYS.has(code))
                e?.preventDefault?.();
            if (e?.repeat || this.keys.has(code))
                return;
            this.keys.add(code);
            if (MOVEMENT_KEYS.has(code))
                this.clearMouse();
            if (code === 'Space')
                this.host.dash();
            if (code === 'KeyB' && this.host.inBattle())
                this.host.toggleBuffs();
            if (code === 'KeyE' && this.host.inBattle())
                this.host.toggleInventory();
            if (code === 'KeyP')
                this.host.togglePerformance();
            if (code === 'Escape' && this.host.inBattle())
                this.host.togglePause();
        });
        Laya.stage.on(Laya.Event.KEY_UP, this, (event: any) => this.keys.delete(this.keyCode(event)));
        Laya.stage.on(Laya.Event.MOUSE_DOWN, this, this.mouseDown);
        Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.mouseMove);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, () => { this.mouseHeld = false; });
        Laya.stage.on(Laya.Event.MOUSE_OUT, this, (event: any) => {
            if (event.target === Laya.stage)
                this.clearMouse();
        });
    }
    /** 模态打开或失焦时清除所有输入；不会保留按住的方向。 */
    reset(): void {
        this.clearMouse();
        this.keys.clear();
        this.stick = { x: 0, y: 0 };
    }
    /** 摇杆优先于鼠标寻点，屏幕方向在 movement 中统一反投影。 */
    setStick(x: number, y: number): void {
        this.stick = { x, y };
        if (x || y)
            this.clearMouse();
    }
    private keyCode(event: any): string { return event.nativeEvent?.code || KEY_CODES[event.keyCode] || ''; }
    private overUI(target: any): boolean {
        for (let node = target; node; node = node.parent)
            if (node.name === 'game-ui')
                return true;
        return false;
    }
    mouseDown(event: any): void {
        if (!this.host.active() || this.overUI(event.target))
            return;
        this.mouseHeld = true;
        this.mouseScreen = { x: Laya.stage.mouseX, y: Laya.stage.mouseY };
        this.setMouseTarget();
        this.host.enableAudio();
    }
    mouseMove(event: any): void {
        if (!this.mouseHeld)
            return;
        if (this.overUI(event.target)) {
            this.clearMouse();
            return;
        }
        this.mouseScreen = { x: Laya.stage.mouseX, y: Laya.stage.mouseY };
    }
    /** 屏幕点反投影后限制世界边界并推出柱子；这里只修正落点，不负责寻路。 */
    private setMouseTarget(): void {
        const point = this.host.screenToWorld(this.mouseScreen.x, this.mouseScreen.y);
        let x = clamp(point.x, -LIMIT, LIMIT), y = clamp(point.y, -LIMIT, LIMIT);
        for (const pillar of this.host.pillars()) {
            const dx = x - pillar.x, dy = y - pillar.y, d = Math.hypot(dx, dy);
            if (d < WORLD_RULES.mousePillarRadius) {
                x = pillar.x + (d ? dx / d : 1) * WORLD_RULES.mousePillarRadius;
                y = pillar.y + (d ? dy / d : 0) * WORLD_RULES.mousePillarRadius;
            }
        }
        this.mouseTarget = { x, y };
    }
    clearMouse(): void {
        this.mouseHeld = false;
        this.mouseTarget = null;
    }
    /** 键盘/摇杆优先；按住鼠标时随相机重新反投影，松开后继续走向原落点。 */
    movement(): {
        x: number;
        y: number;
    } {
        let x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.stick.x;
        let y = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) + this.stick.y;
        if (Math.hypot(x, y) >= .08) {
            this.clearMouse();
            return screenInput(x, y);
        }
        if (this.mouseHeld)
            this.setMouseTarget();
        if (this.mouseTarget) {
            const dx = this.mouseTarget.x - this.host.player().x, dy = this.mouseTarget.y - this.host.player().y, d = Math.hypot(dx, dy);
            if (d > 5)
                return { x: dx / d, y: dy / d };
            if (!this.mouseHeld)
                this.mouseTarget = null;
        }
        return { x: 0, y: 0 };
    }
}

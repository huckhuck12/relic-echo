import type { Game } from '../game/game.js';
import type { ScreenLayout } from './layout.js';
import { UIControls } from './ui-controls.js';
import { mobileHUDLayout, TOUCH_UI } from './hud-layout.js';
declare const Laya: any;
/** 只拥有摇杆节点和首指身份。实例仅绑定一次舞台事件，重排先释放旧触点。 */
export class TouchStick {
    joystick: any;
    knob: any;
    stickTouch: number | null = null;
    stickOrigin = { x: 0, y: 0 };
    constructor(private readonly game: Game, private readonly controls: UIControls, private readonly root: any) {
        Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.dragStick);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.release);
        Laya.stage.on(Laya.Event.MOUSE_OUT, this, (e: any) => {
            if (e.target === Laya.stage)
                this.release();
        });
    }
    build(parent: any, layout: ScreenLayout, mobile: boolean): void {
        this.release();
        const position = mobileHUDLayout(layout);
        this.joystick = this.controls.layer(parent);
        this.joystick.pos(position.stickX, position.stickY);
        this.joystick.name = 'touch-stick';
        this.joystick.size(112, 112);
        this.joystick.pivot(56, 56);
        this.joystick.graphics.drawCircle(56, 56, 55, '#17362f', '#5e9a89', 1);
        this.joystick.alpha = .7;
        this.joystick.visible = mobile;
        this.controls.block(this.joystick);
        this.knob = this.controls.layer(this.joystick);
        this.knob.graphics.drawCircle(0, 0, 20, '#8dc9ae', '#d7f1d7', 1);
        this.knob.pos(56, 56);
        this.joystick.on(Laya.Event.MOUSE_DOWN, this, (e: any) => {
            e.stopPropagation();
            if (this.stickTouch !== null || this.game.gate.paused || this.game.mode !== 'battle')
                return;
            this.stickTouch = e.touchId ?? 0;
            const p = this.joystick.localToGlobal(new Laya.Point(56, 56));
            this.stickOrigin = { x: p.x, y: p.y };
            this.dragStick(e);
        });
    }
    private dragStick(e: any): void {
        if (this.stickTouch === null || (e.touchId ?? 0) !== this.stickTouch)
            return;
        if (this.game.gate.paused) {
            this.release();
            return;
        }
        const scale = this.root.scaleX, dx = (Laya.stage.mouseX - this.stickOrigin.x) / scale, dy = (Laya.stage.mouseY - this.stickOrigin.y) / scale, d = Math.hypot(dx, dy), ratio = Math.min(1, TOUCH_UI.stickTravel / (d || 1));
        this.knob.pos(56 + dx * ratio, 56 + dy * ratio);
        // 中心留 6px 死区，避免拇指自然抖动触发满速移动；超出后按屏幕方向走。
        this.game.setStick(d <= TOUCH_UI.stickDeadZone ? 0 : dx * ratio / TOUCH_UI.stickTravel, d <= TOUCH_UI.stickDeadZone ? 0 : dy * ratio / TOUCH_UI.stickTravel);
    }
    release(e?: any): void {
        if (e && this.stickTouch !== null && (e.touchId ?? 0) !== this.stickTouch)
            return;
        this.stickTouch = null;
        this.game.setStick(0, 0);
        if (this.knob)
            this.knob.pos(56, 56);
    }
}

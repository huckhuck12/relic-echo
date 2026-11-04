import type { LayaSprite, LayaEvent } from '../platform/laya.js';
import type { Game } from '../game/game.js';
import type { ScreenLayout } from './layout.js';
import { UIControls, C } from './ui-controls.js';
import { mobileHUDLayout, TOUCH_UI } from './hud-layout.js';
import { clamp } from '../shared/model.js';
/** 只拥有摇杆节点和首指身份。实例仅绑定一次舞台事件，重排先释放旧触点。 */
export class TouchStick {
    joystick!: LayaSprite;
    knob!: LayaSprite;
    activation!: LayaSprite;
    stickTouch: number | null = null;
    stickOrigin = { x: 0, y: 0 };
    private home = { x: 0, y: 0 };
    private direction = { x: 0, y: 0 };
    private suspended = false;
    private limits = { left: 0, right: 0, top: 0, bottom: 0 };
    constructor(private readonly game: Game, private readonly controls: UIControls, private readonly root: LayaSprite) {
        Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.dragStick);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.release);
        Laya.stage.on(Laya.Event.MOUSE_OUT, this, (e: LayaEvent) => {
            if (e.target === Laya.stage && e.nativeEvent?.type === 'mouseout')
                this.release();
        });
    }
    build(parent: LayaSprite, layout: ScreenLayout, mobile: boolean): void {
        this.release();
        const position = mobileHUDLayout(layout);
        const radius = TOUCH_UI.stickSize / 2;
        this.home = { x: position.stickX, y: position.stickY };
        this.limits = {
            left: layout.margin + radius,
            right: Math.max(layout.margin + radius, Math.min(layout.width * .48, position.dashX - TOUCH_UI.actionGap - radius)),
            top: position.stickAreaY + radius,
            bottom: position.stickAreaBottom - radius,
        };
        // 透明触控区只覆盖左下，位于按钮/弹窗下层；右手不会接管移动。
        this.activation = this.controls.layer(parent);
        this.activation.name = 'touch-stick-area';
        this.activation.pos(position.stickAreaX, position.stickAreaY);
        this.activation.size(position.stickAreaWidth, position.stickAreaBottom - position.stickAreaY);
        this.activation.visible = mobile;
        this.activation.mouseThrough = false;
        this.controls.block(this.activation);
        this.activation.on(Laya.Event.MOUSE_DOWN, this, this.begin);
        this.joystick = this.controls.layer(parent);
        this.joystick.pos(position.stickX, position.stickY);
        this.joystick.name = 'touch-stick';
        this.joystick.size(TOUCH_UI.stickSize, TOUCH_UI.stickSize);
        this.joystick.pivot(radius, radius);
        this.joystick.graphics.drawCircle(radius, radius, radius - 1, C.panel, C.border, 1);
        this.joystick.alpha = .4;
        this.joystick.visible = mobile;
        this.controls.block(this.joystick);
        this.knob = this.controls.layer(this.joystick);
        this.knob.graphics.drawCircle(0, 0, 26, C.muted, C.text, 1);
        this.knob.pos(radius, radius);
        this.joystick.on(Laya.Event.MOUSE_DOWN, this, this.begin);
    }
    /** 每次落指重设中心；边缘只约束底盘显示，按下瞬间不让角色突然走动。 */
    private begin(e: LayaEvent): void {
        e.stopPropagation();
        if (this.stickTouch !== null || this.game.gate.paused || this.game.mode !== 'battle')
            return;
        this.stickTouch = e.touchId ?? 0;
        this.stickOrigin = { x: Laya.stage.mouseX, y: Laya.stage.mouseY };
        const x = (this.stickOrigin.x - this.root.x) / this.root.scaleX;
        const y = (this.stickOrigin.y - this.root.y) / this.root.scaleY;
        this.joystick.pos(clamp(x, this.limits.left, this.limits.right), clamp(y, Math.min(this.limits.top, this.limits.bottom), this.limits.bottom));
        this.joystick.alpha = .75;
        this.game.setStick(0, 0);
    }
    private dragStick(e: LayaEvent): void {
        if (this.stickTouch === null || (e.touchId ?? 0) !== this.stickTouch)
            return;
        if (this.game.gate.paused && !this.rewardOpen()) {
            this.release();
            return;
        }
        const scale = this.root.scaleX, dx = (Laya.stage.mouseX - this.stickOrigin.x) / scale, dy = (Laya.stage.mouseY - this.stickOrigin.y) / scale, d = Math.hypot(dx, dy), ratio = Math.min(1, TOUCH_UI.stickTravel / (d || 1));
        const radius = TOUCH_UI.stickSize / 2;
        this.knob.pos(radius + dx * ratio, radius + dy * ratio);
        // 中心留 6px 死区，避免拇指自然抖动触发满速移动；超出后按屏幕方向走。
        this.direction = { x: d <= TOUCH_UI.stickDeadZone ? 0 : dx * ratio / TOUCH_UI.stickTravel, y: d <= TOUCH_UI.stickDeadZone ? 0 : dy * ratio / TOUCH_UI.stickTravel };
        this.game.setStick(this.game.gate.paused ? 0 : this.direction.x, this.game.gate.paused ? 0 : this.direction.y);
    }
    private rewardOpen(): boolean {
        return this.game.gate.pausedOnlyBy('dialog') && !!this.game.dialog && ['upgrade', 'fragment', 'drop', 'build', 'branch'].includes(this.game.dialog.type);
    }
    /** 奖励只暂停移动，仍按住的左指在最后一张卡领取后继续；失焦/菜单必须释放。 */
    sync(): void {
        if (this.game.mode !== 'battle' || (this.game.gate.paused && !this.rewardOpen())) {
            this.release();
            return;
        }
        if (this.game.gate.paused) {
            this.suspended = true;
            this.game.setStick(0, 0);
        }
        else if (this.suspended) {
            this.suspended = false;
            if (this.stickTouch !== null)
                this.game.setStick(this.direction.x, this.direction.y);
        }
    }
    release(e?: LayaEvent): void {
        if (e && this.stickTouch !== null && (e.touchId ?? 0) !== this.stickTouch)
            return;
        this.stickTouch = null;
        this.direction = { x: 0, y: 0 };
        this.suspended = false;
        this.game.setStick(0, 0);
        if (this.knob && !this.knob.destroyed)
            this.knob.pos(TOUCH_UI.stickSize / 2, TOUCH_UI.stickSize / 2);
        if (this.joystick && !this.joystick.destroyed) {
            this.joystick.pos(this.home.x, this.home.y);
            this.joystick.alpha = .4;
        }
    }
}

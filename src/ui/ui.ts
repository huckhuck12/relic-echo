import { BattleHUD } from './battle-hud.js';
import { UIControls, C } from './ui-controls.js';
import { GameDialogs } from './ui-dialogs.js';
import type { BuffEditorState } from './buff-panel.js';
import { Game } from '../game/game.js';
import { ScreenLayout, screenLayout } from './layout.js';
import { mobileHUDLayout, TOUCH_UI } from './hud-layout.js';
import { readSafeArea } from '../platform/safe-area.js';
declare const Laya: any;
/**
 * UI 编排层：组装 HUD/弹窗，控制模态缓存、诊断与短提示的层序。
 * 战斗节点和缓存归 BattleHUD，摇杆触点归 TouchStick；布局变化通过 resize 原子重建。
 * 公共节点由 UIControls 创建，所有弹窗交给 GameDialogs，Buff 编辑页再委托独立面板。
 * 只通过 Game 的动作入口修改玩法，不能分别赋值 dialog/mode/gate。
 */
export class GameUI {
    readonly root: any;
    private readonly hudView: BattleHUD;
    private dialogs: any;
    private performancePanel: any;
    private performanceLabel: any;
    private toastNode: any;
    private toastLabel: any;
    /** 仅保存正在编辑哪条配方/哪个槽位；实际配方与冷却属于 BuffRuntime。 */
    private readonly buffEditor: BuffEditorState = { slot: 0, picker: null };
    private readonly controls = new UIControls(() => this.game.enableAudio());
    /** 只有内容或布局改变才重建弹窗，避免每帧销毁按钮导致输入丢失。 */
    private modalKey = '';
    private toastExpiry = 0;
    private readonly dialogRenderer: GameDialogs;
    private mobile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    private layout: ScreenLayout = screenLayout(1280, 720);
    constructor(private game: Game) {
        this.root = new Laya.Sprite();
        this.root.name = 'game-ui';
        this.root.size(1280, 720);
        this.root.mouseThrough = true;
        this.root.zOrder = 1000000;
        Laya.stage.addChild(this.root);
        this.hudView = new BattleHUD(this.game, this.controls, this.root, () => {
            this.buffEditor.picker = null;
            this.game.toggleBuffs();
        });
        this.performancePanel = this.controls.button(this.root, '', 0, 0, 104, 44, () => this.game.openPerformance(), false, 'performance-panel');
        this.performancePanel.name = 'performance-panel';
        // 小条点击后暂停查看细节；仍位于模态遮罩下面。
        this.performanceLabel = this.text(this.performancePanel, '', 4, 14, 96, 10, C.mint, 'center');
        this.dialogs = this.layer(this.root);
        this.dialogRenderer = new GameDialogs(this.game, this.dialogs, this.controls, this.buffEditor, {
            invalidate: () => { this.modalKey = ''; },
            refresh: () => {
                this.modalKey = '';
                this.update();
            },
            toast: message => this.toast(message),
            equipment: (...args) => this.hudView.equipment(...args),
        });
        // Toasts sit above dialogs, so they must never take part in mouse hit testing.
        this.toastNode = this.panel(this.root, 400, 585, 480, 45);
        this.toastNode.mouseEnabled = false;
        this.toastLabel = this.text(this.toastNode, '', 14, 12, 452, 13, C.gold, 'center');
        this.toastNode.visible = false;
        this.resize();
        Laya.stage.on(Laya.Event.RESIZE, this, this.resize);
        this.game.onChange = () => this.update();
        this.game.onToast = message => this.toast(message);
        this.update();
    }
    private layer(...args: Parameters<UIControls['layer']>): ReturnType<UIControls['layer']> { return this.controls.layer(...args); }
    private panel(...args: Parameters<UIControls['panel']>): ReturnType<UIControls['panel']> { return this.controls.panel(...args); }
    private text(...args: Parameters<UIControls['text']>): ReturnType<UIControls['text']> { return this.controls.text(...args); }
    /** 旋转/缩放后重排 HUD 与当前弹窗；先释放摇杆，防止旧触点持续移动。 */
    private resize(): void {
        this.hudView.stick.release();
        const safe = this.mobile ? readSafeArea() : { top: 0, right: 0, bottom: 0, left: 0 };
        this.layout = screenLayout(Laya.stage.width - safe.left - safe.right, Laya.stage.height - safe.top - safe.bottom, this.mobile);
        const { width, height, scale, margin } = this.layout;
        this.root.scale(scale, scale);
        this.root.pos(safe.left, safe.top);
        this.root.size(width, height);
        this.game.gate.remove('orientation');
        this.game.cancelMouseMovement();
        this.hudView.resize(this.layout, this.mobile);
        // 底部中央位于摇杆和冲刺之间，详细指标不再常驻遮挡战斗。
        const perfWidth = this.mobile ? Math.min(104, Math.max(44, width - 2 * margin - TOUCH_UI.stickSize - TOUCH_UI.dashWidth - 8)) : 104;
        const perfX = this.mobile ? margin + TOUCH_UI.stickSize + (width - 2 * margin - TOUCH_UI.stickSize - TOUCH_UI.dashWidth - perfWidth) / 2 : (width - perfWidth) / 2;
        this.performancePanel.pos(perfX, height - margin - 44);
        this.performancePanel.size(perfWidth, 44);
        this.performancePanel.graphics.clear();
        this.performancePanel.graphics.drawRect(0, 0, perfWidth, 44, '#1b333c', C.border, 1);
        this.performanceLabel.width = perfWidth - 8;
        this.performanceLabel.y = perfWidth < 90 ? 5 : 14;
        const mobileLayout = mobileHUDLayout(this.layout);
        const toastWidth = this.mobile ? mobileLayout.toastWidth : Math.min(480, width - 2 * margin);
        // 手机提示条放在整组触控按钮上方，不覆盖 Buff 按钮和摇杆。
        const toastHeight = this.mobile ? 44 : 54;
        this.toastNode.pos(this.mobile && !this.layout.portrait ? width - margin - toastWidth : (width - toastWidth) / 2, this.mobile ? mobileLayout.toastY : height - margin - 145);
        this.toastNode.size(toastWidth, toastHeight);
        this.toastNode.graphics.clear();
        this.toastNode.graphics.drawRect(0, 0, toastWidth, toastHeight, C.panel, C.border, 1);
        this.toastLabel.width = toastWidth - 28;
        this.toastLabel.fontSize = 12;
        this.toastLabel.y = this.mobile ? 6 : 12;
        this.toastLabel.leading = this.mobile ? 4 : 6;
        this.toastLabel.height = this.mobile ? 32 : 42;
        this.toastLabel.overflow = 'hidden';
        this.modalKey = '';
        this.update();
    }
    private update(): void {
        const s = this.game.snapshot();
        this.hudView.update(s);
        this.performancePanel.visible = this.game.showPerformance && this.game.mode === 'battle' && !this.game.dialog;
        if (this.performancePanel.visible) {
            const p = this.game.performanceSnapshot();
            const separator = this.performancePanel.width < 90 ? '\n' : ' · ';
            const value = `${p.samples ? `${p.fps.toFixed(0)} FPS` : '采样中'}${separator}详情`;
            if (this.performanceLabel.text !== value)
                this.performanceLabel.text = value;
        }
        this.toastNode.visible = !this.game.dialog && performance.now() < this.toastExpiry;
        const key = JSON.stringify(this.game.dialog) + (this.game.dialog?.type === 'revive' ? `${this.game.revival.busy}:${this.game.reviveMessage}` : '') + (this.game.dialog?.type === 'buffs' ? JSON.stringify(this.game.buffs.recipes) + this.game.buffs.recipes.map(r => this.game.buffs.levelOf(r)).join(',') + [...this.game.buffs.owned].join(',') + this.buffEditor.slot + this.buffEditor.picker : '') + (this.game.dialog?.type === 'inventory' ? JSON.stringify(s.loadout) + this.game.previewBack : '');
        // 流程状态只通过 Game 的语义入口修改；这里按最终弹窗数据重建显示树。
        if (key !== this.modalKey) {
            this.modalKey = key;
            this.hudView.stick.release();
            this.dialogRenderer.render(this.game.dialog, this.layout, this.mobile);
        }
    }
    private toast(message: string): void {
        this.toastLabel.text = message;
        this.toastExpiry = performance.now() + (this.mobile ? TOUCH_UI.toastDuration : 3200);
        this.toastNode.visible = !this.game.dialog;
    }
}

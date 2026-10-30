import { UIControls, C } from './ui-controls.js';
import { GameDialogs } from './ui-dialogs.js';
import type { BuffEditorState } from './buff-panel.js';
import { complete } from '../buffs/buffs.js';
import { Game, Snapshot } from '../game/game.js';
import { COMBAT, ELITE_TIMES, QUALITY, QUALITY_COLOR, SLOTS, SLOT_NAME, UPGRADES, WEAPONS, gear } from '../progression/config.js';
import { Loadout, clamp } from '../shared/model.js';
import { ScreenLayout, screenLayout } from './layout.js';
import { RUN } from '../game/pace.js';
import { clock, SYMBOLS } from './ui-config.js';
declare const Laya: any;
/**
 * UI 编排层：持有 HUD、弹窗容器、响应式布局与输入状态。
 * 公共节点由 UIControls 创建，所有弹窗交给 GameDialogs，Buff 编辑页再委托独立面板。
 * 只通过 Game 的动作入口修改玩法，不能分别赋值 dialog/mode/gate。
 */
export class GameUI {
    readonly root: any;
    private hud: any;
    private dialogs: any;
    private performancePanel: any;
    private performanceLabel: any;
    private toastNode: any;
    private toastLabel: any;
    private labels: Record<string, any> = {};
    private bars: Record<string, any> = {};
    private gearPanel: any;
    private portrait: any;
    private buildPanel: any;
    /** 仅保存正在编辑哪条配方/哪个槽位；实际配方与冷却属于 BuffRuntime。 */
    private readonly buffEditor: BuffEditorState = { slot: 0, picker: null };
    private readonly controls = new UIControls(() => this.game.enableAudio());
    /** 只有内容或布局改变才重建弹窗，避免每帧销毁按钮导致输入丢失。 */
    private modalKey = '';
    private gearKey = '';
    private toastExpiry = 0;
    private readonly dialogRenderer: GameDialogs;
    private joystick: any;
    private knob: any;
    private stickTouch: number | null = null;
    private stickOrigin = { x: 0, y: 0 };
    private mobile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    private layout: ScreenLayout = screenLayout(1280, 720);
    constructor(private game: Game) {
        this.root = new Laya.Sprite();
        this.root.name = 'game-ui';
        this.root.size(1280, 720);
        this.root.mouseThrough = true;
        this.root.zOrder = 1000000;
        Laya.stage.addChild(this.root);
        this.hud = this.layer(this.root);
        this.performancePanel = this.panel(this.root, 0, 0, 300, 68, '#10232b');
        this.performancePanel.name = 'performance-panel';
        // 诊断层不挡住世界移动、摇杆或卡片；位于模态遮罩下面。
        this.performancePanel.mouseEnabled = false;
        this.performanceLabel = this.text(this.performancePanel, '', 8, 8, 284, 10, C.mint);
        this.dialogs = this.layer(this.root);
        this.dialogRenderer = new GameDialogs(this.game, this.dialogs, this.controls, this.buffEditor, {
            invalidate: () => { this.modalKey = ''; },
            refresh: () => {
                this.modalKey = '';
                this.update();
            },
            toast: message => this.toast(message),
            equipment: (...args) => this.equipment(...args),
        });
        // Toasts sit above dialogs, so they must never take part in mouse hit testing.
        this.toastNode = this.panel(this.root, 400, 585, 480, 45);
        this.toastNode.mouseEnabled = false;
        this.toastLabel = this.text(this.toastNode, '', 14, 12, 452, 13, C.gold, 'center');
        this.toastNode.visible = false;
        this.resize();
        Laya.stage.on(Laya.Event.RESIZE, this, this.resize);
        Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.dragStick);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.releaseStick);
        Laya.stage.on(Laya.Event.MOUSE_OUT, this, (e: any) => {
            if (e.target === Laya.stage)
                this.releaseStick();
        });
        this.game.onChange = () => this.update();
        this.game.onToast = message => this.toast(message);
        this.update();
    }
    private layer(...args: Parameters<UIControls['layer']>): ReturnType<UIControls['layer']> { return this.controls.layer(...args); }
    private clear(...args: Parameters<UIControls['clear']>): ReturnType<UIControls['clear']> { return this.controls.clear(...args); }
    private block(...args: Parameters<UIControls['block']>): ReturnType<UIControls['block']> { return this.controls.block(...args); }
    private panel(...args: Parameters<UIControls['panel']>): ReturnType<UIControls['panel']> { return this.controls.panel(...args); }
    private text(...args: Parameters<UIControls['text']>): ReturnType<UIControls['text']> { return this.controls.text(...args); }
    private button(...args: Parameters<UIControls['button']>): ReturnType<UIControls['button']> { return this.controls.button(...args); }
    private avatar(...args: Parameters<UIControls['avatar']>): ReturnType<UIControls['avatar']> { return this.controls.avatar(...args); }
    private bar(parent: any, id: string, x: number, y: number, w: number, h: number): void {
        const node = this.layer(parent);
        node.pos(x, y);
        node.size(w, h);
        this.bars[id] = node;
    }
    private fill(id: string, amount: number, color: string): void {
        const node = this.bars[id];
        node.graphics.clear();
        node.graphics.drawRect(0, 0, node.width, node.height, '#2a4048');
        node.graphics.drawRect(0, 0, node.width * clamp(amount, 0, 1), node.height, color);
    }
    private label(id: string, value: string, parent: any, x: number, y: number, w: number, size = 12, color = C.text, align = 'left'): void { this.labels[id] = this.text(parent, value, x, y, w, size, color, align); }
    private set(id: string, value: string): void {
        if (this.labels[id].text !== value)
            this.labels[id].text = value;
    }
    /** 旋转/缩放后重排 HUD 与当前弹窗；先释放摇杆，防止旧触点持续移动。 */
    private resize(): void {
        this.releaseStick();
        this.layout = screenLayout(Laya.stage.width, Laya.stage.height, this.mobile);
        const { width, height, scale, margin } = this.layout;
        this.root.scale(scale, scale);
        this.root.pos(0, 0);
        this.root.size(width, height);
        this.game.gate.remove('orientation');
        this.game.cancelMouseMovement();
        this.clear(this.hud);
        this.labels = {};
        this.bars = {};
        this.buildHUD();
        const perfW = Math.min(300, width - margin * 2), compact = this.layout.compact;
        const playerY = margin + (this.mobile ? 44 : 40) + (compact ? 12 : 43);
        this.performancePanel.pos(compact && !this.layout.portrait ? width - margin - perfW : margin, playerY + (compact ? (this.layout.portrait ? 160 : 36) : 244));
        this.performancePanel.size(perfW, 68);
        this.performancePanel.graphics.clear();
        this.performancePanel.graphics.drawRect(0, 0, perfW, 68, '#10232b', C.border, 1);
        this.performanceLabel.width = perfW - 16;
        this.gearKey = '';
        const toastWidth = Math.min(480, width - 2 * margin);
        // 手机提示条放在整组触控按钮上方，不覆盖 Buff 按钮和摇杆。
        this.toastNode.pos((width - toastWidth) / 2, height - margin - (this.mobile ? 198 : 145));
        this.toastNode.size(toastWidth, 54);
        this.toastNode.graphics.clear();
        this.toastNode.graphics.drawRect(0, 0, toastWidth, 54, C.panel, C.border, 1);
        this.toastLabel.width = toastWidth - 28;
        this.toastLabel.fontSize = 12;
        this.modalKey = '';
        this.update();
    }
    private buildHUD(): void {
        const { width: w, height: h, margin: m, compact, sidebar, portrait } = this.layout;
        this.text(this.hud, compact ? '遗迹回响' : '◈  遗迹回响', m, m + 4, compact ? 130 : 235, compact ? 17 : 22, C.gold);
        if (!compact) {
            this.text(this.hud, 'RELIC ECHO / SURVIVOR', m + 4, m + 37, 235, 10, C.muted);
            this.text(this.hud, '单人探索  /  方石庭院', m + 280, m + 13, 280, 12, C.muted);
        }
        const actionY = m, actionH = this.mobile ? 44 : 40, inventoryW = compact ? 86 : 153, pauseW = compact ? 62 : 100;
        this.button(this.hud, this.mobile ? '装备' : compact ? '装备 E' : '角色 / 装备 E', w - m - pauseW - inventoryW - 8, actionY, inventoryW, actionH, () => {
            if (this.game.mode === 'battle')
                this.game.toggleInventory();
        }, false, 'inventory');
        this.button(this.hud, '暂停 Ⅱ', w - m - pauseW, actionY, pauseW, actionH, () => {
            if (this.game.mode === 'battle')
                this.game.togglePause();
        }, false, 'pause');
        if (!compact) {
            this.text(this.hud, '方 石 庭 院', w / 2 - 180, 107, 360, 15, '#becdc3', 'center');
            this.text(this.hud, 'THE BLOCK SANCTUARY', w / 2 - 180, 134, 360, 10, '#637f80', 'center');
        }
        // 竖屏将血量/经验铺成顶部状态条，不保留桌面侧栏的窄卡片宽度。
        const phone = this.mobile && portrait && compact;
        const playerW = phone ? w - 2 * m : compact ? Math.min(220, w - 2 * m) : 220, playerY = m + actionH + (compact ? 12 : 43);
        const player = this.panel(this.hud, m, playerY, playerW, compact ? 106 : 226);
        player.name = 'player-hud';
        this.portrait = this.layer(player);
        this.portrait.visible = !compact;
        if (!compact)
            this.text(player, '回响探索者', 76, 22, 130, 14);
        this.label('subtitle', '', player, 76, 48, 130, 11, C.muted);
        this.labels.subtitle.visible = !compact;
        const inset = compact ? 12 : 17, barW = playerW - 2 * inset;
        this.label('hp', '', player, inset, compact ? 10 : 89, barW, phone ? 13 : 11, C.muted);
        this.bar(player, 'hp', inset, compact ? 30 : 110, barW, 5);
        this.label('xp', '', player, inset, compact ? 43 : 127, barW, phone ? 12 : 11, C.muted);
        this.bar(player, 'xp', inset, compact ? 63 : 148, barW, 3);
        this.label('time', '', player, inset, compact ? 79 : 198, 76, compact ? 13 : 19);
        const killsX = phone ? Math.round(playerW * .48) : compact ? 100 : 101;
        const levelX = phone ? playerW - 42 : compact ? 174 : 163;
        this.label('kills', '', player, killsX, compact ? 79 : 198, 55, compact ? 13 : 19);
        this.label('level', '', player, levelX, compact ? 79 : 198, 40, compact ? 13 : 19);
        if (compact) {
            this.text(player, '×', killsX - 15, 79, 13, 12, C.muted);
            this.text(player, 'Lv', levelX - 21, 80, 23, 11, C.muted);
        }
        else {
            player.graphics.drawLine(17, 167, 203, 167, C.border, 1);
            this.text(player, '探索时间', 17, 180, 70, 10, C.muted);
            this.text(player, '击败', 101, 180, 55, 10, C.muted);
            this.text(player, '等级', 163, 180, 42, 10, C.muted);
        }
        const objective = this.panel(this.hud, m, playerY + 240, 220, 145);
        objective.visible = !compact;
        this.text(objective, '◈ 当前目标', 16, 17, 188, 12, C.gold);
        this.label('objective', '', objective, 16, 47, 188, 11, C.muted);
        this.bar(objective, 'progress', 16, 104, 188, 2);
        this.label('event', '', objective, 16, 118, 190, 10, '#789498');
        const right = this.layer(this.hud);
        right.pos(w - m - 208, 0);
        right.visible = sidebar;
        this.text(right, '当前装备', 0, 112, 120, 11, C.muted);
        this.text(right, '可见换装', 118, 112, 90, 11, C.gold, 'right');
        this.gearPanel = this.layer(right);
        this.gearPanel.pos(0, 140);
        this.text(right, '穿上装备，改变角色的轮廓。', 0, 453, 210, 11, C.muted);
        this.text(right, '回响构筑', 0, 499, 205, 11, C.muted);
        this.buildPanel = this.layer(right);
        this.buildPanel.pos(0, 524);
        const bossW = portrait ? w - 2 * m : compact ? Math.max(130, Math.min(360, w - 2 * (playerW + m + 18))) : 420, bossX = portrait ? m : compact ? w - m - bossW : (w - bossW) / 2, bossY = portrait ? playerY + 120 : compact ? playerY : 162;
        this.label('boss', '', this.hud, bossX, bossY, bossW, 12, '#e4b596', 'center');
        this.bar(this.hud, 'boss', bossX, bossY + 25, bossW, 5);
        if (!this.mobile && w >= 800 && h >= 440) {
            this.text(this.hud, '鼠标左键点击 / 按住移动 · WASD 也可移动', m, h - m - 51, 480, 12, C.muted);
            this.text(this.hud, '自动攻击 / 空格冲刺 / E 装备 / Esc 暂停', m, h - m - 24, 480, 11, '#647f83');
        }
        const dashW = compact ? 138 : 174, dashX = compact || this.mobile ? w - m - dashW : (w - dashW) / 2, dashY = h - m - 78;
        const buffButton = this.button(this.hud, '', dashX, dashY - 54, dashW, 44, () => {
            this.buffEditor.picker = null;
            this.game.toggleBuffs();
        }, false, 'buffs');
        this.label('buffs', 'Buff 碎片 B', buffButton, 4, 13, dashW - 8, 11, C.gold, 'center');
        this.button(this.hud, '»  相位冲刺', dashX, dashY, dashW, 54, () => this.game.dash(), false, 'dash');
        this.bar(this.hud, 'dash', dashX, dashY + 54, dashW, 3);
        this.label('dash', '', this.hud, dashX, dashY + 61, dashW, 11, C.muted, 'center');
        const comboW = Math.min(240, w - 2 * m), comboY = portrait || h < 450 ? h * .56 + 34 : h * .56 - 105;
        this.label('combo', '', this.hud, (w - comboW) / 2, comboY, comboW, 14, C.gold, 'center');
        this.bar(this.hud, 'combo', (w - comboW) / 2, comboY + 27, comboW, 3);
        this.label('perf', '', this.hud, w - m - 252, h - m - 24, 252, 10, '#688286', 'right');
        this.labels.perf.visible = false; // 由可开关的详细性能面板统一呈现。
        this.joystick = this.layer(this.hud);
        this.joystick.pos(m + 64, h - m - 70);
        this.joystick.size(112, 112);
        this.joystick.pivot(56, 56);
        this.joystick.graphics.drawCircle(56, 56, 55, '#17362f', '#5e9a89', 1);
        this.joystick.alpha = .7;
        this.joystick.visible = this.mobile;
        this.block(this.joystick);
        this.knob = this.layer(this.joystick);
        this.knob.graphics.drawCircle(0, 0, 20, '#8dc9ae', '#d7f1d7', 1);
        this.knob.pos(56, 56);
        this.joystick.on(Laya.Event.MOUSE_DOWN, this, (e: any) => {
            e.stopPropagation();
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
            this.releaseStick();
            return;
        }
        const scale = this.root.scaleX, dx = (Laya.stage.mouseX - this.stickOrigin.x) / scale, dy = (Laya.stage.mouseY - this.stickOrigin.y) / scale, d = Math.hypot(dx, dy), ratio = Math.min(1, 34 / (d || 1));
        this.knob.pos(56 + dx * ratio, 56 + dy * ratio);
        this.game.setStick(dx * ratio / 34, dy * ratio / 34);
    }
    private releaseStick(e?: any): void {
        if (e && this.stickTouch !== null && (e.touchId ?? 0) !== this.stickTouch)
            return;
        this.stickTouch = null;
        this.game.setStick(0, 0);
        if (this.knob)
            this.knob.pos(56, 56);
    }
    private equipment(parent: any, loadout: Loadout, x: number, y: number, width: number, columns = 1): void {
        const gap = 10, w = (width - (columns - 1) * gap) / columns;
        SLOTS.forEach((slot, index) => {
            const item = loadout[slot], card = this.button(parent, '', x + (index % columns) * (w + gap), y + Math.floor(index / columns) * 73, w, 64, () => {
                if (this.game.mode === 'battle' && !this.game.dialog)
                    this.game.toggleInventory();
            }, false, `gear-${slot}`);
            const color = item ? gear(item).color : C.muted;
            card.graphics.drawRect(10, 11, 40, 42, '#203b44', item ? QUALITY_COLOR[item.quality] : C.border, 1);
            this.text(card, item ? SYMBOLS[item.id] : '◇', 12, 16, 36, 25, color, 'center');
            this.text(card, `${SLOT_NAME[slot]}${item ? ' / ' + QUALITY[item.quality] : ''}`, 62, 12, w - 70, 9, C.muted);
            this.text(card, item ? gear(item).name : '尚未装备', 62, 34, w - 70, 12);
        });
    }
    private refreshGear(s: Snapshot): void {
        this.clear(this.gearPanel);
        this.clear(this.portrait);
        this.clear(this.buildPanel);
        this.avatar(this.portrait, s.loadout, 38, 73, .68);
        this.equipment(this.gearPanel, s.loadout, 0, 0, 208);
        this.text(this.buildPanel, `${WEAPONS[s.weapon].name}核心`, 0, 0, 210, 11, C.mint);
        const upgrades = UPGRADES.filter(u => s.levels[u.id]);
        upgrades.slice(-6).forEach((u, i) => this.text(this.buildPanel, `${u.name} ${s.levels[u.id]}${u.weapon && u.weapon !== s.weapon ? ' · 待激活' : ''}`, 0, 25 + i * 18, 210, 10, u.weapon && u.weapon !== s.weapon ? '#506a72' : C.muted));
    }
    private update(): void {
        const s = this.game.snapshot();
        this.set('hp', `生命 ${Math.ceil(s.hp)} / ${Math.round(s.maxHp)}`);
        this.set('xp', `经验 ${Math.floor(s.xp)} / ${s.need}`);
        this.fill('hp', s.hp / s.maxHp, s.hp / s.maxHp < .3 ? '#e79c86' : C.mint);
        this.fill('xp', s.xp / s.need, C.gold);
        this.set('subtitle', `${WEAPONS[s.weapon].name}行者 · LV.${String(s.level).padStart(2, '0')}`);
        this.set('time', clock(s.time));
        this.set('kills', String(s.kills));
        this.set('level', String(s.level).padStart(2, '0'));
        this.set('objective', this.game.training ? '试装模式 · 角色不会死亡\n按 E 切换装备，查看背面。' : s.time >= RUN.bossAt ? '击败遗迹核心。\n在封印合拢前完成挑战。' : '在遗迹中生存，收集回响。\n5 分钟后挑战遗迹核心。');
        this.fill('progress', s.time / RUN.duration, C.gold);
        this.set('event', s.time >= RUN.bossAt ? '最终封印 · 06:00 合拢' : `下次${s.time >= ELITE_TIMES[ELITE_TIMES.length - 1] ? '核心' : '精英'} · ${clock(ELITE_TIMES.find(t => t > s.time) ?? RUN.bossAt)}`);
        this.set('combo', s.overdrive > 0 ? `狂热 ${s.overdrive.toFixed(1)}s · ${s.combo} 连杀` : s.combo > 0 ? `${s.combo} 连杀 · 狂热 ${s.momentum} / ${COMBAT.frenzyKills}` : '');
        this.labels.combo.visible = s.combo > 0 || s.overdrive > 0;
        this.bars.combo.visible = s.combo > 0 || s.overdrive > 0;
        this.fill('combo', s.overdrive > 0 ? s.overdrive / COMBAT.frenzyDuration : s.momentum / COMBAT.frenzyKills, s.overdrive > 0 ? '#ffc76a' : C.mint);
        this.set('buffs', `Buff ${this.game.buffs.recipes.filter(complete).length}/2 · 碎片 ${this.game.buffs.owned.size}/12`);
        this.set('dash', s.dash > 0 ? `冷却 ${s.dash.toFixed(1)} 秒` : this.mobile ? '点击冲刺' : '已就绪 · SPACE');
        this.fill('dash', 1 - s.dash / s.dashMax, C.mint);
        this.set('perf', `${s.fps} FPS · ${s.enemies} ENEMIES${this.game.training ? ' · 试装' : ''}`);
        this.performancePanel.visible = this.game.showPerformance && this.game.mode === 'battle';
        if (this.performancePanel.visible) {
            const p = this.game.performanceSnapshot();
            const text = p.samples ? `${p.fps.toFixed(0)} FPS · 帧 ${p.frameMs.toFixed(1)} / P95 ${p.p95Ms.toFixed(1)} ms` : this.mobile ? '性能采样中 · 暂停菜单可隐藏' : '性能采样中 · P 键隐藏';
            const value = `${text}\n更新 ${p.updateMs.toFixed(1)} / 绘图 ${p.renderMs.toFixed(1)} ms${p.paused ? ' · 暂停' : ''}\n怪 ${p.enemies} · 弹 ${p.shots} · 掉落 ${p.drops} · 效果 ${p.effects}`;
            if (this.performanceLabel.text !== value)
                this.performanceLabel.text = value;
        }
        this.labels.boss.visible = !!s.boss;
        this.bars.boss.visible = !!s.boss;
        if (s.boss) {
            this.set('boss', '遗 迹 核 心');
            this.fill('boss', s.boss.hp / s.boss.max, '#e2a386');
        }
        const gearKey = JSON.stringify(s.loadout) + JSON.stringify(s.levels);
        if (gearKey !== this.gearKey) {
            this.gearKey = gearKey;
            this.refreshGear(s);
        }
        this.toastNode.visible = performance.now() < this.toastExpiry;
        const key = JSON.stringify(this.game.dialog) + (this.game.dialog?.type === 'buffs' ? JSON.stringify(this.game.buffs.recipes) + this.game.buffs.recipes.map(r => this.game.buffs.levelOf(r)).join(',') + [...this.game.buffs.owned].join(',') + this.buffEditor.slot + this.buffEditor.picker : '') + (this.game.dialog?.type === 'inventory' ? JSON.stringify(s.loadout) + this.game.previewBack : '');
        // 流程状态只通过 Game 的语义入口修改；这里按最终弹窗数据重建显示树。
        if (key !== this.modalKey) {
            this.modalKey = key;
            this.releaseStick();
            this.dialogRenderer.render(this.game.dialog, this.layout, this.mobile);
        }
    }
    private toast(message: string): void {
        this.toastLabel.text = message;
        this.toastExpiry = performance.now() + 3200;
        this.toastNode.visible = true;
    }
}

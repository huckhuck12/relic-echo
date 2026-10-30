import { UIControls, C } from './ui-controls.js';
import { TouchStick } from './touch-stick.js';
import type { Game, Snapshot } from '../game/game.js';
import type { ScreenLayout } from './layout.js';
import { complete } from '../buffs/buffs.js';
import { COMBAT, ELITE_TIMES, QUALITY, QUALITY_COLOR, SLOTS, SLOT_NAME, UPGRADES, WEAPONS, gear } from '../progression/config.js';
import { clamp } from '../shared/model.js';
import type { Loadout } from '../shared/model.js';
import { RUN } from '../game/pace.js';
import { clock, SYMBOLS } from './ui-config.js';
import { mobileHUDLayout, TOUCH_UI } from './hud-layout.js';
declare const Laya: any;
/** HUD 持有战斗显示节点与缓存；只通过 Game 动作请求交互，不写战斗数值。 */
export class BattleHUD {
    private previous: Pick<Snapshot, 'hp' | 'level' | 'dash' | 'time' | 'mode'> | null = null;
    readonly root: any;
    readonly stick: TouchStick;
    private labels: Record<string, any> = {};
    private bars: Record<string, any> = {};
    private gearPanel: any;
    private portrait: any;
    private buildPanel: any;
    private gearKey = '';
    private layout!: ScreenLayout;
    private mobile = false;
    constructor(private readonly game: Game, private readonly controls: UIControls, parent: any, private readonly openBuffs: () => void) {
        this.root = controls.layer(parent);
        this.stick = new TouchStick(game, controls, parent);
    }
    /** 缓存仅随布局/装备变化失效；低频 update 不重建按钮，避免触点丢失。 */
    resize(layout: ScreenLayout, mobile: boolean): void {
        this.previous = null;
        this.stick.release();
        this.layout = layout;
        this.mobile = mobile;
        this.clear(this.root);
        this.labels = {};
        this.bars = {};
        this.gearKey = '';
        this.buildHUD();
    }
    private layer(...args: Parameters<UIControls['layer']>): ReturnType<UIControls['layer']> { return this.controls.layer(...args); }
    private clear(...args: Parameters<UIControls['clear']>): ReturnType<UIControls['clear']> { return this.controls.clear(...args); }
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
        if (!node)
            return;
        node.graphics.clear();
        node.graphics.drawRect(0, 0, node.width, node.height, '#2a4048');
        node.graphics.drawRect(0, 0, node.width * clamp(amount, 0, 1), node.height, color);
    }
    private label(id: string, value: string, parent: any, x: number, y: number, w: number, size = 12, color = C.text, align = 'left'): void { this.labels[id] = this.text(parent, value, x, y, w, size, color, align); }
    private set(id: string, value: string): void {
        if (!this.labels[id])
            return;
        if (this.labels[id].text !== value)
            this.labels[id].text = value;
    }
    private buildHUD(): void {
        if (this.mobile) {
            this.buildMobile();
            return;
        }
        const { width: w, height: h, margin: m, compact, sidebar, portrait } = this.layout;
        this.text(this.root, compact ? '遗迹回响' : '◈  遗迹回响', m, m + 4, compact ? 130 : 235, compact ? 17 : 22, C.gold);
        if (!compact) {
            this.text(this.root, 'RELIC ECHO / SURVIVOR', m + 4, m + 37, 235, 10, C.muted);
            this.text(this.root, '单人探索  /  方石庭院', m + 280, m + 13, 280, 12, C.muted);
        }
        const actionY = m, actionH = this.mobile ? 44 : 40, inventoryW = compact ? 86 : 153, pauseW = compact ? 62 : 100;
        this.button(this.root, this.mobile ? '装备' : compact ? '装备 E' : '角色 / 装备 E', w - m - pauseW - inventoryW - 8, actionY, inventoryW, actionH, () => {
            if (this.game.mode === 'battle')
                this.game.toggleInventory();
        }, false, 'inventory');
        this.button(this.root, '暂停 Ⅱ', w - m - pauseW, actionY, pauseW, actionH, () => {
            if (this.game.mode === 'battle')
                this.game.togglePause();
        }, false, 'pause');
        if (!compact) {
            this.text(this.root, '方 石 庭 院', w / 2 - 180, 107, 360, 15, '#becdc3', 'center');
            this.text(this.root, 'THE BLOCK SANCTUARY', w / 2 - 180, 134, 360, 10, '#637f80', 'center');
        }
        // 竖屏将血量/经验铺成顶部状态条，不保留桌面侧栏的窄卡片宽度。
        const phone = this.mobile && portrait && compact;
        const playerW = phone ? w - 2 * m : compact ? Math.min(220, w - 2 * m) : 220, playerY = m + actionH + (compact ? 12 : 43);
        const player = this.panel(this.root, m, playerY, playerW, compact ? 106 : 226);
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
        const objective = this.panel(this.root, m, playerY + 240, 220, 145);
        objective.visible = !compact;
        this.text(objective, '◈ 当前目标', 16, 17, 188, 12, C.gold);
        this.label('objective', '', objective, 16, 47, 188, 11, C.muted);
        this.bar(objective, 'progress', 16, 104, 188, 2);
        this.label('event', '', objective, 16, 118, 190, 10, '#789498');
        const right = this.layer(this.root);
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
        this.label('boss', '', this.root, bossX, bossY, bossW, 12, '#e4b596', 'center');
        this.bar(this.root, 'boss', bossX, bossY + 25, bossW, 5);
        if (!this.mobile && w >= 800 && h >= 440) {
            this.text(this.root, '鼠标左键点击 / 按住移动 · WASD 也可移动', m, h - m - 51, 480, 12, C.muted);
            this.text(this.root, '自动攻击 / 空格冲刺 / E 装备 / Esc 暂停', m, h - m - 24, 480, 11, '#647f83');
        }
        const dashW = compact ? 138 : 174, dashX = compact || this.mobile ? w - m - dashW : (w - dashW) / 2, dashY = h - m - 78;
        const buffButton = this.button(this.root, '', dashX, dashY - 54, dashW, 44, () => {
            this.openBuffs();
        }, false, 'buffs');
        this.label('buffs', 'Buff 碎片 B', buffButton, 4, 13, dashW - 8, 11, C.gold, 'center');
        const dashButton = this.button(this.root, '»  相位冲刺', dashX, dashY, dashW, 54, () => {
            if (!this.mobile)
                this.game.dash();
        }, false, 'dash');
        // 手机冲刺在按下时提交，不等待抬手 CLICK；左手继续持有摇杆。
        dashButton.on(Laya.Event.MOUSE_DOWN, this, (e: any) => {
            e.stopPropagation();
            if (this.mobile) {
                this.game.enableAudio();
                this.game.dash();
            }
        });
        this.bar(this.root, 'dash', dashX, dashY + 54, dashW, 3);
        this.label('dash', '', this.root, dashX, dashY + 61, dashW, 11, C.muted, 'center');
        const comboW = Math.min(240, w - 2 * m), comboY = portrait || h < 450 ? h * .56 + 34 : h * .56 - 105;
        this.label('combo', '', this.root, (w - comboW) / 2, comboY, comboW, 14, C.gold, 'center');
        this.bar(this.root, 'combo', (w - comboW) / 2, comboY + 27, comboW, 3);
        this.label('perf', '', this.root, w - m - 252, h - m - 24, 252, 10, '#688286', 'right');
        this.labels.perf.visible = false; // 由可开关的详细性能面板统一呈现。
        this.stick.build(this.root, this.layout, this.mobile);
    }
    /** 手机专用结构：不创建隐藏的装备卡/头像和目标大面板，给战斗中央留出空间。 */
    private buildMobile(): void {
        const { width: w, margin: m, portrait } = this.layout;
        const p = mobileHUDLayout(this.layout);
        this.text(this.root, w < 350 ? '遗迹' : '遗迹回响', m, m + 12, w < 350 ? 48 : 98, 16, C.gold);
        this.label('time', '', this.root, m + 102, m + 13, 66, 15);
        this.button(this.root, '装备', w - m - 112, m, 52, 44, () => this.game.toggleInventory(), false, 'inventory');
        this.button(this.root, '暂停', w - m - 52, m, 52, 44, () => this.game.togglePause(), false, 'pause');
        // 最窄屏标题缩短，时间不挤到右侧操作键下方。
        if (w < 350) {
            this.labels.time.x = m + 54;
        }
        const status = this.panel(this.root, p.statusX, p.statusY, p.statusWidth, p.statusHeight, '#1a302a');
        status.name = 'player-hud';
        this.label('hp', '', status, 10, 6, p.statusWidth - 66, 13, C.mint);
        this.label('level', '', status, p.statusWidth - 58, 6, 48, 13, C.gold, 'right');
        this.bar(status, 'hp', 10, 28, p.statusWidth - 20, 5);
        this.label('xp', '', status, 10, 39, p.statusWidth - 80, 12, C.muted);
        this.label('kills', '', status, p.statusWidth - 72, 39, 62, 12, C.muted, 'right');
        this.bar(status, 'xp', 0, 62, p.statusWidth, 2);
        // 连杀移到状态条下，不再压在玩家和弹幕附近。
        this.label('combo', '', this.root, p.comboX, p.comboY, p.comboWidth, 12, C.gold);
        this.bar(this.root, 'combo', p.comboX, p.comboY + 22, Math.min(160, p.comboWidth), 2);
        const bossW = portrait ? w - 2 * m : Math.min(280, w * .4);
        const bossX = portrait ? m : w - m - bossW;
        const bossY = portrait ? p.comboY + 30 : m + 64;
        this.label('boss', '', this.root, bossX, bossY, bossW, 12, '#e4b596', 'center');
        this.bar(this.root, 'boss', bossX, bossY + 22, bossW, 5);
        const buff = this.button(this.root, '', p.buffX, p.buffY, TOUCH_UI.buffWidth, TOUCH_UI.buffHeight, this.openBuffs, false, 'buffs');
        this.label('buffs', '', buff, 4, 13, TOUCH_UI.buffWidth - 8, 13, C.gold, 'center');
        const dash = this.button(this.root, '冲刺', p.dashX, p.dashY, TOUCH_UI.dashWidth, TOUCH_UI.dashHeight, () => { }, true, 'dash');
        // 冲刺主文字扩大；冷却放按钮下方，不覆盖文字和命中区域。
        dash.children[0].fontSize = 18;
        dash.on(Laya.Event.MOUSE_DOWN, this, (e: any) => {
            e.stopPropagation();
            this.game.enableAudio();
            this.game.dash();
        });
        this.bar(this.root, 'dash', p.dashX, p.dashY + TOUCH_UI.dashHeight - 4, TOUCH_UI.dashWidth, 4);
        this.label('dash', '', this.root, p.dashX, p.dashY + TOUCH_UI.dashHeight + 4, TOUCH_UI.dashWidth, 11, C.muted, 'center');
        this.stick.build(this.root, this.layout, true);
    }
    equipment(parent: any, loadout: Loadout, x: number, y: number, width: number, columns = 1): void {
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
    update(s: Snapshot): void {
        const previous = this.previous;
        // 首次采样只记基线；HUD 动画只读快照，不参与战斗随机数或成长结算。
        if (previous && s.mode === 'battle' && previous.mode === 'battle' && s.time >= previous.time) {
            if (s.hp < previous.hp)
                this.controls.effects.flash(this.bars.hp, '#ff927d', 450);
            if (s.level > previous.level)
                this.controls.effects.flash(this.bars.xp, C.gold, 650);
            if (previous.dash > 0 && s.dash <= 0)
                this.controls.effects.flash(this.bars.dash, C.mint, 500);
        }
        this.previous = {
            hp: s.hp, level: s.level, dash: s.dash, time: s.time, mode: s.mode
        };
        this.set('hp', `生命 ${Math.ceil(s.hp)} / ${Math.round(s.maxHp)}`);
        this.set('xp', `经验 ${Math.floor(s.xp)} / ${s.need}`);
        this.fill('hp', s.hp / s.maxHp, s.hp / s.maxHp < .3 ? '#e79c86' : C.mint);
        this.fill('xp', s.xp / s.need, C.gold);
        this.set('subtitle', `${WEAPONS[s.weapon].name}行者 · LV.${String(s.level).padStart(2, '0')}`);
        this.set('time', clock(s.time));
        this.set('kills', this.mobile ? `击败 ${s.kills}` : String(s.kills));
        this.set('level', this.mobile ? `Lv.${s.level}` : String(s.level).padStart(2, '0'));
        this.set('objective', this.game.training ? '试装模式 · 角色不会死亡\n按 E 切换装备，查看背面。' : s.time >= RUN.bossAt ? '击败遗迹核心。\n在封印合拢前完成挑战。' : '在遗迹中生存，收集回响。\n5 分钟后挑战遗迹核心。');
        this.fill('progress', s.time / RUN.duration, C.gold);
        this.set('event', s.time >= RUN.bossAt ? '最终封印 · 06:00 合拢' : `下次${s.time >= ELITE_TIMES[ELITE_TIMES.length - 1] ? '核心' : '精英'} · ${clock(ELITE_TIMES.find(t => t > s.time) ?? RUN.bossAt)}`);
        this.set('combo', s.overdrive > 0 ? `狂热 ${s.overdrive.toFixed(1)}s · ${s.combo} 连杀` : s.combo > 0 ? `${s.combo} 连杀 · 狂热 ${s.momentum} / ${COMBAT.frenzyKills}` : '');
        this.labels.combo.visible = s.combo > 0 || s.overdrive > 0;
        this.bars.combo.visible = s.combo > 0 || s.overdrive > 0;
        this.fill('combo', s.overdrive > 0 ? s.overdrive / COMBAT.frenzyDuration : s.momentum / COMBAT.frenzyKills, s.overdrive > 0 ? '#ffc76a' : C.mint);
        this.set('buffs', this.mobile ? `Buff ${this.game.buffs.recipes.filter(complete).length}/2` : `Buff ${this.game.buffs.recipes.filter(complete).length}/2 · 碎片 ${this.game.buffs.owned.size}/12`);
        this.set('dash', s.dash > 0 ? `冷却 ${s.dash.toFixed(1)} 秒` : this.mobile ? '点击冲刺' : '已就绪 · SPACE');
        this.fill('dash', 1 - s.dash / s.dashMax, C.mint);
        this.set('perf', `${s.fps} FPS · ${s.enemies} ENEMIES${this.game.training ? ' · 试装' : ''}`);
        this.labels.boss.visible = !!s.boss;
        this.bars.boss.visible = !!s.boss;
        if (s.boss) {
            this.set('boss', '遗 迹 核 心');
            this.fill('boss', s.boss.hp / s.boss.max, '#e2a386');
        }
        const gearKey = JSON.stringify(s.loadout) + JSON.stringify(s.levels);
        if (!this.mobile && gearKey !== this.gearKey) {
            this.gearKey = gearKey;
            this.refreshGear(s);
        }
    }
}

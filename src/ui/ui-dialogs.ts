import { UIControls, C } from './ui-controls.js';
import { renderBuffPanel } from './buff-panel.js';
import type { BuffEditorState } from './buff-panel.js';
import { fragment, PART_NAMES } from '../buffs/buffs.js';
import { fragmentRouteHint } from '../progression/fragment-rewards.js';
import type { Game } from '../game/game.js';
import type { Dialog } from '../game/run-flow.js';
import { Item, QUALITY, QUALITY_COLOR, SLOTS, SLOT_NAME, UPGRADES, WEAPONS, Weapon, gear, multiplier } from '../progression/config.js';
import { Loadout, emptyLoadout, resolveStats } from '../shared/model.js';
import type { ScreenLayout } from './layout.js';
import { clock, percent, SYMBOLS } from './ui-config.js';
export interface DialogHooks {
    /** 使原有弹窗缓存失效，保留编辑槽位；绘制层不自行推进战斗。 */
    invalidate(): void;
    refresh(): void;
    toast(message: string): void;
    equipment(parent: any, loadout: Loadout, x: number, y: number, width: number, columns?: number): void;
}
/** 只管理弹窗绘制：桌面/响应式布局、选择回调和编辑状态，不持有奖励队列。
 * GameUI 保留 HUD/触控/刷新缓存；所有玩法写入仍走 Game 的语义动作入口。
 */
export class GameDialogs {
    private selected: Weapon = 'storm';
    constructor(private readonly game: Game, private readonly dialogs: any, private readonly controls: UIControls, private readonly buffEditor: BuffEditorState, private readonly hooks: DialogHooks) { }
    private clear(...args: Parameters<UIControls['clear']>) { return this.controls.clear(...args); }
    private block(...args: Parameters<UIControls['block']>) { return this.controls.block(...args); }
    private panel(...args: Parameters<UIControls['panel']>) { return this.controls.panel(...args); }
    private text(...args: Parameters<UIControls['text']>) { return this.controls.text(...args); }
    private button(...args: Parameters<UIControls['button']>) { return this.controls.button(...args); }
    private avatar(...args: Parameters<UIControls['avatar']>) { return this.controls.avatar(...args); }
    private equipment(...args: Parameters<DialogHooks['equipment']>) { return this.hooks.equipment(...args); }
    private heading(parent: any, eyebrow: string, title: string, description: string): void {
        this.text(parent, eyebrow, 32, 25, 710, 10, C.mint);
        this.text(parent, title, 32, 52, 710, 27);
        this.text(parent, description, 32, 101, 730, 12, C.muted);
    }
    private statRow(parent: any, y: number, entries: [
        string,
        string
    ][]): void {
        entries.forEach(([label, value], i) => {
            const panel = this.panel(parent, 32 + i * 187, y, 175, 77);
            this.text(panel, label, 13, 10, 149, 10, C.muted);
            this.text(panel, value, 13, 34, 149, 22);
        });
    }
    private describe(item: Item | null): string {
        if (!item)
            return '尚未装备该部位';
        const g = gear(item), m = multiplier(item.quality);
        const labels: Record<string, string> = {
            damage: '通用伤害', element: '元素伤害', speed: '移速', attackSpeed: '攻速', hp: '最大生命', crit: '暴击率', reduction: '减伤', dash: '冲刺减冷却', pickup: '拾取半径'
        };
        if (g.weapon)
            return `${g.note}\n基础伤害 ${Math.round(WEAPONS[g.weapon].damage * m)} / ${WEAPONS[g.weapon].interval} 秒`;
        const stats = Object.entries(g.bonus).map(([key, v]) => {
            const value = v! * (v! < 0 ? 1 : m);
            return `${labels[key]} ${value >= 0 ? '+' : ''}${key === 'hp' ? Math.round(value) : percent(value)}`;
        });
        return stats.length ? stats.join(' / ') : `受伤触发范围伤害 ${Math.round(20 * m)}`;
    }
    private comparison(item: Item): string {
        const next = resolveStats({ ...this.game.loadout, [gear(item).slot]: item }, this.game.levels), old = this.game.stats;
        const pairs: [
            keyof typeof old,
            string,
            boolean
        ][] = [['hp', '生命', false], ['damage', '伤害', true], ['element', '元素', true], ['speed', '移速', true], ['crit', '暴击', true], ['reduction', '减伤', true], ['dash', '冲刺减冷却', true], ['pickup', '拾取', true]];
        return pairs.filter(([k]) => Math.abs(next[k] - old[k]) > .00001).map(([k, name, p]) => {
            const delta = next[k] - old[k];
            return `${name} ${delta > 0 ? '+' : ''}${p ? percent(delta) : Math.round(delta)}`;
        }).join('  /  ') || '特殊效果与攻击形态请查看上方说明';
    }
    /** 共用遮罩与暂停容器，再按窗口大小分派；面板不自行启动/结束模拟。 */
    render(dialog: Dialog, layout: ScreenLayout, mobile: boolean): void {
        this.clear(this.dialogs);
        this.dialogs.mouseEnabled = !!dialog;
        if (!dialog)
            return;
        const { width, height, dialogWidth: w, dialogHeight: h } = layout;
        const shade = this.panel(this.dialogs, 0, 0, width, height, '#07141c', '#07141c');
        shade.name = 'modal-shade';
        shade.alpha = .88;
        this.dialogs.size(width, height);
        this.block(this.dialogs);
        const p = this.panel(this.dialogs, (width - w) / 2, (height - h) / 2, w, h, '#152b35', '#627d73');
        p.name = 'dialog-panel';
        if (dialog.type === 'fragment') {
            this.fragmentDialog(p, dialog.choices, w, h);
            return;
        }
        if (dialog.type === 'buffs') {
            this.buffDialog(p, w, h);
            return;
        }
        if (w < 800 || h < 620 || mobile) {
            this.responsiveDialog(p, dialog, w, h);
            return;
        }
        if (dialog.type === 'start')
            this.startDialog(p);
        if (dialog.type === 'upgrade')
            this.upgradeDialog(p, dialog.choices);
        if (dialog.type === 'drop')
            this.dropDialog(p, dialog.item);
        if (dialog.type === 'inventory')
            this.inventoryDialog(p);
        if (dialog.type === 'pause')
            this.pauseDialog(p);
        if (dialog.type === 'result')
            this.resultDialog(p, dialog.win, dialog.reason);
    }
    /** 手机竖屏按行排列，短横屏改为列；共用正式弹窗遮罩与暂停，不额外开启计时器。 */
    private fragmentDialog(p: any, choices: string[], w: number, h: number): void {
        const pad = Math.min(24, w * .05), gap = 10, inner = w - pad * 2;
        const rows = w < 480, top = h < 330 ? 70 : 92, bottom = h - pad - 32;
        const cardW = rows ? inner : (inner - gap * (choices.length - 1)) / choices.length;
        const cardH = rows ? Math.min(116, (bottom - top - gap * (choices.length - 1)) / choices.length) : Math.min(270, bottom - top);
        this.text(p, '首精英奖励 · 碎片选择', pad, pad, inner, h < 330 ? 19 : 24, C.gold);
        this.text(p, '选择一枚解锁，战斗已暂停。', pad, pad + 35, inner, 12, C.muted);
        choices.forEach((id, i) => {
            const f = fragment(id)!;
            const card = this.button(p, '', pad + (rows ? 0 : i * (cardW + gap)), top + (rows ? i * (cardH + gap) : 0), cardW, cardH, () => this.game.chooseFragment(id), false, `fragment-${id}`);
            this.text(card, `${f.name} · ${PART_NAMES[f.part]}`, 12, 10, cardW - 24, 15, C.gold);
            this.text(card, fragmentRouteHint(id, this.game.buffs.owned, this.game.buffs.upgradePreview(id)), 12, 38, cardW - 24, 11, C.text);
        });
        this.text(p, '领取后按 B / Buff 组合装入配方，不自动替换。', pad, h - pad - 23, inner, 11, C.muted);
    }
    private buffDialog(p: any, w: number, h: number): void {
        renderBuffPanel(p, w, h, this.buffEditor, { buffs: this.game.buffs, stats: this.game.stats, training: this.game.training }, this.controls, {
            refresh: () => { this.hooks.refresh(); }, toast: message => this.hooks.toast(message),
            installBuff: (...args) => this.game.installBuff(...args), unlockFragments: () => this.game.unlockFragments(), close: () => this.game.close(),
        });
    }
    private compactEquipment(parent: any, loadout: Loadout, x: number, y: number, width: number, columns: number, rowH: number, cycle = false): number {
        const gap = 8, cardW = (width - gap * (columns - 1)) / columns;
        SLOTS.forEach((slot, i) => {
            const item = loadout[slot], node = this.button(parent, '', x + (i % columns) * (cardW + gap), y + Math.floor(i / columns) * (rowH + gap), cardW, rowH, () => {
                if (cycle)
                    this.game.testGear(slot);
            }, false, `${cycle ? 'cycle' : 'gear'}-${slot}`);
            this.text(node, item ? SYMBOLS[item.id] : '◇', 7, 10, 27, 23, item ? gear(item).color : C.muted, 'center');
            this.text(node, `${SLOT_NAME[slot]}${item ? ' · ' + QUALITY[item.quality] : ''}`, 42, 6, cardW - 49, 10, item ? QUALITY_COLOR[item.quality] : C.muted);
            this.text(node, item ? gear(item).name : '尚未装备', 42, 25, cardW - 49, 11);
        });
        return Math.ceil(4 / columns) * (rowH + gap) - gap;
    }
    private compactStats(parent: any, x: number, y: number, width: number, entries: [
        string,
        string
    ][], columns: number, cellH: number): number {
        const gap = 8, cellW = (width - gap * (columns - 1)) / columns;
        entries.forEach(([name, value], i) => {
            const cell = this.panel(parent, x + (i % columns) * (cellW + gap), y + Math.floor(i / columns) * (cellH + gap), cellW, cellH);
            this.text(cell, name, 8, 6, cellW - 16, 10, C.muted);
            this.text(cell, value, 8, 24, cellW - 16, cellH < 50 ? 14 : 18);
        });
        return Math.ceil(entries.length / columns) * (cellH + gap) - gap;
    }
    private responsiveDialog(p: any, dialog: NonNullable<Dialog>, w: number, h: number): void {
        if (dialog.type === 'fragment') {
            this.fragmentDialog(p, dialog.choices, w, h);
            return;
        }
        const pad = Math.min(20, w * .05), inner = w - 2 * pad, short = h < 460, narrow = w < 560 && (!short || w < 480), body = short ? (h < 330 ? 66 : 83) : 128, footer = h - pad - 44, gap = 10;
        const titles = {
            buffs: '碎片组合', start: '唤醒遗迹中的回响', upgrade: '选择你的回响', drop: '发现新的装备', inventory: '探索者装备', pause: '探索已暂停', result: dialog.type === 'result' && dialog.win ? '回响归来' : '探索终止'
        };
        const descriptions = {
            buffs: '组合两条自定义 Buff', start: '选择武器，发现装备，挑战六分钟怪潮。', upgrade: '战斗已暂停，选择一项强化。', drop: '穿戴立即改变外观，旧装备分解为经验。', inventory: this.game.training ? '点击装备槽位试装；可查看正反面。' : '武器、头饰、护甲、背饰均有可见外观。', pause: '准备好后，继续前进。', result: dialog.type === 'result' ? dialog.reason : ''
        };
        this.text(p, 'RELIC ECHO / ' + dialog.type.toUpperCase(), pad, pad, inner, 10, C.mint);
        this.text(p, titles[dialog.type], pad, pad + 23, inner, short ? 21 : 24);
        if (!short)
            this.text(p, descriptions[dialog.type], pad, pad + 63, inner, 12, C.muted);
        const pair = (first: string, action: () => void, name: string, second?: string, other?: () => void, otherName?: string) => {
            const bw = second ? (inner - gap) / 2 : Math.min(225, inner);
            this.button(p, first, pad, footer, bw, 44, action, true, name);
            if (second && other)
                this.button(p, second, pad + bw + gap, footer, bw, 44, other, false, otherName);
        };
        if (dialog.type === 'start') {
            const bottom = footer - (short ? 12 : 65), rowH = Math.max(44, Math.min(112, (bottom - body - 2 * gap) / 3)), cardW = narrow ? inner : (inner - 2 * gap) / 3, cardH = narrow ? rowH : Math.min(255, bottom - body);
            (['storm', 'flame', 'blade'] as Weapon[]).forEach((weapon, i) => {
                const card = this.button(p, '', pad + (narrow ? 0 : i * (cardW + gap)), body + (narrow ? i * (rowH + gap) : 0), cardW, cardH, () => {
                    this.selected = weapon;
                    this.hooks.refresh();
                }, false, `select-${weapon}`);
                if (weapon === this.selected)
                    card.graphics.drawRect(0, 0, cardW, cardH, null, C.gold, 2);
                if (narrow) {
                    this.avatar(card, emptyLoadout(weapon), 40, cardH - 7, Math.min(1.05, (cardH - 12) / 85));
                    this.text(card, gear(weapon).name, 84, cardH < 72 ? 10 : 14, cardW - 96, cardH < 72 ? 14 : 17);
                    if (cardH >= 58)
                        this.text(card, gear(weapon).note, 84, cardH < 72 ? 35 : 44, cardW - 96, 11, C.muted);
                }
                else {
                    this.avatar(card, emptyLoadout(weapon), cardW / 2, cardH - 69, Math.min(1.5, (cardH - 85) / 85));
                    this.text(card, gear(weapon).name, 12, cardH - 55, cardW - 24, 17);
                    this.text(card, gear(weapon).note, 12, cardH - 28, cardW - 24, 11, C.muted);
                }
            });
            if (!short)
                this.text(p, '左键点击 / 按住移动，或使用 WASD。\n空格冲刺 · E 装备 · 手机使用摇杆。', pad, footer - 52, inner, 11, C.muted);
            pair('开始探索 →', () => this.game.start(this.selected), 'start', '试装与练习', () => {
                this.game.start(this.selected, true);
                this.game.toggleInventory();
            }, 'training');
        }
        if (dialog.type === 'upgrade') {
            const available = h - pad - 35 - body, cardW = narrow ? inner : (inner - gap * (dialog.choices.length - 1)) / dialog.choices.length, cardH = narrow ? Math.min(112, (available - gap * (dialog.choices.length - 1)) / dialog.choices.length) : Math.min(290, available);
            dialog.choices.forEach((id, i) => {
                const u = UPGRADES.find(u => u.id === id), card = this.button(p, '', pad + (narrow ? 0 : i * (cardW + gap)), body + (narrow ? i * (cardH + gap) : 0), cardW, cardH, () => this.game.chooseUpgrade(id), false, `upgrade-${id}`);
                if (narrow) {
                    const tiny = cardH < 72;
                    this.text(card, u?.icon || '✚', 12, tiny ? 10 : 20, 48, tiny ? 24 : 32, C.gold);
                    this.text(card, u?.name || '生命回响', 69, tiny ? 7 : 12, cardW - 81, tiny ? 14 : 17);
                    this.text(card, u?.note || '恢复 30% 最大生命。', 69, tiny ? 30 : 44, cardW - 81, tiny ? 10 : 11, C.muted);
                }
                else {
                    this.text(card, u?.icon || '✚', 16, 19, cardW - 32, 38, C.gold);
                    if (cardH >= 180)
                        this.text(card, u ? `${(this.game.levels[id] || 0) + 1} / ${u.max}` : '恢复', 16, cardH - 104, cardW - 32, 11, C.gold);
                    this.text(card, u?.name || '生命回响', 16, cardH - 76, cardW - 32, 18);
                    this.text(card, u?.note || '恢复 30% 最大生命。', 16, cardH - 43, cardW - 32, 12, C.muted);
                }
            });
            this.text(p, '选择后生效 · 战斗已暂停', pad, h - pad - 18, inner, 11, C.muted);
        }
        if (dialog.type === 'drop') {
            const item = dialog.item, g = gear(item), old = this.game.loadout[g.slot], next = { ...this.game.loadout, [g.slot]: item }, cw = (inner - gap) / 2, ch = Math.min(325, footer - body - (short ? 42 : 65));
            [this.game.loadout, next].forEach((loadout, i) => {
                const current = i ? item : old, card = this.panel(p, pad + i * (cw + gap), body, cw, ch, '#10252e', i ? '#81b499' : C.border);
                this.text(card, i ? `${QUALITY[item.quality]} · 候选` : '当前穿戴', 8, 8, cw - 16, 11, i ? QUALITY_COLOR[item.quality] : C.gold, 'center');
                if (short) {
                    this.text(card, current ? gear(current).name : '空槽位', 8, 29, cw - 16, 14, C.text, 'center');
                    if (ch >= 140)
                        this.avatar(card, loadout, cw / 2, 99, .62);
                    this.text(card, this.describe(current), 8, ch >= 140 ? 112 : 57, cw - 16, 11, C.muted, 'center');
                }
                else {
                    this.avatar(card, loadout, cw / 2, ch - 117, Math.min(1.9, (cw - 24) / 90, (ch - 140) / 83));
                    this.text(card, current ? gear(current).name : '空槽位', 8, ch - 93, cw - 16, 16, C.text, 'center');
                    this.text(card, this.describe(current), 8, ch - 61, cw - 16, 11, C.muted, 'center');
                }
            });
            this.text(p, this.comparison(item), pad, body + ch + 10, inner, 11, C.mint);
            pair('穿戴装备 →', () => this.game.takeDrop(true), 'equip', `分解 ${[5, 10, 20][item.quality]} 经验`, () => this.game.takeDrop(false), 'salvage');
        }
        if (dialog.type === 'inventory') {
            const s = this.game.snapshot(), pw = narrow ? Math.min(116, inner * .34) : 150, eqX = pad + pw + 12, eqW = inner - pw - 12, columns = narrow ? 1 : 2, rowH = short || h < 600 ? 44 : 50;
            const eqH = this.compactEquipment(p, s.loadout, eqX, body, eqW, columns, rowH, this.game.training), portrait = this.panel(p, pad, body, pw, eqH);
            this.avatar(portrait, s.loadout, pw / 2, eqH - 61, Math.min(1.8, (pw - 15) / 85, (eqH - 64) / 83), this.game.previewBack);
            this.button(p, `查看${this.game.previewBack ? '正面' : '背面'}`, 6, eqH - 44, pw - 12, 44, () => {
                this.game.previewBack = !this.game.previewBack;
                this.hooks.refresh();
            }, false, 'turn');
            const toolsY = body + eqH + 12;
            if (this.game.training) {
                const bw = (eqW - gap) / 2;
                this.button(p, '切换品质', eqX, toolsY, bw, 44, () => this.game.testQuality(), false, 'quality');
                this.button(p, '跳到 Boss', eqX + bw + gap, toolsY, bw, 44, () => this.game.testBoss(), false, 'boss');
            }
            const entries: [
                string,
                string
            ][] = [['最大生命', String(Math.round(s.maxHp))], ['通用伤害', `+${percent(s.stats.damage)}`], ['暴击率', percent(s.stats.crit)], ['移速加成', percent(s.stats.speed)]];
            if (h >= 600) {
                const sh = narrow ? 108 : 50;
                this.compactStats(p, pad, footer - sh - 14, inner, entries, narrow ? 2 : 4, 50);
            }
            else if (!this.game.training || footer - toolsY - 44 >= 28)
                this.text(p, `生命 ${Math.round(s.maxHp)}  /  伤害 +${percent(s.stats.damage)}  /  暴击 ${percent(s.stats.crit)}`, pad, footer - 30, inner, 11, C.muted);
            pair('返回探索 →', () => this.game.close(), 'close-inventory');
        }
        if (dialog.type === 'pause') {
            const settingW = (inner - gap) / 2;
            this.button(p, `${this.game.sound ? '■' : '□'} 程序音效`, pad, body, settingW, 44, () => {
                this.game.sound = !this.game.sound;
                this.game.saveSettings();
                this.hooks.refresh();
            }, false, 'sound');
            this.button(p, `${this.game.shake ? '■' : '□'} 战斗震动`, pad + settingW + gap, body, settingW, 44, () => {
                this.game.shake = !this.game.shake;
                this.game.saveSettings();
                this.hooks.refresh();
            }, false, 'shake');
            this.visualQualityButton(p, pad, body + 50, settingW);
            this.performanceButton(p, pad + settingW + gap, body + 50, settingW);
            if (footer - body > 225)
                this.text(p, '鼠标点击 / 按住移动 · WASD 移动\n空格冲刺 · E 装备 · Esc 暂停\n窗口大小与横竖屏切换会保留本局进度。', pad, body + 156, inner, 12, C.muted);
            pair('继续探索 →', () => this.game.close(), 'resume', '结束本局', () => this.game.finish(false, '本次探索已主动结束。'), 'quit');
        }
        if (dialog.type === 'result') {
            const entries: [
                string,
                string
            ][] = [['探索时间', clock(this.game.time)], ['击败敌人', String(this.game.kills)], ['最终等级', String(this.game.level)], ['总伤害', String(Math.round(this.game.damage))]];
            const sh = this.compactStats(p, pad, body, inner, entries, narrow ? 2 : 4, short ? 44 : 52), top = body + sh + 12, pw = narrow ? Math.min(116, inner * .34) : 150;
            const eqH = this.compactEquipment(p, this.game.loadout, pad + pw + 12, top, inner - pw - 12, narrow ? 1 : 2, 44), portrait = this.panel(p, pad, top, pw, eqH);
            this.avatar(portrait, this.game.loadout, pw / 2, eqH - 12, Math.min(1.8, (pw - 15) / 85, (eqH - 20) / 83));
            pair('再次挑战 →', () => this.game.start(this.selected, this.game.training), 'restart', '更换武器', () => { this.game.returnToTitle(); }, 'title');
        }
    }
    private startDialog(p: any): void {
        this.heading(p, 'EXPEDITION 001 / PURE LAYAAIR', '唤醒遗迹中的回响', '选择初始武器，在六分钟的怪潮中构筑力量。发现装备，穿在身上，挑战遗迹核心。');
        (['storm', 'flame', 'blade'] as Weapon[]).forEach((weapon, i) => {
            const card = this.button(p, '', 32 + i * 249, 151, 237, 255, () => {
                this.selected = weapon;
                this.hooks.refresh();
            }, false, `select-${weapon}`);
            if (weapon === this.selected)
                card.graphics.drawRect(0, 0, 237, 255, null, C.gold, 2);
            this.avatar(card, emptyLoadout(weapon), 118, 143, 1.5);
            this.text(card, `0${i + 1} / ${WEAPONS[weapon].name}流派`, 16, 165, 205, 9, C.gold);
            this.text(card, gear(weapon).name, 16, 190, 205, 17);
            this.text(card, gear(weapon).note, 16, 225, 205, 11, C.muted);
        });
        this.button(p, '开始探索 →', 32, 433, 220, 45, () => this.game.start(this.selected), true, 'start');
        this.button(p, '试装与练习', 267, 433, 180, 45, () => {
            this.game.start(this.selected, true);
            this.game.toggleInventory();
        }, false, 'training');
        this.text(p, '鼠标左键点击地面移动，按住持续跟随；WASD 也可移动。\n空格 / 屏幕按钮冲刺 · E 装备 · Esc 暂停 · 手机摇杆移动。', 32, 504, 736, 11, C.muted);
        let record = '首次探索 · 全部画面与界面由 LayaAir 渲染';
        try {
            const records = JSON.parse(localStorage.getItem('relic-records') || '[]');
            if (records.length)
                record = `最近探索：${records[0].win ? '胜利' : '未完成'} · ${clock(records[0].time)} · 击败 ${records[0].kills}`;
        }
        catch { }
        this.text(p, record, 32, 582, 736, 10, '#6c8b8f');
    }
    private upgradeDialog(p: any, choices: string[]): void {
        this.heading(p, `ECHO AWAKENED / LEVEL ${this.game.level}`, '选择你的回响', '战斗已暂停。选择一项强化，塑造本局的战斗方式。');
        choices.forEach((id, i) => {
            const u = UPGRADES.find(u => u.id === id), card = this.button(p, '', 32 + i * 249, 174, 237, 290, () => this.game.chooseUpgrade(id), false, `upgrade-${id}`);
            this.text(card, u?.icon || '✚', 20, 30, 197, 49, C.gold);
            this.text(card, u ? `${(this.game.levels[id] || 0) + 1} / ${u.max}` : '恢复', 20, 113, 197, 11, C.gold);
            this.text(card, u?.name || '生命回响', 20, 148, 197, 20);
            this.text(card, u?.note || '恢复 30% 最大生命。', 20, 197, 197, 12, C.muted);
        });
        this.text(p, '选择后立即生效。武器专属强化随对应武器启用。', 32, 521, 730, 12, C.muted);
    }
    private dropDialog(p: any, item: Item): void {
        const g = gear(item), old = this.game.loadout[g.slot], next = { ...this.game.loadout, [g.slot]: item };
        this.heading(p, `RELIC DISCOVERED / ${SLOT_NAME[g.slot]}`, '发现新的装备', '穿戴会立即改变角色外观。替换后，旧装备分解为经验。');
        [this.game.loadout, next].forEach((loadout, i) => {
            const candidate = i === 1, current = candidate ? item : old, card = this.panel(p, 32 + i * 377, 151, 359, 325, '#10252e', candidate ? '#81b499' : C.border);
            this.text(card, candidate ? `${QUALITY[item.quality]} · 候选装备` : '当前穿戴', 17, 17, 325, 11, candidate ? QUALITY_COLOR[item.quality] : C.gold, 'center');
            this.avatar(card, loadout, 179, 205, 1.9);
            this.text(card, current ? gear(current).name : '空槽位', 17, 229, 325, 18, C.text, 'center');
            this.text(card, this.describe(current), 18, 264, 323, 11, C.muted, 'center');
        });
        this.text(p, this.comparison(item), 32, 494, 736, 11, C.mint);
        this.button(p, '穿戴装备 →', 32, 552, 225, 43, () => this.game.takeDrop(true), true, 'equip');
        this.button(p, `分解为 ${[5, 10, 20][item.quality]} 经验`, 272, 552, 225, 43, () => this.game.takeDrop(false), false, 'salvage');
    }
    private inventoryDialog(p: any): void {
        const s = this.game.snapshot();
        this.heading(p, 'EXPLORER / VISIBLE LOADOUT', '探索者装备', '武器、头饰、护甲与背饰，直接显示在角色身上。');
        this.button(p, '×', 737, 19, 40, 32, () => this.game.close(), false, 'close');
        const portrait = this.panel(p, 32, 149, 180, 270, '#10252c');
        this.avatar(portrait, s.loadout, 90, 198, 2, this.game.previewBack);
        this.button(p, `查看${this.game.previewBack ? '正面' : '背面'} ↻`, 16, 223, 148, 32, () => {
            this.game.previewBack = !this.game.previewBack;
            this.hooks.refresh();
        }, false, 'turn');
        this.equipment(p, s.loadout, 231, 149, 537, 2);
        if (this.game.training) {
            SLOTS.forEach((slot, i) => this.button(p, `切换${SLOT_NAME[slot]}`, 231 + (i % 2) * 275, 312 + Math.floor(i / 2) * 39, 262, 32, () => this.game.testGear(slot), false, `cycle-${slot}`));
            this.button(p, '切换品质', 231, 390, 262, 32, () => this.game.testQuality(), false, 'quality');
            this.button(p, '跳到 Boss', 506, 390, 262, 32, () => this.game.testBoss(), false, 'boss');
        }
        else
            this.text(p, '击败精英保证掉落装备。\n靠近装备可对比外观、属性与特殊效果。', 231, 326, 537, 12, C.muted);
        this.statRow(p, 447, [['最大生命', String(Math.round(s.maxHp))], ['通用伤害', `+${percent(s.stats.damage)}`], ['暴击率', percent(s.stats.crit)], ['移动加成', percent(s.stats.speed)]]);
        this.button(p, '返回探索 →', 32, 552, 225, 43, () => this.game.close(), true, 'close-inventory');
        this.text(p, this.game.training ? '练习模式 · 所有换装工具已启用' : '战斗已暂停', 285, 566, 480, 11, C.muted);
    }
    private visualQualityButton(p: any, x: number, y: number, w: number): void {
        this.button(p, '画质：' + this.game.visuals.name + ' · 点击切换', x, y, w, 44, () => {
            this.game.cycleVisualQuality();
            this.hooks.refresh();
        }, false, 'visual-quality');
    }
    private performanceButton(p: any, x: number, y: number, w: number): void {
        this.button(p, `性能指标：${this.game.showPerformance ? '开' : '关'}`, x, y, w, 44, () => {
            this.hooks.invalidate();
            this.game.togglePerformance();
        }, false, 'performance-toggle');
    }
    private pauseDialog(p: any): void {
        this.performanceButton(p, 410, 174, 358);
        this.visualQualityButton(p, 32, 308, 360);
        this.heading(p, 'SIGNAL ON HOLD', '探索已暂停', '遗迹的时间在此停留。准备好后继续前进。');
        this.button(p, `${this.game.sound ? '■' : '□'} 启用程序音效`, 32, 174, 360, 50, () => {
            this.game.sound = !this.game.sound;
            this.game.saveSettings();
            this.hooks.refresh();
        }, false, 'sound');
        this.button(p, `${this.game.shake ? '■' : '□'} 启用战斗震动`, 32, 241, 360, 50, () => {
            this.game.shake = !this.game.shake;
            this.game.saveSettings();
            this.hooks.refresh();
        }, false, 'shake');
        this.text(p, '鼠标左键：点击移动 / 按住跟随\nWASD / 方向键：移动　空格：冲刺　E：装备　Esc：暂停\n\n切换浏览器标签或窗口会自动暂停，需要点击继续恢复。', 32, 380, 736, 13, C.muted);
        this.button(p, '继续探索 →', 32, 552, 225, 43, () => this.game.close(), true, 'resume');
        this.button(p, '结束本局', 272, 552, 225, 43, () => this.game.finish(false, '本次探索已主动结束。'), false, 'quit');
    }
    private resultDialog(p: any, win: boolean, reason: string): void {
        this.heading(p, `EXPEDITION ${win ? 'COMPLETE' : 'ENDED'}`, win ? '回响归来' : '探索终止', reason);
        this.statRow(p, 153, [['探索时间', clock(this.game.time)], ['击败敌人', String(this.game.kills)], ['最终等级', String(this.game.level)], ['总伤害', String(Math.round(this.game.damage))]]);
        const portrait = this.panel(p, 32, 254, 180, 250, '#10252c');
        this.avatar(portrait, this.game.loadout, 90, 205, 2);
        this.equipment(p, this.game.loadout, 231, 254, 537, 2);
        this.text(p, this.game.training ? '练习结果不计入战绩' : '战绩保存在本机浏览器。局内强化和装备在新一局重置。', 231, 433, 537, 11, C.muted);
        this.button(p, '再次挑战 →', 32, 552, 225, 43, () => this.game.start(this.selected, this.game.training), true, 'restart');
        this.button(p, '选择其他武器', 272, 552, 225, 43, () => { this.game.returnToTitle(); }, false, 'title');
    }
}

import type { LayaSprite } from '../platform/laya.js';
import { FRAGMENTS, PARTS, PART_NAMES, complete, fragment, recipeDescription } from '../buffs/buffs.js';
import type { Part, BuffRuntime } from '../buffs/buffs.js';
import type { Enemy } from '../shared/entities.js';
import type { Stats } from '../shared/model.js';
import { C, UIControls } from './ui-controls.js';
import { evolutionOf } from '../buffs/buff-evolutions.js';
import { MASTERY } from '../buffs/buff-mastery.js';
import { BRANCH_TEXT, branchPair } from '../buffs/buff-branches.js';
import { BUFF_UPGRADES, buffLevelMultiplier } from '../buffs/buff-upgrades.js';
import { buffSynergies, fragmentChoicePreview, recipeChain } from './buff-build-view.js';
/** 由 GameUI 持有，重绘保留选择；不存放战斗属性、配方或运行时冷却。 */
export interface BuffEditorState {
    slot: number;
    picker: Part | null;
    page?: 'recipe' | 'links' | 'growth';
    notice?: string;
}
/** 当前渲染所需的最小视图。面板不保存 Game，也不接触暂停/奖励队列。 */
export interface BuffPanelState {
    buffs: Pick<BuffRuntime<Enemy>, 'recipes' | 'owned' | 'levelOf' | 'branchOf' | 'mastery' | 'growthOf'>;
    stats: Pick<Stats, 'damage' | 'element'>;
    training: boolean;
}
/** 数据操作走玩法入口，refresh 只使 UI 缓存失效并重绘，不重置 BuffRuntime。 */
export interface BuffPanelHooks {
    refresh(): void;
    toast(message: string): void;
    installBuff(slot: number, part: Part, id: string | null): void;
    unlockFragments(): void;
    close(): void;
}
/**
 * 在已创建的弹窗容器中绘制编辑页；外层负责清理旧按钮与拦截场景输入。
 * 窄屏改为单列，低高度改为双列，所有可点控件保持 44px 高度。
 * 先修改 editor/实际配方再刷新，回调不直接维护冷却，避免换配方刷免费释放。
 */
export function renderBuffPanel(p: LayaSprite, w: number, h: number, editor: BuffEditorState, state: BuffPanelState, controls: UIControls, hooks: BuffPanelHooks): void {
    const pad = 16, inner = w - 32, gap = 8, short = h < 420, narrow = w < 500, footer = h - pad - 44, recipe = state.buffs.recipes[editor.slot];
    const refresh = hooks.refresh;
    const page = editor.page || 'recipe';
    p.graphics.drawRect(1, 2, w - 2, 60, C.hud);
    for (const [i, entry] of ([['recipe', '配方编辑'], ['links', '两槽联动'], ['growth', '成长路线']] as const).entries()) {
        controls.button(p, entry[1], pad + i * (inner + gap) / 3, 10, (inner - gap * 2) / 3, 44, () => {
            editor.page = entry[0];
            editor.picker = null;
            editor.notice = undefined;
            refresh();
        }, page === entry[0], `buff-page-${entry[0]}`);
    }
    for (let i = 0; i < (editor.picker && page === 'recipe' ? 0 : 2); i++) {
        const r = state.buffs.recipes[i], evolution = complete(r) ? evolutionOf(r) : undefined;
        controls.button(p, `${i + 1}·Lv.${state.buffs.levelOf(r)} ${evolution?.name || (complete(r) ? '已启用' : '未完成')}`, pad + i * (inner + gap) / 2, 66, (inner - gap) / 2, 44, () => {
            editor.slot = i;
            editor.picker = null;
            editor.notice = undefined;
            refresh();
        }, i === editor.slot, `buff-slot-${i}`);
    }
    if (page === 'links') {
        const rows = buffSynergies(state.buffs.recipes), top = 122, cardH = (footer - top - 16) / 3;
        rows.forEach((row, i) => {
            const y = top + i * (cardH + 4), status = row.ready ? `已搭配 · 槽${row.source + 1} → 槽${row.partner + 1}` : '未搭配';
            if (!short) {
                const card = controls.panel(p, pad, y, inner, cardH, row.ready ? '#e1e8d5' : C.surface);
                card.mouseEnabled = false;
            }
            const label = controls.text(p, `${row.name} · ${status}\n${row.ready ? short ? row.brief : row.note : row.hint}`, pad + 8, y + (short ? 0 : 6), inner - 16, short ? 11 : 12, row.ready ? C.mint : C.text);
            label.leading = short ? 1 : 3;
            label.name = 'buff-link-' + row.id;
        });
    }
    else if (page === 'growth') {
        const level = state.buffs.levelOf(recipe), progress = state.buffs.growthOf(recipe), branch = state.buffs.branchOf(recipe), pair = branchPair(recipe), mastery = state.buffs.mastery.of(recipe);
        const rows = [
            complete(recipe) ? `${recipeChain(recipe)} · Lv.${level}/${BUFF_UPGRADES.maxLevel}` : '配方未完成 · 先选齐触发、行为和元素',
            progress ? `重复匹配碎片 ${progress.progress}/${progress.required} → Lv.${progress.nextLevel}` : level >= BUFF_UPGRADES.maxLevel ? '已达最高等级' : '重复匹配碎片可强化完整配方',
            branch ? '分支 · ' + BRANCH_TEXT[branch].name : pair ? 'Lv.3 二选一：' + pair.choices.map(id => BRANCH_TEXT[id].name).join(' / ') : '此配方没有专属成长分支',
            mastery ? '专精 · ' + MASTERY[mastery].name + ' · ' + MASTERY[mastery].brief : '标准探索：4/7 分钟、Lv.3 起可选专精',
        ];
        const label = controls.text(p, rows.join('\n'), pad, 122, inner, short ? 11 : 13, C.mint);
        label.leading = short ? 3 : 12;
        label.name = 'buff-growth';
        if (!short) {
            controls.text(p, '行为＋元素共享等级、分支和专精；换触发或换槽会保留。\nLv.2/4 增加伤害，Lv.3/5 强化机制；伤害最多 +20%。\n重复碎片按匹配配方分配，无可强化目标时转 5 经验。', pad, 290, inner, 12, C.muted);
        }
    }
    else if (editor.picker) {
        const part = editor.picker, pool = FRAGMENTS.filter(f => f.part === part), columns = short || !narrow ? 2 : 1, cw = (inner - gap * (columns - 1)) / columns;
        const rows = Math.ceil(pool.length / columns), cardH = Math.min(84, (footer - 122 - 8 - (rows - 1) * gap) / rows);
        const status = controls.text(p, editor.notice || `槽${editor.slot + 1} · 选择${PART_NAMES[part]}\n预览替换结果 · 点击已解锁卡片装入`, pad, 65, inner, 12, editor.notice ? C.gold : C.mint);
        status.leading = 3;
        status.name = 'buff-picker-status';
        pool.forEach((f, i) => {
            const unlocked = state.buffs.owned.has(f.id), used = recipe[part] === f.id;
            const preview = fragmentChoicePreview(state.buffs.recipes, editor.slot, part, f.id)!;
            const card = controls.button(p, '', pad + (i % columns) * (cw + gap), 122 + Math.floor(i / columns) * (cardH + gap), cw, cardH, () => {
                if (!unlocked) {
                    editor.notice = `${f.name}尚未解锁\n收集掉落碎片或领取碎片奖励后可装入`;
                    refresh();
                    return;
                }
                hooks.installBuff(editor.slot, part, f.id);
                editor.picker = null;
                editor.notice = undefined;
                refresh();
            }, false, `fragment-${f.id}`);
            controls.choiceCard(card, used);
            const tight = cardH < 62;
            controls.text(card, `${f.name}${used ? ' · 当前' : unlocked ? '' : ' · 未解锁'}`, 8, tight ? 3 : 7, cw - 16, 12, unlocked ? C.text : C.muted);
            const usage = controls.text(card, preview.usage, 8, tight ? 17 : 28, cw - 16, tight ? 10 : 11, C.muted);
            usage.leading = 1;
            usage.name = 'buff-choice-usage-' + f.id;
            const summary = controls.text(card, preview.summary, 8, tight ? 30 : 49, cw - 16, 10, unlocked ? preview.lost.length ? C.gold : C.mint : C.muted);
            summary.leading = 1;
            summary.name = 'buff-choice-preview-' + f.id;
        });
    }
    else {
        PARTS.forEach((part, i) => {
            const id = recipe[part], label = PART_NAMES[part] + ' · ' + (id ? fragment(id)!.name : '请选择'), x = pad + (narrow ? 0 : i * (inner + gap) / 3), y = 122 + (narrow ? i * 52 : 0), cw = narrow ? inner : (inner - 2 * gap) / 3;
            controls.button(p, label, x, y, cw, 44, () => {
                editor.picker = part;
                editor.notice = undefined;
                refresh();
            }, false, `buff-part-${part}`);
        });
        const mastery = state.buffs.mastery.of(recipe), tuning = mastery ? MASTERY[mastery] : undefined;
        const level = state.buffs.levelOf(recipe), branch = state.buffs.branchOf(recipe), evolution = evolutionOf(recipe);
        const descriptionY = narrow ? 282 : 176;
        const description = short && !branch && complete(recipe) ? `Lv.${level}/5 · 伤害 +${Math.round((buffLevelMultiplier(level) - 1) * 100)}%${evolution ? ' · 进化：' + evolution.name : ''}\n${recipeChain(recipe)}${tuning ? ' · ' + tuning.name : ''}` : recipeDescription(recipe, 1 + state.stats.damage + state.stats.element, level, branch, short || h < 620, tuning?.cooldown, tuning?.damage) + (tuning ? short ? ' · ' + tuning.name : '\n专精 · ' + tuning.name + ' · ' + tuning.brief : '');
        const unlock = state.training && descriptionY + 184 < footer, contentBottom = footer - (unlock ? 64 : 8);
        // 进化说明增加行数后，按保守字符宽度预留高度，不能仍用固定的 +78 放次级说明。
        let fontSize = short ? 11 : 13;
        const leading = short ? 2 : 4;
        const textHeight = (size: number) => description.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(inner / size)))), 0) * (size + leading) + 4;
        while (fontSize > 10 && descriptionY + textHeight(fontSize) > contentBottom)
            fontSize--;
        const height = textHeight(fontSize);
        if (descriptionY + height <= contentBottom) {
            const label = controls.text(p, description, pad, descriptionY, inner, fontSize, C.mint);
            label.leading = leading;
            label.name = 'buff-description';
        }
        const noteY = descriptionY + height + 8;
        if (noteY + 42 < contentBottom)
            controls.text(p, '上方「两槽联动」查看搭配条件；\n「成长路线」查看碎片进度、分支与专精。', pad, noteY, inner, 11, C.muted);
        if (unlock)
            controls.button(p, '练习：解锁全部碎片', pad, footer - 56, Math.min(inner, 240), 44, () => hooks.unlockFragments(), false, 'buff-unlock');
    }
    if (page !== 'recipe' || editor.picker) {
        controls.button(p, '返回配方', pad, footer, (inner - gap) / 2, 44, () => {
            editor.page = 'recipe';
            editor.picker = null;
            editor.notice = undefined;
            refresh();
        }, false, 'buff-back');
    }
    else {
        controls.button(p, '清空当前配方', pad, footer, (inner - gap) / 2, 44, () => {
            for (const part of PARTS)
                hooks.installBuff(editor.slot, part, null);
            refresh();
        }, false, 'buff-clear');
    }
    controls.button(p, '返回探索 →', pad + (inner + gap) / 2, footer, (inner - gap) / 2, 44, () => hooks.close(), true, 'buff-close');
    // 编辑只替换配方槽位；冷却由运行时保留，反复切换不能绕过释放间隔。
}

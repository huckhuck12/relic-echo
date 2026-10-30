import { FRAGMENTS, PARTS, PART_NAMES, complete, fragment, recipeDescription } from '../buffs/buffs.js';
import type { Part, BuffRuntime } from '../buffs/buffs.js';
import type { Enemy } from '../shared/entities.js';
import type { Stats } from '../shared/model.js';
import { C, UIControls } from './ui-controls.js';
import { evolutionOf } from '../buffs/buff-evolutions.js';
/** 由 GameUI 持有，重绘保留选择；不存放战斗属性、配方或运行时冷却。 */
export interface BuffEditorState {
    slot: number;
    picker: Part | null;
}
/** 当前渲染所需的最小视图。面板不保存 Game，也不接触暂停/奖励队列。 */
export interface BuffPanelState {
    buffs: Pick<BuffRuntime<Enemy>, 'recipes' | 'owned' | 'levelOf'>;
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
export function renderBuffPanel(p: any, w: number, h: number, editor: BuffEditorState, state: BuffPanelState, controls: UIControls, hooks: BuffPanelHooks): void {
    const pad = 16, inner = w - 32, gap = 8, short = h < 420, narrow = w < 500, footer = h - pad - 44, recipe = state.buffs.recipes[editor.slot];
    const refresh = hooks.refresh;
    controls.text(p, '碎片组合 · 战斗已暂停', pad, 12, inner, short ? 17 : 21, C.gold);
    for (let i = 0; i < 2; i++) {
        const r = state.buffs.recipes[i], evolution = complete(r) ? evolutionOf(r) : undefined;
        controls.button(p, `${i + 1}·Lv.${state.buffs.levelOf(r)} ${evolution?.name || (complete(r) ? '已启用' : '未完成')}`, pad + i * (inner + gap) / 2, 47, (inner - gap) / 2, 44, () => {
            editor.slot = i;
            editor.picker = null;
            refresh();
        }, i === editor.slot, `buff-slot-${i}`);
    }
    if (editor.picker) {
        const part = editor.picker, pool = FRAGMENTS.filter(f => f.part === part), columns = short || !narrow ? 2 : 1, cw = (inner - gap * (columns - 1)) / columns;
        pool.forEach((f, i) => {
            const unlocked = state.buffs.owned.has(f.id), used = recipe[part] === f.id;
            controls.button(p, `${used ? '✓ ' : ''}${f.name}${unlocked ? '' : ' · 未解锁'}`, pad + (i % columns) * (cw + gap), 103 + Math.floor(i / columns) * 52, cw, 44, () => {
                if (!unlocked) {
                    hooks.toast('击败怪物收集金边碎片，解锁后可组合');
                    return;
                }
                hooks.installBuff(editor.slot, part, f.id);
                editor.picker = null;
                refresh();
            }, used, `fragment-${f.id}`);
        });
        const infoY = 103 + Math.ceil(pool.length / columns) * 52 + 4;
        if (infoY + 40 < footer)
            controls.text(p, '重复碎片强化匹配的完整配方，最高 Lv.5；满级或无匹配时转 5 经验。', pad, infoY, inner, 12, C.muted);
        controls.button(p, '返回配方', pad, footer, (inner - gap) / 2, 44, () => {
            editor.picker = null;
            refresh();
        }, false, 'buff-back');
    }
    else {
        PARTS.forEach((part, i) => {
            const id = recipe[part], label = PART_NAMES[part] + ' · ' + (id ? fragment(id)!.name : '请选择'), x = pad + (narrow ? 0 : i * (inner + gap) / 3), y = 103 + (narrow ? i * 52 : 0), cw = narrow ? inner : (inner - 2 * gap) / 3;
            controls.button(p, label, x, y, cw, 44, () => {
                editor.picker = part;
                refresh();
            }, false, `buff-part-${part}`);
        });
        const descriptionY = narrow ? 263 : 158, description = recipeDescription(recipe, 1 + state.stats.damage + state.stats.element, state.buffs.levelOf(recipe));
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
        if (noteY + 62 < contentBottom)
            controls.text(p, '重复碎片匹配完整配方时升级，每级伤害 +20%，最高 Lv.5。\n进化同享加成，等级随具体组合保留，重开清零。', pad, noteY, inner, 11, C.muted);
        if (unlock)
            controls.button(p, '练习：解锁全部碎片', pad, footer - 56, Math.min(inner, 240), 44, () => hooks.unlockFragments(), false, 'buff-unlock');
        controls.button(p, '清空当前配方', pad, footer, (inner - gap) / 2, 44, () => {
            for (const part of PARTS)
                hooks.installBuff(editor.slot, part, null);
            refresh();
        }, false, 'buff-clear');
    }
    controls.button(p, '返回探索 →', pad + (inner + gap) / 2, footer, (inner - gap) / 2, 44, () => hooks.close(), true, 'buff-close');
    // 编辑只替换配方槽位；冷却由运行时保留，反复切换不能绕过释放间隔。
}

import type { LayaSprite } from '../platform/laya.js';
import { C, UIControls } from './ui-controls.js';
import { AUTO_BUILDS } from '../game/auto-builds.js';
import type { AutoBuildBranch } from '../game/auto-builds.js';
import { RUNS } from '../game/pace.js';
import type { RunKind } from '../game/pace.js';
import { gear } from '../progression/config.js';
import type { Weapon } from '../progression/config.js';
export interface AutoPlayDraft {
    branch?: AutoBuildBranch;
    weapon?: Weapon;
    runKind: RunKind;
}
/** Local settings page: editing never starts a run or grants a reward. */
export function renderAutoPlaySettings(p: LayaSprite, w: number, h: number, controls: UIControls, draft: AutoPlayDraft, valid: () => boolean, change: (draft: AutoPlayDraft) => void, start: (stress: boolean) => void, back: () => void): void {
    const pad = Math.min(24, w * .05), inner = w - pad * 2, gap = 8, short = h < 380;
    const guarded = (action: () => void) => () => {
        if (valid())
            action();
    };
    controls.text(p, '自动试玩 · 新局设置', pad, 16, inner, short ? 20 : 24, C.gold);
    if (!short)
        controls.text(p, '点按切换选项，选择正常试玩或保命压测启动。', pad, 55, inner, 12, C.muted);
    const branches: (AutoBuildBranch | undefined)[] = [undefined, ...AUTO_BUILDS.map(profile => profile.branch)];
    const weapons: (Weapon | undefined)[] = [undefined, 'storm', 'flame', 'blade'];
    const rows = [
        { name: 'autoplay-build', text: '构筑：' + (AUTO_BUILDS.find(profile => profile.branch === draft.branch)?.name || '全部六分支轮换'), action: () => change({ ...draft, branch: branches[(branches.indexOf(draft.branch) + 1) % branches.length] }) },
        { name: 'autoplay-weapon', text: '武器：' + (draft.weapon ? gear(draft.weapon).name : '全部三武器轮换'), action: () => change({ ...draft, weapon: weapons[(weapons.indexOf(draft.weapon) + 1) % weapons.length] }) },
        { name: 'autoplay-mode', text: '时长：' + RUNS[draft.runKind].name + ' · ' + RUNS[draft.runKind].duration / 60 + ' 分钟', action: () => change({ ...draft, runKind: draft.runKind === 'standard' ? 'quick' : 'standard' }) },
    ];
    for (const [i, row] of rows.entries())
        controls.button(p, row.text + '  ›', pad, (short ? 52 : 96) + i * 52, inner, 44, guarded(row.action), false, row.name);
    if (!short)
        controls.text(p, '按正常奖励获得起始搭配、碎片与分支，不直接授予满级。\n指定分支或武器后，结算重开继续测试该选择。\n正常试玩会死亡；保命压测致命伤保留 1 血。\n启动会开启新局；测试局不计战绩，触摸仍需手动验收。', pad, 266, inner, 12, C.muted);
    const footer = h - pad - 44, bw = (inner - gap * 2) / 3;
    controls.button(p, '返回', pad, footer, bw, 44, guarded(back), false, 'autoplay-back');
    controls.button(p, '正常试玩', pad + bw + gap, footer, bw, 44, guarded(() => start(false)), true, 'autoplay-run');
    controls.button(p, '保命压测', pad + 2 * (bw + gap), footer, bw, 44, guarded(() => start(true)), false, 'autoplay-run-stress');
}

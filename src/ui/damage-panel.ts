import type { LayaSprite } from '../platform/laya.js';
import type { DamageRanking } from '../combat/damage-ranking.js';
import { C, UIControls } from './ui-controls.js';
const amount = (value: number): string => value >= 1e8 ? (value / 1e8).toFixed(1) + '亿' : value >= 1e4 ? (value / 1e4).toFixed(1) + '万' : String(Math.round(value));
/** Rendering happens only on opening, resizing or paging; battle never updates this view. */
export function renderDamagePanel(p: LayaSprite, w: number, h: number, ranking: DamageRanking, page: number, ui: UIControls, change: (page: number) => void, back: () => void, control?: {
    slowed: number;
    slowedEnemySeconds: number;
}): void {
    const pad = 16, inner = w - pad * 2, top = 110, footer = h - pad - 44;
    const count = Math.max(1, Math.floor((footer - top - 8) / 48));
    const rows = ranking.rows(), pages = Math.max(1, Math.ceil(rows.length / count));
    page = Math.max(0, Math.min(pages - 1, page));
    ui.text(p, '伤害排行', pad, 14, inner, 23, C.gold);
    ui.text(p, `有效伤害 ${Math.round(ranking.total).toLocaleString()}  ·  ${page + 1} / ${pages} 页`, pad, 46, inner, 14, C.text).name = 'damage-total';
    ui.text(p, control ? `有效扣血，含灼烧、连锁和进化。\n减速 ${control.slowed} 敌 · 累计 ${Math.round(control.slowedEnemySeconds)} 敌秒` : '扣血统计，不含溢出；同形态/元素合并。\n灼烧、连锁、进化归入来源，新局清零。', pad, 70, inner, 11, C.muted).name = 'damage-control';
    if (!rows.length)
        ui.text(p, '尚未造成伤害，开始战斗后可查看。', pad, top + 12, inner, 14, C.muted).name = 'damage-empty';
    rows.slice(page * count, (page + 1) * count).forEach((row, index) => {
        const y = top + index * 48;
        ui.text(p, `${page * count + index + 1}. ${row.name}`, pad, y, inner * .6, 13, C.text).name = `damage-row-${row.id}`;
        ui.text(p, `${amount(row.damage)} · ${(row.share * 100).toFixed(1)}%`, pad + inner * .6, y, inner * .4, 12, C.gold, 'right');
        p.graphics.drawRect(pad, y + 29, inner, 5, C.surface);
        p.graphics.drawRect(pad, y + 29, inner * row.share, 5, C.mint);
    });
    const bw = (inner - 16) / 3;
    ui.button(p, '上一页', pad, footer, bw, 44, () => change(Math.max(0, page - 1)), false, 'damage-prev');
    ui.button(p, '返回', pad + bw + 8, footer, bw, 44, back, true, 'damage-back');
    ui.button(p, '下一页', pad + 2 * (bw + 8), footer, bw, 44, () => change(Math.min(pages - 1, page + 1)), false, 'damage-next');
}

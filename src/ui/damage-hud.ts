import type { LayaSprite, LayaText } from '../platform/laya.js';
import type { DamageRanking } from '../combat/damage-ranking.js';
import type { ScreenLayout } from './layout.js';
import { damageHUDLayout } from './hud-layout.js';
import { UIControls, C } from './ui-controls.js';
const amount = (value: number): string => value >= 1e8 ? (value / 1e8).toFixed(1) + '亿' : value >= 1e4 ? (value / 1e4).toFixed(1) + '万' : String(Math.round(value));
/** Persistent hit target and text nodes. Only changed damage refreshes, at most four times/second. */
export class DamageHUD {
    readonly panel: LayaSprite;
    private labels: LayaText[] = [];
    private shownRevision = -1;
    private nextUpdate = 0;
    private count = 3;
    constructor(parent: LayaSprite, controls: UIControls, open: () => void) {
        this.panel = controls.button(parent, '', 0, 0, 184, 80, open, false, 'damage-hud');
        controls.text(this.panel, '伤害排行 · 详情 ›', 6, 5, 172, 11, C.hudGold).name = 'damage-hud-title';
        for (let i = 0; i < 3; i++) {
            const label = controls.text(this.panel, '', 6, 22 + i * 16, 172, 10, C.hudText);
            label.name = 'damage-hud-row-' + i;
            label.wordWrap = false;
            label.overflow = 'hidden';
            this.labels.push(label);
        }
        this.panel.visible = false;
    }
    resize(layout: ScreenLayout, mobile: boolean): void {
        const box = damageHUDLayout(layout, mobile);
        this.panel.pos(box.x, box.y);
        this.panel.size(box.width, box.height);
        this.panel.graphics.clear();
        this.panel.graphics.drawRect(0, 0, box.width, box.height, C.hud, C.hudLine, 1);
        this.panel.alpha = .9;
        this.panel.getChildAt(1)!.width = box.width - 12;
        this.count = Math.min(3, Math.floor((box.height - 20) / 16));
        this.labels.forEach((label, index) => {
            label.width = box.width - 12;
            label.visible = index < this.count;
        });
        this.shownRevision = -1;
        this.nextUpdate = 0;
    }
    update(ranking: DamageRanking, visible: boolean, now: number): void {
        const opening = visible && !this.panel.visible;
        this.panel.visible = visible;
        if (!visible || !opening && (ranking.revision === this.shownRevision || now < this.nextUpdate))
            return;
        this.shownRevision = ranking.revision;
        this.nextUpdate = now + 250;
        const rows = ranking.rows();
        this.labels.forEach((label, index) => {
            const row = rows[index];
            const name = row?.name.replace('武器 · ', '').replace(' · ', '·');
            const value = row ? `${name}  ${amount(row.damage)}  ${(row.share * 100).toFixed(0)}%` : index === 0 ? '尚未造成伤害' : '';
            if (label.text !== value)
                label.text = value;
        });
    }
}

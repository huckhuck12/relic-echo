import type { Game } from '../game/game.js';
import { UIControls, C } from './ui-controls.js';
/** 平台/诊断弹窗共用响应式排版；不自行处理广告结果或修改生命。 */
export function renderSystemDialog(type: 'revive' | 'performance', parent: any, w: number, h: number, game: Game, ui: UIControls): void {
    const pad = Math.min(24, w * .05), inner = w - pad * 2, short = h < 400;
    ui.text(parent, type === 'revive' ? 'RELIC ECHO / SECOND CHANCE' : 'RELIC ECHO / PERFORMANCE', pad, pad, inner, 10, C.mint);
    ui.text(parent, type === 'revive' ? '让回响再次燃起' : '性能详情', pad, pad + 26, inner, 23, C.gold);
    const body = short ? 82 : 120;
    if (type === 'revive') {
        ui.text(parent, '每局仅一次 · 恢复 50% 生命\n清除敌方弹道和危险区 · 无敌 3 秒\n保留当前装备、等级与 Buff', pad, body, inner, short ? 12 : 15);
        ui.text(parent, game.revival.busy ? '正在等待结果，可结束本局取消。' : game.reviveMessage || '当前为测试复活，尚未接入广告。', pad, h - pad - 110, inner, 11, C.muted);
        const gap = 10, bw = (inner - gap) / 2;
        ui.button(parent, game.revival.busy ? '等待中…' : game.revival.provider.label, pad, h - pad - 44, bw, 44, () => { void game.requestRevive(); }, true, 'revive-confirm');
        ui.button(parent, '结束本局', pad + bw + gap, h - pad - 44, bw, 44, () => game.finish(false, '探索者倒下了。'), false, 'revive-skip');
    }
    else {
        // 打开时冻结的一份采样，不在暂停期间反复重建节点。
        const p = game.performanceSnapshot();
        const text = p.samples ? `${p.fps.toFixed(0)} FPS · 平均 ${p.frameMs.toFixed(1)} ms\nP95 ${p.p95Ms.toFixed(1)} / 最慢 ${p.maxMs.toFixed(1)} ms\n更新 ${p.updateMs.toFixed(1)} / 绘图指令 ${p.renderMs.toFixed(1)} ms\n怪 ${p.enemies} · 弹 ${p.shots} · 掉落 ${p.drops} · 效果 ${p.effects}` : '尚无战斗采样，继续探索后再查看。';
        ui.text(parent, text, pad, body, inner, short ? 12 : 15);
        if (!short)
            ui.text(parent, '最近 300 个前台战斗帧；不包含 GPU 耗时。\nP 键或暂停菜单可关闭监控。', pad, body + 142, inner, 12, C.muted);
        ui.button(parent, '继续探索', pad, h - pad - 44, (inner - 10) / 2, 44, () => game.close(), true, 'performance-resume');
        ui.button(parent, '关闭监控', pad + (inner + 10) / 2, h - pad - 44, (inner - 10) / 2, 44, () => {
            game.togglePerformance();
            game.close();
        }, false, 'performance-hide');
    }
}

import type { LayaSprite } from '../platform/laya.js';
import type { Game } from '../game/game.js';
import { UIControls, C } from './ui-controls.js';
import { GAME_VERSION } from '../shared/version.js';
/** 平台/诊断弹窗共用响应式排版；不自行处理广告结果或修改生命。 */
export function renderSystemDialog(type: 'revive' | 'performance', parent: LayaSprite, w: number, h: number, game: Game, ui: UIControls): void {
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
        ui.text(parent, `当前版本 v${GAME_VERSION}`, pad, pad + 60, inner, 11, C.muted).name = 'build-version';
        // 打开时冻结的一份采样，不在暂停期间反复重建节点。
        const p = game.performanceSnapshot();
        const text = p.samples ? `${p.fps.toFixed(0)} FPS · 平均 ${p.frameMs.toFixed(1)} ms\nP95 ${p.p95Ms.toFixed(1)} / 最慢 ${p.maxMs.toFixed(1)} ms\n更新 ${p.updateMs.toFixed(1)} / 指令 ${p.renderMs.toFixed(1)} ms\n模拟 ${p.simulationSteps.toFixed(1)} 步/帧 · 单步 ${p.stepMs.toFixed(1)} ms\n引擎等 CPU ${p.engineSamples ? p.engineMs.toFixed(1) + ' ms' : '待采样'} · DrawCall ${p.drawCalls.toFixed(0)}\n怪 ${p.enemies} · 弹 ${p.shots} · 掉落 ${p.drops} · 效果 ${p.effects}\n${p.quality} · 怪物图集 ${p.enemyAtlasReady ? '就绪' : '回退'} ? ???? ${(p.sceneTextureBytes / 1048576).toFixed(1)} MiB` : '尚无战斗采样，继续探索后再查看。';
        const report = game.drawCallProbe.showReport ? game.drawCallProbe.report : null;
        if (report) {
            ui.text(parent, `全景 DC ${report.baseline} / 复测 ${report.finalBaseline} · ${report.stable ? '稳定' : '有漂移，建议重测'}`, pad, body, inner, short ? 11 : 13, C.gold);
            ui.text(parent, `局内 ${Number(report.context.seconds).toFixed(0)} 秒 · 隐藏各类后减少的 DC：`, pad, body + 22, inner, 11, C.muted);
            report.rows.forEach((row, i) => {
                const column = i < 5 ? 0 : 1, line = i % 5;
                ui.text(parent, `${row.label} ${row.saved >= 0 ? '−' : '+'}${Math.abs(row.saved)}`, pad + column * (inner + 10) / 2, body + 40 + line * 16, (inner - 10) / 2, 11).name = `drawcall-${row.group}`;
            });
            ui.text(parent, '差值不可相加；完整数据见运行诊断。', pad, body + 125, inner, 10, C.muted);
        }
        else {
            ui.text(parent, text, pad, body, inner, short ? 12 : 15);
            if (!short)
                ui.text(parent, '最近 300 个前台战斗帧；不包含 GPU 耗时。\n引擎等 CPU 包含绘制提交及其他定时任务。', pad, body + 190, inner, 12, C.muted);
        }
        if (game.drawCallProbe.error)
            ui.text(parent, game.drawCallProbe.error, pad, h - pad - (short ? 72 : 124), inner, 10, C.gold);
        const bw = short ? (inner - 20) / 3 : (inner - 10) / 2, footer = h - pad - 44;
        ui.button(parent, short && report ? '帧统计' : report ? '重新拆分' : '拆分 DC', short ? pad + 2 * (bw + 10) : pad, short ? footer : footer - 50, short || report ? bw : inner, 44, () => short && report ? game.showFrameStatistics() : game.measureDrawCalls(), false, 'drawcall-measure');
        if (report && !short)
            ui.button(parent, '帧统计', pad + bw + 10, footer - 50, bw, 44, () => game.showFrameStatistics(), false, 'performance-summary');
        if (!report && !short)
            ui.text(parent, '拆分会冻结战斗并短暂隐藏各类画面，约需 60 帧。', pad, footer - 78, inner, 10, C.muted);
        ui.button(parent, '继续探索', pad, footer, bw, 44, () => game.close(), true, 'performance-resume');
        ui.button(parent, '关闭监控', pad + bw + 10, footer, bw, 44, () => {
            game.togglePerformance();
            game.close();
        }, false, 'performance-hide');
    }
}

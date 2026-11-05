import type { Game } from '../game/game.js';
import type { UIControls } from './ui-controls.js';
import { C } from './ui-controls.js';
import { SEAL_REWARDS } from '../game/map-events.js';
/** Uses the same reward token transaction as level-up cards. */
export function renderMapEventReward(parent: any, w: number, h: number, site: string, game: Game, controls: UIControls): void {
    const pad = 18, token = game.flow.dialogId, inner = w - pad * 2, short = h < 350;
    controls.text(parent, '封印已稳定', pad, 18, inner, 24, C.gold);
    const remaining = Math.max(0, Math.ceil(game.mapEvents.reliefUntil - game.time));
    controls.text(parent, `${site} · ${remaining > 0 ? remaining + ' 秒整备，' : ''}选择补给`, pad, 53, inner, 13, C.muted);
    const top = short ? 90 : 112, gap = 12, cardH = Math.min(100, (h - top - pad - gap) / 2);
    for (const [i, id] of ['fragment', 'heal'].entries()) {
        const amount = Math.max(0, Math.min(game.stats.hp - game.player.hp, game.stats.hp * (id === 'fragment' ? SEAL_REWARDS.fragmentHeal : SEAL_REWARDS.heal)));
        const label = id === 'fragment' ? '碎片与补给' : '生命泉涌';
        const note = id === 'fragment' ? `恢复 ${Math.round(amount)} 生命（最多 15%），再从三枚碎片中选择。` : amount > 0 ? `恢复 ${Math.round(amount)} 点生命，最多为生命上限的 45%。` : '生命已满 · 建议选择碎片。';
        const card = controls.button(parent, '', pad, top + i * (cardH + gap), inner, cardH, () => game.claimReward(token, { type: 'event', id }), false, `event-${id}`);
        controls.text(card, label, 14, 10, inner - 28, 17, C.gold);
        controls.text(card, note, 14, 37, inner - 28, 12, C.muted);
    }
}

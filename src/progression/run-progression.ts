import { candidates, equip, nextXP, resolveStats, salvage } from '../shared/model.js';
import type { Loadout, Stats } from '../shared/model.js';
import type { Player, Enemy } from '../shared/entities.js';
import { gear } from './config.js';
import type { Item } from './config.js';
import { weaponOf } from '../rendering/appearance.js';
import { FRAGMENTS, BuffRuntime } from '../buffs/buffs.js';
import { fragmentChoices, fragmentRewardText } from './fragment-rewards.js';
import type { Dialog } from '../game/run-flow.js';
/** 只共享成长所需的局内数据；渲染节点、输入、帧时钟不进入奖励事务。 */
export interface ProgressionState {
    readonly dialog: Dialog;
    readonly buffs: BuffRuntime<Enemy>;
    player: Player;
    loadout: Loadout;
    stats: Stats;
    levels: Record<string, number>;
    xp: number;
    level: number;
}
export interface ProgressionHooks {
    groundFragments(): string[];
    resetRecoil(): void;
    scheduleAttack(delay: number): void;
    drawAvatar(force: boolean): void;
    ring(x: number, y: number, color: string): void;
    beep(frequency: number, duration: number): void;
    show(dialog: NonNullable<Dialog>): void;
    close(): void;
    onToast(message: string): void;
}
/** 奖励先提交数据，再推进弹窗队列；候选仅在实际显示时依据最新状态生成。 */
export class RunProgression {
    constructor(private readonly state: () => ProgressionState, private readonly hooks: ProgressionHooks) { }
    /** 实际显示奖励时生成候选，排队期间不保存过期属性。 */
    prepareDialog(dialog: NonNullable<Dialog>): NonNullable<Dialog> {
        const state = this.state();
        if (dialog.type === 'upgrade')
            return { type: 'upgrade', choices: candidates(state.levels, weaponOf(state.loadout)) };
        if (dialog.type === 'fragment') {
            const ground = new Set(this.hooks.groundFragments());
            const upgradable = new Set(FRAGMENTS.filter(part => state.buffs.upgradePreview(part.id)).map(part => part.id));
            return { type: 'fragment', choices: fragmentChoices(state.buffs.owned, ground, Math.random, upgradable) };
        }
        return dialog;
    }
    /** 重复碎片的经验兜底先入队，再关闭本次选择。 */
    chooseFragment(id: string): void {
        const state = this.state();
        if (state.dialog?.type !== 'fragment' || !state.dialog.choices.includes(id))
            return;
        const reward = state.buffs.receiveFragment(id);
        if (reward.kind === 'xp')
            this.addXP(reward.amount);
        this.hooks.onToast(fragmentRewardText(id, reward));
        this.hooks.close();
    }
    /** 只接受当前候选，强化提交后再推进下一份奖励。 */
    chooseUpgrade(id: string): void {
        const state = this.state();
        if (state.dialog?.type !== 'upgrade' || !state.dialog.choices.includes(id))
            return;
        if (id === 'heal') {
            state.player.hp = Math.min(state.stats.hp, state.player.hp + state.stats.hp * .3);
        }
        else {
            state.levels[id] = (state.levels[id] || 0) + 1;
            state.stats = resolveStats(state.loadout, state.levels);
            if (id === 'vital')
                state.player.hp = Math.min(state.stats.hp, state.player.hp + 20);
        }
        this.hooks.beep(850, .12);
        this.hooks.close();
    }
    /** 穿戴和分解都可能产生升级，必须先结算后关闭比较面板。 */
    takeDrop(accept: boolean): void {
        const state = this.state();
        if (state.dialog?.type !== 'drop')
            return;
        const item = state.dialog.item;
        if (accept)
            this.putOn(item);
        else
            this.addXP(salvage(item.quality));
        this.hooks.close();
    }
    /** 整套重算属性；旧装备分解，换装不会额外回血。 */
    putOn(item: Item): void {
        const state = this.state();
        const result = equip(state.loadout, item, state.player.hp, state.levels);
        state.loadout = result.loadout;
        // 换武器立即取消旧施放姿态，避免暂停试装再换回来时恢复上一把武器的半截动作。
        if (gear(item).slot === 'weapon') {
            state.player.castTime = 0;
            state.player.castWeapon = undefined;
            this.hooks.resetRecoil();
        }
        state.player.hp = result.hp;
        state.stats = resolveStats(state.loadout, state.levels);
        this.addXP(result.xp);
        this.hooks.scheduleAttack(.2);
        this.hooks.drawAvatar(true);
        this.hooks.ring(state.player.x, state.player.y, gear(item).color);
        this.hooks.beep(730, .12);
        this.hooks.onToast(`已穿戴 ${gear(item).name} · 角色外观已更新`);
    }
    /** 经验立即扣除并提升等级，多个选卡请求按顺序进入 RunFlow。 */
    addXP(amount: number): void {
        const state = this.state();
        state.xp += amount;
        while (state.xp >= nextXP(state.level)) {
            state.xp -= nextXP(state.level);
            state.level++;
            this.hooks.show({ type: 'upgrade', choices: candidates(state.levels, weaponOf(state.loadout)) });
            this.hooks.beep(930, .13);
        }
    }
}

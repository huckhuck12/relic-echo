import { candidates, equip, nextXP, resolveStats, salvage } from '../shared/model.js';
import type { Loadout, Stats } from '../shared/model.js';
import type { Player, Enemy } from '../shared/entities.js';
import { gear, UPGRADES } from './config.js';
import type { Item } from './config.js';
import { weaponOf } from '../rendering/appearance.js';
import { MASTERY } from '../buffs/buff-mastery.js';
import type { Mastery } from '../buffs/buff-mastery.js';
import { BRANCH_TEXT } from '../buffs/buff-branches.js';
import type { BuffBranch } from '../buffs/buff-types.js';
import { FRAGMENTS, BuffRuntime } from '../buffs/buffs.js';
import { fragmentChoices, fragmentRewardText } from './fragment-rewards.js';
import type { Dialog } from '../game/run-flow.js';
import { SEAL_REWARDS } from '../game/map-events.js';
/** 只共享成长所需的局内数据；渲染节点、输入、帧时钟不进入奖励事务。 */
export interface ProgressionState {
    readonly dialog: Dialog;
    readonly runKind?: 'quick' | 'standard';
    readonly buffs: BuffRuntime<Enemy>;
    player: Player;
    loadout: Loadout;
    stats: Stats;
    levels: Record<string, number>;
    xp: number;
    level: number;
    upgradeFeedback: string;
}
export interface ProgressionHooks {
    groundFragments(): string[];
    resetRecoil(): void;
    scheduleAttack(delay: number): void;
    drawAvatar(force: boolean): void;
    ring(x: number, y: number, color: string): void;
    beep(frequency: number, duration: number): void;
    show(dialog: NonNullable<Dialog>): void;
    settleReward(dialogId: number, commit: () => boolean): boolean;
    onToast(message: string): void;
}
/** UI 必须提交绘制时的 dialogId，内容相同也不能借用下一份奖励的身份。 */
export type RewardChoice = {
    type: 'upgrade';
    id: string;
} | {
    type: 'fragment';
    id: string;
} | {
    type: 'build' | 'branch' | 'event' | 'mastery';
    id: string;
} | {
    type: 'drop';
    accept: boolean;
};
interface RewardReceipt {
    message?: string;
    sound?: [
        number,
        number
    ];
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
    /** 校验、写入、推进队列共用一个入口；反馈仅在成功领取后发出。 */
    claimReward(dialogId: number, choice: RewardChoice): boolean {
        let receipt: RewardReceipt = {};
        const claimed = this.hooks.settleReward(dialogId, () => {
            const applied = this.applyReward(choice);
            if (!applied)
                return false;
            receipt = applied;
            return true;
        });
        if (!claimed)
            return false;
        if (receipt.sound)
            this.hooks.beep(...receipt.sound);
        if (receipt.message)
            this.hooks.onToast(receipt.message);
        return true;
    }
    /** 这里只提交当前候选；经验产生的新奖励在当前奖励之后排队。 */
    private applyReward(choice: RewardChoice): RewardReceipt | null {
        const state = this.state();
        const dialog = state.dialog;
        if (!dialog || dialog.type !== choice.type)
            return null;
        if (choice.type === 'event' && dialog.type === 'event') {
            if (choice.id === 'fragment') {
                const before = state.player.hp;
                state.player.hp = Math.min(state.stats.hp, before + state.stats.hp * SEAL_REWARDS.fragmentHeal);
                this.hooks.show({ type: 'fragment', choices: [] });
                return { message: `封印奖励 · 恢复 ${Math.round(state.player.hp - before)} 生命，选择一枚碎片` };
            }
            if (choice.id !== 'heal')
                return null;
            const before = state.player.hp;
            state.player.hp = Math.min(state.stats.hp, before + state.stats.hp * SEAL_REWARDS.heal);
            return { message: state.player.hp > before ? '封印奖励 · 已恢复生命' : '生命已满，本次奖励已领取' };
        }
        if (choice.type === 'mastery' && dialog.type === 'mastery') {
            if (!dialog.choices.includes(choice.id) || !state.buffs.mastery.choose(dialog.pair, choice.id))
                return null;
            return { message: `专精已生效 · ${MASTERY[choice.id as Mastery].name}` };
        }
        if (choice.type === 'build' && dialog.type === 'build') {
            if (!dialog.choices.includes(choice.id) || !state.buffs.chooseStarter(choice.id))
                return null;
            if (choice.id === 'free')
                this.hooks.show({ type: 'upgrade', choices: [] });
            return { message: choice.id === 'free' ? '保留自由组合' : '两槽配方已装入 · 可随时在 Buff 面板修改' };
        }
        if (choice.type === 'branch' && dialog.type === 'branch') {
            if (!dialog.choices.includes(choice.id) || !state.buffs.chooseBranch(choice.id, dialog.pair))
                return null;
            return { message: `已选择 ${BRANCH_TEXT[choice.id as BuffBranch].name} · 成长分支已生效` };
        }
        if (choice.type === 'fragment' && dialog.type === 'fragment') {
            if (!dialog.choices.includes(choice.id) || !FRAGMENTS.some(f => f.id === choice.id))
                return null;
            const reward = state.buffs.receiveFragment(choice.id);
            if (reward.kind === 'xp')
                this.addXP(reward.amount);
            return { message: fragmentRewardText(choice.id, reward) };
        }
        if (choice.type === 'drop' && dialog.type === 'drop') {
            if (choice.accept)
                return { message: this.equipItem(dialog.item) };
            this.addXP(salvage(dialog.item.quality));
            return {};
        }
        if (choice.type !== 'upgrade' || dialog.type !== 'upgrade' || !dialog.choices.includes(choice.id))
            return null;
        const id = choice.id;
        if (id !== 'heal') {
            const upgrade = UPGRADES.find(u => u.id === id);
            if (!upgrade || (state.levels[id] || 0) >= upgrade.max)
                return null;
        }
        if (id === 'heal') {
            const before = state.player.hp;
            state.player.hp = Math.min(state.stats.hp, state.player.hp + state.stats.hp * .3);
            state.upgradeFeedback = state.player.hp > before ? `已恢复 ${Math.round(state.player.hp - before)} 点生命` : '生命已满，本次奖励已领取';
        }
        else {
            state.upgradeFeedback = '';
            state.levels[id] = (state.levels[id] || 0) + 1;
            state.stats = resolveStats(state.loadout, state.levels);
            if (id === 'vital')
                state.player.hp = Math.min(state.stats.hp, state.player.hp + 20);
        }
        return { message: state.upgradeFeedback, sound: [850, .12] };
    }
    /** 整套重算属性；旧装备分解，换装不会额外回血。 */
    putOn(item: Item): void {
        this.hooks.onToast(this.equipItem(item));
    }
    private equipItem(item: Item): string {
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
        return `已穿戴 ${gear(item).name} · 角色外观已更新`;
    }
    /** 经验立即扣除并提升等级，多个选卡请求按顺序进入 RunFlow。 */
    addXP(amount: number): void {
        const state = this.state();
        state.xp += amount;
        while (state.xp >= nextXP(state.level, state.runKind === 'standard')) {
            state.xp -= nextXP(state.level, state.runKind === 'standard');
            state.level++;
            this.hooks.show(state.buffs.requestStarter() ? { type: 'build', choices: ['fire', 'ice', 'thunder', 'free'] } : { type: 'upgrade', choices: candidates(state.levels, weaponOf(state.loadout)) });
            this.hooks.beep(930, .13);
        }
    }
}

import type { Item } from '../progression/config.js';
import { PauseGate } from '../shared/model.js';
/** UI 请求描述，不含 Laya 节点，流程模块可在无浏览器环境下测试。 */
export type Dialog = {
    type: 'start';
} | {
    type: 'upgrade';
    choices: string[];
} | {
    type: 'fragment';
    choices: string[];
} | {
    type: 'drop';
    item: Item;
} | {
    type: 'inventory';
} | {
    type: 'buffs';
} | {
    type: 'pause';
} | {
    type: 'result';
    win: boolean;
    reason: string;
} | null;
export type RunMode = 'ready' | 'battle' | 'result';
type Request = NonNullable<Dialog>;
export interface RunFlowHooks {
    /** 打开或排队时清理按键、摇杆和鼠标目标，避免选择后继续旧移动。 */
    beforeOpen: () => void;
    /** 真正显示时准备内容；升级候选必须用此时的强化等级重新生成。 */
    prepare: (request: Request) => Request;
    /** 每次事务结束后通知 UI；不暴露“刚关闭、下一奖励还未打开”的中间态。 */
    changed: () => void;
}
/**
 * 局内流程的唯一所有者：模式、当前弹窗、FIFO 奖励队列和暂停原因。
 * 不发经验、不穿装备、不画界面；奖励的实际结算仍由 Game 完成。
 * gate 的各原因独立：关闭弹窗不能清掉 orientation 等其他暂停原因。
 */
export class RunFlow {
    readonly gate = new PauseGate();
    private current: Dialog = { type: 'start' };
    private state: RunMode = 'ready';
    private pending: Request[] = [];
    constructor(private readonly hooks: RunFlowHooks) { this.gate.add('dialog'); }
    get dialog(): Dialog { return this.current; }
    get mode(): RunMode { return this.state; }
    get pendingCount(): number { return this.pending.length; }
    /**
     * 开局只重置流程，不通知 UI。调用方必须先初始化角色、实体和 Buff，
     * 再统一发出 onChange，防止 UI 读取到半初始化的新局。
     */
    begin(): void {
        this.state = 'battle';
        this.current = null;
        this.pending = [];
        this.gate.clear();
    }
    /** 已有选择时只排队；队列保存请求，不提前冻结升级候选。 */
    open(request: Request): void {
        this.hooks.beforeOpen();
        if (this.current) {
            this.pending.push(request);
            return;
        }
        this.activate(request);
        this.hooks.changed();
    }
    /**
     * 原子地关闭并提升下一个奖励，UI 只收到一次最终状态通知。
     * focus 需要由玩家明确继续或完成选择才解除，不能自动恢复战斗。
     */
    close(): void {
        this.gate.remove('focus');
        this.current = null;
        this.gate.remove('dialog');
        const next = this.pending.shift();
        if (next) {
            this.hooks.beforeOpen();
            this.activate(next);
        }
        this.hooks.changed();
    }
    /** 死亡、胜利或超时优先于未领取奖励；旧选择不能覆盖结算。 */
    finish(win: boolean, reason: string): void {
        this.state = 'result';
        this.replace({ type: 'result', win, reason });
    }
    /** 标题页入口同时清空旧奖励和暂停状态，避免下一局继承悬挂选择。 */
    title(): void {
        this.state = 'ready';
        this.replace({ type: 'start' });
    }
    /**
     * 整体替换当前流程视图，用于结算、标题和开发布局预览。
     * 普通升级和装备必须用 open 排队，不能用 replace 丢弃其他奖励。
     */
    replace(dialog: Dialog): void {
        this.hooks.beforeOpen();
        this.pending = [];
        this.gate.clear();
        this.current = null;
        if (dialog)
            this.activate(dialog);
        this.hooks.changed();
    }
    private activate(request: Request): void {
        this.current = this.hooks.prepare(request);
        this.gate.add('dialog');
    }
}

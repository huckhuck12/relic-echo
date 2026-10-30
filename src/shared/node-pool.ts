declare const Laya: any;
/**
 * 只复用显示节点，不复用 Enemy/Shot 等战斗数据，避免旧状态进入新实体。
 * 池跨局保留；Game 重开时必须先归还所有在用节点，再清空实体数组。
 * Laya 类型沿用项目的运行时声明，池不依赖 Game 或场景渲染器。
 */
export class NodePool {
    readonly sprites: any[] = [];
    readonly texts: any[] = [];
    constructor(private readonly parent: any) { }
    /** 借出后重置所有调用方可能改动的变换；坐标、深度由本帧渲染同步。 */
    acquire(text = false): any {
        const node = text ? this.texts.pop() || new Laya.Text() : this.sprites.pop() || new Laya.Sprite();
        node.visible = true;
        node.alpha = 1;
        node.scale(1, 1);
        node.rotation = 0;
        this.parent.addChild(node);
        return node;
    }
    /**
     * 每个借出节点只能归还一次。先脱离显示树，再清内容，防止旧图形留在场景。
     * 文字与图形分池；上限约束空闲缓存，超过容量直接销毁，不限制活跃实体数。
     */
    release(node: any): void {
        node.removeSelf();
        if (node instanceof Laya.Text) {
            node.text = '';
            if (this.texts.length < 40)
                this.texts.push(node);
            else
                node.destroy();
        }
        else {
            node.graphics.clear();
            if (this.sprites.length < 500)
                this.sprites.push(node);
            else
                node.destroy();
        }
    }
}

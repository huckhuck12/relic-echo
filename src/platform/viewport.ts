/** 使用公开 Stage 接口，布局坐标始终为 CSS 像素，高清分辨率只影响画布缓冲区。 */
export interface ViewportStage {
    scaleMode: string;
    useRetinalCanvas: boolean;
    size(width: number, height: number): unknown;
}
/**
 * LayaAir 2 的 full 模式把 stage.width/height 设为 CSS 尺寸 × devicePixelRatio。
 * DPR=3 的 393px 手机会被布局误判成 1179px 宽屏，44px 按钮也只剩约 15 CSS px。
 * 改用 fixedwidth 并同步设计宽度到当前浏览器视口，使布局、相机和输入共享 CSS 坐标。
 * useRetinalCanvas 保留高清缓冲区；不能通过修改全局 pixelRatio 修正 UI 大小。
 */
export function bindViewport(stage: ViewportStage): () => void {
    stage.scaleMode = 'fixedwidth';
    stage.useRetinalCanvas = true;
    // 引擎初始化会重写 viewport meta；恢复刘海屏所需的 viewport-fit。
    document.querySelector?.('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    let previousWidth = 0, previousHeight = 0;
    const sync = () => {
        // 不使用 screen.width 或物理画布大小；浏览器工具栏收起后 innerHeight 会更新。
        const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
        if (width === previousWidth && height === previousHeight)
            return;
        previousWidth = width;
        previousHeight = height;
        // size 会触发 Laya 自身的延迟画布重算和 RESIZE，不手动修改私有变换或画布样式。
        stage.size(width, height);
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
        window.removeEventListener('resize', sync);
        window.removeEventListener('orientationchange', sync);
        window.visualViewport?.removeEventListener('resize', sync);
    };
}

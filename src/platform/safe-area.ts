export interface SafeArea {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
/** 微信/Safari 内的刘海和 Home 指示条由 CSS env 提供；浏览器工具栏已由视口高度扣除。 */
export function readSafeArea(): SafeArea {
    const empty = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!document.createElement || !document.body || typeof getComputedStyle !== 'function')
        return empty;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
    try {
        const style = getComputedStyle(probe);
        const value = (text: string) => Math.max(0, parseFloat(text) || 0);
        return { top: value(style.paddingTop), right: value(style.paddingRight), bottom: value(style.paddingBottom), left: value(style.paddingLeft) };
    }
    finally {
        probe.remove();
    }
}

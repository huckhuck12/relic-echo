import type { RuntimePlatform, Insets } from './runtime.js';
import { BrowserAudio } from './browser-audio.js';
function safeArea(): Insets {
    const empty = { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof document === 'undefined' || !document.createElement || !document.body || typeof getComputedStyle !== 'function')
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
export function createBrowserPlatform(): RuntimePlatform {
    return {
        kind: 'browser',
        viewport: () => ({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight), pixelRatio: window.devicePixelRatio || 1 }),
        safeArea,
        touch: () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
        font: () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '') ? 'PingFang SC' : 'system-ui',
        hidden: () => typeof document !== 'undefined' && document.hidden,
        reducedMotion: () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        now: () => typeof performance !== 'undefined' ? performance.now() : Date.now(),
        prepareViewport: () => document.querySelector?.('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'),
        onResize(callback) {
            window.addEventListener('resize', callback);
            window.addEventListener('orientationchange', callback);
            window.visualViewport?.addEventListener('resize', callback);
            return () => {
                window.removeEventListener?.('resize', callback);
                window.removeEventListener?.('orientationchange', callback);
                window.visualViewport?.removeEventListener('resize', callback);
            };
        },
        onHide(callback) {
            const visibility = () => {
                if (document.hidden)
                    callback();
            };
            window.addEventListener('blur', callback);
            document.addEventListener?.('visibilitychange', visibility);
            return () => {
                window.removeEventListener?.('blur', callback);
                document.removeEventListener?.('visibilitychange', visibility);
            };
        },
        onShow(callback) {
            const visibility = () => {
                if (!document.hidden)
                    callback();
            };
            document.addEventListener?.('visibilitychange', visibility);
            return () => document.removeEventListener?.('visibilitychange', visibility);
        },
        readStorage: key => localStorage.getItem(key),
        writeStorage: (key, value) => localStorage.setItem(key, value),
        createAudio: () => new BrowserAudio(),
    };
}

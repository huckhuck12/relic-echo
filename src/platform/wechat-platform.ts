import type { RuntimePlatform, GameAudio, Insets } from './runtime.js';
import { ToneVoices } from './tone-voices.js';
export interface WechatWindowInfo {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    screenWidth?: number;
    screenHeight?: number;
    screenTop?: number;
    safeArea?: {
        top: number;
        left: number;
        right: number;
        bottom: number;
    };
}
/** 最小启动需要的 SDK 子集；不把 wx 全局或完整 SDK 类型传入玩法。 */
export interface WechatAPI {
    getWindowInfo?(): WechatWindowInfo;
    getSystemInfoSync(): WechatWindowInfo & {
        platform?: string;
        system?: string;
    };
    getMenuButtonBoundingClientRect?(): {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
    onWindowResize(callback: () => void): void;
    offWindowResize?(callback: () => void): void;
    onHide(callback: () => void): void;
    offHide?(callback: () => void): void;
    onShow(callback: () => void): void;
    offShow?(callback: () => void): void;
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, value: string): void;
    createWebAudioContext?(): AudioContext;
}
class WechatAudio implements GameAudio {
    private context: AudioContext | null = null;
    private readonly voices = new ToneVoices();
    constructor(private readonly api: WechatAPI) { }
    enable(): void {
        try {
            this.context ??= this.api.createWebAudioContext?.() ?? null;
            void this.context?.resume?.()?.catch?.(() => { });
        }
        catch { /* 不支持 WebAudio 时静音，不阻断游戏。 */ }
    }
    play(enabled: boolean, frequency: number, duration = .045, volume = .025): void {
        const context = this.context;
        if (!enabled || !context || context.state === 'suspended' || context.state === 'closed')
            return;
        try {
            this.voices.play(context, frequency, duration, volume);
        }
        catch { /* SDK 音频能力差异不能中断奖励或战斗。 */ }
    }
    suspend(): void {
        this.voices.clear();
        try {
            void this.context?.suspend?.()?.catch?.(() => { });
        }
        catch { }
    }
}
export function createWechatPlatform(api: WechatAPI, diagnostics?: {
    copy(): void;
}): RuntimePlatform {
    let hidden = false;
    const info = () => api.getWindowInfo?.() ?? api.getSystemInfoSync();
    const subscribe = (on: (fn: () => void) => void, off: ((fn: () => void) => void) | undefined, callback: () => void) => {
        on.call(api, callback);
        return () => off?.call(api, callback);
    };
    return {
        kind: 'wechat',
        copyDiagnostics: diagnostics ? () => diagnostics.copy() : undefined,
        viewport: () => {
            const w = info();
            return { width: Math.max(1, w.windowWidth), height: Math.max(1, w.windowHeight), pixelRatio: w.pixelRatio || 1 };
        },
        safeArea: () => {
            const w = info(), safe = w.safeArea, offsetY = w.screenTop || 0;
            const result: Insets = safe ? {
                top: Math.max(0, Math.min(w.windowHeight, safe.top - offsetY)),
                bottom: Math.max(0, Math.min(w.windowHeight, w.windowHeight - (safe.bottom - offsetY))),
                left: Math.max(0, Math.min(w.windowWidth, safe.left)),
                right: Math.max(0, Math.min(w.windowWidth, w.windowWidth - safe.right)),
            } : { top: 0, bottom: 0, left: 0, right: 0 };
            // 第一版让顶部 HUD 整行避开胶囊，避免暂停/装备按钮被系统控件盖住。
            const menu = api.getMenuButtonBoundingClientRect?.();
            if (menu && menu.bottom > menu.top && menu.left < w.windowWidth)
                result.top = Math.max(result.top, Math.min(w.windowHeight, menu.bottom + 8));
            return result;
        },
        touch: () => true,
        font: () => /ios/i.test(api.getSystemInfoSync().platform || '') ? 'PingFang SC' : 'sans-serif',
        hidden: () => hidden,
        reducedMotion: () => false,
        // 老版微信高精度时钟的单位不同，统一使用毫秒，避免把微秒当作帧时长。
        now: () => Date.now(),
        prepareViewport() { },
        onResize: callback => subscribe(api.onWindowResize, api.offWindowResize, callback),
        onHide: callback => subscribe(api.onHide, api.offHide, () => {
            hidden = true;
            callback();
        }),
        onShow: callback => subscribe(api.onShow, api.offShow, () => {
            hidden = false;
            callback();
        }),
        readStorage: key => {
            const value = api.getStorageSync(key);
            return typeof value === 'string' && value ? value : null;
        },
        writeStorage: (key, value) => api.setStorageSync(key, value),
        createAudio: () => new WechatAudio(api),
    };
}

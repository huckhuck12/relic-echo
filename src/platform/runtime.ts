import { createBrowserPlatform } from './browser-platform.js';
export interface Viewport {
    width: number;
    height: number;
    pixelRatio: number;
}
export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface GameAudio {
    enable(): void;
    play(enabled: boolean, frequency: number, duration?: number, volume?: number): void;
    suspend(): void;
}
/** 业务代码只依赖此接口；微信 SDK 与 DOM 分别由对应平台实现持有。 */
export interface RuntimePlatform {
    readonly kind: 'browser' | 'wechat';
    viewport(): Viewport;
    safeArea(): Insets;
    touch(): boolean;
    font(): string;
    hidden(): boolean;
    reducedMotion(): boolean;
    now(): number;
    prepareViewport(): void;
    onResize(callback: () => void): () => void;
    onHide(callback: () => void): () => void;
    onShow(callback: () => void): () => void;
    readStorage(key: string): string | null;
    writeStorage(key: string, value: string): void;
    createAudio(): GameAudio;
}
let current: RuntimePlatform | undefined;
export function platform(): RuntimePlatform { return current ??= createBrowserPlatform(); }
/** 启动时安装，必须早于 Game/GameUI 的构造；返回恢复函数供隔离测试使用。 */
export function installPlatform(next: RuntimePlatform): () => void {
    const previous = current;
    current = next;
    return () => { current = previous; };
}

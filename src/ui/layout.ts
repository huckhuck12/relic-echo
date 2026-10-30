import { clamp } from '../shared/model.js';
export interface ScreenLayout {
    width: number;
    height: number;
    scale: number;
    margin: number;
    compact: boolean;
    portrait: boolean;
    sidebar: boolean;
    dialogWidth: number;
    dialogHeight: number;
}
/** UI density may grow on large displays; small screens reflow rather than shrink text. */
export function screenLayout(screenWidth: number, screenHeight: number, touch = false): ScreenLayout {
    const w = Math.max(1, screenWidth), h = Math.max(1, screenHeight);
    const scale = clamp(Math.min(w / 1600, h / 1000), 1, 1.3), width = w / scale, height = h / scale;
    const compact = width < 1100 || height < 650, portrait = height > width;
    const margin = Math.min(touch ? 22 : compact ? 12 : 28, Math.min(width, height) / 20);
    return {
        width, height, scale, margin, compact, portrait, sidebar: !compact,
        dialogWidth: Math.min(800, width - 2 * margin), dialogHeight: Math.min(620, height - 2 * margin)
    };
}
export function cameraZoom(width: number, height: number): number {
    return clamp(Math.min(width / 1280, height / 720), .8, 1.6);
}

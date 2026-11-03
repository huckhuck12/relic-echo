import type { ScreenLayout } from './layout.js';
/** HUD 与触控区共用尺寸，避免提示条、冲刺和摇杆各自硬编码后相互覆盖。 */
export const TOUCH_UI = {
    stickSize: 144, stickTravel: 44, stickDeadZone: 6,
    dashWidth: 96, dashHeight: 72, buffWidth: 96, buffHeight: 44,
    actionGap: 20, bottomGap: 16, toastDuration: 1700,
};
export function mobileHUDLayout(layout: ScreenLayout) {
    const { width: w, height: h, margin: m, portrait } = layout;
    const dashY = h - m - TOUCH_UI.bottomGap - TOUCH_UI.dashHeight;
    const buffY = dashY - TOUCH_UI.actionGap - TOUCH_UI.buffHeight;
    return {
        statusX: m, statusY: m + 52,
        statusWidth: portrait ? w - 2 * m : Math.min(260, w - 2 * m - 128),
        statusHeight: 64,
        dashX: w - m - TOUCH_UI.dashWidth, dashY,
        buffX: w - m - TOUCH_UI.buffWidth, buffY,
        stickX: m + TOUCH_UI.stickSize / 2,
        stickY: h - m - TOUCH_UI.bottomGap - TOUCH_UI.stickSize / 2,
        stickAreaX: m,
        stickAreaY: Math.max(m + 136, h * .52),
        stickAreaWidth: w * .48 - m,
        stickAreaBottom: h - m - TOUCH_UI.bottomGap,
        comboX: portrait ? m : m + 176,
        comboY: portrait ? m + 122 : m + 8,
        comboWidth: portrait ? Math.min(260, w - 2 * m) : Math.max(80, w - 2 * m - 304),
        // 提示位于触控区上方，较短横屏在右上方显示，不挡住左侧状态条。
        toastY: portrait ? Math.min(m + 156, buffY - 50) : m + 54,
        toastWidth: portrait ? Math.min(340, w - 2 * m) : Math.min(280, w * .45),
    };
}
/** Keep diagnostics at an edge, outside the floating joystick region and action buttons. */
export function performanceHUDLayout(layout: ScreenLayout, mobile: boolean) {
    const { width: w, height: h, margin: m, portrait, sidebar } = layout;
    const height = 88;
    if (mobile) {
        const controls = mobileHUDLayout(layout);
        const width = Math.min(184, portrait ? Math.min(160, w * .5 - m - 28) : controls.dashX - 8 - (w * .48 + 8));
        return {
            width, height, x: portrait ? w - m - width : controls.dashX - 8 - width,
            y: portrait ? controls.buffY - 12 - height : h - m - height,
        };
    }
    const width = 184, inset = sidebar ? 220 : 150;
    return { width, height, x: w - m - inset - width, y: h - m - height };
}

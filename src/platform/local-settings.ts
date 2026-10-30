import { STORAGE } from '../game/game-config.js';
import { visualQuality } from '../rendering/quality.js';
import type { VisualQuality } from '../rendering/quality.js';
export interface LocalSettings {
    sound: boolean;
    shake: boolean;
    quality: VisualQuality;
    showPerformance: boolean;
}
export interface RunRecord {
    win: boolean;
    time: number;
    kills: number;
    level: number;
    date: string;
}
/** localStorage 不可用、内容损坏或浏览器隐私限制都不能阻断开局。 */
export function readSettings(): LocalSettings {
    const defaults: LocalSettings = { sound: true, shake: true, quality: 'standard', showPerformance: false };
    try {
        const settings = JSON.parse(localStorage.getItem(STORAGE.settings) || '{}');
        return { sound: settings.sound !== false, shake: settings.shake !== false,
            showPerformance: settings.showPerformance === true, quality: visualQuality(settings.quality) };
    }
    catch {
        return defaults;
    }
}
export function writeSettings(settings: LocalSettings): void {
    try {
        localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
    }
    catch { /* 存储失败不影响当前设置。 */ }
}
export function saveRunRecord(record: RunRecord): void {
    try {
        const records = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
        records.unshift(record);
        localStorage.setItem(STORAGE.records, JSON.stringify(records.slice(0, STORAGE.recordLimit)));
    }
    catch { /* 战绩为可选本地功能，不阻断结算。 */ }
}

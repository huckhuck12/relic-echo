/** 界面展示常量与格式化函数；不参与战斗数值或状态更新。 */
export const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export const percent = (n: number) => `${Math.round(n * 100)}%`;
export const SYMBOLS: Record<string, string> = {
    storm: 'ϟ', flame: '♨', blade: '✧', visor: '═', hood: '△', helmet: '⌑', light: '⋈', heavy: '⬡', energy: '◈', cape: '⚑', thorn: '✴', pack: '▣'
};

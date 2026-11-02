import { Game } from './game/game.js';
import { GameUI } from './ui/ui.js';
// HTML 只加载引擎和本入口；所有游戏界面仍由原生 Laya 显示节点绘制。
export const game = new Game();
export const ui = new GameUI(game);

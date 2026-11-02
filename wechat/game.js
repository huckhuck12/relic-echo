// Entry order is important: environment -> pinned engine/adapter -> platform -> game.
const {createWechatDiagnostics} = require('./app/platform/wechat-diagnostics.js');
const diagnostics = GameGlobal.__relicDiagnostics = createWechatDiagnostics(wx, '__RELIC_VERSION__');
GameGlobal.__relicEngineWindow = require('./engine-environment.js')(wx, {
  setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,
});
require('./engine.js');
GameGlobal.Laya = GameGlobal.__relicEngineWindow.Laya;
const {installPlatform} = require('./app/platform/runtime.js');
const {createWechatPlatform} = require('./app/platform/wechat-platform.js');
installPlatform(createWechatPlatform(wx, diagnostics));
const app = module.exports = require('./app/main.js');
diagnostics.attach(() => ({
  time: Math.round(app.game.time), mode: app.game.mode,
  ...app.game.performanceSnapshot(),
  // Engine-accounted resources only; these are NOT process RAM or total GPU memory.
  engineCpuBytes: GameGlobal.Laya.Resource?.cpuMemory,
  engineGpuBytes: GameGlobal.Laya.Resource?.gpuMemory,
}));

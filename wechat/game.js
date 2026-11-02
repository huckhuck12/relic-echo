// Entry order is important: environment -> pinned engine/adapter -> platform -> game.
GameGlobal.__relicEngineWindow = require('./engine-environment.js')(wx, {
  setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,
});
require('./engine.js');
GameGlobal.Laya = GameGlobal.__relicEngineWindow.Laya;
const {installPlatform} = require('./app/platform/runtime.js');
const {createWechatPlatform} = require('./app/platform/wechat-platform.js');
installPlatform(createWechatPlatform(wx));
module.exports = require('./app/main.js');

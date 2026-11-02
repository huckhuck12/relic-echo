# LayaAir 2.0.2

Official source: https://github.com/layabox/LayaAir-v1/tree/1100f27b608cf55d9b261ccad9701ea755a8d103/bin/ts/libs

`laya.core.js` in this project is byte-identical to that revision (SHA-256 `b070415c666e85787cfa716d9f4392d2010a6911b5bf29a8d222feb9fca7d382`). `laya.wxmini.js` was copied unchanged from the same revision. License: [MIT](LICENSE-LayaAir.txt).

The engine spells the class **MiniAdpter**, not MiniAdapter. It loads the registered adapter during Browser initialization, before Laya.init completes. The generated WeChat package combines core, WebGL and wxmini in this order without modifying their source. The project-owned `wechat/engine-environment.js` supplies only the browser-shaped surface required by this pinned engine; game logic uses the typed platform interface.

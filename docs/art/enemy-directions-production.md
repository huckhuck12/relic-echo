# 怪物八方向制作记录 · 0.12.6

五类怪物各绘制正面、前侧、右侧、后侧、背面五个视角，左侧三个视角使用镜像；背面没有正脸。以脚底为原点，共享等距投影的朝向量化，保留小角度滞回，避免追击时在相邻方向抖动。蓄力、野猪冲锋和出招恢复期间锁朝向；Boss 的落点坐标仍独立用于伤害结算。

| 家族 | 源切片 | 动作 |
|---|---:|---|
| 史莱姆 | 20 | 五视角 × 四帧压缩/拉伸周期 |
| 法师 | 20 | 五视角 × 身体、左袖手、右袖手、法杖 |
| 野猪 | 20 | 五视角 × 四帧交替步态 |
| 苔藓守卫 | 15 | 五视角 × 身体、双臂 |
| 王冠核心 | 15 | 五视角 × 身体、双臂 |

法师和石像在运行时变换分件，共用图集页。侧面调整远近手臂遮挡、肩部挂点；法师预警晶石和弹丸起点使用与法杖一致的视角、镜像、姿态和整体变换。攻击时间、碰撞、伤害和随机数顺序保持原规则。

## 来源与完整提示词

使用此前已授权的 **imagegen CLI/API edit 模式，gpt-image-2，high**。请求尺寸 1536×1024，实际尺寸见下表。统一参考原怪物家族 `output/imagegen/enemy-family-source.png`；没有引入第三方图片或字体。所有原图与完整提示词均保存在仓库的 `output/imagegen/`。

| 家族 | 提示词文件 | 实际生成图 | 实际尺寸 |
|---|---|---|---|
| 史莱姆 | `enemy-slime-directions-prompt.txt` | `enemy-slime-directions-source.png` | 1402×1122 |
| 法师 | `enemy-mage-directions-prompt.txt` | `enemy-mage-directions-source.png` | 1199×1312 |
| 野猪 | `enemy-boar-directions-prompt.txt` | `enemy-boar-directions-source.png` | 1402×1122 |
| 守卫 | `enemy-guardian-directions-prompt.txt` | `enemy-guardian-directions-source.png` | 1619×971 |
| Boss | `enemy-boss-directions-prompt.txt` | `enemy-boss-directions-source.png` | 1619×971 |

## 归一化与预算

`scripts/build-enemy-art.ps1` 与 `scripts/build-enemy-directions.ps1` 均调用 `DirectionalEnemyAtlasBuilder.cs`。以检查后的行边界切片，清理背景连通色键与白边、过滤零散组件；封闭的琥珀高光保留。每组使用固定缩放并按脚底对齐，紧密装箱到 `assets/enemies/ruin-creatures.png`（1024² RGBA）。RGB 每通道保留 6 位，压缩包体；透明度保留。裁剪和逻辑尺寸写入 `src/rendering/enemy-direction-frames.ts`，元数据写入 `assets/enemies/ruin-creatures.json`。

90 个源切片对应三种配色，共 270 个绘制帧；另有 71 个弹道、掉落和场景帧，总计 **341 帧**。GPU 合成按 0.8 倍逻辑尺寸采样，以保持一张 **1024²、4 MiB** 页；放大查看会比源图柔和。三档画质复用同一页。镜像和分件动作不新增纹理，切换朝向只刷新绘图命令。共享源图另占约 **4 MiB 解码像素**；临时合成画布上传后缩为 1×1。原始生成图不进入发布包。源图或上传失败时保留程序素材。

## 验收与边界

- 自动测试覆盖八方向投影、边界滞回、攻击锁定、Boss 绝对落点、法杖矩阵/特效挂点一致、转身刷新缓存、90 个裁剪范围、失败回退及所有朝向/配色共页。
- 真实 Laya WebGL 检视板覆盖五类 × 八方向、四帧步态、蓄力/释放、冰冻/受击；位置固定便于比较。运行 `node scripts/check-mobile-browser.mjs --enemy-audit --render-audit --wechat`；本地 `/bench/enemy-review.html` 控制台调用 `enemyReview.directions(.17,'normal','wind')` 可复现。
- [八方向样张](enemy-directions-0126.png)、[出招样张](enemy-directions-release-0126.png) 与[验收数据](../render-results-0126.json)记录最终结果。
- 普通怪/精英混排基准在八方向分布下，25/100/200/400 只均为 18 DC；微信固定场景 235 怪、208 弹道、150 掉落为 28 DC。怪物/弹道仍在同一页内合批。
- 五个独立视角加镜像不等于八套完整逐帧动画。法师、石像仍用分件动作；镜像会同时镜像光照和细节。独立攻击帧、转身过渡和玩家更清楚的左右脚动作仍待深化。
- 桌面/微信 SDK 模拟结果不能代替 iPhone Air 真机 FPS、总进程内存及长时间闪退验证。

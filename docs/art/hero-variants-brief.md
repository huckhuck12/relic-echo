# 主角重设计 · 三版绘图规格

用途：供用户比较主角美术方向。用户已选择 B「遗迹学徒」；以 B 的 v2 概念图作为后续转面和动作的身份、服装参考，尚未替换游戏角色。

## 三版统一条件

同一名年轻探险者，栗棕色头发，约三头身；亲切但有探索欲的表情，不画呆笑。全身三分之四正面，放松站姿，手肘自然弯曲，双脚完整露出；左上柔光。暖纸背景、柔和手绘幻想插画，细而有变化的深色轮廓，布料和皮革有克制的笔触。人物完整、不裁切，不含场景、文字、水印、UI 或装备堆砌。

每版独立生成一张 1024×1024 概念图。相同人物比例、镜头、光照和画面占比便于比较。轮廓应在约 80 像素高时仍能分辨；生成后另制作实际尺寸比较图。概念图不直接作为生产动画图集，选定后再制作正侧背、八向及武器动作。

## A · 森林游侠

Use case: stylized-concept

Asset type: player character concept for an isometric fantasy survival game.

Primary request: Draw one appealing young adventurer with a cohesive, professionally designed silhouette. Three-head-tall proportions, chestnut side-swept hair with a few soft layered locks, small thoughtful eyes and a subtle confident expression. A short moss-green hooded cape rests behind the shoulders, with a cream linen shirt, fitted muted green tunic, brown belt pouch and rounded leather ankle boots. The cape hem has a gentle leaf-like curve. One hand holds a slender irregular wooden staff with a small pale-mint suspended crystal, positioned beside the body and clearly away from the face. Relaxed bent elbows, believable shoulders and hands, balanced stance. Soft painted fabric and leather, warm muted colors and restrained highlights. Full-body three-quarter front view, plain warm ivory background, soft upper-left lighting. Keep the face readable and the outfit simple enough to recognize at 80 pixels tall. No block-shaped limbs, rigid tube arms, square face, thick uniform black outline, pixel art, giant eyes, grin, oversized weapon, scenery, text, watermark or interface. One character only, no sprite sheet.

辨识重点：短披风、枝杖、苔绿与米色；最贴近现有遗迹草地。

## B · 遗迹学徒

Use case: stylized-concept

Asset type: player character concept for an isometric fantasy survival game.

Primary request: Draw one appealing young adventurer with a cohesive, professionally designed silhouette. Three-head-tall proportions, chestnut side-swept hair with a few soft layered locks, small thoughtful eyes and a subtle focused expression. A short muted indigo scholar coat with a cream scarf, a small asymmetrical shoulder mantle, a simple amber clasp, narrow brown belt and rounded leather ankle boots. A small closed field notebook sits at the hip. One hand gently guides a single floating pale-lavender rune crystal beside the waist; fingers and elbow form a natural gesture, the crystal does not cover the face. Relaxed balanced stance. Soft painted fabric, paper and leather, warm muted colors and restrained highlights. Full-body three-quarter front view, plain warm ivory background, soft upper-left lighting. Keep the face readable and the outfit simple enough to recognize at 80 pixels tall. No block-shaped limbs, rigid tube arms, square face, thick uniform black outline, pixel art, giant eyes, grin, huge hat, long floor-length robe, ornate armor, scenery, text, watermark or interface. One character only, no sprite sheet. Match the proportions, framing and lighting of the forest ranger variant.

辨识重点：围巾、短外衣、悬浮符晶；突出法术与遗迹研究。

## C · 荒野寻宝者

Use case: stylized-concept

Asset type: player character concept for an isometric fantasy survival game.

Primary request: Draw one appealing young adventurer with a cohesive, professionally designed silhouette. Three-head-tall proportions, chestnut side-swept hair with a few soft layered locks, small thoughtful eyes and a subtle curious expression. A cropped warm-ochre travel jacket over a cream shirt, a muted teal neckerchief, a compact worn leather satchel worn diagonally, charcoal trousers and rounded brown hiking boots. One hand holds a small rounded brass alchemical lantern-tool beside the thigh, with a subdued amber core; the other rests naturally near the satchel strap. Relaxed bent elbows, believable shoulders and hands, balanced stance. Soft painted cloth, scuffed leather and softly lit brass, warm muted colors with a small teal accent. Full-body three-quarter front view, plain warm ivory background, soft upper-left lighting. Keep the face readable and the outfit simple enough to recognize at 80 pixels tall. No block-shaped limbs, rigid tube arms, square face, thick uniform black outline, pixel art, giant eyes, grin, gun-like bulky barrel, enormous backpack, excessive gadgets, scenery, text, watermark or interface. One character only, no sprite sheet. Match the proportions, framing and lighting of the forest ranger variant.

辨识重点：短夹克、斜挎包、炼金器；突出探索者身份，减少传统法师感。

## 选择与落地标准

先比较脸部吸引力、整体轮廓、服装层次，以及手机实际尺寸的可读性。避免只挑高分辨率下细节最多的一张。确定方向后制作转面和施法样张，再映射现有装备槽、武器挂点和有界纹理缓存。

## 生成记录与交付

用户明确授权 API/CLI 路径后，使用 imagegen 技能附带的 `image_gen.py`，模型 `gpt-image-2`、medium 质量、PNG，先独立生成三版，再分别以原图为编辑目标修正为约三头身。请求尺寸均为 1024×1024；最终 v2 文件实际尺寸均为 1254×1254，以输出文件为准。

文件均位于仓库 `output/imagegen/`：

| 方案 | 最终概念图 | 辨识重点 |
| --- | --- | --- |
| A 森林游侠 | `hero-a-forest-ranger-v2.png` | 苔绿披风、枝杖、薄荷晶石 |
| B 遗迹学徒 | `hero-b-ruin-apprentice-v2.png` | 紫色短衣、米色围巾、悬浮符晶 |
| C 荒野寻宝者 | `hero-c-wild-treasure-hunter-v2.png` | 赭黄夹克、蓝绿领巾、提灯 |

- `hero-variants-comparison.png`：1440×1120 并排比较图，包含约 500px、80px、160px 高的裁边缩放参考。查看实际像素时才对应标注尺寸；不是游戏内截图。
- `hero-variants-prompts.jsonl`：三版初始生成的完整提示词和参数。
- `hero-proportions-edit.txt`：统一比例修正的完整提示词；保留服装、配色和手持物，调整头身与四肢。
- 三张无 `-v2` 后缀的 PNG：初轮探索图，也是 v2 的编辑来源。
- `build-comparison.ps1`：使用 System.Drawing 合成比较图，保留插画本身。
- `hero-variants-dimensions.json`：最终文件尺寸与比较图裁边坐标。

已检查三版全身构图、服装和手持物、缩小轮廓，以及比较图文字和裁切。图片保留暖纸背景，属于概念插画，不是透明精灵或动画图集；尚未接入游戏，也不代表真机性能验证。建议优先考虑 B，其紫色服装在草地上区分更明显，符晶呼应遗迹法术主题。最终方向由用户选择。

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$names = @('hero-a-forest-ranger-v2.png', 'hero-b-ruin-apprentice-v2.png', 'hero-c-wild-treasure-hunter-v2.png')
$titles = @('A · 森林游侠', 'B · 遗迹学徒', 'C · 荒野寻宝者')
$notes = @('苔绿披风 · 枝杖与薄荷晶石', '紫色短衣 · 围巾与悬浮符晶', '赭黄夹克 · 蓝绿领巾与提灯')
$board = [System.Drawing.Bitmap]::new(1440, 1120)
$g = [System.Drawing.Graphics]::FromImage($board)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#fff3e3'))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#453b34'))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#857467'))
$titleFont = [System.Drawing.Font]::new('Microsoft YaHei', 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new('Microsoft YaHei', 23, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = [System.Drawing.Font]::new('Microsoft YaHei', 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$center = [System.Drawing.StringFormat]::new()
$center.Alignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('主角重设计 · 手绘幻想三方案', $titleFont, $ink, [System.Drawing.RectangleF]::new(0, 25, 1440, 42), $center)
$g.DrawString('概念方向比较 / 暖纸背景 / 尚未制作游戏动画', $smallFont, $muted, [System.Drawing.RectangleF]::new(0, 72, 1440, 30), $center)
$manifest = @()
for ($i = 0; $i -lt 3; $i++) {
    $src = [System.Drawing.Bitmap]::new((Join-Path $root $names[$i]))
    $left = $src.Width; $top = $src.Height; $right = 0; $bottom = 0
    for ($y = 0; $y -lt $src.Height; $y += 3) {
        for ($x = 0; $x -lt $src.Width; $x += 3) {
            $p = $src.GetPixel($x, $y)
            if ([Math]::Min($p.R, [Math]::Min($p.G, $p.B)) -lt 180) {
                $left = [Math]::Min($left, $x); $right = [Math]::Max($right, $x)
                $top = [Math]::Min($top, $y); $bottom = [Math]::Max($bottom, $y)
            }
        }
    }
    $left = [Math]::Max(0, $left - 6); $top = [Math]::Max(0, $top - 6)
    $right = [Math]::Min($src.Width, $right + 9); $bottom = [Math]::Min($src.Height, $bottom + 9)
    $crop = [System.Drawing.Rectangle]::new($left, $top, $right - $left, $bottom - $top)
    $cx = 240 + 480 * $i
    $g.DrawString($titles[$i], $labelFont, $ink, [System.Drawing.RectangleF]::new($cx - 230, 120, 460, 38), $center)
    $g.DrawString($notes[$i], $smallFont, $muted, [System.Drawing.RectangleF]::new($cx - 230, 163, 460, 30), $center)
    foreach ($spec in @(@(500, 210), @(80, 785), @(160, 910))) {
        $height = $spec[0]; $dy = $spec[1]; $width = $crop.Width * $height / $crop.Height
        $dest = [System.Drawing.RectangleF]::new(($cx - $width / 2), $dy, $width, $height)
        $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    }
    $manifest += @{ file = $names[$i]; width = $src.Width; height = $src.Height; comparisonCrop = @{ x = $crop.X; y = $crop.Y; width = $crop.Width; height = $crop.Height } }
    $src.Dispose()
}
$g.DrawString('80px 高 · 手机尺寸参考（按原图像素查看）', $smallFont, $muted, [System.Drawing.RectangleF]::new(0, 740, 1440, 30), $center)
$g.DrawString('160px 高 · 放大检查', $smallFont, $muted, [System.Drawing.RectangleF]::new(0, 875, 1440, 30), $center)
$g.DrawString('尺寸参考为概念图缩放，非游戏内截图；保留原图背景。', $smallFont, $muted, [System.Drawing.RectangleF]::new(0, 1080, 1440, 30), $center)
$board.Save((Join-Path $root 'hero-variants-comparison.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'hero-variants-dimensions.json') -Encoding UTF8
$center.Dispose(); $titleFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose(); $ink.Dispose(); $muted.Dispose(); $g.Dispose(); $board.Dispose()

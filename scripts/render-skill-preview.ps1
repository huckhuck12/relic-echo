param([string]$PreviewName = 'skill-preview')
# 离线重放正式 Graphics 图元，不能作为浏览器 WebGL 或 FPS 证据。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$preview = Get-Content -LiteralPath "$PSScriptRoot/../artifacts/$PreviewName.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$bitmap = New-Object System.Drawing.Bitmap($preview.width, $preview.height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = New-Object System.Drawing.Font('Microsoft YaHei', 12)
$titleFont = New-Object System.Drawing.Font('Microsoft YaHei', 20)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e4d7ab'))
try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#17271f'))
    $graphics.DrawString($preview.title, $titleFont, $textBrush, 35, 25)
    foreach ($command in $preview.commands) {
        if ($command.type -eq 'label') {
            $graphics.DrawString($command.text, $font, $textBrush, [single]$command.x, [single]$command.y)
            continue
        }
        $brush = $null; $pen = $null
        try {
            if ($command.fill) { $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($command.fill)) }
            if ($command.stroke) { $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($command.stroke), [single]$command.width) }
            $points = $command.p
            if ($command.type -eq 'rect') {
                if ($brush) { $graphics.FillRectangle($brush, [single]$points[0], [single]$points[1], [single]$points[2], [single]$points[3]) }
                if ($pen) { $graphics.DrawRectangle($pen, [single]$points[0], [single]$points[1], [single]$points[2], [single]$points[3]) }
            } else {
                $polygon = New-Object 'System.Drawing.PointF[]' ($points.Count / 2)
                for ($i = 0; $i -lt $points.Count; $i += 2) {
                    $polygon[$i / 2] = New-Object System.Drawing.PointF([single]$points[$i], [single]$points[$i + 1])
                }
                if ($brush) { $graphics.FillPolygon($brush, $polygon) }
                if ($pen) {
                    if ($command.type -eq 'poly') { $graphics.DrawPolygon($pen, $polygon) }
                    else { $graphics.DrawLines($pen, $polygon) }
                }
            }
        } finally {
            if ($brush) { $brush.Dispose() }; if ($pen) { $pen.Dispose() }
        }
    }
    $bitmap.Save("$PSScriptRoot/../artifacts/$PreviewName.png", [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $titleFont.Dispose(); $textBrush.Dispose()
}

# 从正式绘图命令生成离线 PNG，供造型检查；不代表 Laya WebGL 或真机效果。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$preview = Get-Content -LiteralPath "$PSScriptRoot/../artifacts/enemy-preview.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$bitmap = New-Object System.Drawing.Bitmap($preview.width, $preview.height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = New-Object System.Drawing.Font('Microsoft YaHei', 12)
$titleFont = New-Object System.Drawing.Font('Microsoft YaHei', 18)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e4d7ab'))
try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#17271f'))
    $graphics.DrawString($preview.title, $titleFont, $textBrush, 30, 20)
    foreach ($command in $preview.commands) {
        if ($command.type -eq 'label') {
            $graphics.DrawString($command.text, $font, $textBrush, [single]$command.x, [single]$command.y)
            continue
        }
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($command.fill))
        try {
            $points = $command.p
            if ($command.type -eq 'rect') {
                $graphics.FillRectangle($brush, [single]$points[0], [single]$points[1], [single]$points[2], [single]$points[3])
            } else {
                $polygon = New-Object 'System.Drawing.PointF[]' ($points.Count / 2)
                for ($i = 0; $i -lt $points.Count; $i += 2) {
                    $polygon[$i / 2] = New-Object System.Drawing.PointF([single]$points[$i], [single]$points[$i + 1])
                }
                $graphics.FillPolygon($brush, $polygon)
            }
        } finally { $brush.Dispose() }
    }
    $bitmap.Save("$PSScriptRoot/../artifacts/enemy-preview.png", [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $titleFont.Dispose(); $textBrush.Dispose()
}

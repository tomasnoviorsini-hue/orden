# Genera los PNG de icons/ a partir del mismo diseño que icons/icon.svg.
# Uso: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons'
$outer = [System.Drawing.ColorTranslator]::FromHtml('#0f1115')
$inner = [System.Drawing.ColorTranslator]::FromHtml('#171a21')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#4fb3a9')

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [string]$name, [bool]$fullBleed, [double]$glyphScale) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 512.0

  if ($fullBleed) {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $inner), 0, 0, $size, $size)
  } else {
    $g.FillPath((New-Object System.Drawing.SolidBrush $outer), (New-RoundedPath 0 0 $size $size (112 * $s)))
    $g.FillPath((New-Object System.Drawing.SolidBrush $inner), (New-RoundedPath (24 * $s) (24 * $s) (464 * $s) (464 * $s) (96 * $s)))
  }

  $pen = New-Object System.Drawing.Pen $accent, ([float](48 * $s * $glyphScale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $c = 256 * $s
  $points = @(@(150, 266), @(220, 336), @(362, 176)) | ForEach-Object {
    New-Object System.Drawing.PointF ([float]($c + ($_[0] - 256) * $s * $glyphScale)), ([float]($c + ($_[1] - 256) * $s * $glyphScale))
  }
  $g.DrawLines($pen, [System.Drawing.PointF[]]$points)

  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon 192 'icon-192.png' $false 1.0
New-Icon 512 'icon-512.png' $false 1.0
New-Icon 512 'icon-maskable-512.png' $true 0.9
New-Icon 180 'apple-touch-icon.png' $true 1.0
Write-Output 'Iconos generados.'

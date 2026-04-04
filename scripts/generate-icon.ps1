Add-Type -AssemblyName System.Drawing
$outDir = 'd:\sw\github\s3\build\icons-temp'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$rect = New-Object System.Drawing.RectangleF 0,0,$size,$size
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$corner = 220.0
$bgPath.AddArc(0,0,$corner,$corner,180,90)
$bgPath.AddArc($size-$corner,0,$corner,$corner,270,90)
$bgPath.AddArc($size-$corner,$size-$corner,$corner,$corner,0,90)
$bgPath.AddArc(0,$size-$corner,$corner,$corner,90,90)
$bgPath.CloseFigure()
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,([System.Drawing.Color]::FromArgb(255,37,99,235)),([System.Drawing.Color]::FromArgb(255,14,165,233)),135)
$g.FillPath($brush,$bgPath)
$highlight = New-Object System.Drawing.Drawing2D.GraphicsPath
$highlight.AddEllipse(120,90,520,380)
$hb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70,255,255,255))
$g.FillPath($hb,$highlight)
$cloud = New-Object System.Drawing.Drawing2D.GraphicsPath
$cloud.AddEllipse(250,430,320,210)
$cloud.AddEllipse(420,350,360,280)
$cloud.AddEllipse(610,430,220,190)
$cloud.AddRectangle((New-Object System.Drawing.Rectangle(300,520,470,180)))
$cloudBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235,8,20,44))
$g.FillPath($cloudBrush,$cloud)
$arrowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,103,232,249),42)
$arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLine($arrowPen,390,595,510,595)
$g.DrawLine($arrowPen,510,595,470,555)
$g.DrawLine($arrowPen,510,595,470,635)
$g.DrawLine($arrowPen,640,675,520,675)
$g.DrawLine($arrowPen,520,675,560,635)
$g.DrawLine($arrowPen,520,675,560,715)
$bmp.Save('d:\sw\github\s3\build\icon-master.png',[System.Drawing.Imaging.ImageFormat]::Png)
$sizes = @(16,20,24,32,40,48,64,72,96,128,256)
foreach ($s in $sizes) {
  $resized = New-Object System.Drawing.Bitmap $s,$s,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gr = [System.Drawing.Graphics]::FromImage($resized)
  $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gr.DrawImage($bmp,0,0,$s,$s)
  $resized.Save((Join-Path $outDir ("icon-$s.png")),[System.Drawing.Imaging.ImageFormat]::Png)
  $gr.Dispose()
  $resized.Dispose()
}
$g.Dispose(); $brush.Dispose(); $hb.Dispose(); $bgPath.Dispose(); $highlight.Dispose(); $cloud.Dispose(); $cloudBrush.Dispose(); $arrowPen.Dispose(); $bmp.Dispose()

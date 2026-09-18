import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type PrintSize = '4x6' | '5x7'

/** DNP DS620 / DS820 native 300 DPI sizes, including cutter overbleed. */
const DNP_CANVAS: Record<PrintSize, { short: number; long: number }> = {
  '4x6': { short: 1240, long: 1844 },
  '5x7': { short: 1568, long: 2152 },
}

const PRINT_SCRIPT = `
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [Parameter(Mandatory = $true)][string]$Printer,
  [int]$Copies = 1,
  [string]$Size = '4x6'
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "Print file not found: $ImagePath"
}

$img = [System.Drawing.Image]::FromFile($ImagePath)
$doc = New-Object System.Drawing.Printing.PrintDocument
try {
  $doc.PrinterSettings.PrinterName = $Printer
  if (-not $doc.PrinterSettings.IsValid) {
    throw "Printer not found: $Printer"
  }

  $copyCount = [Math]::Max(1, [Math]::Min(99, $Copies))
  $doc.PrinterSettings.Copies = [int16]$copyCount
  $doc.PrinterSettings.Collate = $false
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.OriginAtMargins = $false
  $doc.DefaultPageSettings.Color = $true
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

  $short = 400
  $long = 600
  if ($Size -eq '5x7') {
    $short = 500
    $long = 700
  }

  $best = $null
  $bestDiff = [int]::MaxValue
  foreach ($paper in $doc.PrinterSettings.PaperSizes) {
    $a = [Math]::Min($paper.Width, $paper.Height)
    $b = [Math]::Max($paper.Width, $paper.Height)
    $diff = [Math]::Abs($a - $short) + [Math]::Abs($b - $long)
    if ($diff -lt $bestDiff) {
      $bestDiff = $diff
      $best = $paper
    }
  }
  if ($best) {
    $doc.DefaultPageSettings.PaperSize = $best
    $paperLandscape = $best.Width -gt $best.Height
    $imageLandscape = $img.Width -gt $img.Height
    $doc.DefaultPageSettings.Landscape = ($paperLandscape -ne $imageLandscape)
  } else {
    $doc.DefaultPageSettings.Landscape = $img.Width -gt $img.Height
  }

  $doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $e.Graphics.SetClip($e.PageBounds)

    $page = $e.PageBounds
    $scale = [Math]::Max($page.Width / $img.Width, $page.Height / $img.Height)
    $drawW = [int][Math]::Round($img.Width * $scale)
    $drawH = [int][Math]::Round($img.Height * $scale)
    $drawX = $page.X + [int][Math]::Round(($page.Width - $drawW) / 2)
    $drawY = $page.Y + [int][Math]::Round(($page.Height - $drawH) / 2)
    $e.Graphics.DrawImage($img, $drawX, $drawY, $drawW, $drawH)
    $e.HasMorePages = $false
  })

  $doc.Print()
} finally {
  $img.Dispose()
  $doc.Dispose()
}
`.trim()

function scriptPath() {
  return path.join(app.getPath('temp'), 'ss-dnp-print.ps1')
}

export async function preparePrintImage(imagePath: string, size: PrintSize) {
  const sharp = (await import('sharp')).default
  const canvas = DNP_CANVAS[size]
  const oriented = await sharp(imagePath).rotate().toBuffer()
  const meta = await sharp(oriented).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) throw new Error('Could not read image size.')

  const landscape = width > height
  const targetW = landscape ? canvas.long : canvas.short
  const targetH = landscape ? canvas.short : canvas.long

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const imgFile = path.join(app.getPath('temp'), `ss-print-${stamp}.jpg`)

  await sharp(oriented)
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
    .withMetadata({ density: 300 })
    .toFile(imgFile)

  return imgFile
}

export async function printPreparedImage(opts: {
  imagePath: string
  printer: string
  copies: number
  printSize: PrintSize
}) {
  const ps1 = scriptPath()
  fs.writeFileSync(ps1, PRINT_SCRIPT, 'utf8')
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy', 'Bypass',
        '-File', ps1,
        '-ImagePath', opts.imagePath,
        '-Printer', opts.printer,
        '-Copies', String(Math.max(1, opts.copies || 1)),
        '-Size', opts.printSize,
      ],
      { windowsHide: true, timeout: 120000, windowsVerbatimArguments: false },
    )
  } catch (err: unknown) {
    const detail = err as { stderr?: string; message?: string }
    const message = String(detail.stderr || detail.message || 'Print failed.').trim()
    throw new Error(message || 'Print failed.')
  }
}

export async function sendPhotoPrint(opts: {
  imagePath: string
  printer: string
  copies: number
  printSize?: PrintSize
}) {
  if (!opts.imagePath || !fs.existsSync(opts.imagePath)) {
    return { success: false, error: 'Image file not found.' }
  }
  if (!opts.printer) {
    return { success: false, error: 'No printer configured.' }
  }

  const printSize: PrintSize = opts.printSize === '5x7' ? '5x7' : '4x6'
  let imgFile = ''
  try {
    imgFile = await preparePrintImage(opts.imagePath, printSize)
    await printPreparedImage({
      imagePath: imgFile,
      printer: opts.printer,
      copies: opts.copies,
      printSize,
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  } finally {
    if (imgFile) {
      setTimeout(() => {
        try { fs.unlinkSync(imgFile) } catch { /* ignore */ }
      }, 15000)
    }
  }
}

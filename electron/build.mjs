// Simple esbuild script to compile Electron main + preload
import { build } from 'esbuild'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function writeAppIcons() {
  const png = resolve(__dirname, '../public/icon.png')
  if (!existsSync(png)) return
  mkdirSync(resolve(__dirname, '../build'), { recursive: true })
  mkdirSync(resolve(__dirname, '../src/assets'), { recursive: true })
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const bufs = await Promise.all(
    sizes.map((s) => sharp(png).resize(s, s, { fit: 'cover' }).png().toBuffer()),
  )
  const ico = await pngToIco(bufs)
  writeFileSync(resolve(__dirname, '../build/icon.ico'), ico)
  writeFileSync(resolve(__dirname, '../public/icon.ico'), ico)
  copyFileSync(png, resolve(__dirname, '../src/assets/app-icon.png'))
  console.log('✓ App icons written')
}

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: [
    'electron',
    'chokidar',
    'twilio',
    'postmark',
    'axios',
    'sharp',
    'form-data',
  ],
}

await writeAppIcons()

await Promise.all([
  build({
    ...shared,
    entryPoints: [resolve(__dirname, 'main.ts')],
    outfile: resolve(__dirname, '../dist-electron/main.js'),
    format: 'cjs',
  }),
  build({
    ...shared,
    entryPoints: [resolve(__dirname, 'preload.ts')],
    outfile: resolve(__dirname, '../dist-electron/preload.js'),
    format: 'cjs',
  }),
])

console.log('✓ Electron compiled')

// Simple esbuild script to compile Electron main + preload
import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

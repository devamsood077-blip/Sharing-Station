import { app } from 'electron'
import * as fs from 'fs'
import * as https from 'https'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'

export const DEFAULT_GITHUB_REPO = 'devamsood077-blip/Sharing-Station'
const USER_AGENT = 'SharingStation-Updater'

export class UpdateAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpdateAuthError'
  }
}

export type GithubAsset = {
  name: string
  id: number
  size: number
  url: string
}

export type GithubRelease = {
  tag: string
  name: string
  assets: GithubAsset[]
}

export type UpdateCheck = {
  ok: true
  current: string
  latest: string
  available: boolean
  packaged: boolean
  portable: boolean
  file: string
}

function parseVersion(value: string) {
  const text = String(value || '').trim().replace(/^v/i, '')
  const parts = text.split('.').map((chunk) => {
    const digits = chunk.match(/^\d+/)?.[0] || '0'
    return parseInt(digits, 10) || 0
  })
  while (parts.length < 3) parts.push(0)
  return parts.slice(0, 3)
}

export function isNewer(latest: string, current: string) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

export function isPortableApp() {
  return !!(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR)
}

function githubHeaders(token?: string, accept = 'application/vnd.github+json') {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function fetchLatestRelease(repo: string, token?: string): Promise<GithubRelease> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: githubHeaders(token),
  })
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new UpdateAuthError(
      'Could not read GitHub releases. If this repo is private, Check for Updates needs a GitHub personal access token with repo read access.',
    )
  }
  if (!res.ok) throw new Error(`GitHub request failed (${res.status}).`)
  const data = await res.json() as {
    tag_name?: string
    name?: string
    assets?: { name?: string; id?: number; size?: number; url?: string }[]
  }
  const tag = String(data.tag_name || '').replace(/^v/i, '')
  if (!tag) throw new Error('Latest GitHub release has no version tag.')
  return {
    tag,
    name: data.name || tag,
    assets: (data.assets || []).map((asset) => ({
      name: asset.name || '',
      id: asset.id || 0,
      size: asset.size || 0,
      url: asset.url || '',
    })),
  }
}

export function matchingAsset(release: GithubRelease, portable: boolean) {
  const want = portable ? 'portable' : 'setup'
  const exeAssets = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.exe'))
  const match = exeAssets.find((asset) => asset.name.toLowerCase().includes(want)) || exeAssets[0]
  if (!match || !match.id) {
    const names = release.assets.map((asset) => asset.name).join(', ') || 'none'
    throw new Error(`No Windows exe in the latest GitHub release (found: ${names}).`)
  }
  return match
}

export async function checkForAppUpdate(repo: string, token?: string): Promise<UpdateCheck> {
  const current = app.getVersion()
  const release = await fetchLatestRelease(repo, token)
  const portable = isPortableApp()
  const asset = matchingAsset(release, portable)
  return {
    ok: true,
    current,
    latest: release.tag,
    available: isNewer(release.tag, current),
    packaged: app.isPackaged,
    portable,
    file: asset.name,
  }
}

export function downloadGithubAsset(
  repo: string,
  asset: GithubAsset,
  dest: string,
  token: string | undefined,
  onProgress?: (percent: number) => void,
) {
  const url = `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`
  return downloadFile(url, dest, onProgress, githubHeaders(token, 'application/octet-stream'))
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void,
  headers: Record<string, string> = { 'User-Agent': USER_AGENT },
) {
  return new Promise<void>((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, dest, onProgress, { 'User-Agent': USER_AGENT }).then(resolve, reject)
        return
      }
      if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 404) {
        reject(new UpdateAuthError('Could not download the update. Add a GitHub token with repo read access.'))
        return
      }
      if (!response.statusCode || response.statusCode >= 400) {
        reject(new Error(`Download failed (${response.statusCode || 0}).`))
        return
      }
      const total = Number(response.headers['content-length'] || 0)
      let read = 0
      const out = fs.createWriteStream(dest)
      response.on('data', (chunk) => {
        read += chunk.length
        if (total && onProgress) onProgress(Math.min(100, Math.round((read / total) * 100)))
      })
      response.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      out.on('error', reject)
    })
    request.on('error', reject)
  })
}

export function launchPortableReplacer(downloadedExe: string) {
  const current = process.env.PORTABLE_EXECUTABLE_FILE
  if (!current) throw new Error('Could not find the running portable exe.')
  const script = path.join(path.dirname(current), '_ss_update.bat')
  const pid = process.pid
  fs.writeFileSync(
    script,
    [
      '@echo off',
      'setlocal',
      ':wait',
      `tasklist /FI "PID eq ${pid}" | findstr /I "${pid}" >nul`,
      'if %ERRORLEVEL%==0 (',
      '  timeout /t 1 /nobreak >nul',
      '  goto wait',
      ')',
      `move /Y "${downloadedExe}" "${current}"`,
      `start "" "${current}"`,
      'del "%~f0"',
      '',
    ].join('\r\n'),
    'utf8',
  )
  spawn('cmd.exe', ['/c', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}

export function launchSetupInstaller(setupExe: string) {
  spawn(setupExe, ['/S'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}

export function updateDownloadPath(filename: string) {
  return path.join(os.tmpdir(), filename)
}

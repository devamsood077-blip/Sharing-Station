import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import chokidar from 'chokidar'
import { v4 as uuidv4 } from 'uuid'
import {
  checkForAppUpdate,
  DEFAULT_GITHUB_REPO,
  downloadGithubAsset,
  fetchLatestRelease,
  launchPortableReplacer,
  launchSetupInstaller,
  matchingAsset,
  UpdateAuthError,
  updateDownloadPath,
} from './updater'
import { sendPhotoPrint } from './print'

// ─── Config store ────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(data: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2))
}

// ─── Per-photo session IDs (persisted, unique, 9-char alphanumeric) ──────────
const SESSION_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SESSION_LENGTH = 9
const DEFAULT_SHARE_BASE = 'https://share.photoboothto.com/s'

function sessionsPath() {
  return path.join(app.getPath('userData'), 'sessions.json')
}

function readSessions(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(sessionsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeSessions(data: Record<string, string>) {
  fs.writeFileSync(sessionsPath(), JSON.stringify(data, null, 2))
}

function generateSessionId(used: Set<string>): string {
  let id = ''
  do {
    const bytes = crypto.randomBytes(SESSION_LENGTH)
    id = Array.from(bytes, (b) => SESSION_CHARSET[b % SESSION_CHARSET.length]).join('')
  } while (used.has(id))
  return id
}

function getOrCreateSessionId(filePath: string): string {
  const sessions = readSessions()
  if (sessions[filePath]) return sessions[filePath]
  const used = new Set(Object.values(sessions))
  const id = generateSessionId(used)
  sessions[filePath] = id
  writeSessions(sessions)
  return id
}

function shareUrlFor(sessionId: string): string {
  const cfg = readConfig()
  const base = typeof cfg.shareBaseUrl === 'string' && cfg.shareBaseUrl.trim()
    ? cfg.shareBaseUrl.trim()
    : DEFAULT_SHARE_BASE
  return `${base.replace(/\/$/, '')}/${sessionId}`
}

const SHARES_CSV = 'shares.csv'

type ShareRecord = {
  sessionId: string
  shareUrl: string
  filename: string
  filePath: string
  galleryId: string
  uploadedAt: string
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xmlUnescape(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

function xmlTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? xmlUnescape(match[1].trim()) : ''
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function sidecarXmlPath(imagePath: string) {
  const ext = path.extname(imagePath)
  return path.join(path.dirname(imagePath), `${path.basename(imagePath, ext)}.xml`)
}

function sharesCsvPath(imagePath: string) {
  return path.join(path.dirname(imagePath), SHARES_CSV)
}

function buildShareRecord(imagePath: string, sessionId: string): ShareRecord {
  const cfg = readConfig()
  return {
    sessionId,
    shareUrl: shareUrlFor(sessionId),
    filename: path.basename(imagePath),
    filePath: imagePath,
    galleryId: normalizeGallerySlug(String(cfg.breezeGalleryId || '')),
    uploadedAt: new Date().toISOString(),
  }
}

function readSidecarShare(imagePath: string): ShareRecord | null {
  const xmlPath = sidecarXmlPath(imagePath)
  if (!fs.existsSync(xmlPath)) return null
  try {
    const xml = fs.readFileSync(xmlPath, 'utf8')
    const sessionId = xmlTag(xml, 'sessionId') || xmlTag(xml, 'sessionid')
    const shareUrl = xmlTag(xml, 'shareUrl') || xmlTag(xml, 'shareurl')
    if (!sessionId && !shareUrl) return null
    return {
      sessionId,
      shareUrl,
      filename: xmlTag(xml, 'filename') || path.basename(imagePath),
      filePath: xmlTag(xml, 'filePath') || imagePath,
      galleryId: xmlTag(xml, 'galleryId') || xmlTag(xml, 'galleryid'),
      uploadedAt: xmlTag(xml, 'uploadedAt') || xmlTag(xml, 'uploadedat'),
    }
  } catch {
    return null
  }
}

function readSharesCsv(imagePath: string): ShareRecord[] {
  const csvPath = sharesCsvPath(imagePath)
  if (!fs.existsSync(csvPath)) return []
  try {
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((line) => line.trim())
    if (lines.length < 2) return []
    const header = parseCsvLine(lines[0]).map((cell) => cell.trim())
    const idx = (name: string) => header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase())
    const sessionIdx = idx('sessionId')
    const shareIdx = idx('shareUrl')
    if (sessionIdx < 0 && shareIdx < 0) return []
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line)
      return {
        sessionId: cells[sessionIdx] || '',
        shareUrl: shareIdx >= 0 ? cells[shareIdx] || '' : '',
        filename: idx('filename') >= 0 ? cells[idx('filename')] || '' : '',
        filePath: idx('filePath') >= 0 ? cells[idx('filePath')] || '' : '',
        galleryId: idx('galleryId') >= 0 ? cells[idx('galleryId')] || '' : '',
        uploadedAt: idx('uploadedAt') >= 0 ? cells[idx('uploadedAt')] || '' : '',
      }
    }).filter((row) => row.sessionId || row.shareUrl)
  } catch {
    return []
  }
}

function findLocalShare(imagePath: string, sessionId?: string): ShareRecord | null {
  const sidecar = readSidecarShare(imagePath)
  if (sidecar) return sidecar
  const filename = path.basename(imagePath)
  const rows = readSharesCsv(imagePath)
  return rows.find((row) =>
    (sessionId && row.sessionId === sessionId)
    || row.filename === filename
    || row.filePath === imagePath,
  ) ?? null
}

function writeSidecarXml(record: ShareRecord) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<share>
  <sessionId>${xmlEscape(record.sessionId)}</sessionId>
  <shareUrl>${xmlEscape(record.shareUrl)}</shareUrl>
  <filename>${xmlEscape(record.filename)}</filename>
  <filePath>${xmlEscape(record.filePath)}</filePath>
  <galleryId>${xmlEscape(record.galleryId)}</galleryId>
  <uploadedAt>${xmlEscape(record.uploadedAt)}</uploadedAt>
</share>
`
  fs.writeFileSync(sidecarXmlPath(record.filePath), xml, 'utf8')
}

function writeSharesCsv(record: ShareRecord) {
  const csvPath = sharesCsvPath(record.filePath)
  const header = 'sessionId,shareUrl,filename,filePath,galleryId,uploadedAt'
  const rows = readSharesCsv(record.filePath)
  const next = rows.filter((row) =>
    row.sessionId !== record.sessionId && row.filename !== record.filename && row.filePath !== record.filePath,
  )
  next.push(record)
  const body = next.map((row) =>
    [row.sessionId, row.shareUrl, row.filename, row.filePath, row.galleryId, row.uploadedAt]
      .map((cell) => csvEscape(cell))
      .join(','),
  )
  fs.writeFileSync(csvPath, `${header}\n${body.join('\n')}\n`, 'utf8')
}

function saveShareRecords(imagePath: string, sessionId: string): ShareRecord {
  const existing = findLocalShare(imagePath, sessionId)
  const record = buildShareRecord(imagePath, sessionId)
  if (existing?.uploadedAt) record.uploadedAt = existing.uploadedAt
  writeSidecarXml(record)
  writeSharesCsv(record)
  return record
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

async function fileToThumbnailDataUrl(filePath: string): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    const buf = await sharp(filePath)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    // Fallback: read full file if sharp fails
    return fileToFullDataUrl(filePath)
  }
}

function fileToFullDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'webp'
  const data = fs.readFileSync(filePath)
  return `data:image/${mime};base64,${data.toString('base64')}`
}

async function buildPhotoObject(filePath: string) {
  const stat = fs.statSync(filePath)
  const sessionId = getOrCreateSessionId(filePath)
  return {
    id: uuidv4(),
    name: path.basename(filePath),
    path: filePath,
    url: await fileToThumbnailDataUrl(filePath),
    size: stat.size,
    mtime: stat.mtimeMs,
    sessionId,
    shareUrl: shareUrlFor(sessionId),
    uploaded: !!findLocalShare(filePath, sessionId),
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let watcher: ReturnType<typeof chokidar.watch> | null = null

function appIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../dist/icon.ico'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
  ]
  return candidates.find((file) => fs.existsSync(file))
}

function splashHtmlPath() {
  const packaged = path.join(__dirname, '../dist/splash.html')
  const dev = path.join(__dirname, '../public/splash.html')
  if (fs.existsSync(packaged)) return packaged
  return dev
}

let splashWindow: BrowserWindow | null = null
let splashShownAt = 0
let appRevealed = false

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 1024,
    height: 576,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#050505',
    icon: appIconPath(),
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  splashShownAt = Date.now()
  void splashWindow.loadFile(splashHtmlPath())
  splashWindow.on('closed', () => { splashWindow = null })
}

function revealApp() {
  if (appRevealed) return
  appRevealed = true
  mainWindow?.show()
  mainWindow?.focus()
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createWindow() {
  nativeTheme.themeSource = 'dark'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
  })

  // Only use the Vite server when launched with --dev. Kiosk / autorun always loads the built app.
  const isDev = process.argv.includes('--dev')
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    const remain = Math.max(0, 1400 - (Date.now() - splashShownAt))
    setTimeout(revealApp, remain)
  })
  setTimeout(revealApp, 15000)
  mainWindow.on('closed', () => { mainWindow = null })
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.photoboothto.sharingstation')
}

const PROTOCOL = 'sharingstation'
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

if (process.defaultApp) {
  const appPath = path.resolve(process.argv[1] || '.')
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

function githubUpdateConfig() {
  const cfg = readConfig()
  const repo = String(cfg.githubRepo || DEFAULT_GITHUB_REPO).trim() || DEFAULT_GITHUB_REPO
  const token = String(cfg.githubToken || '').trim() || undefined
  return { repo, token }
}

function sendUpdateProgress(percent: number, status: string) {
  mainWindow?.webContents.send('update:progress', { percent, status })
}

app.whenReady().then(() => {
  createSplash()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Window controls ────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.on('window:fullscreen', (_e, on: boolean) => {
  mainWindow?.setFullScreen(!!on)
})

// ─── IPC: File system ────────────────────────────────────────────────────────
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result.filePaths[0] ?? null
})

ipcMain.handle('fs:readImages', async (_e, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return []
  const files = fs.readdirSync(folderPath)
  const imageFiles = files.filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
  const photos = await Promise.all(imageFiles.map((f) => buildPhotoObject(path.join(folderPath, f))))
  return photos.sort((a, b) => b.mtime - a.mtime)
})

// Full-res image for the viewer — only loaded on demand
ipcMain.handle('fs:getFullImage', (_e, filePath: string) => {
  if (!fs.existsSync(filePath)) return null
  return fileToFullDataUrl(filePath)
})

ipcMain.handle('fs:watchFolder', async (_e, folderPath: string) => {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (!folderPath) return

  watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  watcher.on('add', (filePath) => {
    if (!IMAGE_EXTS.includes(path.extname(filePath).toLowerCase())) return
    buildPhotoObject(filePath)
      .then((photo) => mainWindow?.webContents.send('watch:add', photo))
      .catch(() => { /* file still writing — skip */ })
  })

  watcher.on('unlink', (filePath) => {
    mainWindow?.webContents.send('watch:remove', filePath)
  })
})

// ─── IPC: Config ─────────────────────────────────────────────────────────────
ipcMain.handle('config:read', () => readConfig())
ipcMain.handle('config:write', (_e, data: Record<string, unknown>) => {
  writeConfig(data)
  return true
})
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('updates:check', async () => {
  try {
    const { repo, token } = githubUpdateConfig()
    return await checkForAppUpdate(repo, token)
  } catch (err: unknown) {
    return {
      ok: false,
      error: (err as Error).message,
      needsToken: err instanceof UpdateAuthError,
    }
  }
})
ipcMain.handle('updates:downloadAndInstall', async () => {
  try {
    const { repo, token } = githubUpdateConfig()
    const check = await checkForAppUpdate(repo, token)
    if (!check.available) {
      return { ok: false, error: `You already have the latest version (v${check.current}).` }
    }
    if (!check.packaged) {
      return {
        ok: false,
        error: `Version ${check.latest} is available (you have v${check.current}). You're running from source, so the app was not replaced. Use the built Setup/portable, or pull the latest code and rebuild.`,
      }
    }

    sendUpdateProgress(0, 'Downloading update...')
    const release = await fetchLatestRelease(repo, token)
    const asset = matchingAsset(release, check.portable)
    const dest = updateDownloadPath(asset.name)
    await downloadGithubAsset(repo, asset, dest, token, (percent) => {
      sendUpdateProgress(percent, 'Downloading update...')
    })
    sendUpdateProgress(100, 'Installing update...')
    if (check.portable) {
      launchPortableReplacer(dest)
    } else {
      launchSetupInstaller(dest)
    }
    setTimeout(() => app.quit(), 400)
    return { ok: true }
  } catch (err: unknown) {
    return {
      ok: false,
      error: (err as Error).message,
      needsToken: err instanceof UpdateAuthError,
    }
  }
})

// ─── IPC: Shell ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:openFile', (_e, filePath: string) => {
  shell.showItemInFolder(filePath)
})

// ─── IPC: Print ──────────────────────────────────────────────────────────────
ipcMain.handle('print:send', async (_e, opts: {
  imagePath: string
  printer: string
  copies: number
  printSize?: '4x6' | '5x7'
}) => sendPhotoPrint(opts))

ipcMain.handle('print:listPrinters', async () => {
  return mainWindow?.webContents.getPrintersAsync() ?? []
})

// ─── IPC: SMS via Twilio ─────────────────────────────────────────────────────
ipcMain.handle('sms:send', async (_e, opts: {
  accountSid: string; authToken: string; fromNumber: string
  toNumber: string; message: string; mediaUrl?: string
}) => {
  try {
    const twilio = await import('twilio')
    const client = twilio.default(opts.accountSid, opts.authToken)
    const msg = await client.messages.create({
      from: opts.fromNumber,
      to: opts.toNumber,
      body: opts.message,
      ...(opts.mediaUrl ? { mediaUrl: [opts.mediaUrl] } : {}),
    })
    return { success: true, sid: msg.sid }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ─── IPC: Email via Postmark ──────────────────────────────────────────────────
ipcMain.handle('email:send', async (_e, opts: {
  serverToken: string; from: string; to: string
  subject: string; htmlBody: string; attachmentPath?: string
}) => {
  try {
    const postmark = await import('postmark')
    const client = new postmark.ServerClient(opts.serverToken)
    const attachments: postmark.Models.Attachment[] = []
    if (opts.attachmentPath && fs.existsSync(opts.attachmentPath)) {
      const data = fs.readFileSync(opts.attachmentPath)
      attachments.push({
        Name: path.basename(opts.attachmentPath),
        Content: data.toString('base64'),
        ContentType: 'image/jpeg',
      })
    }
    const result = await client.sendEmail({
      From: opts.from, To: opts.to,
      Subject: opts.subject, HtmlBody: opts.htmlBody,
      Attachments: attachments,
    })
    return { success: true, messageId: result.MessageID }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ─── IPC: Breeze Cloud upload ────────────────────────────────────────────────
const BREEZE_UPLOAD_URL = 'https://eventkite.app/api/event-files/upload'

function normalizeGallerySlug(value: string) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

ipcMain.handle('breeze:upload', async (_e, opts: {
  apiKey: string
  galleryId: string
  imagePath: string
  sessionId: string
}) => {
  try {
    const apiKey = String(opts.apiKey || '').trim()
    const galleryId = normalizeGallerySlug(opts.galleryId)
    const sessionId = String(opts.sessionId || '').trim()
    if (!apiKey || !galleryId) {
      return { success: false, error: 'Breeze Cloud API key and gallery slug are required.' }
    }
    if (!opts.imagePath || !fs.existsSync(opts.imagePath)) {
      return { success: false, error: 'Image file not found.' }
    }

    if (findLocalShare(opts.imagePath, sessionId)) {
      saveShareRecords(opts.imagePath, sessionId)
      return { success: true, alreadyUploaded: true }
    }

    const filename = path.basename(opts.imagePath)
    const buffer = fs.readFileSync(opts.imagePath)
    const form = new FormData()
    form.append('gallery_id', galleryId)
    if (sessionId) form.append('session_id', sessionId)
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), filename)

    const res = await fetch(BREEZE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: form,
    })

    if (!res.ok) {
      let detail = res.statusText || `HTTP ${res.status}`
      try {
        const body = await res.json() as { message?: string; error?: string }
        detail = body?.message || body?.error || JSON.stringify(body)
      } catch {
        try {
          detail = (await res.text()).slice(0, 200) || detail
        } catch {
          // keep status text
        }
      }
      return { success: false, error: `${filename}: ${detail}` }
    }
    saveShareRecords(opts.imagePath, sessionId)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('breeze:checkShare', (_e, opts: { imagePath: string; sessionId?: string }) => {
  const share = findLocalShare(opts.imagePath, opts.sessionId)
  return {
    uploaded: !!share,
    sessionId: share?.sessionId || opts.sessionId || '',
    shareUrl: share?.shareUrl || '',
  }
})

ipcMain.handle('breeze:saveShare', (_e, opts: { imagePath: string; sessionId: string }) => {
  if (!opts.imagePath || !opts.sessionId || !fs.existsSync(opts.imagePath)) {
    return { success: false, error: 'Image file not found.' }
  }
  const record = saveShareRecords(opts.imagePath, opts.sessionId)
  return { success: true, shareUrl: record.shareUrl }
})

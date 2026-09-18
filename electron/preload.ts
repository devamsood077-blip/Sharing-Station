import { contextBridge, ipcRenderer } from 'electron'

export type PhotoFile = {
  id: string
  name: string
  path: string
  url: string
  size: number
  mtime: number
  sessionId: string
  shareUrl: string
  uploaded: boolean
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  readImages: (folder: string) => ipcRenderer.invoke('fs:readImages', folder),
  getFullImage: (filePath: string) => ipcRenderer.invoke('fs:getFullImage', filePath),
  watchFolder: (folder: string) => ipcRenderer.invoke('fs:watchFolder', folder),
  onPhotoAdded: (cb: (photo: PhotoFile) => void) => {
    ipcRenderer.on('watch:add', (_e, photo) => cb(photo))
    return () => ipcRenderer.removeAllListeners('watch:add')
  },
  onPhotoRemoved: (cb: (filePath: string) => void) => {
    ipcRenderer.on('watch:remove', (_e, filePath) => cb(filePath))
    return () => ipcRenderer.removeAllListeners('watch:remove')
  },

  // Config
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (data: Record<string, unknown>) => ipcRenderer.invoke('config:write', data),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadAndInstallUpdate: () => ipcRenderer.invoke('updates:downloadAndInstall'),
  onUpdateProgress: (cb: (payload: { percent: number; status: string }) => void) => {
    ipcRenderer.on('update:progress', (_e, payload) => cb(payload))
    return () => ipcRenderer.removeAllListeners('update:progress')
  },

  // Shell
  openInExplorer: (filePath: string) => ipcRenderer.invoke('shell:openFile', filePath),

  // Print
  listPrinters: () => ipcRenderer.invoke('print:listPrinters'),
  sendPrint: (opts: { imagePath: string; printer: string; copies: number; printSize?: '4x6' | '5x7' }) =>
    ipcRenderer.invoke('print:send', opts),

  // SMS
  sendSms: (opts: {
    accountSid: string
    authToken: string
    fromNumber: string
    toNumber: string
    message: string
    mediaUrl?: string
  }) => ipcRenderer.invoke('sms:send', opts),

  // Email
  sendEmail: (opts: {
    serverToken: string
    from: string
    to: string
    subject: string
    htmlBody: string
    attachmentPath?: string
  }) => ipcRenderer.invoke('email:send', opts),

  // Breeze
  uploadToBreeze: (opts: {
    apiKey: string
    galleryId: string
    imagePath: string
    sessionId: string
  }) => ipcRenderer.invoke('breeze:upload', opts),
  checkBreezeShare: (opts: { imagePath: string; sessionId?: string }) =>
    ipcRenderer.invoke('breeze:checkShare', opts),
  saveBreezeShare: (opts: { imagePath: string; sessionId: string }) =>
    ipcRenderer.invoke('breeze:saveShare', opts),

  // Window controls (frameless)
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setFullscreen: (on: boolean) => ipcRenderer.send('window:fullscreen', on),
})

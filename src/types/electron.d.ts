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

export type PrinterInfo = {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
  options?: Record<string, string>
}

export type SendResult = { success: boolean; error?: string; sid?: string; messageId?: string }

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>
      readImages: (folder: string) => Promise<PhotoFile[]>
      getFullImage: (filePath: string) => Promise<string | null>
      watchFolder: (folder: string) => Promise<void>
      onPhotoAdded: (cb: (photo: PhotoFile) => void) => () => void
      onPhotoRemoved: (cb: (filePath: string) => void) => () => void

      readConfig: () => Promise<Record<string, unknown>>
      writeConfig: (data: Record<string, unknown>) => Promise<boolean>
      getAppVersion: () => Promise<string>
      checkForUpdates: () => Promise<{
        ok: boolean
        current?: string
        latest?: string
        available?: boolean
        packaged?: boolean
        portable?: boolean
        file?: string
        error?: string
        needsToken?: boolean
      }>
      downloadAndInstallUpdate: () => Promise<{ ok: boolean; error?: string; needsToken?: boolean }>
      onUpdateProgress: (cb: (payload: { percent: number; status: string }) => void) => () => void

      openInExplorer: (filePath: string) => Promise<void>

      listPrinters: () => Promise<PrinterInfo[]>
      sendPrint: (opts: { imagePath: string; printer: string; copies: number; printSize?: '4x6' | '5x7' }) => Promise<SendResult>

      sendSms: (opts: {
        accountSid: string
        authToken: string
        fromNumber: string
        toNumber: string
        message: string
        mediaUrl?: string
      }) => Promise<SendResult>

      sendEmail: (opts: {
        serverToken: string
        from: string
        to: string
        subject: string
        htmlBody: string
        attachmentPath?: string
      }) => Promise<SendResult>

      uploadToBreeze: (opts: {
        apiKey: string
        galleryId: string
        imagePath: string
        sessionId: string
      }) => Promise<SendResult & { alreadyUploaded?: boolean }>
      checkBreezeShare: (opts: { imagePath: string; sessionId?: string }) => Promise<{
        uploaded: boolean
        sessionId: string
        shareUrl: string
      }>
      saveBreezeShare: (opts: { imagePath: string; sessionId: string }) => Promise<SendResult>

      // Window controls
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      setFullscreen: (on: boolean) => void
    }
  }
}

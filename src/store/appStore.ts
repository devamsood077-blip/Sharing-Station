import { create } from 'zustand'
import type { PhotoFile } from '../types/electron'
import { isPrintable } from '../lib/media'

export type PrintSize = '4x6' | '5x7'

export type AppConfig = {
  watchFolder: string
  // Print
  defaultPrinter: string
  defaultCopies: number
  printSize: PrintSize
  // Twilio
  twilioAccountSid: string
  twilioAuthToken: string
  twilioFromNumber: string
  smsMessage: string
  // Postmark
  postmarkServerToken: string
  emailFrom: string
  emailSubject: string
  emailBody: string
  // Breeze
  breezeApiKey: string
  breezeGalleryId: string
  breezeUploadUrl: string
  breezeUploadPassword: string
  breezeEnabled: boolean
  breezeAutoUpload: boolean
  shareBaseUrl: string
  githubRepo: string
  githubToken: string
  // UI
  kioskMode: boolean
  accentColor: string
  logoText: string
}

export const defaultConfig: AppConfig = {
  watchFolder: '',
  defaultPrinter: '',
  defaultCopies: 1,
  printSize: '4x6',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  smsMessage: 'Thanks for visiting! Here is your photo 📸',
  postmarkServerToken: '',
  emailFrom: '',
  emailSubject: 'Your Photo from PhotoboothTO',
  emailBody: '<p>Thank you for visiting us! Your photo is attached.</p>',
  breezeApiKey: '',
  breezeGalleryId: '',
  breezeUploadUrl: '',
  breezeUploadPassword: '',
  breezeEnabled: false,
  breezeAutoUpload: false,
  shareBaseUrl: 'https://share.photoboothto.com/s',
  githubRepo: 'devamsood077-blip/Sharing-Station',
  githubToken: '',
  kioskMode: false,
  accentColor: '#6366f1',
  logoText: 'PhotoboothTO',
}

type Notification = {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export type BreezeJobStatus = 'queued' | 'uploading' | 'done' | 'failed'

export type BreezeJob = {
  id: string
  sessionId: string
  name: string
  imagePath: string
  status: BreezeJobStatus
  error: string
  createdAt: number
  updatedAt: number
}

type AppState = {
  photos: PhotoFile[]
  selectedPhoto: PhotoFile | null
  config: AppConfig
  printers: { name: string; displayName: string; isDefault: boolean }[]
  isLoading: boolean
  notifications: Notification[]
  view: 'gallery' | 'settings'
  shareModalOpen: boolean
  shareModalPhoto: PhotoFile | null
  shareModalTab: 'sms' | 'email' | 'print' | 'breeze'
  keyboardVisible: boolean
  breezeQueue: BreezeJob[]
  breezeQueueProcessing: boolean
  breezeUploadedIds: string[]
  updateModalOpen: boolean

  setPhotos: (photos: PhotoFile[]) => void
  addPhoto: (photo: PhotoFile) => void
  removePhoto: (filePath: string) => void
  setSelectedPhoto: (photo: PhotoFile | null) => void
  setConfig: (config: Partial<AppConfig>) => void
  setPrinters: (printers: AppState['printers']) => void
  setLoading: (v: boolean) => void
  addNotification: (n: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  setView: (v: AppState['view']) => void
  openShareModal: (photo: PhotoFile, tab?: 'sms' | 'email' | 'print' | 'breeze') => void
  closeShareModal: () => void
  setKeyboardVisible: (v: boolean) => void
  setBreezeQueue: (queue: BreezeJob[] | ((q: BreezeJob[]) => BreezeJob[])) => void
  setBreezeQueueProcessing: (v: boolean) => void
  setBreezeUploadedIds: (ids: string[]) => void
  markBreezeUploaded: (sessionId: string) => void
  openUpdateModal: () => void
  closeUpdateModal: () => void
}

let _notifId = 0

export const useAppStore = create<AppState>((set) => ({
  photos: [],
  selectedPhoto: null,
  config: defaultConfig,
  printers: [],
  isLoading: false,
  notifications: [],
  view: 'gallery',
  shareModalOpen: false,
  shareModalPhoto: null,
  shareModalTab: 'sms',
  keyboardVisible: false,
  breezeQueue: [],
  breezeQueueProcessing: false,
  breezeUploadedIds: [],
  updateModalOpen: false,

  setPhotos: (photos) => set({ photos }),
  addPhoto: (photo) =>
    set((s) => {
      if (s.photos.some((existing) => existing.path === photo.path)) return s
      return { photos: [photo, ...s.photos] }
    }),
  removePhoto: (filePath) =>
    set((s) => ({ photos: s.photos.filter((p) => p.path !== filePath) })),
  setSelectedPhoto: (photo) => set({ selectedPhoto: photo }),
  setConfig: (cfg) => set((s) => ({ config: { ...s.config, ...cfg } })),
  setPrinters: (printers) => set({ printers }),
  setLoading: (isLoading) => set({ isLoading }),
  addNotification: (n) => {
    const id = String(++_notifId)
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }))
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) }))
    }, 4000)
  },
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  setView: (view) => set({ view }),
  openShareModal: (photo, tab = 'sms') => set({
    shareModalOpen: true,
    shareModalPhoto: photo,
    shareModalTab: tab === 'print' && !isPrintable(photo) ? 'sms' : tab,
  }),
  closeShareModal: () => set({ shareModalOpen: false, shareModalPhoto: null, keyboardVisible: false }),
  setKeyboardVisible: (keyboardVisible) => set({ keyboardVisible }),
  setBreezeQueue: (queue) =>
    set((s) => ({ breezeQueue: typeof queue === 'function' ? queue(s.breezeQueue) : queue })),
  setBreezeQueueProcessing: (breezeQueueProcessing) => set({ breezeQueueProcessing }),
  setBreezeUploadedIds: (breezeUploadedIds) => set({ breezeUploadedIds }),
  markBreezeUploaded: (sessionId) =>
    set((s) => ({
      breezeUploadedIds: s.breezeUploadedIds.includes(sessionId)
        ? s.breezeUploadedIds
        : [...s.breezeUploadedIds, sessionId],
      photos: s.photos.map((photo) =>
        photo.sessionId === sessionId ? { ...photo, uploaded: true } : photo,
      ),
    })),
  openUpdateModal: () => set({ updateModalOpen: true }),
  closeUpdateModal: () => set({ updateModalOpen: false }),
}))

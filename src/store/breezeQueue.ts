import type { PhotoFile } from '../types/electron'
import { useAppStore, type BreezeJob } from './appStore'

const QUEUE_MAX = 80

function canUpload() {
  const { config } = useAppStore.getState()
  return !!(config.breezeApiKey.trim() && config.breezeGalleryId.trim())
}

function patchJob(id: string, patch: Partial<BreezeJob>) {
  useAppStore.getState().setBreezeQueue((queue) =>
    queue.map((job) => (job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job)),
  )
}

export function isBreezeUploaded(sessionId: string) {
  const { breezeUploadedIds, breezeQueue, photos } = useAppStore.getState()
  if (breezeUploadedIds.includes(sessionId)) return true
  if (photos.some((photo) => photo.sessionId === sessionId && photo.uploaded)) return true
  return breezeQueue.some((job) => job.sessionId === sessionId && job.status === 'done')
}


async function persistUploaded(sessionId: string) {
  useAppStore.getState().markBreezeUploaded(sessionId)
  try {
    const existing = await window.electronAPI.readConfig()
    const prev = Array.isArray(existing.breezeUploadedIds) ? (existing.breezeUploadedIds as string[]) : []
    if (prev.includes(sessionId)) return
    await window.electronAPI.writeConfig({
      ...existing,
      breezeUploadedIds: [...prev, sessionId],
    })
  } catch {
    // ignore persist errors
  }
}

export function enqueueBreezeUpload(photo: PhotoFile) {
  if (!canUpload()) return null
  const { breezeQueue, setBreezeQueue } = useAppStore.getState()

  if (photo.uploaded || isBreezeUploaded(photo.sessionId)) {
    const done = breezeQueue.find((job) => job.sessionId === photo.sessionId && job.status === 'done')
    if (done) return done
    const job: BreezeJob = {
      id: `${photo.sessionId}-done`,
      sessionId: photo.sessionId,
      name: photo.name,
      imagePath: photo.path,
      status: 'done',
      error: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setBreezeQueue([job, ...breezeQueue].slice(0, QUEUE_MAX))
    return job
  }

  const existing = breezeQueue.find(
    (job) => job.sessionId === photo.sessionId && job.status !== 'failed',
  )
  if (existing) return existing

  const job: BreezeJob = {
    id: `${photo.sessionId}-${Date.now()}`,
    sessionId: photo.sessionId,
    name: photo.name,
    imagePath: photo.path,
    status: 'queued',
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  setBreezeQueue([job, ...breezeQueue].slice(0, QUEUE_MAX))
  void processBreezeQueue()
  return job
}

function waitForSessionJob(sessionId: string, timeoutMs = 120000) {
  return new Promise<BreezeJob>((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const jobs = useAppStore.getState().breezeQueue.filter((entry) => entry.sessionId === sessionId)
      const job =
        jobs.find((entry) => entry.status === 'done') ??
        jobs.find((entry) => entry.status === 'uploading' || entry.status === 'queued') ??
        jobs.find((entry) => entry.status === 'failed')
      if (job?.status === 'done') {
        resolve(job)
        return
      }
      if (job?.status === 'failed') {
        reject(new Error(job.error || 'Upload failed.'))
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Upload timed out.'))
        return
      }
      window.setTimeout(tick, 200)
    }
    tick()
  })
}

async function hasLocalShare(photo: PhotoFile) {
  if (photo.uploaded || isBreezeUploaded(photo.sessionId)) return true
  try {
    const local = await window.electronAPI.checkBreezeShare({
      imagePath: photo.path,
      sessionId: photo.sessionId,
    })
    if (local.uploaded) {
      await persistUploaded(photo.sessionId)
      return true
    }
  } catch {
    // fall through to upload
  }
  return false
}

/** Upload this photo if it is not already on Breeze, then resolve. */
export async function ensurePhotoUploaded(photo: PhotoFile) {
  if (await hasLocalShare(photo)) return { ok: true as const }
  if (!canUpload()) {
    return { ok: false as const, error: 'Set Breeze API key and gallery slug in Settings.' }
  }
  enqueueBreezeUpload(photo)
  try {
    await waitForSessionJob(photo.sessionId)
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Upload failed.' }
  }
}

export async function processBreezeQueue() {
  const { breezeQueueProcessing, breezeQueue, config, setBreezeQueueProcessing, addNotification } =
    useAppStore.getState()
  if (breezeQueueProcessing) return

  const job = breezeQueue.find((entry) => entry.status === 'queued')
  if (!job) return

  if (isBreezeUploaded(job.sessionId)) {
    patchJob(job.id, { status: 'done', error: '' })
    void window.electronAPI.saveBreezeShare({ imagePath: job.imagePath, sessionId: job.sessionId })
    void processBreezeQueue()
    return
  }

  setBreezeQueueProcessing(true)
  patchJob(job.id, { status: 'uploading', error: '' })

  try {
    const local = await window.electronAPI.checkBreezeShare({
      imagePath: job.imagePath,
      sessionId: job.sessionId,
    })
    if (local.uploaded) {
      patchJob(job.id, { status: 'done', error: '' })
      await persistUploaded(job.sessionId)
      void window.electronAPI.saveBreezeShare({ imagePath: job.imagePath, sessionId: job.sessionId })
      useAppStore.getState().setBreezeQueueProcessing(false)
      void processBreezeQueue()
      return
    }

    const result = await window.electronAPI.uploadToBreeze({
      apiKey: config.breezeApiKey,
      galleryId: config.breezeGalleryId,
      imagePath: job.imagePath,
      sessionId: job.sessionId,
    })
    if (result.success) {
      patchJob(job.id, { status: 'done', error: '' })
      await persistUploaded(job.sessionId)
    } else {
      patchJob(job.id, { status: 'failed', error: result.error ?? 'Upload failed.' })
      addNotification({ type: 'error', message: `Breeze upload failed: ${result.error ?? 'Upload failed.'}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    patchJob(job.id, { status: 'failed', error: message })
    addNotification({ type: 'error', message: `Breeze upload failed: ${message}` })
  }

  useAppStore.getState().setBreezeQueueProcessing(false)
  void processBreezeQueue()
}

/** Retry failed jobs and queue any watch-folder photos that have not been uploaded yet. */
export function retryFailedBreezeUploads() {
  const { photos, breezeQueue, setBreezeQueue } = useAppStore.getState()
  let queued = 0

  setBreezeQueue(
    breezeQueue.map((job) => {
      if (job.status !== 'failed') return job
      queued += 1
      return { ...job, status: 'queued', error: '', updatedAt: Date.now() }
    }),
  )

  for (const photo of photos) {
    if (isBreezeUploaded(photo.sessionId)) continue
    const current = useAppStore.getState().breezeQueue.find((job) => job.sessionId === photo.sessionId)
    if (current && current.status !== 'failed' && current.status !== 'done') continue
    if (current?.status === 'done') continue
    const job = enqueueBreezeUpload(photo)
    if (job && job.status === 'queued') queued += 1
  }

  if (queued) void processBreezeQueue()
  return queued
}

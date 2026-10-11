import type { PhotoFile } from '../types/electron'
import { useAppStore, type ShareJob, type ShareJobKind, type ShareLogEntry } from './appStore'
import { ensurePhotoUploaded } from './breezeQueue'

const QUEUE_MAX = 80
const LOG_MAX = 80
const UI_WAIT_MS = 15000
const MAX_ATTEMPTS = 8
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000]

export { UI_WAIT_MS }

let persistTimer = 0
const retryTimers = new Map<string, number>()

function patchJob(id: string, patch: Partial<ShareJob>) {
  useAppStore.getState().setShareQueue((queue) =>
    queue.map((job) => (job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job)),
  )
}

function addLog(entry: Omit<ShareLogEntry, 'id' | 'at'>) {
  const row: ShareLogEntry = {
    ...entry,
    id: `${entry.jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
  }
  useAppStore.getState().setShareLog((log) => [row, ...log].slice(0, LOG_MAX))
}

function schedulePersist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    void persistShareState()
  }, 400)
}

async function persistShareState() {
  if (!window.electronAPI) return
  try {
    const { shareQueue, shareLog } = useAppStore.getState()
    const existing = await window.electronAPI.readConfig()
    await window.electronAPI.writeConfig({
      ...existing,
      shareQueue: shareQueue.slice(0, QUEUE_MAX),
      shareLog: shareLog.slice(0, LOG_MAX),
    })
  } catch {
    // ignore persist errors
  }
}

function photoFromJob(job: ShareJob): PhotoFile {
  return {
    id: job.sessionId,
    name: job.photoName,
    path: job.photoPath,
    url: '',
    mediaUrl: '',
    kind: 'photo',
    size: 0,
    mtime: 0,
    sessionId: job.sessionId,
    shareUrl: job.shareUrl,
    uploaded: false,
  }
}

export function enqueueShareSend(opts: {
  kind: ShareJobKind
  photo: PhotoFile
  to: string
}) {
  const job: ShareJob = {
    id: `${opts.kind}-${opts.photo.sessionId}-${Date.now()}`,
    kind: opts.kind,
    status: 'queued',
    to: opts.to.trim(),
    photoName: opts.photo.name,
    photoPath: opts.photo.path,
    sessionId: opts.photo.sessionId,
    shareUrl: opts.photo.shareUrl,
    error: '',
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  useAppStore.getState().setShareQueue((queue) => [job, ...queue].slice(0, QUEUE_MAX))
  addLog({
    jobId: job.id,
    kind: job.kind,
    to: job.to,
    photoName: job.photoName,
    event: 'queued',
    message: job.kind === 'sms' ? 'Text queued' : 'Email queued',
  })
  schedulePersist()
  void processShareQueue()
  return job
}

export function waitForShareJob(id: string, timeoutMs = UI_WAIT_MS) {
  return new Promise<'done' | 'failed' | 'timeout'>((resolve) => {
    const started = Date.now()
    const tick = () => {
      const job = useAppStore.getState().shareQueue.find((entry) => entry.id === id)
      if (job?.status === 'done') {
        resolve('done')
        return
      }
      if (job?.status === 'failed') {
        resolve('failed')
        return
      }
      if (Date.now() - started >= timeoutMs) {
        resolve('timeout')
        return
      }
      window.setTimeout(tick, 200)
    }
    tick()
  })
}

function scheduleRetry(job: ShareJob) {
  if (job.attempts >= MAX_ATTEMPTS) return
  if (retryTimers.has(job.id)) return
  const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 30_000
  const timer = window.setTimeout(() => {
    retryTimers.delete(job.id)
    const current = useAppStore.getState().shareQueue.find((entry) => entry.id === job.id)
    if (!current || current.status !== 'failed') return
    addLog({
      jobId: job.id,
      kind: job.kind,
      to: job.to,
      photoName: job.photoName,
      event: 'retry',
      message: `Retrying ${job.kind === 'sms' ? 'text' : 'email'} (attempt ${current.attempts + 1})`,
    })
    patchJob(job.id, { status: 'queued', error: '' })
    schedulePersist()
    void processShareQueue()
  }, delay)
  retryTimers.set(job.id, timer)
}

async function sendJob(job: ShareJob) {
  const { config } = useAppStore.getState()
  if (job.kind === 'sms') {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      return { ok: false as const, error: 'Twilio credentials not configured in Settings.' }
    }
    const result = await window.electronAPI.sendSms({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      fromNumber: config.twilioFromNumber,
      toNumber: job.to,
      message: `${config.smsMessage}\n\n${job.shareUrl}`,
    })
    return result.success
      ? { ok: true as const }
      : { ok: false as const, error: result.error ?? 'SMS failed' }
  }

  if (!config.postmarkServerToken) {
    return { ok: false as const, error: 'Postmark not configured in Settings.' }
  }
  const result = await window.electronAPI.sendEmail({
    serverToken: config.postmarkServerToken,
    from: config.emailFrom,
    to: job.to,
    subject: config.emailSubject,
    htmlBody: `${config.emailBody}<p><a href="${job.shareUrl}">${job.shareUrl}</a></p>`,
    attachmentPath: job.photoPath,
  })
  return result.success
    ? { ok: true as const }
    : { ok: false as const, error: result.error ?? 'Email failed' }
}

export async function processShareQueue() {
  const { shareQueueProcessing, shareQueue, setShareQueueProcessing, addNotification } =
    useAppStore.getState()
  if (shareQueueProcessing) return

  const job = [...shareQueue].reverse().find((entry) => entry.status === 'queued')
  if (!job) return

  setShareQueueProcessing(true)
  patchJob(job.id, { status: 'uploading', attempts: job.attempts + 1 })

  try {
    const uploaded = await ensurePhotoUploaded(photoFromJob(job))
    if (!uploaded.ok) {
      patchJob(job.id, { status: 'failed', error: uploaded.error })
      addLog({
        jobId: job.id,
        kind: job.kind,
        to: job.to,
        photoName: job.photoName,
        event: 'failed',
        message: uploaded.error,
      })
      scheduleRetry({ ...job, attempts: job.attempts + 1, status: 'failed', error: uploaded.error })
      schedulePersist()
      setShareQueueProcessing(false)
      void processShareQueue()
      return
    }

    patchJob(job.id, { status: 'sending' })
    const sent = await sendJob(job)
    if (sent.ok) {
      patchJob(job.id, { status: 'done', error: '' })
      addLog({
        jobId: job.id,
        kind: job.kind,
        to: job.to,
        photoName: job.photoName,
        event: 'sent',
        message: job.kind === 'sms' ? `Text sent to ${job.to}` : `Email sent to ${job.to}`,
      })
      addNotification({
        type: 'success',
        message: job.kind === 'sms' ? `Text sent to ${job.to}` : `Email sent to ${job.to}`,
      })
    } else {
      patchJob(job.id, { status: 'failed', error: sent.error })
      addLog({
        jobId: job.id,
        kind: job.kind,
        to: job.to,
        photoName: job.photoName,
        event: 'failed',
        message: sent.error,
      })
      addNotification({ type: 'error', message: sent.error })
      scheduleRetry({ ...job, attempts: job.attempts + 1, status: 'failed', error: sent.error })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed.'
    patchJob(job.id, { status: 'failed', error: message })
    addLog({
      jobId: job.id,
      kind: job.kind,
      to: job.to,
      photoName: job.photoName,
      event: 'failed',
      message,
    })
    addNotification({ type: 'error', message })
    scheduleRetry({ ...job, attempts: job.attempts + 1, status: 'failed', error: message })
  }

  schedulePersist()
  useAppStore.getState().setShareQueueProcessing(false)
  void processShareQueue()
}

export function retryFailedShareJobs(kind?: ShareJobKind) {
  const { shareQueue } = useAppStore.getState()
  let queued = 0
  useAppStore.getState().setShareQueue((queue) =>
    queue.map((job) => {
      if (job.status !== 'failed') return job
      if (kind && job.kind !== kind) return job
      queued += 1
      return { ...job, status: 'queued', error: '', updatedAt: Date.now() }
    }),
  )
  if (queued) {
    addLog({
      jobId: 'bulk',
      kind: kind ?? 'sms',
      to: '',
      photoName: '',
      event: 'retry',
      message: kind
        ? `Retrying ${queued} failed ${kind === 'sms' ? 'text' : 'email'}${queued === 1 ? '' : 's'}`
        : `Retrying ${queued} failed send${queued === 1 ? '' : 's'}`,
    })
    schedulePersist()
    void processShareQueue()
  }
  return queued
}

export function resumeShareQueue(saved: { shareQueue?: unknown; shareLog?: unknown }) {
  const rawQueue = Array.isArray(saved.shareQueue) ? saved.shareQueue as ShareJob[] : []
  const rawLog = Array.isArray(saved.shareLog) ? saved.shareLog as ShareLogEntry[] : []
  const queue = rawQueue.map((job) => (
    job.status === 'uploading' || job.status === 'sending'
      ? { ...job, status: 'queued' as const, error: '' }
      : job
  ))
  useAppStore.getState().setShareQueue(queue.slice(0, QUEUE_MAX))
  useAppStore.getState().setShareLog(rawLog.slice(0, LOG_MAX))
  if (queue.some((job) => job.status === 'queued' || job.status === 'failed')) {
    for (const job of queue.filter((entry) => entry.status === 'failed')) {
      scheduleRetry(job)
    }
    void processShareQueue()
  }
}

import { X, Printer, Mail, MessageSquare, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { isPrintable, isVideo, photoKind } from '../lib/media'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

type Orientation = 'landscape' | 'portrait'

const SWIPE_THRESHOLD = 64

export function PhotoViewer() {
  const { selectedPhoto, setSelectedPhoto, openShareModal, photos, shareModalOpen } = useAppStore()
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const index = selectedPhoto ? photos.findIndex((photo) => photo.id === selectedPhoto.id) : -1
  const canNavigate = photos.length > 1 && index >= 0
  const prevPhoto = canNavigate ? photos[(index - 1 + photos.length) % photos.length] : null
  const nextPhoto = canNavigate ? photos[(index + 1) % photos.length] : null

  const goPrev = useCallback(() => {
    if (!prevPhoto) return
    setSelectedPhoto(prevPhoto)
  }, [prevPhoto, setSelectedPhoto])

  const goNext = useCallback(() => {
    if (!nextPhoto) return
    setSelectedPhoto(nextPhoto)
  }, [nextPhoto, setSelectedPhoto])

  useEffect(() => {
    if (!selectedPhoto) {
      setFullUrl(null)
      return
    }
    if (index < 0) {
      setSelectedPhoto(null)
      return
    }
    setFullUrl(null)
    setLoadingFull(true)
    const kind = photoKind(selectedPhoto)
    const probe = new Image()
    probe.onload = () => {
      if (probe.naturalWidth && probe.naturalHeight) {
        setOrientation(probe.naturalWidth > probe.naturalHeight ? 'landscape' : 'portrait')
      }
    }
    if (selectedPhoto.url) probe.src = selectedPhoto.url
    if (kind !== 'photo') {
      setFullUrl(selectedPhoto.mediaUrl)
      setLoadingFull(kind === 'video')
      return
    }
    window.electronAPI.getFullImage(selectedPhoto.path).then((url) => {
      setFullUrl(url)
      setLoadingFull(false)
    })
  }, [selectedPhoto?.id, index, setSelectedPhoto])

  useEffect(() => {
    if (!selectedPhoto || shareModalOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedPhoto, shareModalOpen, goPrev, goNext, setSelectedPhoto])

  if (!selectedPhoto) return null

  const landscape = orientation === 'landscape'

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !canNavigate) return
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || !canNavigate) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev()
    else goNext()
  }

  const actions = (
    <>
      <ActionCard
        icon={<MessageSquare size={22} />}
        label="Send Text"
        color="indigo"
        horizontal={landscape}
        onClick={() => openShareModal(selectedPhoto, 'sms')}
      />
      <ActionCard
        icon={<Mail size={22} />}
        label="Send Email"
        color="violet"
        horizontal={landscape}
        onClick={() => openShareModal(selectedPhoto, 'email')}
      />
      {isPrintable(selectedPhoto) && (
        <ActionCard
          icon={<Printer size={22} />}
          label="Print"
          color="sky"
          horizontal={landscape}
          onClick={() => openShareModal(selectedPhoto, 'print')}
        />
      )}
    </>
  )

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-[#0a0a0a] fade-in"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <p className="text-sm text-white/40 tabular-nums">
          {index >= 0 ? `${index + 1} / ${photos.length}` : ''}
        </p>
        <button
          onClick={() => setSelectedPhoto(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/15 text-white/60 hover:text-white text-sm transition-colors"
        >
          <X size={15} />
          Close
        </button>
      </div>

      <div
        className={clsx(
          'flex-1 px-6 pb-6 overflow-hidden',
          landscape ? 'flex flex-col gap-4' : 'flex gap-6',
        )}
      >
        <div
          className="flex-1 flex items-center justify-center bg-[#0d0d0d] rounded-2xl overflow-hidden relative min-h-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipeStart.current = null }}
        >
          {loadingFull && !fullUrl && (
            <div className="flex flex-col items-center gap-3 text-white/25">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {(fullUrl || selectedPhoto.url) && (
            isVideo(selectedPhoto) ? (
              <video
                key={selectedPhoto.id}
                src={fullUrl ?? selectedPhoto.mediaUrl}
                poster={selectedPhoto.url}
                autoPlay
                loop
                muted
                playsInline
                className="max-w-full max-h-full object-contain"
                onLoadedMetadata={(e) => {
                  const { videoWidth, videoHeight } = e.currentTarget
                  if (!videoWidth || !videoHeight) return
                  setOrientation(videoWidth > videoHeight ? 'landscape' : 'portrait')
                  setLoadingFull(false)
                }}
              />
            ) : (
              <img
                key={selectedPhoto.id}
                src={fullUrl ?? selectedPhoto.url}
                alt={selectedPhoto.name}
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                style={{ opacity: fullUrl ? 1 : 0.5, transition: 'opacity 0.25s' }}
                draggable={false}
                onLoad={(e) => {
                  const { naturalWidth, naturalHeight } = e.currentTarget
                  if (!naturalWidth || !naturalHeight) return
                  setOrientation(naturalWidth > naturalHeight ? 'landscape' : 'portrait')
                }}
              />
            )
          )}

          {canNavigate && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => { e.stopPropagation(); goPrev() }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => { e.stopPropagation(); goNext() }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}
        </div>

        <div
          className={clsx(
            'shrink-0',
            landscape
              ? 'flex flex-row gap-3'
              : 'w-56 flex flex-col gap-3 justify-center',
          )}
        >
          {actions}
        </div>
      </div>
    </div>
  )
}

type ActionCardProps = {
  icon: React.ReactNode
  label: string
  color: 'indigo' | 'violet' | 'sky' | 'emerald'
  onClick: () => void
  disabled?: boolean
  horizontal?: boolean
}

const colorMap = {
  indigo: {
    bg: 'bg-indigo-600 hover:bg-indigo-500',
    icon: 'text-indigo-200',
  },
  violet: {
    bg: 'bg-violet-600 hover:bg-violet-500',
    icon: 'text-violet-200',
  },
  sky: {
    bg: 'bg-sky-600 hover:bg-sky-500',
    icon: 'text-sky-200',
  },
  emerald: {
    bg: 'bg-emerald-600 hover:bg-emerald-500',
    icon: 'text-emerald-200',
  },
}

function ActionCard({ icon, label, color, onClick, disabled, horizontal }: ActionCardProps) {
  const c = colorMap[color]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center rounded-2xl transition-all active:scale-[0.97]',
        horizontal ? 'flex-1 justify-center gap-3 px-5 py-4' : 'w-full gap-4 px-5 py-5',
        disabled ? 'bg-white/5 text-white/25 cursor-not-allowed' : `${c.bg} text-white`,
      )}
    >
      <div className={`shrink-0 ${disabled ? 'text-white/25' : c.icon}`}>
        {icon}
      </div>
      <p className="text-base font-semibold">{label}</p>
    </button>
  )
}

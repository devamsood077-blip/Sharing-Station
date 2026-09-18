import { X, Printer, Mail, MessageSquare, Loader2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

type Orientation = 'landscape' | 'portrait'

export function PhotoViewer() {
  const { selectedPhoto, setSelectedPhoto, openShareModal } = useAppStore()
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [orientation, setOrientation] = useState<Orientation>('portrait')

  useEffect(() => {
    if (!selectedPhoto) {
      setFullUrl(null)
      return
    }
    setFullUrl(null)
    setLoadingFull(true)
    const probe = new Image()
    probe.onload = () => {
      if (probe.naturalWidth && probe.naturalHeight) {
        setOrientation(probe.naturalWidth > probe.naturalHeight ? 'landscape' : 'portrait')
      }
    }
    probe.src = selectedPhoto.url
    window.electronAPI.getFullImage(selectedPhoto.path).then((url) => {
      setFullUrl(url)
      setLoadingFull(false)
    })
  }, [selectedPhoto?.id])

  useEffect(() => {
    if (!selectedPhoto) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPhoto(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedPhoto])

  if (!selectedPhoto) return null

  const landscape = orientation === 'landscape'

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
      <ActionCard
        icon={<Printer size={22} />}
        label="Print"
        color="sky"
        horizontal={landscape}
        onClick={() => openShareModal(selectedPhoto, 'print')}
      />
    </>
  )

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-[#0a0a0a] fade-in"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="flex items-center justify-end px-5 py-3 shrink-0">
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
        <div className="flex-1 flex items-center justify-center bg-[#0d0d0d] rounded-2xl overflow-hidden relative min-h-0">
          {loadingFull && !fullUrl && (
            <div className="flex flex-col items-center gap-3 text-white/25">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {(fullUrl || selectedPhoto.url) && (
            <img
              key={selectedPhoto.id}
              src={fullUrl ?? selectedPhoto.url}
              alt={selectedPhoto.name}
              className="max-w-full max-h-full object-contain select-none"
              style={{ opacity: fullUrl ? 1 : 0.5, transition: 'opacity 0.25s' }}
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth, naturalHeight } = e.currentTarget
                if (!naturalWidth || !naturalHeight) return
                setOrientation(naturalWidth > naturalHeight ? 'landscape' : 'portrait')
              }}
            />
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

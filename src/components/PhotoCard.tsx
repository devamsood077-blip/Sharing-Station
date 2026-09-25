import { useRef, useState } from 'react'
import { Share2, Printer, Eye } from 'lucide-react'
import type { PhotoFile } from '../types/electron'
import { useAppStore } from '../store/appStore'
import { isPrintable, isVideo, photoKind } from '../lib/media'

type Props = {
  photo: PhotoFile
  isNew?: boolean
}

export function PhotoCard({ photo, isNew }: Props) {
  const { openShareModal, setSelectedPhoto } = useAppStore()
  const [hovered, setHovered] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const kind = photoKind(photo)
  const printable = isPrintable(photo)
  const video = isVideo(photo)

  const handlePrintQuick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!printable) return
    const { config, addNotification } = useAppStore.getState()
    if (!config.defaultPrinter) {
      addNotification({ type: 'error', message: 'No default printer set. Go to Settings.' })
      return
    }
    const result = await window.electronAPI.sendPrint({
      imagePath: photo.path,
      printer: config.defaultPrinter,
      copies: config.defaultCopies,
      printSize: config.printSize || '4x6',
    })
    if (result.success) {
      addNotification({ type: 'success', message: `Sent to printer: ${config.defaultPrinter}` })
    } else {
      addNotification({ type: 'error', message: result.error ?? 'Print failed' })
    }
  }

  const onEnter = () => {
    setHovered(true)
    if (video) void videoRef.current?.play().catch(() => {})
  }

  const onLeave = () => {
    setHovered(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  return (
    <div
      className={`group relative rounded-xl overflow-hidden cursor-pointer bg-[#111] border border-white/5 transition-colors duration-200 hover:border-white/15 hover:z-10 ${isNew ? 'photo-in ring-2 ring-indigo-500/40' : ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => setSelectedPhoto(photo)}
    >
      {video ? (
        <video
          ref={videoRef}
          src={photo.mediaUrl}
          poster={photo.url}
          muted
          playsInline
          loop
          preload="metadata"
          className="block w-full h-auto object-contain bg-[#111]"
        />
      ) : (
        <img
          src={photo.url}
          alt={photo.name}
          className="block w-full h-auto object-contain"
          loading="lazy"
        />
      )}

      {kind !== 'photo' && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-semibold tracking-wide">
          {kind === 'video' ? 'VIDEO' : 'GIF'}
        </div>
      )}

      {hovered && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent fade-in flex flex-col justify-end p-3 gap-2">
          <div className="flex gap-2">
            <button
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
              onClick={(e) => { e.stopPropagation(); openShareModal(photo) }}
            >
              <Share2 size={13} />
              Share
            </button>
            {printable && (
              <button
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                onClick={handlePrintQuick}
                title="Quick print"
              >
                <Printer size={13} />
              </button>
            )}
            <button
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
              onClick={(e) => { e.stopPropagation(); setSelectedPhoto(photo) }}
              title="View full size"
            >
              <Eye size={13} />
            </button>
          </div>
        </div>
      )}

      {isNew && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tracking-wide">
          NEW
        </div>
      )}
    </div>
  )
}

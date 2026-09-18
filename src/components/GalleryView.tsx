import { useState, useEffect, useRef } from 'react'
import { FolderOpen, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { enqueueBreezeUpload } from '../store/breezeQueue'
import { PhotoCard } from './PhotoCard'
import type { PhotoFile } from '../types/electron'

export function GalleryView() {
  const { photos, setPhotos, addPhoto, removePhoto, config, setConfig, addNotification, isLoading, setLoading } = useAppStore()
  const [newPhotoIds, setNewPhotoIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [gridSize, setGridSize] = useState<'md' | 'lg'>('md')
  const cleanupRef = useRef<(() => void)[]>([])

  const loadFolder = async (folder: string) => {
    if (!folder) return
    setLoading(true)
    const imgs = await window.electronAPI.readImages(folder)
    setPhotos(imgs)
    const { breezeUploadedIds, setBreezeUploadedIds } = useAppStore.getState()
    setBreezeUploadedIds([
      ...new Set([
        ...breezeUploadedIds,
        ...imgs.filter((photo) => photo.uploaded).map((photo) => photo.sessionId),
      ]),
    ])
    await window.electronAPI.watchFolder(folder)
    setLoading(false)
  }

  useEffect(() => {
    if (config.watchFolder) {
      loadFolder(config.watchFolder)
    }

    const unsubAdd = window.electronAPI.onPhotoAdded((photo: PhotoFile) => {
      addPhoto(photo)
      if (photo.uploaded) useAppStore.getState().markBreezeUploaded(photo.sessionId)
      setNewPhotoIds((s) => new Set(s).add(photo.id))
      setTimeout(() => {
        setNewPhotoIds((s) => {
          const next = new Set(s)
          next.delete(photo.id)
          return next
        })
      }, 5000)

      const { config: cfg } = useAppStore.getState()
      if (cfg.breezeEnabled && cfg.breezeAutoUpload) {
        enqueueBreezeUpload(photo)
      }
    })

    const unsubRemove = window.electronAPI.onPhotoRemoved((filePath: string) => {
      removePhoto(filePath)
    })

    cleanupRef.current = [unsubAdd, unsubRemove]
    return () => cleanupRef.current.forEach((fn) => fn())
  }, [config.watchFolder])

  const selectFolder = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setConfig({ watchFolder: folder })
      // save to persistent config
      const cfg = await window.electronAPI.readConfig()
      window.electronAPI.writeConfig({ ...cfg, watchFolder: folder })
      addNotification({ type: 'info', message: `Watching: ${folder}` })
    }
  }

  const filtered = photos.filter((p) =>
    search ? p.name.toLowerCase().includes(search.toLowerCase()) : true,
  )

  // Empty state
  if (!config.watchFolder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
          <FolderOpen size={28} className="text-white/30" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white/80">No Watch Folder Selected</p>
          <p className="text-sm text-white/35 mt-1 max-w-xs">
            Choose a folder to watch and photos will appear here automatically as they're added.
          </p>
        </div>
        <button
          onClick={selectFolder}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <FolderOpen size={16} />
          Select Watch Folder
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0 gap-3 ${config.kioskMode ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 flex-1 max-w-72 focus-within:border-white/20 transition-colors">
            <Search size={13} className="text-white/30 shrink-0" />
            <input
              type="text"
              placeholder="Search photos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/25"
            />
          </div>
          <span className="text-xs text-white/30">{filtered.length} photos</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setGridSize((s) => (s === 'md' ? 'lg' : 'md'))}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            title="Toggle grid size"
          >
            <SlidersHorizontal size={14} />
          </button>
          <button
            onClick={() => loadFolder(config.watchFolder)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={selectFolder}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition-colors"
          >
            <FolderOpen size={13} />
            Change Folder
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && photos.length === 0 ? (
          <div className="flex items-center justify-center h-48 gap-3 text-white/30">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Loading photos…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <p className="text-white/30 text-sm">
              {search ? `No photos matching "${search}"` : 'No photos in folder yet. Watching for new arrivals…'}
            </p>
          </div>
        ) : (
          <div className={gridSize === 'md' ? 'photo-grid' : 'photo-grid-lg'}>
            {filtered.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} isNew={newPhotoIds.has(photo.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

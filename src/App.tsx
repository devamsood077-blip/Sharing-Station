import { useEffect, useRef } from 'react'
import { Titlebar } from './components/Titlebar'
import { GalleryView } from './components/GalleryView'
import { SettingsView } from './components/SettingsView'
import { PhotoViewer } from './components/PhotoViewer'
import { ShareModal } from './components/ShareModal'
import { UpdateModal } from './components/UpdateModal'
import { Notifications } from './components/Notifications'
import { StatusBar } from './components/StatusBar'
import { OnScreenKeyboard } from './components/OnScreenKeyboard'
import { useAppStore, defaultConfig } from './store/appStore'
import { setKioskMode } from './store/kiosk'

export default function App() {
  const { view, config, setConfig, shareModalOpen, keyboardVisible } = useAppStore()
  const kiosk = config.kioskMode

  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      const saved = await window.electronAPI.readConfig()
      if (saved && typeof saved === 'object') {
        const next = { ...defaultConfig, ...(saved as typeof defaultConfig) }
        setConfig(next)
        if (Array.isArray((saved as { breezeUploadedIds?: string[] }).breezeUploadedIds)) {
          useAppStore.getState().setBreezeUploadedIds(
            (saved as { breezeUploadedIds: string[] }).breezeUploadedIds,
          )
        }
        if (next.kioskMode) window.electronAPI.setFullscreen(true)
      }
    }
    load()
  }, [])

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden bg-[#0a0a0a] text-white relative"
      style={{ '--accent': config.accentColor } as React.CSSProperties}
    >
      {!kiosk && <Titlebar />}

      <div className="flex-1 flex overflow-hidden">
        {(kiosk || view === 'gallery') && <GalleryView />}
        {!kiosk && view === 'settings' && <SettingsView />}
      </div>

      <PhotoViewer />
      {shareModalOpen && <ShareModal />}
      <UpdateModal />
      <Notifications />
      <OnScreenKeyboard />
      {!kiosk && !keyboardVisible && <StatusBar />}
      {kiosk && <KioskExitHotspot />}
    </div>
  )
}

function KioskExitHotspot() {
  const lastTap = useRef(0)

  const onTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 400) {
      lastTap.current = 0
      void setKioskMode(false)
      return
    }
    lastTap.current = now
  }

  return (
    <button
      type="button"
      aria-label=""
      onClick={onTap}
      className="absolute top-0 left-0 z-[80] w-16 h-16 bg-transparent border-0 p-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    />
  )
}

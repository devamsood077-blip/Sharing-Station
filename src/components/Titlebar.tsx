import { Settings, Grid3X3, Minus, Square, X, Maximize2, RefreshCw } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { setKioskMode } from '../store/kiosk'
import appIcon from '../assets/app-icon.png'

export function Titlebar() {
  const { config, view, setView, openUpdateModal } = useAppStore()

  const isElectron = !!window.electronAPI

  return (
    <div
      className="h-10 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: logo + folder */}
      <div className="flex items-center gap-3 px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <img
          src={appIcon}
          alt=""
          draggable={false}
          className="w-5 h-5 rounded-md shrink-0 object-cover"
        />
        <span className="text-sm font-semibold tracking-tight text-white/90">
          {config.logoText || 'Sharing Station'}
        </span>
        {config.watchFolder && (
          <span className="text-xs text-white/25 truncate max-w-52 hidden sm:block">
            {config.watchFolder}
          </span>
        )}
      </div>

      {/* Center: nav tabs */}
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => setView('gallery')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'gallery'
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          <Grid3X3 size={12} />
          Gallery
        </button>
        <button
          onClick={() => setView('settings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'settings'
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          <Settings size={12} />
          Settings
        </button>
      </div>

      {/* Right: window controls */}
      {isElectron && (
        <div
          className="flex items-center h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => openUpdateModal()}
            className="h-full px-3 flex items-center gap-1.5 text-white/40 hover:text-white hover:bg-white/8 transition-colors text-xs font-medium"
            title="Check for Updates"
          >
            <RefreshCw size={12} />
            Updates
          </button>
          <button
            onClick={() => setKioskMode(true)}
            className="h-full px-3 flex items-center gap-1.5 text-white/40 hover:text-white hover:bg-white/8 transition-colors text-xs font-medium"
            title="Fullscreen kiosk"
          >
            <Maximize2 size={12} />
            Full Screen
          </button>
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="w-11 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-11 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Square size={11} />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-11 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-red-600 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

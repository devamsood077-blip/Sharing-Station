import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

type Phase = 'checking' | 'current' | 'available' | 'source' | 'token' | 'downloading' | 'error'

export function UpdateModal() {
  const { updateModalOpen, closeUpdateModal, setConfig } = useAppStore()
  const [phase, setPhase] = useState<Phase>('checking')
  const [current, setCurrent] = useState('')
  const [latest, setLatest] = useState('')
  const [error, setError] = useState('')
  const [percent, setPercent] = useState(0)
  const [status, setStatus] = useState('Checking for updates...')
  const [token, setToken] = useState('')

  const runCheck = useCallback(() => {
    setPhase('checking')
    setError('')
    setPercent(0)
    setStatus('Checking for updates...')
    void window.electronAPI.checkForUpdates().then((result) => {
      if (!result.ok) {
        if (result.needsToken) {
          setPhase('token')
          setError(result.error || 'A GitHub token is required for this private repo.')
          return
        }
        setPhase('error')
        setError(result.error || 'Update check failed.')
        return
      }
      setCurrent(result.current || '')
      setLatest(result.latest || '')
      if (!result.available) {
        setPhase('current')
        return
      }
      if (!result.packaged) {
        setPhase('source')
        return
      }
      setPhase('available')
    })
  }, [])

  useEffect(() => {
    if (!updateModalOpen) return
    setToken('')
    const unsub = window.electronAPI.onUpdateProgress((payload) => {
      setPercent(payload.percent)
      setStatus(payload.status)
    })
    runCheck()
    return unsub
  }, [updateModalOpen, runCheck])

  if (!updateModalOpen) return null

  const saveTokenAndRetry = async () => {
    const next = token.trim()
    if (!next) return
    const existing = await window.electronAPI.readConfig()
    await window.electronAPI.writeConfig({ ...existing, githubToken: next })
    setConfig({ githubToken: next })
    runCheck()
  }

  const install = async () => {
    setPhase('downloading')
    setStatus('Downloading update...')
    const result = await window.electronAPI.downloadAndInstallUpdate()
    if (!result.ok) {
      if (result.needsToken) {
        setPhase('token')
        setError(result.error || 'A GitHub token is required for this private repo.')
        return
      }
      setPhase('error')
      setError(result.error || 'Download failed.')
    }
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center fade-in" style={{ position: 'absolute' }}>
      <div className="absolute inset-0 bg-black/75" onClick={phase === 'downloading' ? undefined : closeUpdateModal} />
      <div className="relative w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl overflow-hidden slide-up mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-indigo-400" />
            <p className="text-lg font-semibold text-white">Check for Updates</p>
          </div>
          {phase !== 'downloading' && (
            <button
              onClick={closeUpdateModal}
              className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'checking' && (
          <div className="flex items-center gap-3 text-white/70 py-3">
            <Loader2 size={18} className="animate-spin" />
            Checking for updates...
          </div>
        )}

        {phase === 'current' && (
          <p className="text-white/80 text-sm leading-relaxed">
            You already have the latest version (v{current}).
          </p>
        )}

        {phase === 'available' && (
          <div className="space-y-4">
            <p className="text-white/80 text-sm leading-relaxed">
              Version {latest} is available (you have v{current}).
              <br /><br />
              Download and install it now? The app will restart when it finishes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={closeUpdateModal}
                className="flex-1 py-3 rounded-xl bg-white/8 hover:bg-white/12 text-white text-sm font-semibold"
              >
                Later
              </button>
              <button
                onClick={() => void install()}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
              >
                Download and Install
              </button>
            </div>
          </div>
        )}

        {phase === 'source' && (
          <p className="text-white/80 text-sm leading-relaxed">
            Version {latest} is available (you have v{current}).
            <br /><br />
            You're running from source, so the app was not replaced. Use the built Setup/portable, or pull the latest code and rebuild.
          </p>
        )}

        {phase === 'token' && (
          <div className="space-y-4">
            <p className="text-white/80 text-sm leading-relaxed">
              {error || 'Could not read GitHub releases. If this repo is private, paste a GitHub personal access token with repo read access.'}
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github.com/settings/tokens"
              className="input-field w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={closeUpdateModal}
                className="flex-1 py-3 rounded-xl bg-white/8 hover:bg-white/12 text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveTokenAndRetry()}
                disabled={!token.trim()}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold"
              >
                Save and Retry
              </button>
            </div>
          </div>
        )}

        {phase === 'downloading' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 text-white/80 text-sm">
              <Loader2 size={18} className="animate-spin" />
              {status}{percent ? ` ${percent}%` : ''}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {phase === 'error' && (
          <p className="text-red-300 text-sm leading-relaxed">{error}</p>
        )}

        {(phase === 'current' || phase === 'source' || phase === 'error') && (
          <button
            onClick={closeUpdateModal}
            className="mt-5 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
          >
            OK
          </button>
        )}
      </div>
    </div>
  )
}

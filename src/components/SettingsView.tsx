import { useEffect, useState } from 'react'
import { Save, Printer, MessageSquare, Mail, Cloud, FolderOpen, Monitor, RefreshCw, RotateCcw } from 'lucide-react'
import { useAppStore, type AppConfig } from '../store/appStore'
import { isBreezeUploaded, retryFailedBreezeUploads } from '../store/breezeQueue'
import { setKioskMode } from '../store/kiosk'
import clsx from 'clsx'

type Section = 'general' | 'print' | 'sms' | 'email' | 'breeze' | 'display'

export function SettingsView() {
  const { config, setConfig, addNotification, setPrinters, printers, openUpdateModal } = useAppStore()
  const [section, setSection] = useState<Section>('general')
  const [local, setLocal] = useState<AppConfig>(config)
  const [appVersion, setAppVersion] = useState('')
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  useEffect(() => {
    setLocal(config)
  }, [config])

  useEffect(() => {
    void window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

  const set = (key: keyof AppConfig, val: unknown) => {
    setLocal((c) => ({ ...c, [key]: val }))
  }

  const save = async () => {
    setConfig(local)
    const existing = await window.electronAPI.readConfig()
    await window.electronAPI.writeConfig({ ...existing, ...local })
    addNotification({ type: 'success', message: 'Settings saved.' })
  }

  const fetchPrinters = async () => {
    setLoadingPrinters(true)
    const list = await window.electronAPI.listPrinters()
    setPrinters(list as typeof printers)
    setLoadingPrinters(false)
  }

  const selectFolder = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) set('watchFolder', folder)
  }

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <FolderOpen size={15} /> },
    { id: 'print', label: 'Print', icon: <Printer size={15} /> },
    { id: 'sms', label: 'SMS / Twilio', icon: <MessageSquare size={15} /> },
    { id: 'email', label: 'Email / Postmark', icon: <Mail size={15} /> },
    { id: 'breeze', label: 'Breeze Cloud', icon: <Cloud size={15} /> },
    { id: 'display', label: 'Display', icon: <Monitor size={15} /> },
  ]

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 border-r border-white/5 p-3 shrink-0 space-y-0.5">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
              section === s.id
                ? 'bg-white/10 text-white font-medium'
                : 'text-white/45 hover:text-white/75 hover:bg-white/5',
            )}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg space-y-6">

          {/* General */}
          {section === 'general' && (
            <>
              <SectionHeader title="General Settings" />
              <Field label="Watch Folder">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={local.watchFolder}
                    readOnly
                    placeholder="No folder selected"
                    className="flex-1 input-field"
                  />
                  <button onClick={selectFolder} className="btn-secondary flex items-center gap-2 px-4">
                    <FolderOpen size={14} />
                    Browse
                  </button>
                </div>
              </Field>
              <Field label="Logo / Studio Name">
                <input
                  type="text"
                  value={local.logoText}
                  onChange={(e) => set('logoText', e.target.value)}
                  placeholder="PhotoboothTO"
                  className="input-field w-full"
                />
              </Field>
              <Field label="App Updates">
                {appVersion && (
                  <p className="text-sm text-white/50 mb-2">Current version v{appVersion}</p>
                )}
                <input
                  type="text"
                  value={local.githubRepo}
                  onChange={(e) => set('githubRepo', e.target.value)}
                  placeholder="devamsood077-blip/Sharing-Station"
                  className="input-field w-full"
                />
                <input
                  type="password"
                  value={local.githubToken}
                  onChange={(e) => set('githubToken', e.target.value)}
                  placeholder="GitHub token (required for private repos)"
                  className="input-field w-full mt-2"
                />
                <p className="text-xs text-white/30 mt-1.5">
                  Updates come from GitHub Releases on this repo. From your main PC, run publish-updates.bat after a build. Kiosks only need the installed app — no Git or Node on the station.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-2 px-4 py-2 text-sm"
                  onClick={() => openUpdateModal()}
                >
                  Check for Updates...
                </button>
              </Field>
            </>
          )}

          {/* Print */}
          {section === 'print' && (
            <>
              <SectionHeader title="Print Settings" />
              <Field label="Printer">
                <div className="flex gap-2">
                  <select
                    value={local.defaultPrinter}
                    onChange={(e) => set('defaultPrinter', e.target.value)}
                    className="flex-1 input-field"
                  >
                    <option value="">Select printer…</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}
                        {p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={fetchPrinters}
                    className="btn-secondary flex items-center gap-2 px-4"
                    disabled={loadingPrinters}
                  >
                    <RefreshCw size={13} className={loadingPrinters ? 'animate-spin' : ''} />
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  DNP DS620A, DS820A, and other Windows printers are supported.
                </p>
              </Field>
              <Field label="Print Size">
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  {(['4x6', '5x7'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => set('printSize', size)}
                      className={clsx(
                        'py-3 rounded-xl text-sm font-semibold transition-colors',
                        local.printSize === size
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/8 text-white/55 hover:bg-white/12 hover:text-white',
                      )}
                    >
                      {size === '4x6' ? '4×6' : '5×7'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  DNP DS620 media size. Portrait photos print 4×6 or 5×7; landscape prints 6×4 or 7×5.
                </p>
              </Field>
              <Field label="Default Copies">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={local.defaultCopies}
                  onChange={(e) => set('defaultCopies', Number(e.target.value))}
                  className="input-field w-24"
                />
              </Field>
            </>
          )}

          {/* SMS */}
          {section === 'sms' && (
            <>
              <SectionHeader title="SMS via Twilio" />
              <div className="p-3 rounded-lg bg-indigo-500/8 border border-indigo-500/20 text-xs text-indigo-300">
                Get your credentials at <a href="https://console.twilio.com" target="_blank" className="underline">console.twilio.com</a>
              </div>
              <Field label="Account SID">
                <input
                  type="text"
                  value={local.twilioAccountSid}
                  onChange={(e) => set('twilioAccountSid', e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="input-field w-full font-mono text-xs"
                />
              </Field>
              <Field label="Auth Token">
                <input
                  type="password"
                  value={local.twilioAuthToken}
                  onChange={(e) => set('twilioAuthToken', e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="input-field w-full font-mono text-xs"
                />
              </Field>
              <Field label="From Number">
                <input
                  type="tel"
                  value={local.twilioFromNumber}
                  onChange={(e) => set('twilioFromNumber', e.target.value)}
                  placeholder="+15550000000"
                  className="input-field w-full"
                />
              </Field>
              <Field label="Default Message">
                <textarea
                  value={local.smsMessage}
                  onChange={(e) => set('smsMessage', e.target.value)}
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </Field>
            </>
          )}

          {/* Email */}
          {section === 'email' && (
            <>
              <SectionHeader title="Email via Postmark" />
              <div className="p-3 rounded-lg bg-indigo-500/8 border border-indigo-500/20 text-xs text-indigo-300">
                Get your server token at <a href="https://account.postmarkapp.com" target="_blank" className="underline">account.postmarkapp.com</a>
              </div>
              <Field label="Server Token">
                <input
                  type="password"
                  value={local.postmarkServerToken}
                  onChange={(e) => set('postmarkServerToken', e.target.value)}
                  placeholder="••••••••-••••-••••-••••-••••••••••••"
                  className="input-field w-full font-mono text-xs"
                />
              </Field>
              <Field label="From Address">
                <input
                  type="email"
                  value={local.emailFrom}
                  onChange={(e) => set('emailFrom', e.target.value)}
                  placeholder="photos@yourstudio.com"
                  className="input-field w-full"
                />
              </Field>
              <Field label="Default Subject">
                <input
                  type="text"
                  value={local.emailSubject}
                  onChange={(e) => set('emailSubject', e.target.value)}
                  className="input-field w-full"
                />
              </Field>
              <Field label="Email Body (HTML)">
                <textarea
                  value={local.emailBody}
                  onChange={(e) => set('emailBody', e.target.value)}
                  rows={4}
                  className="input-field w-full resize-none font-mono text-xs"
                />
              </Field>
            </>
          )}

          {/* Breeze */}
          {section === 'breeze' && (
            <>
              <SectionHeader title="Breeze Cloud" />
              <Field label="">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={local.breezeEnabled}
                    onChange={(e) => set('breezeEnabled', e.target.checked)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="text-sm text-white/75">Enable Breeze Cloud integration</span>
                </label>
              </Field>
              {local.breezeEnabled && (
                <>
                  <Field label="API Key">
                    <input
                      type="password"
                      value={local.breezeApiKey}
                      onChange={(e) => set('breezeApiKey', e.target.value)}
                      placeholder="Same key as Receipt Software"
                      className="input-field w-full font-mono text-xs"
                    />
                  </Field>
                  <Field label="Gallery Slug">
                    <input
                      type="text"
                      value={local.breezeGalleryId}
                      onChange={(e) => set('breezeGalleryId', e.target.value)}
                      placeholder="e.g. receipt"
                      className="input-field w-full"
                    />
                  </Field>
                  <Field label="Microsite Base URL">
                    <input
                      type="text"
                      value={local.shareBaseUrl}
                      onChange={(e) => set('shareBaseUrl', e.target.value)}
                      placeholder="https://share.photoboothto.com/s"
                      className="input-field w-full"
                    />
                  </Field>
                  <Field label="">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={local.breezeAutoUpload}
                        onChange={(e) => set('breezeAutoUpload', e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm text-white/75">Auto-upload new photos to Breeze</span>
                    </label>
                  </Field>
                  <BreezeQueuePanel
                    onRetry={() => {
                      const n = retryFailedBreezeUploads()
                      addNotification({
                        type: 'info',
                        message: n
                          ? `Queued ${n} photo${n === 1 ? '' : 's'} that still need uploading.`
                          : 'All watch-folder photos are already uploaded.',
                      })
                    }}
                  />
                </>
              )}
            </>
          )}

          {/* Display */}
          {section === 'display' && (
            <>
              <SectionHeader title="Display Settings" />
              <Field label="Kiosk">
                <button
                  type="button"
                  onClick={() => setKioskMode(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                >
                  Enter Full Screen
                </button>
              </Field>
              <Field label="Accent Color">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={local.accentColor}
                    onChange={(e) => set('accentColor', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={local.accentColor}
                    onChange={(e) => set('accentColor', e.target.value)}
                    className="input-field w-32 font-mono text-xs"
                  />
                </div>
              </Field>
            </>
          )}

          {/* Save button */}
          <div className="pt-4 border-t border-white/5">
            <button
              onClick={save}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
            >
              <Save size={15} />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pb-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-white/50 uppercase tracking-wider">{label}</label>}
      {children}
    </div>
  )
}

function BreezeQueuePanel({ onRetry }: { onRetry: () => void }) {
  const { breezeQueue, photos } = useAppStore()
  const waiting = breezeQueue.filter((j) => j.status === 'queued' || j.status === 'uploading').length
  const failed = breezeQueue.filter((j) => j.status === 'failed').length
  const done = breezeQueue.filter((j) => j.status === 'done').length
  const missing = photos.filter((photo) => {
    if (isBreezeUploaded(photo.sessionId)) return false
    const job = breezeQueue.find((entry) => entry.sessionId === photo.sessionId)
    if (job && (job.status === 'queued' || job.status === 'uploading')) return false
    return true
  }).length
  const canRetry = failed > 0 || missing > 0

  let summary = 'No uploads yet.'
  if (breezeQueue.length || missing) {
    const parts: string[] = []
    if (waiting) parts.push(`${waiting} in progress`)
    if (done) parts.push(`${done} uploaded`)
    if (failed) parts.push(`${failed} need attention`)
    if (missing) parts.push(`${missing} in the watch folder still need uploading`)
    summary = parts.join(', ') + '.'
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Upload Queue</p>
          <p className="text-sm text-white/60 mt-1">{summary}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
          className="btn-secondary flex items-center gap-2 px-4 whitespace-nowrap disabled:opacity-40"
        >
          <RotateCcw size={13} />
          Upload missing
        </button>
      </div>

      <ul className="max-h-64 overflow-y-auto rounded-xl border border-white/8 bg-[#0d0d0d] divide-y divide-white/5">
        {!breezeQueue.length && (
          <li className="px-4 py-6 text-sm text-white/30 text-center">Completed uploads will appear here.</li>
        )}
        {breezeQueue.map((job) => (
          <li key={job.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{job.sessionId}</p>
                <p className="text-xs text-white/35 truncate mt-0.5">{job.name}</p>
              </div>
              <span
                className={clsx(
                  'shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                  job.status === 'done' && 'bg-emerald-500/15 text-emerald-300',
                  job.status === 'uploading' && 'bg-indigo-500/15 text-indigo-300',
                  job.status === 'queued' && 'bg-white/8 text-white/50',
                  job.status === 'failed' && 'bg-red-500/15 text-red-300',
                )}
              >
                {job.status === 'queued' ? 'Waiting' : job.status === 'uploading' ? 'Uploading' : job.status === 'done' ? 'Uploaded' : 'Failed'}
              </span>
            </div>
            {job.error && <p className="text-xs text-red-300/80 mt-1.5 break-words">{job.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

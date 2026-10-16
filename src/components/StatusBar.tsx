import { Wifi, WifiOff, FolderOpen, Image, Cloud } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { sharingOn } from '../lib/media'

export function StatusBar() {
  const { photos, config, breezeQueue, shareQueue } = useAppStore()
  const sharing = sharingOn(config)
  const breezeFailed = breezeQueue.filter((j) => j.status === 'failed').length
  const breezeWaiting = breezeQueue.filter((j) => j.status === 'queued' || j.status === 'uploading').length
  const smsFailed = shareQueue.filter((j) => j.kind === 'sms' && j.status === 'failed').length
  const smsWaiting = shareQueue.filter((j) => j.kind === 'sms' && j.status !== 'done' && j.status !== 'failed').length
  const emailFailed = shareQueue.filter((j) => j.kind === 'email' && j.status === 'failed').length
  const emailWaiting = shareQueue.filter((j) => j.kind === 'email' && j.status !== 'done' && j.status !== 'failed').length

  return (
    <div className="h-7 border-t border-white/5 bg-[#080808] flex items-center px-4 gap-4 shrink-0">
      {/* Watch folder */}
      <div className="flex items-center gap-1.5 text-white/30">
        <FolderOpen size={11} />
        <span className="text-[11px]">
          {config.watchFolder ? (
            <span className="text-white/45">{config.watchFolder}</span>
          ) : (
            'No folder'
          )}
        </span>
      </div>

      <div className="h-3 w-px bg-white/10" />

      {/* Photo count */}
      <div className="flex items-center gap-1.5 text-white/30">
        <Image size={11} />
        <span className="text-[11px]">{photos.length} photos</span>
      </div>

      <div className="h-3 w-px bg-white/10" />

      {/* Services status */}
      <div className="flex items-center gap-3">
        {sharing.sms && (
          <ServiceDot
            label={smsFailed ? `SMS ${smsFailed} failed` : smsWaiting ? `SMS ${smsWaiting}` : 'SMS'}
            active={!!config.twilioAccountSid && smsFailed === 0}
          />
        )}
        {sharing.email && (
          <ServiceDot
            label={emailFailed ? `Email ${emailFailed} failed` : emailWaiting ? `Email ${emailWaiting}` : 'Email'}
            active={!!config.postmarkServerToken && emailFailed === 0}
          />
        )}
        {config.breezeEnabled && (
          <ServiceDot
            label={breezeFailed ? `Breeze ${breezeFailed} failed` : breezeWaiting ? `Breeze ${breezeWaiting}` : 'Breeze'}
            active={!!config.breezeApiKey && !!config.breezeGalleryId && breezeFailed === 0}
          />
        )}
        {sharing.print && (
          <ServiceDot label="Print" active={!!config.defaultPrinter} />
        )}
      </div>

      <div className="flex-1" />

      <span className="text-[11px] text-white/20">PhotoboothTO Sharing Station</span>
    </div>
  )
}

function ServiceDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-white/15'}`} />
      <span className={`text-[11px] ${active ? 'text-white/45' : 'text-white/20'}`}>{label}</span>
    </div>
  )
}

import { useState } from 'react'
import { X, Mail, Check, Loader2, Phone } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { enqueueBreezeUpload, ensurePhotoUploaded } from '../store/breezeQueue'
import { isPrintable, isVideo } from '../lib/media'
import clsx from 'clsx'

type Mode = 'sms' | 'email' | 'print' | 'breeze'

export function ShareModal() {
  const { shareModalPhoto, shareModalTab, closeShareModal, config, addNotification, keyboardVisible } = useAppStore()
  const mode = shareModalTab as Mode
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [done, setDone] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [copies, setCopies] = useState(config.defaultCopies)

  if (!shareModalPhoto) return null

  const finish = () => {
    setDone(true)
    setTimeout(() => {
      setDone(false)
      closeShareModal()
    }, 1200)
  }

  const sendSms = async () => {
    if (!phone) return
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      addNotification({ type: 'error', message: 'Twilio credentials not configured in Settings.' })
      return
    }
    setLoading(true)
    setLoadingLabel('Uploading…')
    const uploaded = await ensurePhotoUploaded(shareModalPhoto)
    if (!uploaded.ok) {
      setLoading(false)
      setLoadingLabel('')
      addNotification({ type: 'error', message: uploaded.error })
      return
    }
    setLoadingLabel('Sending…')
    const result = await window.electronAPI.sendSms({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      fromNumber: config.twilioFromNumber,
      toNumber: phone,
      message: `${config.smsMessage}\n\n${shareModalPhoto.shareUrl}`,
    })
    setLoading(false)
    setLoadingLabel('')
    if (result.success) {
      addNotification({ type: 'success', message: `Text sent to ${phone}` })
      finish()
    } else {
      addNotification({ type: 'error', message: result.error ?? 'SMS failed' })
    }
  }

  const sendEmail = async () => {
    if (!email) return
    if (!config.postmarkServerToken) {
      addNotification({ type: 'error', message: 'Postmark not configured in Settings.' })
      return
    }
    setLoading(true)
    setLoadingLabel('Uploading…')
    const uploaded = await ensurePhotoUploaded(shareModalPhoto)
    if (!uploaded.ok) {
      setLoading(false)
      setLoadingLabel('')
      addNotification({ type: 'error', message: uploaded.error })
      return
    }
    setLoadingLabel('Sending…')
    const result = await window.electronAPI.sendEmail({
      serverToken: config.postmarkServerToken,
      from: config.emailFrom,
      to: email,
      subject: config.emailSubject,
      htmlBody: `${config.emailBody}<p><a href="${shareModalPhoto.shareUrl}">${shareModalPhoto.shareUrl}</a></p>`,
      attachmentPath: shareModalPhoto.path,
    })
    setLoading(false)
    setLoadingLabel('')
    if (result.success) {
      addNotification({ type: 'success', message: `Email sent to ${email}` })
      finish()
    } else {
      addNotification({ type: 'error', message: result.error ?? 'Email failed' })
    }
  }

  const sendPrint = async () => {
    if (!config.defaultPrinter) {
      addNotification({ type: 'error', message: 'No printer configured in Settings.' })
      return
    }
    setLoading(true)
    const result = await window.electronAPI.sendPrint({
      imagePath: shareModalPhoto.path,
      printer: config.defaultPrinter,
      copies,
      printSize: config.printSize || '4x6',
    })
    setLoading(false)
    if (result.success) {
      addNotification({ type: 'success', message: `Sent ${copies} print${copies > 1 ? 's' : ''} to printer` })
      finish()
    } else {
      addNotification({ type: 'error', message: result.error ?? 'Print failed' })
    }
  }

  const uploadBreeze = async () => {
    if (!config.breezeApiKey || !config.breezeGalleryId) {
      addNotification({ type: 'error', message: 'Set Breeze API key and gallery slug in Settings.' })
      return
    }
    const job = enqueueBreezeUpload(shareModalPhoto)
    if (job?.status === 'done') {
      addNotification({ type: 'info', message: 'Already uploaded to Breeze Cloud.' })
    } else {
      addNotification({ type: 'info', message: 'Added to Breeze upload queue.' })
    }
    finish()
  }

  const titles: Record<Mode, string> = {
    sms: 'Send Text',
    email: 'Send Email',
    print: 'Print',
    breeze: 'Upload to Breeze',
  }

  return (
    <div
      className={`absolute inset-0 z-50 flex justify-center fade-in ${keyboardVisible ? 'items-start pt-6' : 'items-center'}`}
      style={{ position: 'absolute' }}
    >
      <div className="absolute inset-0 bg-black/75" onClick={closeShareModal} />

      <div className="relative w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl overflow-hidden slide-up mx-4">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            {isVideo(shareModalPhoto) ? (
              <video
                src={shareModalPhoto.mediaUrl}
                muted
                playsInline
                className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
              />
            ) : (
              <img
                src={shareModalPhoto.url}
                alt=""
                className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
              />
            )}
            <p className="text-lg font-semibold text-white">{titles[mode]}</p>
          </div>
          <button
            onClick={closeShareModal}
            className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 pt-3">
          {mode === 'sms' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-indigo-500/60 transition-colors">
                <Phone size={16} className="text-white/30 shrink-0" />
                <input
                  type="tel"
                  placeholder="+1 555 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendSms()}
                  className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/25"
                  autoFocus
                  data-keyboard="phone"
                />
              </div>
              <ActionButton label={loading && loadingLabel ? loadingLabel : 'Send Text'} loading={loading} done={done} onClick={sendSms} disabled={!phone} />
            </div>
          )}

          {mode === 'email' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-indigo-500/60 transition-colors">
                <Mail size={16} className="text-white/30 shrink-0" />
                <input
                  type="email"
                  placeholder="guest@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendEmail()}
                  className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/25"
                  autoFocus
                  data-keyboard="email"
                />
              </div>
              <ActionButton label={loading && loadingLabel ? loadingLabel : 'Send Email'} loading={loading} done={done} onClick={sendEmail} disabled={!email} />
            </div>
          )}

          {mode === 'print' && isPrintable(shareModalPhoto) && (
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-6 py-2">
                <button
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  className="w-12 h-12 rounded-full bg-white/8 hover:bg-white/15 text-white text-2xl font-light flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <div className="text-center">
                  <span className="text-5xl font-bold text-white tabular-nums">{copies}</span>
                  <p className="text-xs text-white/35 mt-1">{copies === 1 ? 'copy' : 'copies'}</p>
                </div>
                <button
                  onClick={() => setCopies((c) => Math.min(10, c + 1))}
                  className="w-12 h-12 rounded-full bg-white/8 hover:bg-white/15 text-white text-2xl font-light flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>
              <ActionButton
                label={`Print ${copies} ${copies === 1 ? 'Copy' : 'Copies'}`}
                loading={loading}
                done={done}
                onClick={sendPrint}
                disabled={!config.defaultPrinter}
              />
            </div>
          )}

          {mode === 'breeze' && (
            <div className="space-y-4 py-2">
              <ActionButton label="Upload to Breeze Cloud" loading={loading} done={done} onClick={uploadBreeze} disabled={!config.breezeApiKey} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  label, loading, done, onClick, disabled,
}: {
  label: string; loading: boolean; done: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={clsx(
        'w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-base font-semibold transition-all',
        done ? 'bg-emerald-600 text-white'
          : disabled ? 'bg-white/5 text-white/20 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white',
      )}
    >
      {loading && <Loader2 size={17} className="animate-spin" />}
      {done && <Check size={17} />}
      {done ? 'Sent!' : label}
    </button>
  )
}

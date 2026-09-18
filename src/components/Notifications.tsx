import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import clsx from 'clsx'

export function Notifications() {
  const { notifications, removeNotification } = useAppStore()

  if (!notifications.length) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'slide-up pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border text-sm max-w-sm',
            n.type === 'success' && 'bg-[#0d1f15] border-emerald-500/20 text-emerald-300',
            n.type === 'error' && 'bg-[#1f0d0d] border-red-500/20 text-red-300',
            n.type === 'info' && 'bg-[#0d0f1f] border-indigo-500/20 text-indigo-300',
          )}
        >
          <div className="mt-0.5 shrink-0">
            {n.type === 'success' && <CheckCircle size={15} />}
            {n.type === 'error' && <XCircle size={15} />}
            {n.type === 'info' && <Info size={15} />}
          </div>
          <span className="flex-1">{n.message}</span>
          <button
            onClick={() => removeNotification(n.id)}
            className="mt-0.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

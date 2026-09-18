import { useEffect, useRef, useState } from 'react'
import { Delete, ChevronDown, ArrowUp, Space } from 'lucide-react'
import { useAppStore } from '../store/appStore'

type Layout = 'qwerty' | 'email' | 'phone'
type Target = HTMLInputElement | HTMLTextAreaElement

const QWERTY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-'],
]

const PHONE_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['+', '0', 'backspace'],
]

const EMAIL_DOMAINS = [
  '@gmail.com',
  '@yahoo.com',
  '@hotmail.com',
  '@outlook.com',
  '@icloud.com',
  '@aol.com',
]

function isTextField(el: EventTarget | null): el is Target {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false
  if (el instanceof HTMLInputElement) {
    const t = el.type
    if (['button', 'submit', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes(t)) return false
  }
  return !el.readOnly && !el.disabled
}

function detectLayout(el: Target): Layout {
  if (el.dataset.keyboard === 'phone' || el.dataset.keyboard === 'email' || el.dataset.keyboard === 'qwerty') {
    return el.dataset.keyboard as Layout
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === 'tel' || el.inputMode === 'tel' || el.inputMode === 'numeric') return 'phone'
    if (el.type === 'email') return 'email'
  }
  return 'qwerty'
}

function setNativeValue(el: Target, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function applyEmailDomain(el: Target, domain: string) {
  const value = el.value
  const at = value.indexOf('@')
  const local = (at >= 0 ? value.slice(0, at) : value).trim()
  const next = `${local}${domain}`
  setNativeValue(el, next)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(next.length, next.length)
  })
}

function insertText(el: Target, text: string) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  setNativeValue(el, next)
  const pos = start + text.length
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

function deleteText(el: Target) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  if (start !== end) {
    setNativeValue(el, el.value.slice(0, start) + el.value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start, start)
    })
    return
  }
  if (start > 0) {
    setNativeValue(el, el.value.slice(0, start - 1) + el.value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start - 1, start - 1)
    })
  }
}

export function OnScreenKeyboard() {
  const { keyboardVisible, setKeyboardVisible } = useAppStore()
  const [layout, setLayout] = useState<Layout>('qwerty')
  const [shift, setShift] = useState(false)
  const targetRef = useRef<Target | null>(null)
  const hideTimer = useRef<number>(0)

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      window.clearTimeout(hideTimer.current)
      if (!isTextField(e.target)) return
      targetRef.current = e.target
      setLayout(detectLayout(e.target))
      // Suppress the Windows tablet keyboard — we provide our own
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        e.target.setAttribute('inputmode', 'none')
      }
      setKeyboardVisible(true)
    }

    const onFocusOut = (e: FocusEvent) => {
      hideTimer.current = window.setTimeout(() => {
        const next = document.activeElement
        if (isTextField(next)) {
          targetRef.current = next
          setLayout(detectLayout(next))
          return
        }
        // Keep keyboard if focus moved onto the keyboard itself
        if ((e.relatedTarget as HTMLElement | null)?.closest?.('[data-osk]')) return
        targetRef.current = null
        setKeyboardVisible(false)
        setShift(false)
      }, 80)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.clearTimeout(hideTimer.current)
    }
  }, [setKeyboardVisible])

  const press = (key: string) => {
    const el = targetRef.current
    if (!el) return
    if (key === 'backspace') {
      deleteText(el)
      return
    }
    if (key === 'space') {
      insertText(el, ' ')
      return
    }
    if (key === 'shift') {
      setShift((s) => !s)
      return
    }
    if (key.startsWith('@') && key.includes('.')) {
      applyEmailDomain(el, key)
      return
    }
    insertText(el, shift ? key.toUpperCase() : key)
    if (shift) setShift(false)
  }

  const hide = () => {
    targetRef.current?.blur()
    setKeyboardVisible(false)
    setShift(false)
  }

  if (!keyboardVisible) return null

  return (
    <div
      data-osk
      className="absolute left-0 right-0 bottom-0 z-[70] bg-[#111] border-t border-white/10 px-3 pt-2 pb-3 select-none"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex justify-end mb-1.5">
        <button
          type="button"
          onClick={hide}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/8"
        >
          <ChevronDown size={14} />
          Hide
        </button>
      </div>

      {layout === 'email' && (
        <div className="max-w-4xl mx-auto mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {EMAIL_DOMAINS.map((domain) => (
            <button
              key={domain}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(domain)}
              className="shrink-0 h-11 px-3 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 text-sm font-medium active:scale-95 hover:bg-indigo-600/35 transition-colors"
            >
              {domain}
            </button>
          ))}
        </div>
      )}

      {layout === 'phone' ? (
        <PhonePad onPress={press} />
      ) : (
        <QwertyPad
          email={layout === 'email'}
          shift={shift}
          onPress={press}
        />
      )}
    </div>
  )
}

function Key({
  label,
  wide,
  accent,
  onPress,
}: {
  label: React.ReactNode
  wide?: number
  accent?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`h-12 rounded-lg text-base font-medium active:scale-95 transition-transform flex items-center justify-center
        ${accent ? 'bg-indigo-600 text-white' : 'bg-[#1c1c1c] text-white hover:bg-[#262626]'}
      `}
      style={{ flex: wide ?? 1 }}
    >
      {label}
    </button>
  )
}

function PhonePad({ onPress }: { onPress: (k: string) => void }) {
  return (
    <div className="max-w-sm mx-auto space-y-1.5">
      {PHONE_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1.5">
          {row.map((k) => (
            <Key
              key={k}
              label={k === 'backspace' ? <Delete size={20} /> : k}
              accent={k === 'backspace'}
              onPress={() => onPress(k)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function QwertyPad({
  email,
  shift,
  onPress,
}: {
  email: boolean
  shift: boolean
  onPress: (k: string) => void
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-1.5">
      {QWERTY_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1.5 justify-center">
          {i === 3 && (
            <Key
              label={<ArrowUp size={18} />}
              wide={1.3}
              accent={shift}
              onPress={() => onPress('shift')}
            />
          )}
          {row.map((k) => (
            <Key
              key={k}
              label={shift ? k.toUpperCase() : k}
              onPress={() => onPress(k)}
            />
          ))}
          {i === 3 && (
            <Key
              label={<Delete size={18} />}
              wide={1.3}
              accent
              onPress={() => onPress('backspace')}
            />
          )}
        </div>
      ))}
      <div className="flex gap-1.5">
        {email && <Key label=".com" wide={1.6} onPress={() => onPress('.com')} />}
        <Key label="@" wide={1.2} onPress={() => onPress('@')} />
        <Key
          label={<Space size={18} />}
          wide={email ? 4 : 6}
          onPress={() => onPress('space')}
        />
        {email && <Key label="_" wide={1.2} onPress={() => onPress('_')} />}
      </div>
    </div>
  )
}

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircle2 size={20} color="var(--success)" />,
  error: <XCircle size={20} color="var(--danger)" />,
  warning: <AlertTriangle size={20} color="var(--warning)" />,
  info: <Info size={20} color="var(--info)" />,
}

/**
 * const toast = useToast()
 * toast.success('Alarm saved')            toast.error(err)   // ApiError or string
 * toast.show({ type, title, message, duration })
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    ({ type = 'info', title, message, duration = 4000 }) => {
      const id = ++seq.current
      setItems((list) => [...list.slice(-3), { id, type, title, message }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const api = useMemo(() => {
    const text = (m) => (typeof m === 'string' ? m : m?.message || 'Something went wrong')
    return {
      show,
      dismiss,
      success: (message, title) => show({ type: 'success', message: text(message), title }),
      info: (message, title) => show({ type: 'info', message: text(message), title }),
      warning: (message, title) => show({ type: 'warning', message: text(message), title }),
      error: (err, title) => show({ type: 'error', message: text(err), title, duration: 6000 }),
    }
  }, [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            {ICONS[t.type]}
            <div className="grow">
              {t.title && <div className="toast-title">{t.title}</div>}
              <div className="toast-msg">{t.message}</div>
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

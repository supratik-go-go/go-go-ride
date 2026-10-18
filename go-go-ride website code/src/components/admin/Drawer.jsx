import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './admin-ui.css'

/**
 * Right-hand side panel for reviewing a record without leaving the table.
 * Full width on phones. Escape / backdrop click closes it.
 *
 *   <Drawer open={!!row} onClose={() => setRow(null)} title="WB 20 9876" subtitle="S24 Belur Link"
 *           footer={<Button>Approve</Button>} wide>
 *     ...
 *   </Drawer>
 */
export function Drawer({ open, onClose, title, subtitle, headerExtra, footer, wide, children, labelledBy }) {
  const panel = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    // Escape closes the drawer, unless a dialog opened from it is on top.
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.modal-backdrop') && closeRef.current?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <>
      <div className="adm-drawer-backdrop" onMouseDown={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        className={`adm-drawer ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : typeof title === 'string' ? title : undefined}
        aria-labelledby={labelledBy}
        style={{ outline: 'none' }}
      >
        <div className="adm-drawer-head">
          <div className="grow">
            {title && <h2 className="adm-drawer-title">{title}</h2>}
            {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
            {headerExtra}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={20} />
          </button>
        </div>
        <div className="adm-drawer-body">{children}</div>
        {footer && <div className="adm-drawer-foot">{footer}</div>}
      </aside>
    </>,
    document.body,
  )
}

export default Drawer

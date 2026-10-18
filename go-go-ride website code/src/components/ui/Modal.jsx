import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

/**
 * <Modal open onClose title="..." footer={<Button/>} size="sm|md|lg">body</Modal>
 * Renders as a centred dialog on desktop and a bottom sheet on phones.
 */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', dismissible = true }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && dismissible && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, dismissible])

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {(title || dismissible) && (
          <div className="modal-header">
            <div>
              {title && <h3 className="modal-title">{title}</h3>}
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            {dismissible && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Confirmation dialog. `onConfirm` may be async; the button shows a spinner
 * until it settles. Set `requireReason` to collect text (e.g. rejection reason).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  requireReason,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
}) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm?.(reason.trim())
      onClose?.()
    } catch {
      /* caller shows the error toast; keep dialog open */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={requireReason && !reason.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-2">{message}</p>}
      {requireReason && (
        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label">
            {reasonLabel}
            <span className="req">*</span>
          </label>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonPlaceholder} autoFocus />
        </div>
      )}
    </Modal>
  )
}

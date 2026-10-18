import { useState } from 'react'
import { Check, Hourglass, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Modal'
import { useToast } from '../../context/ToastContext'
import { adminService } from '../../services'
import { BUS_REQUESTS_CHANGED_EVENT } from './adminUtils'
import './admin-ui.css'

const SUCCESS = {
  APPROVED: (n) => `${n} approved - it is now live for passengers.`,
  REJECTED: (n) => `${n} rejected. The owner has been notified.`,
  UNDER_REVIEW: (n) => `${n} moved to Under Review.`,
}

/**
 * Approve / reject / "mark under review" controls for a bus request, with
 * confirmation dialogs (rejection requires a reason). Calls
 * adminService.setBusStatus and toasts the result.
 *
 *   <ApprovalActions bus={bus} onChanged={(updated, status) => list.reload()} />            // ✓ ✗ icons
 *   <ApprovalActions bus={bus} variant="buttons" onChanged={...} />                          // labelled buttons
 *
 * Which controls show: approve unless APPROVED, reject unless REJECTED,
 * "under review" only while PENDING (and `showReview`).
 */
export function ApprovalActions({ bus, onChanged, variant = 'icons', showReview = true, disabled }) {
  const toast = useToast()
  const [dialog, setDialog] = useState(null)
  if (!bus) return null

  const status = bus.status
  const canApprove = status !== 'APPROVED'
  const canReject = status !== 'REJECTED'
  const canReview = showReview && status === 'PENDING'
  const name = bus.busNumber
  const noDocs = !bus.documents?.length

  const run = async (next, reason) => {
    try {
      const updated = await adminService.setBusStatus(bus.id, next, reason || undefined)
      toast.success(SUCCESS[next](name))
      window.dispatchEvent(new Event(BUS_REQUESTS_CHANGED_EVENT))
      onChanged?.(updated, next)
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const open = (which) => (e) => {
    e?.stopPropagation()
    setDialog(which)
  }

  const controls =
    variant === 'buttons' ? (
      <>
        {canReview && (
          <Button variant="outline" icon={<Hourglass size={16} />} onClick={open('review')} disabled={disabled}>
            Mark under review
          </Button>
        )}
        {canReject && (
          <Button variant="outline-danger" icon={<X size={17} />} onClick={open('reject')} disabled={disabled}>
            Reject
          </Button>
        )}
        {canApprove && (
          <Button variant="success" icon={<Check size={17} />} onClick={open('approve')} disabled={disabled}>
            Approve
          </Button>
        )}
      </>
    ) : (
      <span className="adm-actions">
        {canApprove && (
          <button type="button" className="adm-act approve" onClick={open('approve')} aria-label={`Approve ${name}`} title="Approve" disabled={disabled}>
            <Check size={17} strokeWidth={2.5} />
          </button>
        )}
        {canReject && (
          <button type="button" className="adm-act reject" onClick={open('reject')} aria-label={`Reject ${name}`} title="Reject" disabled={disabled}>
            <X size={17} strokeWidth={2.5} />
          </button>
        )}
        {canReview && (
          <button type="button" className="adm-act review" onClick={open('review')} aria-label={`Mark ${name} under review`} title="Mark under review" disabled={disabled}>
            <Hourglass size={15} />
          </button>
        )}
      </span>
    )

  // The dialogs render through a portal, but React still bubbles their clicks
  // to ancestors - stop them so a clickable table row doesn't react.
  return (
    <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
      {controls}
      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        tone="primary"
        title="Approve this bus?"
        confirmLabel="Approve"
        message={
          <>
            <b>{name}</b>
            {bus.busName ? ` (${bus.busName})` : ''} will be listed for passengers right away and the owner will be notified.
            {noDocs && (
              <>
                <br />
                <span className="text-danger fw-500">No documents have been uploaded for this bus.</span>
              </>
            )}
          </>
        }
        onConfirm={() => run('APPROVED')}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Reject this bus?"
        confirmLabel="Reject"
        message={
          <>
            The owner of <b>{name}</b> will see this reason and can fix the request and resubmit.
          </>
        }
        requireReason
        reasonLabel="Reason for rejection"
        reasonPlaceholder="e.g. Route permit has expired - please upload a valid copy"
        onConfirm={(reason) => run('REJECTED', reason)}
      />
      <ConfirmDialog
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        tone="primary"
        title="Mark as under review?"
        confirmLabel="Mark under review"
        message={
          <>
            <b>{name}</b> moves to Under Review and the owner is told their request is being checked.
          </>
        }
        onConfirm={() => run('UNDER_REVIEW')}
      />
    </span>
  )
}

export default ApprovalActions

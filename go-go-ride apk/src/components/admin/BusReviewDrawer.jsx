import { Pencil } from 'lucide-react'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/Badge'
import { ApprovalActions } from './ApprovalActions'
import { BusRequestDetails } from './BusRequestDetails'
import { Drawer } from './Drawer'

/**
 * Side panel to review one bus request (from /admin/bus-requests or the
 * dashboard queue) and approve / reject / mark it under review.
 *
 *   <BusReviewDrawer bus={selected} onClose={() => setSelected(null)}
 *     onChanged={(updated) => { setSelected(null); list.reload() }} />
 */
export function BusReviewDrawer({ bus, onClose, onChanged, showEdit = true }) {
  return (
    <Drawer
      open={Boolean(bus)}
      onClose={onClose}
      title={bus?.busNumber}
      subtitle={bus?.busName}
      wide
      headerExtra={
        bus && (
          <div className="row" style={{ '--gap': '8px', marginTop: 8 }}>
            <StatusBadge value={bus.status} group="busStatus" withDot />
          </div>
        )
      }
      footer={
        bus && (
          <>
            {showEdit && (
              <Button variant="ghost" icon={<Pencil size={16} />} to={`/admin/buses/${bus.id}/edit`} style={{ marginRight: 'auto' }}>
                Edit
              </Button>
            )}
            <ApprovalActions bus={bus} variant="buttons" onChanged={onChanged} />
          </>
        )
      }
    >
      <BusRequestDetails bus={bus} />
    </Drawer>
  )
}

export default BusReviewDrawer

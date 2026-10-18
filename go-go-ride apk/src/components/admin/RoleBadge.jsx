import { Badge } from '../ui/Badge'
import { label } from '../../utils/format'
import { ROLE_TONE } from './adminUtils'

/** <RoleBadge role="BUS_OWNER" /> -> coloured "Bus Owner" pill. */
export function RoleBadge({ role }) {
  return (
    <Badge tone={ROLE_TONE[role] || 'neutral'} square>
      {label('role', role)}
    </Badge>
  )
}

export default RoleBadge

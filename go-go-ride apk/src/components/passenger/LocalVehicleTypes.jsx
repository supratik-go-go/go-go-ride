import { Link } from 'react-router-dom'
import { LOCAL_VEHICLE_TYPES } from './helpers'
import './passenger-ui.css'

/**
 * Category boxes (Home and the Local Vehicle page). Each opens Local Vehicle for
 * that type; tapping the one already open shows every type again.
 */
export function LocalVehicleTypes({ active = '', replace = false }) {
  return (
    <nav className="px-lv-types" aria-label="Local vehicle types">
      {LOCAL_VEHICLE_TYPES.map((t) => {
        const on = active === t.value
        return (
          <Link
            key={t.value}
            to={on ? '/local-cars' : `/local-cars?type=${t.value}`}
            replace={replace}
            className={`px-lv-type ${on ? 'active' : ''}`}
            aria-current={on ? 'true' : undefined}
          >
            <span className="px-lv-emoji" aria-hidden="true">
              {t.emoji}
            </span>
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

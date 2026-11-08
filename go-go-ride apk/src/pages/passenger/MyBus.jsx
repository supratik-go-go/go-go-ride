import { Link } from 'react-router-dom'
import { AlarmClock, BusFront, Eye, Heart, IndianRupee, Navigation, Search, Snowflake, Star } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, RouteBadge, Skeleton, useToast } from '../../components/ui'
import { updateFavoriteCache } from '../../components/passenger/FavoriteButton'
import { ratingText } from '../../components/passenger/helpers'
import { profileService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { busBadge, label } from '../../utils/format'
import './passenger.css'
import './extras.css'

function BusCard({ bus, onRemove }) {
  const badge = busBadge(bus)
  const name = bus.busName || bus.busNumber
  return (
    <article className="card px-x-bus" aria-label={name}>
      <div className="px-x-bus-head">
        <RouteBadge>{badge}</RouteBadge>
        <Link to={`/bus/${bus.id}`} className="px-x-bus-title">
          <strong className="truncate">{name}</strong>
          {bus.route?.name && <span className="px-x-bus-route">{bus.route.name}</span>}
        </Link>
        <button type="button" className="icon-btn px-x-heart" onClick={() => onRemove(bus)} aria-label={`Remove ${name} from My Bus`} title="Remove from My Bus">
          <Heart size={22} fill="currentColor" />
        </button>
      </div>

      <div className="px-x-chips">
        {bus.busNumber && bus.busNumber !== badge && (
          <span className="px-x-chip">
            <BusFront size={14} /> {bus.busNumber}
          </span>
        )}
        {bus.type && (
          <span className="px-x-chip">
            <Snowflake size={14} /> {label('busType', bus.type)}
          </span>
        )}
        {bus.fare != null && (
          <span className="px-x-chip" aria-label={`Fare ${bus.fare} rupees`}>
            <IndianRupee size={14} /> {Number(bus.fare).toLocaleString('en-IN')}
          </span>
        )}
        <span className="px-x-chip" aria-label={bus.ratingAvg > 0 ? `Rated ${Number(bus.ratingAvg).toFixed(1)}` : 'Not rated yet'}>
          <Star size={14} className="px-x-star" /> {ratingText(bus.ratingAvg, 0)}
        </span>
      </div>

      <nav className="px-x-bus-acts" aria-label={`${name} actions`}>
        <Link to={`/bus/${bus.id}`} className="px-x-bus-act">
          <Eye size={20} /> View
        </Link>
        <Link to={`/bus/${bus.id}/track`} className="px-x-bus-act">
          <Navigation size={20} /> Live Track
        </Link>
        <Link to={`/bus/${bus.id}/alarm`} className="px-x-bus-act">
          <AlarmClock size={20} /> Set Alarm
        </Link>
      </nav>
    </article>
  )
}

export default function MyBus() {
  const toast = useToast()
  const q = useAsync(() => profileService.favorites(), [])
  const buses = q.data?.buses || []

  const remove = async (bus) => {
    const index = buses.findIndex((b) => b.id === bus.id)
    q.setData((d) => ({ ...d, buses: (d?.buses || []).filter((b) => b.id !== bus.id) }))
    try {
      await profileService.removeFavorite('BUS', bus.id)
      updateFavoriteCache('BUS', bus.id, false)
      toast.success(`Removed ${bus.busName || bus.busNumber} from My Bus`)
    } catch (err) {
      // put it back where it was
      q.setData((d) => {
        const list = (d?.buses || []).slice()
        list.splice(Math.max(0, index), 0, bus)
        return { ...d, buses: list }
      })
      toast.error(err)
    }
  }

  const count = buses.length
  return (
    <div className="px-page px-narrow">
      <PageHeader title="My Bus" subtitle={count ? `${count} saved ${count === 1 ? 'bus' : 'buses'}` : 'Your favourite buses'} />

      {q.loading && !q.data ? (
        <div className="stack">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} height={168} radius={14} />
          ))}
        </div>
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !count ? (
        <EmptyState
          icon={<Heart size={26} />}
          title="No buses in My Bus yet"
          message="Tap the heart on any bus to add it here"
          action={
            <Button to="/home" icon={<Search size={17} />}>
              Search Buses
            </Button>
          }
        />
      ) : (
        <div className="stack" style={{ '--gap': '12px' }}>
          {buses.map((bus) => (
            <BusCard key={bus.id} bus={bus} onRemove={remove} />
          ))}
          <p className="px-x-note">
            <Heart size={16} aria-hidden="true" />
            <span>Tap the heart on a card to remove that bus from My Bus.</span>
          </p>
        </div>
      )}
    </div>
  )
}

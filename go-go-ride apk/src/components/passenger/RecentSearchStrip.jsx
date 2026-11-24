import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BusFront, ChevronRight, Hash, Search, Waypoints, X } from 'lucide-react'
import { useToast } from '../ui'
import { profileService } from '../../services'
import { searchHref } from '../../pages/account/accountUtils'
import { parseTimestamp, relativeDayLabel, timeAgo, toISODate } from '../../utils/format'
import { localSearches, removeLocalSearch } from '../../utils/localSearches'

const TYPE_META = {
  ROUTE: { icon: Waypoints, label: 'Route search' },
  BUS_NUMBER: { icon: Hash, label: 'Bus number' },
  BUS_NAME: { icon: BusFront, label: 'Bus name' },
}

function groupByDay(items) {
  const groups = []
  for (const s of items) {
    const rel = relativeDayLabel(toISODate(parseTimestamp(s.searchedAt)))
    const title = rel === 'Today' || rel === 'Yesterday' ? rel : 'Earlier'
    let g = groups.find((x) => x.title === title)
    if (!g) groups.push((g = { title, items: [] }))
    g.items.push(s)
  }
  return groups
}

/**
 * Home's "Recent Search" row: tap a card to run it again, X to forget it. Signed-in users see the
 * searches the server keeps; guests see the ones kept on this phone. Hidden when there are none.
 */
export function RecentSearchStrip({ signedIn, style }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    if (!signedIn) setItems(localSearches())
    else
      profileService
        .recentSearches(10)
        .then((list) => alive && setItems(list || []))
        .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [signedIn])

  if (!items?.length) return null

  const remove = async (s) => {
    const before = items
    setItems(items.filter((x) => x.id !== s.id))
    if (!signedIn) return removeLocalSearch(s.id)
    try {
      await profileService.removeRecentSearch(s.id)
    } catch (err) {
      setItems(before)
      toast.error(err)
    }
  }

  return (
    <section className="px-section" aria-labelledby="px-recent-title" style={style}>
      <div className="px-section-head">
        <h2 id="px-recent-title" className="px-section-title">
          Recent Search
        </h2>
        {signedIn && (
          <Link to="/recent-searches" className="link-btn">
            View All <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <div className="px-recent">
        {groupByDay(items).map((g) => (
          <div key={g.title} className="px-recent-group">
            <span className="px-recent-day">{g.title}</span>
            <div className="px-recent-cards">
              {g.items.map((s) => {
                const meta = TYPE_META[s.searchType] || TYPE_META.ROUTE
                const byStops = s.searchType === 'ROUTE' || (!s.query && (s.fromText || s.toText))
                return (
                  <div key={s.id} className="px-recent-card">
                    <button type="button" className="px-recent-main" onClick={() => navigate(searchHref(s))}>
                      <span className="icon-tile sm">
                        <meta.icon size={16} />
                      </span>
                      <span className="px-recent-text">
                        {byStops ? (
                          <>
                            <span className="truncate fw-600">
                              {s.fromText || 'Anywhere'} <ArrowRight size={13} className="px-recent-arrow" />
                            </span>
                            <span className="truncate fw-600">{s.toText || 'Anywhere'}</span>
                          </>
                        ) : (
                          <span className="truncate fw-600">{s.query}</span>
                        )}
                        <span className="text-xs text-muted truncate">
                          {meta.label} · {timeAgo(s.searchedAt)}
                        </span>
                      </span>
                      <Search size={15} className="text-muted" aria-hidden="true" />
                    </button>
                    <button type="button" className="px-recent-x" onClick={() => remove(s)} aria-label="Remove from recent searches" title="Remove">
                      <X size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

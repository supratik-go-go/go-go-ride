import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BusFront, Hash, History, Search, Trash2, Waypoints, X } from 'lucide-react'
import { Button, Card, ConfirmDialog, DataState, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services'
import { parseTimestamp, relativeDayLabel, timeAgo, toISODate } from '../../utils/format'
import { AccountPage } from './accountShared'
import { searchHref } from './accountUtils'

const TYPE_META = {
  ROUTE: { icon: Waypoints, label: 'Route search', tone: '' },
  BUS_NUMBER: { icon: Hash, label: 'Bus number', tone: 'accent' },
  BUS_NAME: { icon: BusFront, label: 'Bus name', tone: 'violet' },
}

function groupByDay(items) {
  const groups = []
  for (const s of items) {
    const day = toISODate(parseTimestamp(s.searchedAt))
    const rel = relativeDayLabel(day)
    const title = rel === 'Today' || rel === 'Yesterday' ? rel : 'Earlier'
    let g = groups.find((x) => x.title === title)
    if (!g) groups.push((g = { title, items: [] }))
    g.items.push(s)
  }
  return groups
}

export default function RecentSearches() {
  const navigate = useNavigate()
  const toast = useToast()
  const q = useAsync(() => profileService.recentSearches(20), [])
  const [confirmClear, setConfirmClear] = useState(false)

  const removeOne = async (s) => {
    const before = q.data
    q.setData((d) => d.filter((x) => x.id !== s.id))
    try {
      await profileService.removeRecentSearch(s.id)
    } catch (err) {
      q.setData(before)
      toast.error(err)
    }
  }

  const clearAll = async () => {
    try {
      await profileService.clearRecentSearches()
      q.setData([])
      toast.success('Search history cleared')
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  return (
    <AccountPage
      title="Recent Searches"
      actions={
        q.data?.length ? (
          <button type="button" className="link-btn" onClick={() => setConfirmClear(true)} style={{ color: 'var(--danger)' }}>
            Clear
          </button>
        ) : null
      }
    >
      <DataState
        state={q}
        empty={!q.data?.length}
        skeleton
        skeletonCount={5}
        skeletonHeight={64}
        emptyProps={{
          icon: <History size={26} />,
          title: 'No recent searches',
          message: 'Buses you search for while signed in show up here, so you can run them again with one tap.',
          action: (
            <Button to="/search" icon={<Search size={17} />}>
              Search buses
            </Button>
          ),
        }}
      >
        {(items) => (
          <>
            {groupByDay(items).map((g) => (
              <section key={g.title} className="stack" style={{ '--gap': '10px' }}>
                <h2 className="acc-section-title">{g.title}</h2>
                <Card pad={false}>
                  {g.items.map((s) => {
                    const meta = TYPE_META[s.searchType] || TYPE_META.ROUTE
                    const isRoute = s.searchType === 'ROUTE' || (!s.query && (s.fromText || s.toText))
                    return (
                      <div key={s.id} className="acc-recent-row">
                        <button type="button" className="acc-recent-main" onClick={() => navigate(searchHref(s))}>
                          <span className={`icon-tile sm ${meta.tone}`}>
                            <meta.icon size={17} />
                          </span>
                          <span className="grow" style={{ minWidth: 0 }}>
                            {isRoute ? (
                              <span className="acc-recent-route">
                                <span>{s.fromText || 'Anywhere'}</span>
                                <ArrowRight size={15} />
                                <span>{s.toText || 'Anywhere'}</span>
                              </span>
                            ) : (
                              <span className="fw-600 truncate" style={{ display: 'block' }}>
                                {s.query}
                              </span>
                            )}
                            <span className="text-xs text-muted">
                              {meta.label} · {timeAgo(s.searchedAt)}
                            </span>
                          </span>
                          <Search size={16} className="text-muted" aria-hidden="true" />
                        </button>
                        <button type="button" className="acc-x" onClick={() => removeOne(s)} aria-label="Remove from history" title="Remove">
                          <X size={17} />
                        </button>
                      </div>
                    )
                  })}
                </Card>
              </section>
            ))}
            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
              Showing your last {items.length} {items.length === 1 ? 'search' : 'searches'}.
            </p>
          </>
        )}
      </DataState>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearAll}
        title="Clear search history?"
        message="All your recent searches will be removed. This can't be undone."
        confirmLabel={
          <>
            <Trash2 size={16} /> Clear all
          </>
        }
      />
    </AccountPage>
  )
}

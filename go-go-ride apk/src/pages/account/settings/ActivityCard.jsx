import { useCallback, useEffect, useState } from 'react'
import { Globe, Monitor, ShieldCheck, Smartphone, Terminal } from 'lucide-react'
import { Badge, Card, ErrorState, Skeleton } from '../../../components/ui'
import { profileService } from '../../../services'
import { formatDateTime, parseTimestamp, timeAgo } from '../../../utils/format'
import { LoadMore } from '../accountShared'

const WEEK_MS = 7 * 86400000
const isThisWeek = (ts) => Date.now() - parseTimestamp(ts).getTime() < WEEK_MS

function describeDevice(ua) {
  if (!ua) return { name: 'Unknown device', icon: Globe }
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /CrOS/i.test(ua)
            ? 'ChromeOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /wv\)|; wv/.test(ua)
          ? 'GO-GO Ride app'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : null
  if (!os && !browser) return { name: ua.split(/[\s/]/)[0] || 'API client', icon: Terminal }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua)
  return { name: [browser, os].filter(Boolean).join(' on '), icon: mobile ? Smartphone : Monitor }
}

/** Recent sign-ins (successful and failed) to this account. */
export function ActivityCard() {
  const [state, setState] = useState({ items: [], meta: null, loading: true, loadingMore: false, error: null })

  const load = useCallback(async (page) => {
    setState((s) => ({ ...s, loading: page === 1, loadingMore: page > 1, error: null }))
    try {
      const { data, meta } = await profileService.loginActivity({ page, limit: 8 })
      setState((s) => ({ items: page === 1 ? data : [...s.items, ...data], meta, loading: false, loadingMore: false, error: null }))
    } catch (error) {
      setState((s) => ({ ...s, loading: false, loadingMore: false, error }))
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  const { items, meta } = state
  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile success">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2>Login activity</h2>
          <p>Recent sign-ins to your account. Don&apos;t recognise one? Change your password.</p>
        </div>
      </div>
      {state.loading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row">
              <Skeleton width={34} height={34} radius={10} />
              <div className="grow stack" style={{ '--gap': '6px' }}>
                <Skeleton width="45%" height={13} />
                <Skeleton width="65%" height={11} />
              </div>
            </div>
          ))}
        </div>
      ) : state.error && !items.length ? (
        <ErrorState error={state.error} onRetry={() => load(1)} compact />
      ) : !items.length ? (
        <p className="text-sm text-muted">No sign-ins recorded yet.</p>
      ) : (
        <>
          <div>
            {items.map((a, i) => {
              const d = describeDevice(a.device)
              const ok = a.status === 'SUCCESS'
              return (
                <div key={a.id} className="acc-activity">
                  <span className={`icon-tile sm ${ok ? '' : 'danger'}`}>
                    <d.icon size={17} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ '--gap': '6px' }}>
                      <strong className="text-sm truncate">{d.name}</strong>
                      {i === 0 && ok && (
                        <Badge tone="primary" square>
                          Latest
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted" title={formatDateTime(a.createdAt)}>
                      {isThisWeek(a.createdAt) ? `${timeAgo(a.createdAt)} · ` : ''}
                      {formatDateTime(a.createdAt)}
                      {a.ipAddress ? ` · IP ${a.ipAddress}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </span>
                  </div>
                  <Badge tone={ok ? 'success' : 'danger'} square>
                    {ok ? 'Signed in' : 'Failed'}
                  </Badge>
                </div>
              )
            })}
          </div>
          {state.error && <ErrorState error={state.error} onRetry={() => load((meta?.page || 1) + 1)} compact />}
          <LoadMore
            hasMore={meta && meta.page < meta.totalPages}
            loading={state.loadingMore}
            onClick={() => load(meta.page + 1)}
            shown={items.length}
            total={meta?.total}
            noun="sign-ins"
          />
        </>
      )}
    </Card>
  )
}

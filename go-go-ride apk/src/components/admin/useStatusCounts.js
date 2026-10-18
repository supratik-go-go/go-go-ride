import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Totals per filter value for tab badges / KPI cards, via one `limit: 1`
 * call per value (reads `meta.total`). '' means "no filter" (all).
 *
 *   const counts = useStatusCounts(busService.list, 'status', ['', 'PENDING', 'APPROVED'])
 *   counts.data   // { '': 8, PENDING: 1, APPROVED: 6 }  (null until loaded; a failed value is null)
 *   counts.reload()
 *
 * `extra` adds fixed params to every call (e.g. { role: 'DRIVER' }).
 */
export function useStatusCounts(fetcher, param, values, extra) {
  const [state, setState] = useState({ data: null, loading: true })
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })
  const key = JSON.stringify([param, values, extra || {}])
  const callId = useRef(0)

  const load = useCallback(async () => {
    const id = ++callId.current
    const [p, vals, ex] = JSON.parse(key)
    setState((s) => ({ ...s, loading: true }))
    const results = await Promise.all(
      vals.map((v) =>
        fetcherRef
          .current({ ...ex, ...(v ? { [p]: v } : {}), limit: 1 })
          .then((r) => r?.meta?.total ?? 0)
          .catch(() => null),
      ),
    )
    if (id !== callId.current) return
    setState({ data: Object.fromEntries(vals.map((v, i) => [v, results[i]])), loading: false })
  }, [key])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}

export default useStatusCounts

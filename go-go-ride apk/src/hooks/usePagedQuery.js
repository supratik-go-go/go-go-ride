import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from './useDebounce'

/**
 * Paginated list state for any `service.list(params) -> { data, meta }` call.
 *
 *   const list = usePagedQuery(busService.list, { limit: 10, initialFilters: { status: '' } })
 *   list.rows, list.meta, list.loading, list.error
 *   list.search / list.setSearch       (debounced 300 ms, resets to page 1)
 *   list.filters / list.setFilter(k,v) (resets to page 1)
 *   list.page / list.setPage
 *   list.reload()
 */
export function usePagedQuery(fetcher, { limit = 10, initialFilters = {}, initialSearch = '', extraParams } = {}) {
  const [page, setPage] = useState(1)
  const [search, setSearchRaw] = useState(initialSearch)
  const [filters, setFilters] = useState(initialFilters)
  const [state, setState] = useState({ rows: [], meta: null, loading: true, error: null })
  const debouncedSearch = useDebounce(search, 300)
  const callId = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const extraKey = JSON.stringify(extraParams || {})

  const load = useCallback(async () => {
    const id = ++callId.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const params = { page, limit, ...(debouncedSearch ? { search: debouncedSearch } : {}), ...JSON.parse(extraKey) }
      for (const [k, v] of Object.entries(filters)) if (v !== '' && v != null) params[k] = v
      const { data, meta } = await fetcherRef.current(params)
      if (id === callId.current) setState({ rows: data || [], meta, loading: false, error: null })
    } catch (error) {
      if (id === callId.current) setState((s) => ({ ...s, loading: false, error }))
    }
  }, [page, limit, debouncedSearch, filters, extraKey])

  useEffect(() => {
    load()
  }, [load])

  const setSearch = useCallback((v) => {
    setSearchRaw(v)
    setPage(1)
  }, [])

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }, [])

  /** Optimistically patch one row in place (after an update call). */
  const patchRow = useCallback((id, patch) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)) }))
  }, [])

  const removeRow = useCallback((id) => {
    setState((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id), meta: s.meta ? { ...s.meta, total: s.meta.total - 1 } : s.meta }))
  }, [])

  return { ...state, page, setPage, search, setSearch, filters, setFilter, setFilters, reload: load, patchRow, removeRow }
}

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async loader and track { data, error, loading }.
 *
 *   const { data, loading, error, reload, setData } = useAsync(() => busService.get(id), [id])
 *
 * Stale responses (deps changed mid-flight) are dropped. Pass `{ immediate: false }`
 * to load only when `reload()` is called.
 */
export function useAsync(loader, deps = [], { immediate = true, initialData = null } = {}) {
  const [state, setState] = useState({ data: initialData, error: null, loading: immediate })
  const callId = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++callId.current
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await loaderRef.current()
      if (id === callId.current) setState({ data, error: null, loading: false })
      return data
    } catch (error) {
      if (error?.name === 'AbortError') return undefined
      if (id === callId.current) setState((s) => ({ ...s, error, loading: false }))
      return undefined
    }
  }, [])

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload: run, setData }
}

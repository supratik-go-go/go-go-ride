import { useEffect, useRef, useState } from 'react'

export function useInterval(callback, delay) {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    if (delay == null) return undefined
    const id = setInterval(() => saved.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}

/** Re-renders every `ms` and returns the current Date - for clocks and ETAs. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date())
  useInterval(() => setNow(new Date()), ms)
  return now
}

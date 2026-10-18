import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { notificationService } from '../services/messagingService'

const EVENT = 'gogo:notifications-changed'

/** Tell every bell to re-fetch (call after marking notifications read). */
export const notifyUnreadChanged = () => window.dispatchEvent(new Event(EVENT))

/** Unread notification count for the bell; polls every minute while signed in. */
export function useUnreadCount() {
  const { isAuthenticated } = useAuth()
  const [count, setCount] = useState(0)

  const load = useCallback(() => {
    if (!isAuthenticated) return
    notificationService
      .unreadCount()
      .then((d) => setCount(d?.count ?? 0))
      .catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setCount(0)
      return undefined
    }
    load()
    const id = setInterval(load, 60000)
    window.addEventListener(EVENT, load)
    return () => {
      clearInterval(id)
      window.removeEventListener(EVENT, load)
    }
  }, [isAuthenticated, load])

  return count
}

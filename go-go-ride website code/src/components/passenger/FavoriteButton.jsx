import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { profileService } from '../../services'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useRequireLogin } from './helpers'
import './passenger-ui.css'

// One favourites fetch shared by every heart on screen, per signed-in user.
let cache = { userId: null, promise: null }

function loadFavorites(userId) {
  if (cache.userId !== userId || !cache.promise) {
    const promise = profileService.favorites().then((d) => d?.raw ?? [])
    cache = { userId, promise }
    promise.catch(() => {
      if (cache.promise === promise) cache.promise = null
    })
  }
  return cache.promise
}

function patchCache(userId, itemType, itemId, on) {
  if (cache.userId !== userId || !cache.promise) return
  cache.promise = cache.promise
    .then((raw) => (on ? [...raw.filter((r) => !(r.itemType === itemType && r.itemId === itemId)), { itemType, itemId }] : raw.filter((r) => !(r.itemType === itemType && r.itemId === itemId))))
    .catch(() => [])
}

const NOUN = { BUS: 'bus', ROUTE: 'route', STOP: 'stop', LOCAL_CAR: 'driver' }

/**
 * Heart toggle backed by /users/me/favorites. itemType: BUS | ROUTE | STOP | LOCAL_CAR.
 * Signed-out users are sent to /login?next=<here>.
 */
export function FavoriteButton({ itemType, itemId, size = 22, className = '' }) {
  const { user, isAuthenticated } = useAuth()
  const toast = useToast()
  const requireLogin = useRequireLogin()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !itemId) {
      setOn(false)
      return undefined
    }
    let alive = true
    loadFavorites(user.id)
      .then((raw) => alive && setOn(raw.some((r) => r.itemType === itemType && r.itemId === itemId)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isAuthenticated, user?.id, itemType, itemId])

  const toggle = async () => {
    if (!requireLogin()) return
    const next = !on
    setOn(next)
    setBusy(true)
    try {
      if (next) await profileService.addFavorite(itemType, itemId)
      else await profileService.removeFavorite(itemType, itemId)
      patchCache(user.id, itemType, itemId, next)
      toast.success(next ? `Saved this ${NOUN[itemType] || 'item'} to your favourites` : 'Removed from favourites')
    } catch (err) {
      setOn(!next)
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const label = on ? 'Remove from favourites' : 'Add to favourites'
  return (
    <button
      type="button"
      className={`icon-btn px-fav ${on ? 'is-on' : ''} ${className}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={label}
      title={label}
    >
      <Heart size={size} fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}

export default FavoriteButton

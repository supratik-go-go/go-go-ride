import { startTransition, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { googleIdToken, hasDeviceSettings } from '../../native/device'
import { authService } from '../../services'
import './google-button.css'

// The server's Google client ID, asked once per app start (null while Google sign-in is off).
let clientIdOnce = null

// Google's "G", as its sign-in button guidelines ask for (not an icon from the app's icon set).
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

/**
 * "Continue with Google" (no mobile number needed; it can be added later in Settings). Shown in the
 * Android app once the server has Google sign-in set up (GOOGLE_CLIENT_ID); hidden otherwise.
 */
export function GoogleButton({ next = '/home', className = '', withDivider = false }) {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Development builds show it too, to check the screen in a browser.
    if (!hasDeviceSettings() && !import.meta.env.DEV) return undefined
    let alive = true
    clientIdOnce ??= authService.googleClientId().catch(() => {
      clientIdOnce = null
      return null
    })
    clientIdOnce.then((id) => alive && setClientId(id))
    return () => {
      alive = false
    }
  }, [])

  if (!clientId) return null

  const signIn = async () => {
    setBusy(true)
    try {
      const idToken = await googleIdToken(clientId)
      const data = await authService.googleSignIn(idToken)
      toast.success(data.isNewUser ? `Welcome to GO-GO Ride, ${data.user.name.split(' ')[0]}!` : 'Signed in with Google')
      // Set the user and navigate in one render so the GuestOnly guard does not redirect first.
      startTransition(() => {
        setUser(data.user)
        navigate(next, { replace: true })
      })
    } catch (err) {
      setBusy(false)
      if (err.code !== 'CANCELLED') toast.error(err)
    }
  }

  return (
    <>
      {withDivider && <div className="auth-divider">or</div>}
      <button type="button" className={`google-btn ${className}`} onClick={signIn} disabled={busy}>
        {busy ? <Spinner size={20} /> : <GoogleLogo />}
        <span>Continue with Google</span>
      </button>
    </>
  )
}

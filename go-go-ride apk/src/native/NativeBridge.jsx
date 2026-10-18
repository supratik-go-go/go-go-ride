import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { useAuth } from '../context/AuthContext'
import { alarmService } from '../services/alarmService'
import { alarmNotifications } from './alarmNotifications'
import { isNativeApp } from './platform'

// Screens where the hardware back button should leave the app rather than
// walk back through history (they are "home" screens of the bottom tabs).
const ROOT_SCREENS = new Set(['/', '/home', '/admin'])

/**
 * Glue between Android and the React app. Renders nothing.
 * - hardware back button: navigate back, exit on root screens
 * - status bar colour, hide the splash screen once React has painted
 * - signed-in users skip the welcome screen
 * - keep phone alarm reminders in sync with the account; tapping one opens My Alarms
 */
export function NativeBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const { ready, isAuthenticated } = useAuth()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const synced = useRef(false)

  useEffect(() => {
    if (!isNativeApp()) return undefined
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    StatusBar.setBackgroundColor({ color: '#0b2a7a' }).catch(() => {})
    const back = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (ROOT_SCREENS.has(pathRef.current) || !canGoBack) CapApp.exitApp()
      else window.history.back()
    })
    const offTap = alarmNotifications.onTap((to) => navigate(to))
    return () => {
      back.then((h) => h.remove()).catch(() => {})
      offTap()
    }
  }, [navigate])

  useEffect(() => {
    if (!isNativeApp() || !ready) return
    SplashScreen.hide().catch(() => {})
    // The app opens on the welcome screen; returning users go straight in.
    if (isAuthenticated && pathRef.current === '/') navigate('/home', { replace: true })
  }, [ready, isAuthenticated, navigate])

  useEffect(() => {
    if (!isNativeApp() || !ready) return
    if (!isAuthenticated) {
      synced.current = false
      alarmNotifications.clearAll().catch(() => {})
      return
    }
    if (synced.current) return
    synced.current = true
    // list({ status: 'ACTIVE' }) reconciles the phone's reminders as a side effect.
    alarmService.list({ status: 'ACTIVE', limit: 100 }).catch(() => {})
  }, [ready, isAuthenticated])

  return null
}

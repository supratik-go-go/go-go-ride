import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SESSION_EXPIRED_EVENT } from '../api/client'
import { authService } from '../services/authService'
import { isAdminRole } from '../utils/format'

const AuthContext = createContext(null)

/**
 * const { user, ready, isAuthenticated, isAdmin, login, loginWithOtp, register, logout, refreshUser, setUser } = useAuth()
 *
 * On start-up, if tokens exist, GET /auth/me restores the user (the API client
 * refreshes an expired access token transparently). `ready` is false until
 * that check finishes - route guards wait for it.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    if (!authService.hasSession()) {
      setReady(true)
      return undefined
    }
    authService
      .me()
      .then((me) => alive && setUser(me))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (phone, password) => {
    const data = await authService.login(phone, password)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (body) => {
    const data = await authService.register(body)
    setUser(data.user)
    return data.user
  }, [])

  /** Returns { user, isNewUser }. */
  const loginWithOtp = useCallback(async (body) => {
    const data = await authService.verifyOtp(body)
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await authService.me()
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      isAdmin: isAdminRole(user?.role),
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      isOwner: user?.role === 'BUS_OWNER' || isAdminRole(user?.role),
      isDriver: user?.role === 'DRIVER',
      login,
      register,
      loginWithOtp,
      logout,
      refreshUser,
      setUser,
    }),
    [user, ready, login, register, loginWithOtp, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

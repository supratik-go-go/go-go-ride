import { StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { initTheme, keepLight } from './utils/theme'
import './styles/global.css'
import './components/ui/ui.css'
import './components/navigation/navigation.css'
import './layouts/layouts.css'
import './styles/dark.css'

// The admin panel has no dark design, so it stays light whatever the theme.
const isAdminPath = (path) => path.startsWith('/admin')

initTheme({ light: isAdminPath(window.location.pathname) })

/** Keeps the admin panel light as the route changes, before paint so it never flashes dark. */
function AdminStaysLight() {
  const { pathname } = useLocation()
  useLayoutEffect(() => keepLight(isAdminPath(pathname)), [pathname])
  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AdminStaysLight />
      {/* Last resort for a crash outside a screen (menus, providers); each screen has its own. */}
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)

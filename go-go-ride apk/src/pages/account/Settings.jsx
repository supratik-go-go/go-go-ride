import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PhoneAlarmsCard, ServerCard, serverSettingsNeeded } from '../../native/AppSettings'
import { isNativeApp } from '../../native/platform'
import { AccountPage } from './accountShared'
import { AboutCard } from './settings/AboutCard'
import { ActivityCard } from './settings/ActivityCard'
import { DeleteAccountCard } from './settings/DeleteAccountCard'
import { LanguageCard } from './settings/LanguageCard'
import { NotificationsCard } from './settings/NotificationsCard'
import { PasswordCard } from './settings/PasswordCard'
import { ThemeCard } from './settings/ThemeCard'
import { UpdatesCard } from './settings/UpdatesCard'
import './settings/settings.css'

const APP_VERSION = __APP_VERSION__

/** One row per screen, in menu order. `path` is the part after /settings/. */
function settingsItems({ isAdmin }) {
  const native = isNativeApp()
  return [
    { path: 'theme', emoji: '🎨', title: 'Theme', hint: 'Light, dark or auto', screen: <ThemeCard /> },
    { path: 'language', emoji: '💬', title: 'Language', hint: 'English', screen: <LanguageCard /> },
    { path: 'password', emoji: '🔑', title: 'Change Password', hint: 'Update your sign-in password', screen: <PasswordCard /> },
    {
      path: 'notifications',
      emoji: '🔔',
      title: 'Notifications',
      hint: native ? 'Bus reminders on this phone' : 'Pop-up alerts in this browser',
      screen: native ? <PhoneAlarmsCard /> : <NotificationsCard />,
    },
    { path: 'activity', emoji: '🛡️', title: 'Sign-in History', hint: 'Recent sign-ins to your account', screen: <ActivityCard /> },
    { path: 'updates', emoji: '📱', title: 'Check for Updates', hint: `You have version ${APP_VERSION}`, screen: <UpdatesCard /> },
    { path: 'about', emoji: 'ℹ️', title: 'About & Legal', hint: 'Contact, help, terms and privacy', screen: <AboutCard /> },
    // Ordinary users of the live app never need to change the server address.
    (isAdmin || serverSettingsNeeded()) && { path: 'server', emoji: '🖥️', title: 'Server', hint: 'The address this app talks to', screen: <ServerCard /> },
    !isAdmin && { path: 'delete', emoji: '🗑️', title: 'Delete Account', hint: 'Remove your account and data', screen: <DeleteAccountCard />, danger: true },
  ].filter(Boolean)
}

function SettingsMenu({ items }) {
  return (
    <AccountPage title="Settings">
      <nav className="card acc-menu" aria-label="Settings">
        {items.map((item) => (
          <Link key={item.path} to={`/settings/${item.path}`} className={`acc-menu-row${item.danger ? ' acc-set-danger' : ''}`}>
            <span className="acc-set-emoji" aria-hidden="true">
              {item.emoji}
            </span>
            <span className="acc-menu-label">
              {item.title}
              <small>{item.hint}</small>
            </span>
            <ChevronRight size={20} className="acc-menu-chevron" />
          </Link>
        ))}
      </nav>
      <p className="acc-version">
        GO-GO Ride v{APP_VERSION} · Made for West Bengal
      </p>
    </AccountPage>
  )
}

/** /settings is a menu; each row opens its own screen at /settings/<path>. */
export default function Settings() {
  const { isAdmin } = useAuth()
  const items = settingsItems({ isAdmin })

  return (
    <Routes>
      <Route index element={<SettingsMenu items={items} />} />
      {items.map((item) => (
        <Route key={item.path} path={item.path} element={<AccountPage title={item.title}>{item.screen}</AccountPage>} />
      ))}
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  )
}

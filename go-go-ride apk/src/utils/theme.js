/**
 * Light / dark / auto colour theme, remembered on this device only.
 * index.html sets <html data-theme> before the first paint; this module keeps it
 * current. All dark colours live in styles/dark.css.
 */

const KEY = 'gogo.theme'
const CHOICES = ['light', 'dark', 'auto']
// Existing users keep the look they know until they pick another theme.
const DEFAULT_CHOICE = 'light'
// Browser bar / phone status bar per theme. Light keeps the navy brand bar; dark matches --bg in dark.css.
export const BAR_COLORS = { light: '#0b2a7a', dark: '#0b101c' }

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
const listeners = new Set()
let choice = readChoice()
let lightOnly = false
let shown = null

function readChoice() {
  try {
    const saved = window.localStorage.getItem(KEY)
    return CHOICES.includes(saved) ? saved : DEFAULT_CHOICE
  } catch {
    return DEFAULT_CHOICE
  }
}

/** What the user picked: 'light' | 'dark' | 'auto'. */
export const themeChoice = () => choice

/** What 'auto' means right now on this phone. */
export const systemTheme = () => (darkQuery?.matches ? 'dark' : 'light')

/** The theme on screen: 'light' | 'dark'. */
export const appliedTheme = () => shown || 'light'

function apply() {
  const theme = lightOnly ? 'light' : choice === 'auto' ? systemTheme() : choice
  if (theme === shown) return
  shown = theme
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[theme])
  listeners.forEach((fn) => fn(theme))
}

export function setThemeChoice(next) {
  if (!CHOICES.includes(next)) return
  choice = next
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    /* storage blocked: the theme still changes for this visit */
  }
  apply()
}

/** The admin panel is only designed in light, so it stays light whatever the choice. */
export function keepLight(on) {
  lightOnly = on
  apply()
}

/** Calls fn('light' | 'dark') whenever the theme on screen changes. Returns an unsubscribe. */
export function onThemeChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Run once at start-up, before the first render. */
export function initTheme({ light = false } = {}) {
  lightOnly = light
  apply()
  darkQuery?.addEventListener?.('change', () => {
    if (choice === 'auto') apply()
  })
}

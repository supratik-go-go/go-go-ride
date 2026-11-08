import { useState } from 'react'
import { Check, Moon, Sun, SunMoon } from 'lucide-react'
import { isNativeApp } from '../../../native/platform'
import { setThemeChoice, themeChoice } from '../../../utils/theme'

const OPTIONS = [
  { value: 'light', icon: Sun, title: 'Light', hint: 'Always use the light look' },
  { value: 'dark', icon: Moon, title: 'Dark', hint: 'Easier on the eyes at night' },
  { value: 'auto', icon: SunMoon, title: 'Auto', hint: isNativeApp() ? "Follow your phone's dark mode setting" : "Follow your device's dark mode setting" },
]

/** Light / Dark / Auto. Applies at once and is remembered on this device. */
export function ThemeCard() {
  const [choice, setChoice] = useState(themeChoice)

  const pick = (value) => {
    setThemeChoice(value)
    setChoice(value)
  }

  return (
    <>
      <div className="card acc-menu" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => {
          const on = choice === o.value
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} className="acc-menu-row acc-choice" onClick={() => pick(o.value)}>
              <span className="icon-tile sm">
                <o.icon size={18} />
              </span>
              <span className="acc-menu-label">
                {o.title}
                <small>{o.hint}</small>
              </span>
              <span className="acc-choice-mark">{on && <Check size={15} strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      <p className="acc-set-note">Your choice is saved on this device only.</p>
    </>
  )
}

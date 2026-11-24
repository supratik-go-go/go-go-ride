import { registerPlugin } from '@capacitor/core'
import { platform } from './platform'

// Android helpers from android/.../GoGoDevicePlugin.java. In a browser they do nothing, so callers
// fall back to plain web behaviour.
const GoGoDevice = registerPlugin('GoGoDevice')

export const hasDeviceSettings = () => platform() === 'android'

/** Is the phone's Location (GPS) switched on? Unknown counts as on. */
export async function locationSwitchedOn() {
  if (!hasDeviceSettings()) return true
  try {
    return (await GoGoDevice.locationEnabled()).enabled !== false
  } catch {
    return true
  }
}

/** Opens the phone's Location switch. Resolves false when that isn't possible here. */
export async function openLocationSettings() {
  if (!hasDeviceSettings()) return false
  try {
    await GoGoDevice.openLocationSettings()
    return true
  } catch {
    return false
  }
}

/**
 * Voice search: listens once in 'en-IN', 'hi-IN' or 'bn-IN' and resolves the phone's guesses at what
 * was said, most likely first ([] when nothing was heard). Android uses its own voice typing
 * (Google); a browser uses its speech recognition where it has one (Chrome).
 */
export async function listenOnce(language, prompt) {
  if (hasDeviceSettings()) {
    const result = await GoGoDevice.listen({ language, prompt })
    return result.matches || []
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) throw new Error('Voice search needs the GO-GO Ride app (or Chrome on a computer).')
  return new Promise((resolve, reject) => {
    const rec = new Recognition()
    rec.lang = language
    rec.maxAlternatives = 5
    rec.interimResults = false
    rec.onresult = (e) => resolve([...e.results[0]].map((a) => a.transcript))
    rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Allow the microphone to use voice search.' : "Couldn't hear you. Please try again."))
    rec.onend = () => resolve([])
    rec.start()
  })
}

/** Opens GO-GO Ride's own page in the phone's settings (Permissions > Location). */
export async function openAppSettings() {
  if (!hasDeviceSettings()) return false
  try {
    await GoGoDevice.openAppSettings()
    return true
  } catch {
    return false
  }
}

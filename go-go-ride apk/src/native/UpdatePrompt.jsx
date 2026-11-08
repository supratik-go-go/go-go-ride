import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { assetUrl } from '../api/client'
import { Button, Modal } from '../components/ui'
import { platformService } from '../services'
import { platform } from './platform'

/**
 * Compares the newest version on the server with the one installed (Android only).
 * Resolves { latest: { version, versionCode, notes, url }, installed: { version, build }, newer };
 * throws when the server can't be reached.
 */
export async function checkForUpdate() {
  const [latest, installed] = await Promise.all([platformService.appVersion(), CapApp.getInfo()])
  return { latest, installed, newer: latest?.versionCode > Number(installed.build) }
}

/**
 * Popup shown when a newer version is on the server. It checks when the app opens
 * and whenever it comes back to the screen. Android only: the App Store and
 * Google Play deliver their own updates, and they don't allow outside downloads.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState(null)
  const dismissed = useRef(0)

  useEffect(() => {
    if (platform() !== 'android') return undefined
    const check = async () => {
      try {
        const { latest, newer } = await checkForUpdate()
        if (newer && latest.versionCode !== dismissed.current) setUpdate(latest)
      } catch {
        /* offline or server busy: the next check will catch it */
      }
    }
    check()
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check()
    })
    return () => {
      listener.then((h) => h.remove()).catch(() => {})
    }
  }, [])

  const later = () => {
    dismissed.current = update.versionCode
    setUpdate(null)
  }

  return (
    <Modal
      open={Boolean(update)}
      onClose={later}
      title="Update available"
      subtitle={`Version ${update?.version} is ready`}
      footer={
        <>
          <Button variant="outline" onClick={later}>
            Later
          </Button>
          <Button href={assetUrl(update?.url)} target="_blank" rel="noopener noreferrer" onClick={later}>
            Update now
          </Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '10px' }}>
        {update?.notes && <p className="text-sm text-2">{update.notes}</p>}
        <p className="text-sm text-2">After the download finishes, open the file and tap Install. Your account and alarms stay as they are.</p>
      </div>
    </Modal>
  )
}

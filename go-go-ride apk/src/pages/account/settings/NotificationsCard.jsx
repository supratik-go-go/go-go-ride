import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Info } from 'lucide-react'
import { Badge, Button, Card, useToast } from '../../../components/ui'

function readPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

/** Browser pop-up alerts (web only; the phone app uses PhoneAlarmsCard). */
export function NotificationsCard() {
  const toast = useToast()
  const [perm, setPerm] = useState(readPermission)
  const [asking, setAsking] = useState(false)

  // Pick up changes made in the browser's site settings while the page is open.
  useEffect(() => {
    const sync = () => setPerm(readPermission())
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  const showTest = () => {
    try {
      // eslint-disable-next-line no-new
      new window.Notification('GO-GO Ride', { body: "Alerts are on. We'll remind you before your bus arrives.", icon: '/app-icon-192.png' })
    } catch {
      toast.info('Alerts are allowed. Your next alarm reminder will appear here.')
    }
  }

  const enable = async () => {
    setAsking(true)
    try {
      const result = await window.Notification.requestPermission()
      setPerm(result)
      if (result === 'granted') {
        toast.success('Browser alerts turned on')
        showTest()
      } else if (result === 'denied') toast.warning('Alerts are blocked. You can allow them from your browser settings.')
    } catch (err) {
      toast.error(err)
    } finally {
      setAsking(false)
    }
  }

  const status = {
    granted: { tone: 'success', text: 'Allowed', icon: BellRing },
    denied: { tone: 'danger', text: 'Blocked', icon: BellOff },
    default: { tone: 'warning', text: 'Not enabled', icon: Bell },
    unsupported: { tone: 'neutral', text: 'Not supported', icon: BellOff },
  }[perm] || { tone: 'neutral', text: perm, icon: Bell }

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile accent">
          <status.icon size={20} />
        </span>
        <div className="grow">
          <h2>Notifications</h2>
          <p>Pop-up alerts for alarm reminders and booking updates.</p>
        </div>
        <Badge tone={status.tone} square>
          {status.text}
        </Badge>
      </div>
      <div className="stack" style={{ '--gap': '12px' }}>
        {perm === 'default' && (
          <div className="row-between wrap">
            <span className="text-sm text-2">Allow alerts on this device so you don&apos;t miss your bus.</span>
            <Button size="sm" icon={<BellRing size={16} />} onClick={enable} loading={asking}>
              Enable
            </Button>
          </div>
        )}
        {perm === 'granted' && (
          <div className="row-between wrap">
            <span className="text-sm text-2">Alerts are on for this browser.</span>
            <Button size="sm" variant="outline" onClick={showTest}>
              Send a test alert
            </Button>
          </div>
        )}
        {perm === 'denied' && (
          <p className="text-sm text-2">
            Alerts are blocked for this site. Open your browser&apos;s site settings (the lock icon next to the address) and allow notifications, then come back here.
          </p>
        )}
        {perm === 'unsupported' && <p className="text-sm text-2">This browser can&apos;t show pop-up alerts. Reminders still appear inside the app.</p>}
        <div className="soft-panel acc-muted-note">
          <Info size={17} />
          <span>
            Every alarm reminder and booking update is also saved in your <Link to="/notifications">in-app notifications</Link>, so you can check them any time.
          </span>
        </div>
      </div>
    </Card>
  )
}

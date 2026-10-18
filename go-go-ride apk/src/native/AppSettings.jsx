import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, BellRing, CheckCircle2, ChevronRight, Info, Server, XCircle } from 'lucide-react'
import { server } from '../api/client'
import { Badge, Button, Card, Input, PageHeader, useToast } from '../components/ui'
import { alarmNotifications } from './alarmNotifications'
import { isNativeApp } from './platform'

/** Card to view / change / test the API server address (works signed out). */
export function ServerCard() {
  const toast = useToast()
  const [value, setValue] = useState(server.base)
  const [state, setState] = useState({ checking: false, ok: null })

  const check = async (base) => {
    setState({ checking: true, ok: null })
    const ok = await server.test(base)
    setState({ checking: false, ok })
    return ok
  }

  useEffect(() => {
    check(server.base)
  }, [])

  const save = async (e) => {
    e.preventDefault()
    const next = server.normalise(value)
    if (!next) return
    setValue(next)
    const ok = await check(next)
    if (!ok) {
      toast.error(`No GO-GO Ride server answered at ${next}. Check the address and that the server is running.`)
      return
    }
    server.set(next)
    toast.success('Server saved. Reloading the app…')
    setTimeout(() => window.location.replace('/'), 700)
  }

  const reset = () => {
    server.set('')
    setValue(server.base)
    toast.info('Back to the built-in server address. Reloading…')
    setTimeout(() => window.location.replace('/'), 700)
  }

  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <span className="icon-tile">
          <Server size={20} />
        </span>
        <div className="grow">
          <h2 style={{ fontSize: 'var(--fs-md)' }}>Server</h2>
          <p className="text-sm text-muted">The GO-GO Ride API this app talks to.</p>
        </div>
        {state.ok === true && (
          <Badge tone="success" square icon={<CheckCircle2 size={13} />}>
            Connected
          </Badge>
        )}
        {state.ok === false && (
          <Badge tone="danger" square icon={<XCircle size={13} />}>
            Unreachable
          </Badge>
        )}
      </div>
      <form className="stack" onSubmit={save}>
        <Input
          label="API address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://192.168.1.9:8000/api"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          hint={`Built-in: ${server.buildDefault}${server.isOverridden ? ' · currently overridden' : ''}`}
        />
        <div className="row wrap">
          <Button type="submit" loading={state.checking}>
            Test &amp; save
          </Button>
          <Button variant="outline" onClick={() => check(server.normalise(value))} disabled={state.checking}>
            Test only
          </Button>
          {server.isOverridden && (
            <Button variant="ghost" onClick={reset}>
              Reset to built-in
            </Button>
          )}
        </div>
        <div className="alert alert-info">
          <Info size={17} />
          <span>
            Testing on your Wi-Fi? Use your computer&apos;s address, e.g. <b>http://192.168.1.9:8000/api</b>, and start the server
            with <b>start-gogo-ride.bat phone</b>. After you put the API online, use its https address.
          </span>
        </div>
      </form>
    </Card>
  )
}

/** Phone notification + exact-alarm permissions (Android app only). */
export function PhoneAlarmsCard() {
  const [perm, setPerm] = useState('prompt')
  const [exact, setExact] = useState('unsupported')

  const refresh = async () => {
    setPerm(await alarmNotifications.permission())
    setExact(await alarmNotifications.exactAlarmSetting())
  }

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [])

  if (!isNativeApp()) return null
  const ok = perm === 'granted'

  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <span className="icon-tile accent">
          <BellRing size={20} />
        </span>
        <div className="grow">
          <h2 style={{ fontSize: 'var(--fs-md)' }}>Phone alarms</h2>
          <p className="text-sm text-muted">Bus reminders ring on this phone even when the app is closed.</p>
        </div>
        <Badge tone={ok ? 'success' : perm === 'denied' ? 'danger' : 'warning'} square>
          {ok ? 'On' : perm === 'denied' ? 'Blocked' : 'Off'}
        </Badge>
      </div>
      <div className="stack">
        {!ok && perm !== 'denied' && (
          <Button icon={<BellRing size={17} />} onClick={async () => { await alarmNotifications.requestPermission(); refresh() }}>
            Allow notifications
          </Button>
        )}
        {perm === 'denied' && (
          <p className="text-sm text-2">
            Notifications are blocked. Open Android Settings → Apps → GO-GO Ride → Notifications and turn them on.
          </p>
        )}
        {ok && exact === 'denied' && (
          <div className="alert alert-warning">
            <AlarmClock size={17} />
            <div className="stack" style={{ '--gap': '8px' }}>
              <span>
                Android may delay reminders by a few minutes. Allow <b>Alarms &amp; reminders</b> so they ring exactly on time.
              </span>
              <Button size="sm" variant="outline" onClick={() => alarmNotifications.openExactAlarmSetting()}>
                Open setting
              </Button>
            </div>
          </div>
        )}
        {ok && exact !== 'denied' && <p className="text-sm text-2">Reminders are scheduled on this phone when you save an alarm.</p>}
      </div>
    </Card>
  )
}

/** Link row used on the login screen and in Settings. */
export function ServerLink() {
  return (
    <Link to="/server" className="row text-sm" style={{ '--gap': '6px', justifyContent: 'center', color: 'var(--muted)' }}>
      <Server size={15} /> Server settings <ChevronRight size={15} />
    </Link>
  )
}

/** /server - reachable without signing in, so a wrong address can always be fixed. */
export default function ServerSettingsPage() {
  return (
    <div className="app-narrow page stack">
      <PageHeader title="Server settings" />
      <ServerCard />
    </div>
  )
}

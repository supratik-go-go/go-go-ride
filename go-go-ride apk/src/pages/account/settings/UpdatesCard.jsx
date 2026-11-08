import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, Globe, RefreshCw, Smartphone } from 'lucide-react'
import { assetUrl } from '../../../api/client'
import { Button, Card, ErrorState, Spinner } from '../../../components/ui'
import { platform } from '../../../native/platform'
import { checkForUpdate } from '../../../native/UpdatePrompt'

const APP_VERSION = __APP_VERSION__

/**
 * Installed version and, on Android, a check against the server (same check as the update popup).
 * iPhones update from the App Store, and the web version is always the newest.
 */
export function UpdatesCard() {
  const os = platform()
  const android = os === 'android'
  const [state, setState] = useState({ checking: android, result: null, error: null })

  const load = useCallback(async () => {
    try {
      setState({ checking: false, result: await checkForUpdate(), error: null })
    } catch (error) {
      setState({ checking: false, result: null, error })
    }
  }, [])

  useEffect(() => {
    if (android) load()
  }, [android, load])

  const check = () => {
    setState((s) => ({ ...s, checking: true, error: null }))
    load()
  }

  const { checking, result, error } = state
  const installed = result?.installed.version || APP_VERSION
  const latest = result?.latest

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile">{os === 'web' ? <Globe size={20} /> : <Smartphone size={20} />}</span>
        <div className="grow">
          <h2>GO-GO Ride v{installed}</h2>
          <p>{android ? 'Installed on this phone' : os === 'ios' ? 'Installed on this iPhone' : 'Web version'}</p>
        </div>
      </div>

      {!android ? (
        <p className="text-sm text-2">
          {os === 'ios'
            ? 'Updates for iPhone come from the App Store. Open the App Store and check Updates to get the newest version.'
            : 'This is the web version of GO-GO Ride. It loads the newest version every time, so there is nothing to install.'}
        </p>
      ) : checking ? (
        <div className="row text-sm text-2" role="status">
          <Spinner size={18} /> Checking for updates…
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={check} title="Couldn't check for updates" compact />
      ) : result?.newer ? (
        <div className="stack" style={{ '--gap': '12px' }}>
          <div className="alert alert-info">
            <Download size={18} />
            <div className="stack" style={{ '--gap': '4px' }}>
              <strong>Version {latest.version} is ready</strong>
              {latest.notes && <span>{latest.notes}</span>}
            </div>
          </div>
          <p className="text-sm text-2">After the download finishes, open the file and tap Install. Your account and alarms stay as they are.</p>
          <Button href={assetUrl(latest.url)} target="_blank" rel="noopener noreferrer" icon={<Download size={18} />} block>
            Update
          </Button>
        </div>
      ) : (
        <div className="stack" style={{ '--gap': '12px' }}>
          <div className="alert alert-success">
            <CheckCircle2 size={18} />
            <span>You have the latest version (v{installed})</span>
          </div>
          <Button variant="outline" icon={<RefreshCw size={16} />} onClick={check} style={{ alignSelf: 'flex-start' }}>
            Check again
          </Button>
        </div>
      )}
    </Card>
  )
}

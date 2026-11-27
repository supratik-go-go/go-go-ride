import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, MessageSquareText, RotateCcw } from 'lucide-react'
import { Button, Spinner } from '../../components/ui'
import { authService } from '../../services'
import { formatPhone } from '../../utils/format'
import './phone-check.css'

const ASK_EVERY_MS = 3000

/**
 * Proves a mobile number for free: the person texts the code shown here from that number to the
 * GO-GO Ride phone, and the server notices it arriving (POST /auth/phone-check/*). It costs them one
 * normal SMS. Calls onVerified({ checkId, checkToken }) once the SMS is in, onUnavailable() when the
 * server has number checks switched off, and onError(err) when it refuses the number (404 / 409).
 */
export function PhoneCheck({ purpose, phone, onVerified, onUnavailable, onError }) {
  const [check, setCheck] = useState(null)
  const [state, setState] = useState('starting') // starting | waiting | verified | expired | failed
  const [problem, setProblem] = useState('')
  const [round, setRound] = useState(0)
  // The callbacks change on every render of the parent; the effects only need the latest ones.
  const calls = useRef({ onVerified, onUnavailable, onError })
  calls.current = { onVerified, onUnavailable, onError }
  // React runs this effect twice in development (StrictMode); one code per round is enough.
  const pending = useRef(null) // { key, promise }

  useEffect(() => {
    let alive = true
    setCheck(null)
    setState('starting')
    const key = `${purpose}|${phone}|${round}`
    if (pending.current?.key !== key) pending.current = { key, promise: authService.startPhoneCheck(purpose, phone) }
    pending.current.promise.then(
      (c) => {
        if (!alive) return
        setCheck(c)
        setState('waiting')
      },
      (err) => {
        if (!alive) return
        if (err.code === 'SMS_NOT_READY' && calls.current.onUnavailable) calls.current.onUnavailable()
        else if ((err.status === 404 || err.status === 409) && calls.current.onError) calls.current.onError(err)
        else {
          setProblem(err.message)
          setState('failed')
        }
      },
    )
    return () => {
      alive = false
    }
  }, [purpose, phone, round])

  // Ask every few seconds, and at once when the person comes back from the SMS app.
  useEffect(() => {
    if (!check || state !== 'waiting') return undefined
    let alive = true
    const ask = async () => {
      try {
        const { status } = await authService.phoneCheckStatus(check)
        if (!alive) return
        if (status === 'VERIFIED') {
          setState('verified')
          calls.current.onVerified({ checkId: check.checkId, checkToken: check.checkToken })
        } else if (status !== 'WAITING') setState('expired')
      } catch {
        /* no network for a moment: ask again next time */
      }
    }
    const timer = setInterval(ask, ASK_EVERY_MS)
    const onReturn = () => document.visibilityState === 'visible' && ask()
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [check, state])

  const again = () => setRound((r) => r + 1)

  if (state === 'starting') {
    return (
      <div className="auth-check-status" role="status">
        <Spinner size={18} /> Getting your code...
      </div>
    )
  }
  if (state === 'failed') {
    return (
      <div className="auth-check">
        <div className="alert alert-danger" role="alert">
          <AlertCircle size={18} />
          <span>{problem}</span>
        </div>
        <Button variant="outline" block icon={<RotateCcw size={18} />} onClick={again}>
          Try again
        </Button>
      </div>
    )
  }

  // The Android app hands sms: links to the phone's SMS app with the message filled in.
  const openSms = () => {
    window.location.href = `sms:${check.sendTo}?body=${encodeURIComponent(check.message)}`
  }

  return (
    <div className="auth-check">
      <p className="auth-check-lead">
        To prove <strong>{formatPhone(phone)}</strong> is yours, send this SMS from it. It costs one normal SMS.
      </p>
      <div className="auth-check-sms">
        <span>To</span>
        <strong>{formatPhone(check.sendTo)}</strong>
        <span>Message</span>
        <strong className="auth-check-code">{check.message}</strong>
      </div>
      {state === 'expired' ? (
        <>
          <div className="alert alert-info" role="status">
            <AlertCircle size={18} />
            <span>Time ran out before your SMS arrived. Get a new code and send it again.</span>
          </div>
          <Button size="lg" block icon={<RotateCcw size={18} />} onClick={again}>
            Get a new code
          </Button>
        </>
      ) : (
        <>
          <Button size="lg" block icon={<MessageSquareText size={18} />} onClick={openSms} disabled={state === 'verified'}>
            Send the SMS
          </Button>
          <p className="auth-check-hint">Phone with two SIMs? Send it from the SIM with {formatPhone(phone)}. Don&apos;t change the message.</p>
          <div className={`auth-check-status ${state === 'verified' ? 'is-done' : ''}`} role="status">
            {state === 'verified' ? (
              <>
                <CheckCircle2 size={18} /> Number verified
              </>
            ) : (
              <>
                <Spinner size={18} /> Waiting for your SMS. This screen moves on by itself.
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

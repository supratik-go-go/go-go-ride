// Email through the owner's mailbox (SMTP, settings in config.mail). Free, and used only for
// forgot-password codes.
import nodemailer from 'nodemailer'
import { config } from '../config.js'
import { ApiError } from '../errors.js'

export const mailReady = () => Boolean(config.mail.host && config.mail.user && config.mail.password)

let transport = null
const mailer = () =>
  (transport ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  }))

// 'off' | 'ok' | 'error: ...', shown on /api/health so the owner can see the mailbox works.
let status = 'off'
export const mailStatus = () => (mailReady() ? status : 'off')

/** At start: logs in to the mailbox once, so a wrong setting shows on /api/health. */
export async function checkMailbox() {
  if (!mailReady()) return
  try {
    await mailer().verify()
    status = 'ok'
  } catch (err) {
    // The reason is the server's answer or a network error code, never the password.
    status = `error: ${err.code || 'login failed'}`.slice(0, 200)
    console.error('[mail] could not log in to the mailbox:', err.code || err.message)
  }
}

/** Throws a user-readable ApiError when the email can't be sent. */
export async function sendMail({ to, subject, text }) {
  try {
    await mailer().sendMail({ from: config.mail.from || `GO-GO Ride <${config.mail.user}>`, to, subject, text })
    status = 'ok'
  } catch (err) {
    console.error('[mail] could not send:', err.code || err.message)
    throw new ApiError(502, "Couldn't send the email right now. Please try again in a minute.", 'MAIL_FAILED')
  }
}

// GO-GO Ride API - entry point (Hostinger Node.js app "entry file").
import express from 'express'
import { app } from './src/app.js'
import { config } from './src/config.js'
import { connect, ensureSchema } from './src/db.js'
import { startScheduler } from './src/scheduler.js'
import { checkMailbox, mailStatus } from './src/services/mail.js'
import { linkSmsPhone, smsStatus } from './src/services/sms.js'

// Last resort for errors outside a request (Express handles those inside one): log them so they
// show in the Hostinger logs. A rejected promise is logged and the API keeps serving; a thrown
// exception leaves the process in an unknown state, so it exits and Hostinger starts it again.
process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err))
process.on('uncaughtException', (err) => {
  console.error('[uncaught exception]', err)
  process.exit(1)
})

// Hostinger starts the app on the first visit and gives up when the port does not open quickly, so
// the server listens at once and connects to MySQL right after. Until the database answers, every
// call gets 503 "starting", and /api/health says what the database is doing (no secrets), so a
// wrong setting shows up there instead of as a site that never starts. It never starts empty.
// `sms` says whether the phone that receives number-check SMS is linked (off | connecting | ok | error);
// `mail` whether the mailbox for forgot-password codes works (off | ok | error).
let database = 'starting'
const server = express()
server.get(`${config.apiPrefix}/health`, (req, res) => {
  const ok = database === 'ok'
  res.status(ok ? 200 : 503).json({ success: ok, status: ok ? 'ok' : 'starting', database, sms: smsStatus(), mail: mailStatus(), uptime: process.uptime(), timestamp: new Date().toISOString() })
})
server.use((req, res, next) =>
  database === 'ok' ? next() : res.status(503).json({ success: false, message: 'The server is starting. Try again in a moment.', code: 'STARTING' }),
)
server.use(app)
server.listen(config.port, () => {
  console.log(`GO-GO Ride API listening on port ${config.port}${config.apiPrefix} (${config.environment})`)
  console.log(`  uploads:  ${config.uploadDir}`)
})

async function startDatabase() {
  try {
    if (!config.mysql.user || !config.mysql.database) throw new Error('MYSQL_USER or MYSQL_DATABASE is not set (hPanel > Environment variables)')
    const host = await connect()
    await ensureSchema()
    database = 'ok'
    startScheduler()
    linkSmsPhone()
    checkMailbox()
    console.log(`  database: MySQL ${config.mysql.database} on ${host}:${config.mysql.port}`)
  } catch (err) {
    database = `error: ${err.tried || err.code || err.message}`.slice(0, 200)
    console.error('[db] could not reach the database; trying again in a minute:', err)
    setTimeout(startDatabase, 60_000)
  }
}
startDatabase()

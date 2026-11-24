// GO-GO Ride API - entry point (Hostinger Node.js app "entry file").
import { app } from './src/app.js'
import { config } from './src/config.js'
import { connect, ensureSchema } from './src/db.js'
import { startScheduler } from './src/scheduler.js'

// Last resort for errors outside a request (Express handles those inside one): log them so they
// show in the Hostinger logs. A rejected promise is logged and the API keeps serving; a thrown
// exception leaves the process in an unknown state, so it exits and Hostinger starts it again.
process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err))
process.on('uncaughtException', (err) => {
  console.error('[uncaught exception]', err)
  process.exit(1)
})

// Without its database settings the API cannot work, so it stops with a clear message instead of
// starting empty (the old SQLite setup silently created a new, empty database).
if (!config.mysql.user || !config.mysql.database) {
  console.error('[db] MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE must be set (hPanel > Environment variables).')
  process.exit(1)
}
const dbHost = await connect()
await ensureSchema()
startScheduler()

app.listen(config.port, () => {
  console.log(`GO-GO Ride API ready on port ${config.port}${config.apiPrefix} (${config.environment})`)
  console.log(`  database: MySQL ${config.mysql.database} on ${dbHost}:${config.mysql.port}`)
  console.log(`  uploads:  ${config.uploadDir}`)
})

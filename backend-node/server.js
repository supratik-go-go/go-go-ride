// GO-GO Ride API - entry point (Hostinger Node.js app "entry file").
import { app } from './src/app.js'
import { config } from './src/config.js'
import { startScheduler } from './src/scheduler.js'

// Last resort for errors outside a request (Express handles those inside one): log them so they
// show in the Hostinger logs. A rejected promise is logged and the API keeps serving; a thrown
// exception leaves the process in an unknown state, so it exits and Hostinger starts it again.
process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err))
process.on('uncaughtException', (err) => {
  console.error('[uncaught exception]', err)
  process.exit(1)
})

startScheduler()

app.listen(config.port, () => {
  console.log(`GO-GO Ride API ready on port ${config.port}${config.apiPrefix} (${config.environment})`)
  console.log(`  database: ${config.databasePath}`)
  console.log(`  uploads:  ${config.uploadDir}`)
})

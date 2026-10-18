// GO-GO Ride API - entry point (Hostinger Node.js app "entry file").
import { app } from './src/app.js'
import { config } from './src/config.js'
import { startScheduler } from './src/scheduler.js'

startScheduler()

app.listen(config.port, () => {
  console.log(`GO-GO Ride API ready on port ${config.port}${config.apiPrefix} (${config.environment})`)
  console.log(`  database: ${config.databasePath}`)
  console.log(`  uploads:  ${config.uploadDir}`)
})

// Express application: middleware, routes, uploads, errors.
// The API serves the Android app only (no website is hosted here).
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { errorHandler, notFoundHandler } from './errors.js'

import platform from './routes/platform.js'
import auth from './routes/auth.js'
import profile from './routes/profile.js'
import buses from './routes/buses.js'
import network from './routes/network.js'
import alarms from './routes/alarms.js'
import cars from './routes/cars.js'
import bookings from './routes/bookings.js'
import messaging from './routes/messaging.js'
import admin from './routes/admin.js'

export const app = express()

// Behind Hostinger's proxy: use X-Forwarded-For for the client IP.
app.set('trust proxy', 1)
app.disable('x-powered-by')

const localhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = native app / server-to-server / same-origin.
      if (!origin || config.corsOrigins.includes(origin) || localhost.test(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
  }),
)

app.use(express.json({ limit: '1mb' }))

// Rate limits (enforced in production): sign-in endpoints 20 per 15 min per IP,
// everything else 300 per minute.
const limited = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !config.isProd,
    handler: (req, res) =>
      res.status(429).json({ success: false, message: 'Too many requests, please slow down', code: 'TOO_MANY_REQUESTS' }),
  })
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/otp'], limited(15 * 60 * 1000, 20))
app.use('/api', limited(60 * 1000, 300))

// Uploaded documents / photos.
app.use('/uploads', express.static(config.uploadDir, { fallthrough: false, maxAge: '7d' }))

// The APK offered by the download page, always sent as a file download.
app.use(
  '/download',
  express.static(config.downloadDir, {
    fallthrough: false,
    setHeaders(res, file) {
      res.setHeader('Cache-Control', 'no-cache')
      if (file.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive')
        res.setHeader('Content-Disposition', 'attachment; filename="GO-GO-Ride.apk"')
      }
    },
  }),
)

// go-goride.com itself: a one-page "Download the app" site (no other website is hosted).
app.use(express.static(config.publicDir, { index: 'index.html', maxAge: '1h' }))

app.get(config.apiPrefix, (req, res) =>
  res.json({ name: 'GO-GO Ride API', tagline: 'Smart local transport for West Bengal', version: '1.0.0' }),
)

for (const router of [platform, auth, profile, buses, network, alarms, cars, bookings, messaging, admin]) {
  app.use(config.apiPrefix, router)
}

app.use(config.apiPrefix, notFoundHandler)
app.use(notFoundHandler)
app.use(errorHandler)

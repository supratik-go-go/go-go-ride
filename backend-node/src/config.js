// Runtime configuration from environment variables (and an optional .env file).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Node's built-in .env loader; real environment variables win.
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

const env = (key, fallback) => {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}
const num = (key, fallback) => Number(env(key, fallback))
const bool = (key, fallback) => String(env(key, fallback)).toLowerCase() === 'true'
// "~/x" = the account's home folder (on Hostinger: outside the app folder that
// every deployment overwrites); relative paths are relative to this project.
const resolve = (p) => {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p)
}

const environment = env('ENVIRONMENT', 'development')
const isProd = environment === 'production'

export const config = {
  environment,
  isProd: environment === 'production',
  port: num('PORT', 8000),
  apiPrefix: '/api',
  corsOrigins: env('CORS_ORIGINS', 'https://localhost,capacitor://localhost,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Production defaults live in the home folder so redeploys never wipe them.
  databasePath: resolve(env('DATABASE_PATH', isProd ? '~/gogoride-data/gogoride.db' : './data/gogoride.db')),
  starterDatabase: resolve(env('STARTER_DATABASE', './seed/gogoride.db')),

  uploadDir: resolve(env('UPLOAD_DIR', isProd ? '~/gogoride-data/uploads' : './data/uploads')),
  starterUploads: resolve(env('STARTER_UPLOADS', './seed/uploads')),

  // The app download page (public/index.html) and the APK it offers.
  publicDir: resolve('./public'),
  downloadDir: resolve(env('DOWNLOAD_DIR', './public/downloads')),
  maxUploadBytes: num('MAX_UPLOAD_MB', 5) * 1024 * 1024,

  jwtAccessSecret: env('JWT_ACCESS_SECRET', 'change-me-access-secret'),
  jwtRefreshSecret: env('JWT_REFRESH_SECRET', 'change-me-refresh-secret'),
  accessTokenMinutes: num('ACCESS_TOKEN_MINUTES', 15),
  refreshTokenDays: num('REFRESH_TOKEN_DAYS', 30),

  otpExpiryMinutes: num('OTP_EXPIRY_MINUTES', 5),
  otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  // Never leak the OTP in production, whatever the flag says.
  echoOtp: bool('OTP_DEV_ECHO', 'true') && environment !== 'production',

  busExceptionMinDays: num('BUS_EXCEPTION_MIN_DAYS', 5),
  cronKey: env('CRON_KEY', ''),

  // Clock used for "today", timetables and alarms - the service is for West Bengal.
  timeZone: 'Asia/Kolkata',
}

if (config.isProd && config.jwtAccessSecret.startsWith('change-me')) {
  console.warn('[config] WARNING: set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET to long random values in production')
}

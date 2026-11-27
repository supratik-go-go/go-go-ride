// Runtime configuration from environment variables (and an optional .env file).
import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Node's built-in .env loader; real environment variables win.
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
// Local runs point MYSQL_ENV_FILE at data/mysql-test.env, which holds the test database password.
if (process.env.MYSQL_ENV_FILE) process.loadEnvFile(path.resolve(ROOT, process.env.MYSQL_ENV_FILE))

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

  // MySQL: on Hostinger the five MYSQL_* values come from hPanel > Databases. Locally they come
  // from data/mysql-test.env (MYSQL_ENV_FILE), the test MariaDB on this PC.
  mysql: {
    host: env('MYSQL_HOST', '127.0.0.1'),
    port: num('MYSQL_PORT', 3306),
    user: env('MYSQL_USER', ''),
    password: env('MYSQL_PASSWORD', ''),
    database: env('MYSQL_DATABASE', ''),
  },

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

  // Mobile number checks cost GO-GO Ride nothing: the person texts a code from their own number to
  // the owner's phone (receiveNumber), whose free "SMS Gateway for Android" app (cloud mode,
  // https://sms-gate.app) passes every SMS it gets to /api/sms/incoming/<webhookKey>. user and
  // password are shown in that app's Cloud Server section; the server uses them to tell the app
  // where to pass the SMS. Until receiveNumber is set (and, on the live server, the login), no
  // check is asked for.
  sms: {
    api: env('SMS_GATEWAY_URL', 'https://api.sms-gate.app/3rdparty/v1'),
    user: env('SMS_GATEWAY_USER', ''),
    password: env('SMS_GATEWAY_PASSWORD', ''),
    receiveNumber: env('SMS_RECEIVE_NUMBER', '').replace(/\D/g, '').slice(-10),
    webhookKey: env('SMS_WEBHOOK_KEY', ''),
    publicUrl: env('PUBLIC_URL', 'https://go-goride.com'),
  },

  // Sign in with Google (free). clientId is the "Web application" client ID from Google Cloud
  // (Google Auth Platform > Clients); the app shows the Google button only once it is set.
  google: {
    clientId: env('GOOGLE_CLIENT_ID', ''),
    certsUrl: env('GOOGLE_CERTS_URL', 'https://www.googleapis.com/oauth2/v3/certs'),
  },

  // Forgot-password codes go by email (free): any mailbox that allows SMTP, e.g. one on the
  // go-goride.com domain from hPanel > Emails (smtp.hostinger.com) or a Gmail with an app password
  // (smtp.gmail.com). Until host, user and password are set, the live server sends no email.
  mail: {
    host: env('SMTP_HOST', ''),
    port: num('SMTP_PORT', 465),
    user: env('SMTP_USER', ''),
    password: env('SMTP_PASSWORD', ''),
    from: env('MAIL_FROM', ''),
  },

  busExceptionMinDays: num('BUS_EXCEPTION_MIN_DAYS', 5),
  cronKey: env('CRON_KEY', ''),

  // Clock used for "today", timetables and alarms - the service is for West Bengal.
  timeZone: 'Asia/Kolkata',
}

// The secret part of the address the SMS phone posts to: made from the JWT secret unless set.
config.sms.webhookKey ||= createHmac('sha256', config.jwtAccessSecret).update('sms-webhook').digest('hex').slice(0, 32)

if (config.isProd && config.jwtAccessSecret.startsWith('change-me')) {
  console.warn('[config] WARNING: set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET to long random values in production')
}

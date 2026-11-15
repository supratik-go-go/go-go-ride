#!/usr/bin/env node
// API safety net. Starts the API in this process on a fresh copy of seed/gogoride.db with the
// clock frozen, sends every case in scripts/api-cases/*.mjs and compares each answer with the
// snapshot saved in scripts/api-snapshots/. Run it before and after changing server code:
// any difference is either a bug or an intended change (then save it with --update).
//
//   npm run check                       compare, exit 1 on any difference
//   npm run check -- --update           save the current answers as the snapshots
//   npm run check -- --only 20-buses-network --verbose
//
// A case: { name, method = 'GET', path: string | (ctx) => string, as = 'public' | 'passenger' |
//           'owner' | 'driver' | 'admin' | 'super', body?, ignore?: [keys], mode?: 'full' | 'status' }
// Cases run in file order against one database copy, so a write case affects later cases.
// Needs seed/gogoride.db (git-ignored; made by scripts/make-starter.mjs). Live data is never used.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const UPDATE = args.includes('--update')
const VERBOSE = args.includes('--verbose')
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const caseDir = path.join(here, 'api-cases')
const snapDir = path.join(here, 'api-snapshots')
const seed = path.join(root, 'seed', 'gogoride.db')
if (!fs.existsSync(seed)) {
  console.error(`Missing ${seed}. Make it with: node scripts/make-starter.mjs <path to a test database>`)
  process.exit(1)
}

// ---------------------------------------------------------------- frozen clock, throwaway database

// 10:00 in Kolkata on a Tuesday, the date the seed's shared rides run on. Every "today" in the
// API is this moment, so the answers are the same whenever the check runs.
const RealDate = Date
const FROZEN = RealDate.parse('2026-09-22T04:30:00.000Z')
globalThis.Date = class extends RealDate {
  constructor(...a) {
    if (a.length) super(...a)
    else super(FROZEN)
  }
  static now() {
    return FROZEN
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gogo-api-check-'))
fs.copyFileSync(seed, path.join(work, 'gogoride.db'))
process.env.ENVIRONMENT = 'development'
process.env.DATABASE_PATH = path.join(work, 'gogoride.db')
process.env.UPLOAD_DIR = path.join(work, 'uploads')
const cleanUp = () => fs.rmSync(work, { recursive: true, force: true })

const realLog = console.log
console.log = (...a) => (/^\[(uploads|db)\]/.test(String(a[0])) ? undefined : realLog(...a))
const { app } = await import(pathToFileURL(path.join(root, 'src', 'app.js')).href)
const { db } = await import(pathToFileURL(path.join(root, 'src', 'db.js')).href)
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
// Node closes idle connections after 5 s; on a busy PC a request can race that close.
server.keepAliveTimeout = 120000
server.headersTimeout = 121000
const BASE = `http://127.0.0.1:${server.address().port}/api`

// ---------------------------------------------------------------- requests

const ACCOUNTS = {
  passenger: ['9123456789', 'Rider@123'],
  owner: ['9876543210', 'Owner@123'],
  driver: ['9000011223', 'Driver@123'],
  admin: ['9876500002', 'Admin@123'],
  super: ['9876500001', 'Admin@123'],
}

async function call(method, p, token, body, retry = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (err) {
    // A dropped connection never reached the API, so sending it again is safe.
    if (retry && err.cause?.code === 'ECONNRESET') return call(method, p, token, body, false)
    throw err
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

async function login(role) {
  const [phone, password] = ACCOUNTS[role]
  const r = await call('POST', '/auth/login', null, { phone, password })
  if (r.status !== 200) throw new Error(`login as ${role} failed: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.data
}

// ---------------------------------------------------------------- comparing

const VOLATILE = new Set(['accessToken', 'refreshToken', 'uptime', 'timestamp'])

// Snapshots go to GitHub, so phone numbers and email names from the seed database are masked.
// The shape is kept (length, prefix, domain), so a missing or reformatted value still shows up.
const mask = (text) =>
  text
    .replace(/(^|\D)(\+91)?([6-9]\d)(\d{8})(?!\d)/g, (m, before, cc = '', start, rest) => `${before}${cc}${start}${'*'.repeat(rest.length)}`)
    .replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '***@$1')

function normalise(value, ignore) {
  if (Array.isArray(value)) return value.map((v) => normalise(v, ignore))
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE.has(k) || ignore.has(k)) continue
      out[k] = normalise(value[k], ignore)
    }
    return out
  }
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6
  if (typeof value === 'string') return mask(value)
  return value
}

function diff(a, b, at = '$', out = []) {
  if (out.length > 25) return out
  const show = (v) => JSON.stringify(v)?.slice(0, 120)
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(`${at}: expected ${show(a)}, got ${show(b)}`)
    return out
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) out.push(`${at}: expected ${a.length} items, got ${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff(a[i], b[i], `${at}[${i}]`, out)
    return out
  }
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${at}.${k}: new field ${show(b[k])}`)
      else if (!(k in b)) out.push(`${at}.${k}: missing (expected ${show(a[k])})`)
      else diff(a[k], b[k], `${at}.${k}`, out)
    }
    return out
  }
  if (a !== b) out.push(`${at}: expected ${show(a)}, got ${show(b)}`)
  return out
}

// ---------------------------------------------------------------- ids the cases refer to

async function buildContext(tokens) {
  const g = async (p, role = 'public') => (await call('GET', p, role === 'public' ? null : tokens[role].accessToken)).json?.data
  const buses = (await g('/buses?limit=100', 'admin')) || []
  const s12 = buses.find((b) => b.route?.routeNumber === 'S12') || buses[0]
  const stops = (await g('/stops?limit=100')) || []
  const routes = (await g('/routes?limit=100')) || []
  const cars = (await g('/local-cars?limit=10')) || []
  const rides = (await g('/rides?date=2026-09-22')) || []
  const pending = (await g('/admin/bus-requests?limit=5', 'admin')) || []
  const bookings = (await g('/bookings?limit=5', 'passenger')) || []
  const alarms = (await g('/alarms?limit=5', 'passenger')) || []
  const tickets = (await g('/support/tickets?limit=5', 'admin')) || []
  const notes = (await g('/notifications?limit=5', 'passenger')) || []
  const users = (await g('/admin/users?limit=100', 'admin')) || []
  return {
    busId: s12?.id,
    bus: s12,
    ownerBusId: buses.find((b) => b.owner?.phone === ACCOUNTS.owner[0])?.id,
    pendingBusId: pending[0]?.id,
    stopId: stops.find((s) => s.name === 'Howrah Station')?.id || stops[0]?.id,
    stops,
    routeId: routes.find((r) => r.routeNumber === 'S12')?.id || routes[0]?.id,
    carId: cars[0]?.id,
    rideId: rides[0]?.id,
    bookingId: bookings[0]?.id,
    alarmId: alarms[0]?.id,
    ticketId: tickets[0]?.id,
    notificationId: notes[0]?.id,
    users: Object.fromEntries(Object.entries(tokens).map(([role, s]) => [role, s.user])),
    userIds: users.map((u) => u.id),
    today: new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------- run

let pass = 0
let fail = 0
let saved = 0
try {
  const tokens = {}
  for (const role of Object.keys(ACCOUNTS)) tokens[role] = await login(role)
  const ctx = await buildContext(tokens)
  fs.mkdirSync(snapDir, { recursive: true })

  for (const file of fs.readdirSync(caseDir).filter((f) => f.endsWith('.mjs')).sort()) {
    const group = path.basename(file, '.mjs')
    if (ONLY.length && !ONLY.includes(group)) continue
    const cases = (await import(pathToFileURL(path.join(caseDir, file)).href)).default
    const snapFile = path.join(snapDir, `${group}.json`)
    const snaps = fs.existsSync(snapFile) ? JSON.parse(fs.readFileSync(snapFile, 'utf8')) : {}
    const fresh = {}
    realLog(`\n== ${group} (${cases.length} cases)`)

    for (const c of cases) {
      if (c.name in fresh) throw new Error(`Two cases in ${file} are named "${c.name}". Give each a unique name.`)
      const method = (c.method || 'GET').toUpperCase()
      const p = typeof c.path === 'function' ? c.path(ctx) : c.path
      if (p == null || p.includes('undefined')) {
        realLog(`  SKIP ${c.name} (no id available)`)
        continue
      }
      const body = typeof c.body === 'function' ? c.body(ctx) : c.body
      const role = c.as || 'public'
      const r = await call(method, p, role === 'public' ? null : tokens[role].accessToken, body)
      const ignore = new Set(c.ignore || [])
      const got = { status: r.status, body: (c.mode || 'full') === 'full' ? normalise(r.json, ignore) : { code: r.json?.code ?? null } }
      fresh[c.name] = got

      const expected = snaps[c.name]
      const problems = !expected ? ['no snapshot yet'] : diff(expected, got)
      if (problems.length && !UPDATE) {
        fail += 1
        realLog(`  FAIL ${c.name}  [${method} ${p} as ${role}]`)
        for (const line of problems.slice(0, VERBOSE ? 50 : 8)) realLog(`       ${line}`)
      } else {
        pass += 1
        if (VERBOSE) realLog(`  PASS ${c.name}`)
      }
    }
    if (UPDATE) {
      fs.writeFileSync(snapFile, `${JSON.stringify(fresh, null, 1)}\n`)
      saved += Object.keys(fresh).length
    }
  }
} finally {
  server.close()
  db.close()
  cleanUp()
}

if (UPDATE) realLog(`\nSaved ${saved} snapshots in scripts/api-snapshots/.`)
else realLog(`\n${pass} passed, ${fail} failed${fail ? ' - see FAIL lines above' : ''}`)
process.exit(fail ? 1 : 0)

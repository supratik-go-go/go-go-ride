#!/usr/bin/env node
// Parity check: sends the same requests to the Python API and the Node API and
// compares the JSON they return.
//
//   node scripts/parity.mjs --node http://localhost:8101/api [--py http://localhost:8000/api] [--only buses,auth] [--verbose]
//
// Cases live in scripts/parity-cases/*.mjs (export default [ { name, path, ... } ]).
// A case: { name, method = 'GET', path: string | (ctx) => string, as = 'public' | 'passenger' | 'owner' | 'driver' | 'admin' | 'super',
//           body?, ignore?: [keys], mode?: 'full' | 'status' }
// Only GETs, plus requests that are expected to FAIL validation/permission checks, are allowed:
// the Python database is live and must not be modified by this script.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const PY = arg('py', 'http://localhost:8000/api')
const NODE = arg('node', 'http://localhost:8101/api')
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const VERBOSE = args.includes('--verbose')

const ACCOUNTS = {
  passenger: ['9123456789', 'Rider@123'],
  owner: ['9876543210', 'Owner@123'],
  driver: ['9000011223', 'Driver@123'],
  admin: ['9876500002', 'Admin@123'],
  super: ['9876500001', 'Admin@123'],
}

async function call(base, method, p, token, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

async function login(base, role) {
  const [phone, password] = ACCOUNTS[role]
  const r = await call(base, 'POST', '/auth/login', null, { phone, password })
  if (r.status !== 200) throw new Error(`login ${role} on ${base} failed: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.data
}

// ---------------------------------------------------------------- normalisation

const VOLATILE = new Set(['accessToken', 'refreshToken', 'uptime', 'timestamp', 'lastLoginAt'])
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

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
  if (typeof value === 'string' && ISO.test(value)) {
    const s = /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? value : d.toISOString()
  }
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6
  return value
}

function diff(a, b, at = '$', out = []) {
  if (out.length > 25) return out
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(`${at}: python=${JSON.stringify(a)?.slice(0, 120)} node=${JSON.stringify(b)?.slice(0, 120)}`)
    return out
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) out.push(`${at}: length python=${a.length} node=${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff(a[i], b[i], `${at}[${i}]`, out)
    return out
  }
  if (a && typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      if (!(k in a)) out.push(`${at}.${k}: missing in python (node=${JSON.stringify(b[k])?.slice(0, 80)})`)
      else if (!(k in b)) out.push(`${at}.${k}: missing in node (python=${JSON.stringify(a[k])?.slice(0, 80)})`)
      else diff(a[k], b[k], `${at}.${k}`, out)
    }
    return out
  }
  if (a !== b) out.push(`${at}: python=${JSON.stringify(a)?.slice(0, 120)} node=${JSON.stringify(b)?.slice(0, 120)}`)
  return out
}

// ---------------------------------------------------------------- context (ids discovered read-only from Python)

async function buildContext(tokens) {
  const g = async (p, role = 'public') => (await call(PY, 'GET', p, role === 'public' ? null : tokens.py[role].accessToken)).json?.data
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
    users: Object.fromEntries(Object.entries(tokens.py).map(([role, s]) => [role, s.user])),
    userIds: users.map((u) => u.id),
    today: new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------- run

const here = path.dirname(fileURLToPath(import.meta.url))
const caseDir = path.join(here, 'parity-cases')
const files = fs.existsSync(caseDir) ? fs.readdirSync(caseDir).filter((f) => f.endsWith('.mjs')) : []

const tokens = { py: {}, node: {} }
for (const role of Object.keys(ACCOUNTS)) {
  tokens.py[role] = await login(PY, role)
  tokens.node[role] = await login(NODE, role)
}
const ctx = await buildContext(tokens)

let pass = 0
let fail = 0
for (const file of files.sort()) {
  const group = path.basename(file, '.mjs')
  if (ONLY.length && !ONLY.includes(group)) continue
  const cases = (await import(pathToFileURL(path.join(caseDir, file)).href)).default
  console.log(`\n== ${group} (${cases.length} cases)`)
  for (const c of cases) {
    const method = (c.method || 'GET').toUpperCase()
    const p = typeof c.path === 'function' ? c.path(ctx) : c.path
    if (p == null || p.includes('undefined')) {
      console.log(`  SKIP ${c.name} (no id available)`)
      continue
    }
    const body = typeof c.body === 'function' ? c.body(ctx) : c.body
    const role = c.as || 'public'
    const tok = (side) => (role === 'public' ? null : tokens[side][role].accessToken)
    const [a, b] = await Promise.all([call(PY, method, p, tok('py'), body), call(NODE, method, p, tok('node'), body)])
    const problems = []
    if (a.status !== b.status) problems.push(`status python=${a.status} node=${b.status}`)
    if (method !== 'GET' && a.status < 400) problems.push(`python returned ${a.status} - write cases must be expected failures`)
    if ((c.mode || 'full') === 'full') {
      const ignore = new Set(c.ignore || [])
      problems.push(...diff(normalise(a.json, ignore), normalise(b.json, ignore)))
    } else if (a.json?.code !== b.json?.code) {
      problems.push(`code python=${a.json?.code} node=${b.json?.code}`)
    }
    if (problems.length) {
      fail += 1
      console.log(`  FAIL ${c.name}  [${method} ${p} as ${role}]`)
      for (const line of problems.slice(0, VERBOSE ? 50 : 8)) console.log(`       ${line}`)
    } else {
      pass += 1
      console.log(`  PASS ${c.name}`)
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

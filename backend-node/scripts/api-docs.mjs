#!/usr/bin/env node
// Writes docs/API.md: every API address, read from the route files themselves, so the list
// never drifts from the code. Run after adding or changing a route:  npm run docs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, '..', 'docs', 'API.md')

// Importing the routes sets up the database pool (it does not connect until a query runs).
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gogo-api-docs-'))
process.env.UPLOAD_DIR = path.join(work, 'uploads')
const realLog = console.log
console.log = () => {}

const load = async (rel) => import(pathToFileURL(path.join(root, rel)).href)
const auth = await load('src/auth.js')
const { config } = await load('src/config.js')
const ACCESS = new Map([
  [auth.requireUser, 'signed in'],
  [auth.optionalUser, 'anyone (more if signed in)'],
  [auth.requireAdmin, 'admin'],
  [auth.requireSuperAdmin, 'super admin'],
  [auth.requireOwner, 'bus owner or admin'],
])

// What each route file covers, in the order app.js mounts them.
const FILES = [
  ['platform', 'App version, stats, settings, news, public pages'],
  ['auth', 'Sign up, sign in, OTP, tokens, password'],
  ['profile', 'Profile, favourites, recent searches, delete account'],
  ['buses', 'Bus search, bus details, reviews, owner bus listings'],
  ['network', 'Routes, stops, nearby stops'],
  ['alarms', 'Arrival alarms'],
  ['cars', 'Local Vehicle listings and Running Car shared rides'],
  ['bookings', 'Bookings'],
  ['messaging', 'Notifications and support tickets'],
  ['admin', 'Admin panel'],
  ['contributions', 'Add Bus / Add Route Information from users, admin review'],
  ['games', 'Online games, Ping Ball, leaderboard'],
  ['community', 'Local police numbers and bus ticket photos from users, admin review'],
]

let md = `# GO-GO Ride API

Every address below starts with \`https://go-goride.com${config.apiPrefix}\`. Generated from \`backend-node/src/routes/\` by \`npm run docs\` (in \`backend-node\`): do not edit by hand.

Every reply has the same shape: \`{ success, message, data, meta }\`, and on errors \`{ success: false, message, code, details? }\`.
Send \`Authorization: Bearer <accessToken>\` for anything that needs a signed-in user.

`
let total = 0
for (const [file, about] of FILES) {
  const router = (await load(`src/routes/${file}.js`)).default
  const rows = []
  for (const layer of router.stack) {
    const route = layer.route
    if (!route) continue
    const methods = Object.keys(route.methods).filter((m) => route.methods[m]).map((m) => m.toUpperCase())
    const guards = route.stack.map((l) => ACCESS.get(l.handle)).filter(Boolean)
    for (const method of methods) rows.push(`| ${method} | \`${route.path}\` | ${route.path.startsWith('/internal/') ? 'the server timer (needs the CRON_KEY secret)' : guards[0] || 'anyone'} |`)
  }
  total += rows.length
  md += `## ${file} (${rows.length})\n\n${about}. Code: \`backend-node/src/routes/${file}.js\`\n\n| Method | Path | Who can call it |\n| --- | --- | --- |\n${rows.join('\n')}\n\n`
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, md.replace(/\n+$/, '\n'))
const { close } = await load('src/db.js')
await close()
fs.rmSync(work, { recursive: true, force: true })
realLog(`Wrote ${path.relative(path.join(root, '..'), out)}: ${total} addresses`)
process.exit(0)

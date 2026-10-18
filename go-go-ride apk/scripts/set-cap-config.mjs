#!/usr/bin/env node
// Adjusts capacitor.config.json for the server the app is built against.
//   node scripts/set-cap-config.mjs https://go-goride.com/api   -> live: plain-http access OFF
//   node scripts/set-cap-config.mjs http://192.168.1.9:8000/api -> Wi-Fi testing: plain-http access ON
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json')
const url = process.argv[2] || ''
const live = url.startsWith('https://')
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
cfg.server = { ...(cfg.server || {}), cleartext: !live }
cfg.android = { ...(cfg.android || {}), allowMixedContent: !live }
fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`)
console.log(` [ok]    ${live ? 'Live build: plain-http access off' : 'Test build: plain-http access on (Wi-Fi server)'}`)

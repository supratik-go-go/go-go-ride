#!/usr/bin/env node
// Copies the current database (and uploaded files) into seed/ so a new server
// starts with today's buses, routes, stops and accounts.
//   node scripts/make-starter.mjs [path/to/gogoride.db]
// Uses VACUUM INTO, which makes a consistent copy even while the API is running.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(process.argv[2] || path.join(root, '..', 'backend-python', 'gogoride.db'))
const target = path.join(root, 'seed', 'gogoride.db')

if (!fs.existsSync(source)) {
  console.error(`Database not found: ${source}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(target), { recursive: true })
if (fs.existsSync(target)) fs.rmSync(target)
const db = new DatabaseSync(source, { readOnly: true })
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
db.close()

const check = new DatabaseSync(target, { readOnly: true })
const count = (t) => check.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n
console.log(`Starter database: ${target}`)
console.log(`  ${count('User')} users, ${count('Bus')} buses, ${count('Route')} routes, ${count('BusStop')} stops`)
check.close()

const uploadsFrom = path.join(path.dirname(source), 'uploads')
const uploadsTo = path.join(root, 'seed', 'uploads')
if (fs.existsSync(uploadsFrom)) {
  fs.rmSync(uploadsTo, { recursive: true, force: true })
  fs.cpSync(uploadsFrom, uploadsTo, { recursive: true })
  console.log(`Starter uploads:  ${uploadsTo}`)
}

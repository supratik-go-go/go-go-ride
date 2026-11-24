#!/usr/bin/env node
// The night-time switch to MySQL, prepared on this PC in the local test MariaDB (never the live one):
//   1. copies the live SQLite file into the new design (database gogoride_switch, wiped first)
//   2. deletes the demo data that came with the starter database (seed/gogoride.db), and whatever
//      depended on it; bus stops and app settings stay
//   3. makes the owner's account (found by phone) a super admin
//   4. loads the Excel buses as the owner, published
//   5. writes data/gogoride-switch.sql.gz to import in phpMyAdmin
//
//   node scripts/prepare-switch.mjs <live gogoride.db> <owner phone> [<buses.xlsx>] [--temporary-password]
//
// Needs the local test MariaDB (data/mysql-test.env). The live SQLite file is only read.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const [liveFile, ownerPhone, excelFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!liveFile || !ownerPhone || !fs.existsSync(liveFile)) {
  console.error('Usage: node scripts/prepare-switch.mjs <live gogoride.db> <owner phone> [<buses.xlsx>]')
  process.exit(1)
}
process.env.MYSQL_ENV_FILE = process.env.MYSQL_ENV_FILE || 'data/mysql-test.env'
process.env.MYSQL_DATABASE = 'gogoride_switch'
const KEEP = new Set(['bus_stops', 'app_settings'])

const { config } = await import('../src/config.js')
if (!['127.0.0.1', 'localhost'].includes(config.mysql.host)) {
  console.error(`Refusing: MYSQL_HOST is ${config.mysql.host}. This tool only works on the local test database.`)
  process.exit(1)
}
const mysql = (await import('mysql2/promise')).default
const { copySqliteToMysql } = await import('./sqlite-to-mysql.mjs')
const { database, ...server } = config.mysql
const conn = await mysql.createConnection({ ...server, multipleStatements: true, charset: 'utf8mb4' })
const q = async (sql, params = []) => (await conn.query(sql, params))[0]
const schema = fs.readFileSync(path.join(root, 'mysql', 'schema.sql'), 'utf8')
async function fresh(name, sqlite) {
  await conn.query(`DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${name}\``)
  await conn.query(schema)
  await copySqliteToMysql(sqlite, conn, { log: () => {} })
}

// ---------------------------------------------------------------- 1. live copy, and the demo ids
console.log(`1. Copying ${liveFile}`)
await fresh('gogoride_seedids', path.join(root, 'seed', 'gogoride.db'))
const tables = (await q("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'gogoride_seedids'")).map((r) => r.t)
const hasId = new Set(
  (await q("SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'gogoride_seedids' AND column_name = 'id'")).map((r) => r.t),
)
const demoIds = new Map()
for (const t of tables) if (hasId.has(t) && !KEEP.has(t)) demoIds.set(t, (await q(`SELECT id FROM \`${t}\``)).map((r) => r.id))
await conn.query('DROP DATABASE gogoride_seedids')
await fresh(database, liveFile)
const before = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, Number((await q(`SELECT COUNT(*) AS n FROM \`${t}\``))[0].n)])))

// ---------------------------------------------------------------- 2. demo data out
console.log('2. Removing the demo data')
const doomed = new Map()
for (const [t, ids] of demoIds) {
  const found = ids.length ? (await q(`SELECT id FROM \`${t}\` WHERE id IN (?)`, [ids])).map((r) => r.id) : []
  doomed.set(t, new Set(found))
}
const links = await q(
  `SELECT k.table_name AS t, k.column_name AS col, k.referenced_table_name AS ref, c.is_nullable AS nullable
   FROM information_schema.key_column_usage k
   JOIN information_schema.columns c ON c.table_schema = k.table_schema AND c.table_name = k.table_name AND c.column_name = k.column_name
   WHERE k.table_schema = ? AND k.referenced_table_name IS NOT NULL`,
  [database],
)
// Rows pointing at removed rows go too; a link that may be empty is emptied instead (a real bus on a demo route keeps the bus).
const emptied = []
for (let changed = true; changed; ) {
  changed = false
  for (const l of links) {
    const gone = [...(doomed.get(l.ref) ?? [])]
    if (!gone.length || !hasId.has(l.t)) continue
    for (const { id } of await q(`SELECT id FROM \`${l.t}\` WHERE \`${l.col}\` IN (?)`, [gone])) {
      if (!doomed.has(l.t)) doomed.set(l.t, new Set())
      if (doomed.get(l.t).has(id)) continue
      if (l.nullable === 'YES') emptied.push([l.t, l.col, id])
      else {
        doomed.get(l.t).add(id)
        changed = true
      }
    }
  }
}
const show = async (t, cols) => {
  const ids = [...(doomed.get(t) ?? [])]
  return ids.length ? (await q(`SELECT ${cols} AS x FROM \`${t}\` WHERE id IN (?) ORDER BY x`, [ids])).map((r) => r.x) : []
}
console.log(`   accounts: ${(await show('users', "CONCAT(name, ' (', role, ')')")).join(', ')}`)
console.log(`   buses: ${(await show('buses', "CONCAT_WS(' ', bus_number, bus_name)")).join(', ')}`)
console.log(`   routes: ${(await show('bus_routes', "CONCAT(route_number, ' ', name)")).join(', ')}`)
console.log(`   Local Vehicle: ${(await show('local_vehicles', 'driver_name')).join(', ')}`)

await conn.query('SET FOREIGN_KEY_CHECKS = 0')
for (const [t, col, id] of emptied) if (!doomed.get(t)?.has(id)) await q(`UPDATE \`${t}\` SET \`${col}\` = NULL WHERE id = ?`, [id])
for (const [t, ids] of doomed) if (ids.size) await q(`DELETE FROM \`${t}\` WHERE id IN (?)`, [[...ids]])
// Tables without an id (reads, leaderboard) and favourites (which point at buses, routes and vehicles by item id).
for (const l of links.filter((l) => !hasId.has(l.t))) {
  const gone = [...(doomed.get(l.ref) ?? [])]
  if (gone.length) await q(`DELETE FROM \`${l.t}\` WHERE \`${l.col}\` IN (?)`, [gone])
}
const items = ['buses', 'bus_routes', 'local_vehicles'].flatMap((t) => [...(doomed.get(t) ?? [])])
if (items.length) await q('DELETE FROM favorites WHERE item_id IN (?)', [items])
await conn.query('SET FOREIGN_KEY_CHECKS = 1')
for (const l of links) {
  const [{ n }] = await q(
    `SELECT COUNT(*) AS n FROM \`${l.t}\` a LEFT JOIN \`${l.ref}\` b ON b.id = a.\`${l.col}\` WHERE a.\`${l.col}\` IS NOT NULL AND b.id IS NULL`,
  )
  if (Number(n)) throw new Error(`${n} rows in ${l.t}.${l.col} point at removed ${l.ref}`)
}

// ---------------------------------------------------------------- 3. owner
console.log(`3. Super admin: phone ${ownerPhone}`)
const owner = (await q('SELECT id, name, role, status FROM users WHERE phone = ?', [ownerPhone]))[0]
if (!owner) throw new Error(`No account with phone ${ownerPhone}. Sign up in the app with it first, then download the live file again.`)
await q("UPDATE users SET role = 'SUPER_ADMIN', status = 'ACTIVE', updated_at = NOW(3) WHERE id = ?", [owner.id])
console.log(`   ${owner.name}: ${owner.role} -> SUPER_ADMIN`)
// --temporary-password: the owner forgot the account's password. A random one goes into a file only
// the owner opens (never printed); they sign in with it and choose their own in Profile > Change password.
if (process.argv.includes('--temporary-password')) {
  const { randomInt } = await import('node:crypto')
  const { hashPassword } = await import('../src/auth.js')
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const temporary = Array.from({ length: 10 }, () => letters[randomInt(letters.length)]).join('')
  await q('UPDATE users SET password = ?, updated_at = NOW(3) WHERE id = ?', [hashPassword(temporary), owner.id])
  await q('DELETE FROM sign_in_sessions WHERE user_id = ?', [owner.id])
  const note = path.join(root, 'data', 'YOUR-TEMPORARY-PASSWORD.txt')
  fs.writeFileSync(
    note,
    `GO-GO Ride - temporary password for ${ownerPhone}\r\n\r\n${temporary}\r\n\r\n` +
      'It works after the switch. Sign in with it, then go to Profile > Change password and choose your own.\r\n' +
      'Delete this file afterwards.\r\n',
  )
  console.log(`   temporary password written to ${note} (not shown here)`)
}
await conn.end()

// ---------------------------------------------------------------- 4. Excel buses
const db = await import('../src/db.js')
if (excelFile) {
  console.log(`4. Loading ${excelFile}`)
  const busImport = await import('../src/services/busImport.js')
  const plan = await busImport.planImport(await busImport.readSheet(fs.readFileSync(excelFile)))
  const admin = await db.get('SELECT * FROM users WHERE id = ?', owner.id)
  const result = await busImport.applyImport(plan, admin, { publish: true })
  console.log(`   ${result.created} added, ${result.updated} updated, ${result.skipped} with problems left out`)
}

console.log('\nBefore -> after')
for (const t of tables) {
  const n = Number(await db.scalar(`SELECT COUNT(*) FROM \`${t}\``))
  if (n || before[t]) console.log(`   ${t.padEnd(26)} ${String(before[t]).padStart(6)} -> ${n}`)
}
await db.close()

// ---------------------------------------------------------------- 5. file for phpMyAdmin
const out = path.join(root, 'data', 'gogoride-switch.sql')
const dump = spawnSync(
  'C:\\GoGoTools\\mariadb\\bin\\mariadb-dump.exe',
  ['--host', server.host, '--port', String(server.port), '--user', server.user, '--single-transaction', '--skip-lock-tables', '--no-tablespaces', '--default-character-set=utf8mb4', database],
  { env: { ...process.env, MYSQL_PWD: server.password }, maxBuffer: 1 << 30 },
)
if (dump.status !== 0) throw new Error(`mariadb-dump failed: ${dump.stderr}`)
// MariaDB 11's first line ("enable the sandbox mode") stops older servers from importing the file.
const sql = dump.stdout.toString('utf8').replace(/^\/\*M!999999\\- enable the sandbox mode \*\/\r?\n/, '')
fs.writeFileSync(out, sql)
fs.writeFileSync(`${out}.gz`, zlib.gzipSync(sql))
console.log(`\n5. Wrote ${out}.gz (${(fs.statSync(`${out}.gz`).size / 1e6).toFixed(1)} MB) for phpMyAdmin`)

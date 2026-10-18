// SQLite through Node's built-in driver (no native modules to compile on the host).
//
// The schema is the one the original Prisma service created and the Python
// service shares: PascalCase tables, camelCase columns, datetimes stored as
// INTEGER milliseconds since the epoch (UTC), booleans as 0/1.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config, ROOT } from './config.js'

function openDatabase() {
  const file = config.databasePath
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) {
    if (fs.existsSync(config.starterDatabase)) {
      fs.copyFileSync(config.starterDatabase, file)
      console.log(`[db] created ${file} from ${config.starterDatabase}`)
    } else {
      const fresh = new DatabaseSync(file)
      fresh.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'))
      fresh.close()
      console.log(`[db] created empty database ${file}`)
    }
  }
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

export const db = openDatabase()

/** SQLite only binds null / number / bigint / string / bytes. */
function bindable(value) {
  if (value === undefined) return null
  if (value === true) return 1
  if (value === false) return 0
  if (value instanceof Date) return value.getTime()
  return value
}
const prep = (params) => params.map(bindable)

const stmtCache = new Map()
function stmt(sql) {
  let s = stmtCache.get(sql)
  if (!s) {
    s = db.prepare(sql)
    stmtCache.set(sql, s)
  }
  return s
}

/** All rows. */
export const all = (sql, ...params) => stmt(sql).all(...prep(params))
/** First row or undefined. */
export const get = (sql, ...params) => stmt(sql).get(...prep(params))
/** { changes, lastInsertRowid } */
export const run = (sql, ...params) => stmt(sql).run(...prep(params))
/** Single scalar (first column of the first row), or the fallback. */
export function scalar(sql, ...params) {
  const row = get(sql, ...params)
  if (!row) return null
  return Object.values(row)[0]
}

/** "?, ?, ?" for an IN (...) list. */
export const placeholders = (list) => list.map(() => '?').join(', ')

const q = (name) => `"${name}"`

/** INSERT the object's own keys into `table`; returns the object. */
export function insert(table, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined)
  run(
    `INSERT INTO ${q(table)} (${keys.map(q).join(', ')}) VALUES (${placeholders(keys)})`,
    ...keys.map((k) => obj[k]),
  )
  return obj
}

/** UPDATE the given columns of one row by id. Ignores undefined values. */
export function update(table, id, patch) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined)
  if (!keys.length) return 0
  return run(`UPDATE ${q(table)} SET ${keys.map((k) => `${q(k)} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), id)
    .changes
}

export const byId = (table, id) => (id ? get(`SELECT * FROM ${q(table)} WHERE id = ?`, id) : undefined)

let depth = 0
/** Run fn inside a transaction (nested calls join the outer one). */
export function tx(fn) {
  if (depth > 0) return fn()
  depth += 1
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    depth -= 1
  }
}

/**
 * Pattern for free-text search. SQLite's LIKE is case-insensitive for ASCII,
 * which matches the Python service's ilike (also unescaped).
 */
export const like = (text) => `%${String(text)}%`

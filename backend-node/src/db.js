// MySQL through mysql2: Hostinger's MySQL in production, a local MariaDB in tests.
//
// The database uses lowercase names with underscores (bus_number) and stores dates in India time.
// This layer lets the rest of the code work with plain values:
//   - rows come back with camelCase keys (bus_number -> busNumber),
//   - DATETIME columns as milliseconds, DATE columns as milliseconds at midnight UTC (as the old
//     SQLite database stored them), TIME columns as 'HH:MM', money and yes/no as numbers,
//   - insert() and update() take camelCase keys and the same plain values, and convert them.
// Raw SQL is written with the real column names; pass dates with at() / day() (see below).
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { config, ROOT } from './config.js'

const IST_MS = 5.5 * 3600 * 1000

export const toCamel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
export const toSnake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Milliseconds -> 'YYYY-MM-DD HH:MM:SS.mmm' in India time, for DATETIME columns and comparisons. */
export const at = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms) + IST_MS).toISOString().replace('T', ' ').slice(0, 23))
/** Midnight-UTC milliseconds (a calendar date) -> 'YYYY-MM-DD', for DATE columns. */
export const day = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString().slice(0, 10))

function typeCast(field, next) {
  switch (field.type) {
    case 'DATETIME':
    case 'TIMESTAMP': {
      const s = field.string()
      return s === null ? null : Date.parse(`${s.replace(' ', 'T')}+05:30`)
    }
    case 'DATE': {
      const s = field.string()
      return s === null ? null : Date.parse(`${s}T00:00:00Z`)
    }
    case 'TIME': {
      const s = field.string()
      return s === null ? null : s.slice(0, 5)
    }
    case 'NEWDECIMAL': {
      const s = field.string()
      return s === null ? null : Number(s)
    }
    case 'JSON':
      return field.string()
    default:
      return next()
  }
}

const makePool = (host) =>
  mysql.createPool({
    ...config.mysql,
    host,
    charset: 'utf8mb4',
    timezone: '+05:30',
    connectionLimit: 5,
    supportBigNumbers: true,
    multipleStatements: false,
    typeCast,
  })
export let pool = makePool(config.mysql.host)
let activeHost = config.mysql.host

const SHUT_OUT = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ER_ACCESS_DENIED_ERROR', 'ER_HOST_NOT_PRIVILEGED', 'ER_DBACCESS_DENIED_ERROR'])

/**
 * On start: makes sure the database answers and returns the host in use. hPanel names the MySQL
 * server (srv838.hstgr.io), but an app on the same server may only be let in through localhost,
 * so that is tried when the named host turns the app away.
 */
export async function connect() {
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    if (activeHost === 'localhost' || !SHUT_OUT.has(err.code)) throw err
    console.warn(`[db] ${activeHost} did not let the app in (${err.code}); trying localhost`)
    const local = makePool('localhost')
    await local.query('SELECT 1')
    pool.end().catch(() => {})
    pool = local
    activeHost = 'localhost'
  }
  return activeHost
}

// Queries inside tx() run on the transaction's connection, found through this store.
const txConnection = new AsyncLocalStorage()
const runner = () => txConnection.getStore() ?? pool

function bindable(value) {
  if (value === undefined) return null
  if (value === true) return 1
  if (value === false) return 0
  return value
}

const camelRow = (row) => {
  const out = {}
  for (const k of Object.keys(row)) out[toCamel(k)] = row[k]
  return out
}

/** All rows. */
export async function all(sql, ...params) {
  const [rows] = await runner().query(sql, params.map(bindable))
  return rows.map(camelRow)
}
/** First row or undefined. */
export async function get(sql, ...params) {
  return (await all(sql, ...params))[0]
}
/** { changes, insertId } */
export async function run(sql, ...params) {
  const [result] = await runner().query(sql, params.map(bindable))
  return { changes: result.affectedRows, insertId: result.insertId }
}
/** First column of the first row, or null. */
export async function scalar(sql, ...params) {
  const row = await get(sql, ...params)
  if (!row) return null
  return Object.values(row)[0]
}

/** "?, ?, ?" for an IN (...) list. */
export const placeholders = (list) => list.map(() => '?').join(', ')

// ---------------------------------------------------------------- column types, for insert / update

const columnCache = new Map()
async function columnsOf(table) {
  if (!columnCache.has(table)) {
    columnCache.set(
      table,
      pool
        .query('SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table])
        .then(([rows]) => new Map(rows.map((r) => [r.name, String(r.type).toLowerCase()]))),
    )
  }
  return columnCache.get(table)
}

async function toColumns(table, obj) {
  const types = await columnsOf(table)
  const cols = []
  const values = []
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value === undefined) continue
    const col = toSnake(key)
    const type = types.get(col)
    if (!type) throw new Error(`Column ${table}.${col} does not exist`)
    cols.push(col)
    if (type === 'datetime' || type === 'timestamp') values.push(typeof value === 'number' ? at(value) : value)
    else if (type === 'date') values.push(typeof value === 'number' ? day(value) : value)
    else values.push(bindable(value))
  }
  return { cols, values }
}

/** INSERT the object's own keys (camelCase) into `table`; returns the object. */
export async function insert(table, obj) {
  const { cols, values } = await toColumns(table, obj)
  await run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols)})`, ...values)
  return obj
}

/**
 * INSERT many objects with the same keys, 500 rows per statement (the Excel import adds thousands).
 * `refresh` lists snake_case columns to overwrite when a row with the same id is already there.
 */
export async function insertMany(table, objs, { refresh = [] } = {}) {
  const onDuplicate = refresh.length ? ` ON DUPLICATE KEY UPDATE ${refresh.map((c) => `${c} = VALUES(${c})`).join(', ')}` : ''
  for (let i = 0; i < objs.length; i += 500) {
    const chunk = []
    let cols
    for (const obj of objs.slice(i, i + 500)) {
      const c = await toColumns(table, obj)
      cols ??= c.cols
      chunk.push(c.values)
    }
    const row = `(${placeholders(cols)})`
    await run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${chunk.map(() => row).join(', ')}${onDuplicate}`, ...chunk.flat())
  }
}

/** UPDATE the given columns (camelCase keys) of one row by id. Ignores undefined values. */
export async function update(table, id, patch) {
  const { cols, values } = await toColumns(table, patch)
  if (!cols.length) return 0
  return (await run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...values, id)).changes
}

export const byId = async (table, id) => (id ? get(`SELECT * FROM ${table} WHERE id = ?`, id) : undefined)

/** Run fn inside a transaction (nested calls join the outer one). */
export async function tx(fn) {
  if (txConnection.getStore()) return fn()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await txConnection.run(conn, fn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/** Pattern for free-text search. MySQL's LIKE is case-insensitive with the utf8mb4_unicode_ci collation. */
export const like = (text) => `%${String(text)}%`

/** On start: an empty database gets the tables from mysql/schema.sql (on the live server only when allowed). */
export async function ensureSchema() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'")
  if (Number(n) > 0) return false
  // On the live server an empty database means the data was not imported or the settings name the
  // wrong database: stop with a clear message rather than start empty, as the old SQLite setup once did.
  if (config.isProd && process.env.ALLOW_EMPTY_DATABASE !== 'yes') {
    throw new Error(`MySQL database ${config.mysql.database} has no tables: import the data first (or set ALLOW_EMPTY_DATABASE=yes for a brand-new start)`)
  }
  const conn = await mysql.createConnection({ ...config.mysql, host: activeHost, charset: 'utf8mb4', multipleStatements: true })
  try {
    await conn.query(fs.readFileSync(path.join(ROOT, 'mysql', 'schema.sql'), 'utf8'))
  } finally {
    await conn.end()
  }
  console.log(`[db] created the tables in ${config.mysql.database}`)
  return true
}

export const close = () => pool.end()

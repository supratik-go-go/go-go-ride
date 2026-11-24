// SQLite through Node's built-in driver (no native modules to compile on the host).
//
// The schema is the one the original Prisma service created and the Python
// service shares: PascalCase tables, camelCase columns, datetimes stored as
// INTEGER milliseconds since the epoch (UTC), booleans as 0/1.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config, ROOT } from './config.js'

// Added after launch, so these are created on start for databases that already exist.
const ADDED_TABLES = `
CREATE TABLE IF NOT EXISTS "RouteSubmission" (
  id VARCHAR NOT NULL PRIMARY KEY,
  "userId" VARCHAR NOT NULL REFERENCES "User" (id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  "routeNumber" VARCHAR,
  notes VARCHAR,
  stops TEXT NOT NULL,
  status VARCHAR NOT NULL,
  "rejectionReason" VARCHAR,
  "routeId" VARCHAR REFERENCES "Route" (id) ON DELETE SET NULL,
  "reviewedById" VARCHAR REFERENCES "User" (id) ON DELETE SET NULL,
  "reviewedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS "GameRoom" (
  id VARCHAR NOT NULL PRIMARY KEY,
  game VARCHAR NOT NULL,
  code VARCHAR,
  "isPublic" INTEGER NOT NULL,
  status VARCHAR NOT NULL,
  state TEXT NOT NULL,
  "turnDeadline" BIGINT,
  version INTEGER NOT NULL,
  result TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_GameRoom_status" ON "GameRoom" (game, status);
CREATE TABLE IF NOT EXISTS "GamePlayer" (
  id VARCHAR NOT NULL PRIMARY KEY,
  "roomId" VARCHAR NOT NULL REFERENCES "GameRoom" (id) ON DELETE CASCADE,
  "userId" VARCHAR NOT NULL REFERENCES "User" (id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  "pointsEarned" INTEGER NOT NULL,
  UNIQUE ("roomId", seat),
  UNIQUE ("roomId", "userId")
);
CREATE INDEX IF NOT EXISTS "ix_GamePlayer_userId" ON "GamePlayer" ("userId");
CREATE TABLE IF NOT EXISTS "GameScore" (
  "userId" VARCHAR NOT NULL PRIMARY KEY REFERENCES "User" (id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  draws INTEGER NOT NULL,
  played INTEGER NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_GameScore_points" ON "GameScore" (points DESC);
CREATE TABLE IF NOT EXISTS "ArcadeRun" (
  id VARCHAR NOT NULL PRIMARY KEY,
  "userId" VARCHAR NOT NULL REFERENCES "User" (id) ON DELETE CASCADE,
  game VARCHAR NOT NULL,
  score INTEGER NOT NULL,
  points INTEGER NOT NULL,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_ArcadeRun_userId_game_createdAt" ON "ArcadeRun" ("userId", game, "createdAt");
`

// Columns added after launch: [table, column, definition]. Existing rows get the default.
const ADDED_COLUMNS = [['LocalCar', 'vehicleType', `VARCHAR NOT NULL DEFAULT 'CAR'`]]

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
  db.exec(ADDED_TABLES)
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info("${table}")`).all().some((c) => c.name === column)
    if (!has) db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`)
  }
  // The demo accounts from the starter database had their passwords published, so on the live
  // server they can never sign in. They are deleted when the data moves to MySQL.
  if (config.isProd) {
    const ids = DEMO_USER_IDS.map(() => '?').join(', ')
    db.prepare(`UPDATE "User" SET status = 'BLOCKED', "updatedAt" = ? WHERE status != 'BLOCKED' AND id IN (${ids})`).run(Date.now(), ...DEMO_USER_IDS)
    db.prepare(`DELETE FROM "RefreshToken" WHERE "userId" IN (${ids})`).run(...DEMO_USER_IDS)
  }
  return db
}

/** The 14 demo accounts that came with the starter database (seed/gogoride.db). */
const DEMO_USER_IDS = [
  'cmua7ig2h00022qtjqg7pglpb',
  'cmua7ig2h000795zwi3b9r3f2',
  'cmua7ig2h0005cfxuwboi328e',
  'cmua7ig2h00030d5ia9e9j3el',
  'cmua7ig2h00069vaw2wu2otum',
  'cmua7ig2h00048d0r8drcpfl6',
  'cmua7ig2h000djv5ejr1983md',
  'cmua7ig2h000cny9i5kx90ffw',
  'cmua7ig2h0009bwu7ytsbe46m',
  'cmua7ig2h000b1pqoxik1f2di',
  'cmua7j6mi0005vvgmex8dlkq6',
  'cmua7ig2h000ay5ju49mm798z',
  'cmua7ig2h0008af67g99rwmsv',
  'cmua7ig2h00015xwt9nft5jh8',
]

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

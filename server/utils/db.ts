import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'

let database: DatabaseSync | undefined

export function useDatabase() {
  if (database) return database

  const path = resolve(process.cwd(), process.env.PCN_DB_PATH || 'data/pcn.db')
  mkdirSync(dirname(path), { recursive: true })
  database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  database.exec(readFileSync(resolve(process.cwd(), 'data/schema.sql'), 'utf8'))
  const tiPartColumns = database.prepare('PRAGMA table_info(ti_part)').all() as { name: string }[]
  if (!tiPartColumns.some((column) => column.name === 'industry')) {
    database.exec('ALTER TABLE ti_part ADD COLUMN industry TEXT')
  }
  seedAccount(database, 'PCN_ADMIN_USERNAME', 'PCN_ADMIN_PASSWORD', 'admin')
  seedAccount(database, 'PCN_OPERATOR_USERNAME', 'PCN_OPERATOR_PASSWORD', 'operator')
  return database
}

function seedAccount(db: DatabaseSync, usernameKey: string, passwordKey: string, role: 'operator' | 'admin') {
  const username = String(process.env[usernameKey] || '').trim()
  const password = String(process.env[passwordKey] || '')
  if (!username || !password) return
  const existing = db.prepare('SELECT id FROM app_user WHERE username = ?').get(username)
  if (existing) return
  const salt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync(password, salt, 64).toString('hex')
  db.prepare('INSERT INTO app_user(username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)')
    .run(username, passwordHash, salt, role)
}

export function all<T>(sql: string, ...params: any[]) {
  return useDatabase().prepare(sql).all(...params) as T[]
}

export function get<T>(sql: string, ...params: any[]) {
  return useDatabase().prepare(sql).get(...params) as T | undefined
}

export function run(sql: string, ...params: any[]) {
  return useDatabase().prepare(sql).run(...params)
}

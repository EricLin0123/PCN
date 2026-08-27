import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let database: DatabaseSync | undefined

export function useDatabase() {
  if (database) return database

  const path = resolve(process.cwd(), process.env.PCN_DB_PATH || 'data/pcn.db')
  mkdirSync(dirname(path), { recursive: true })
  database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  database.exec(readFileSync(resolve(process.cwd(), 'data/schema.sql'), 'utf8'))
  return database
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

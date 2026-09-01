#!/usr/bin/env node
/**
 * Transactionally import TI part ownership and SBE-1 champion contacts.
 *
 * This development migration is never called by the Nuxt application. SQLite
 * remains the runtime source of truth after the workbook data is imported.
 */

import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'

const root = resolve(import.meta.dirname, '..')
const { values } = parseArgs({
  options: {
    database: { type: 'string', default: resolve(root, 'data/pcn.db') },
    owners: { type: 'string', default: resolve(root, 'source of truth/Parts-SBE-1 owner.xlsx') },
    contacts: { type: 'string', default: resolve(root, 'source of truth/SBE-1 contact list.xlsx') }
  }
})

function clean(value) {
  if (value == null) return ''
  if (typeof value === 'object' && 'text' in value) return String(value.text || '').trim()
  return String(value).trim()
}

function normalized(value) {
  return clean(value).toUpperCase()
}

function headersFor(worksheet) {
  const headers = new Map()
  worksheet.getRow(1).eachCell((cell, column) => headers.set(clean(cell.value), column))
  return headers
}

function requireHeaders(headers, required, source) {
  const missing = required.filter(header => !headers.has(header))
  if (missing.length) throw new Error(`${source} is missing required headers: ${missing.join(', ')}`)
}

function emailFrom(value) {
  const hyperlink = value && typeof value === 'object' && 'hyperlink' in value ? clean(value.hyperlink) : ''
  const match = `${hyperlink} ${clean(value)}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0] || null
}

async function readOwners(path) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('Part ownership workbook has no worksheets')
  const headers = headersFor(worksheet)
  requireHeaders(headers, ['Material', 'SBE-1'], 'Part ownership workbook')
  const result = new Map()
  let blankPartRows = 0
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const displayPart = clean(row.getCell(headers.get('Material')).value)
    if (!displayPart) {
      blankPartRows++
      continue
    }
    const part = normalized(displayPart)
    const sbe1Name = normalized(row.getCell(headers.get('SBE-1')).value) || null
    const existing = result.get(part)
    if (existing && existing.sbe1Name !== sbe1Name) {
      throw new Error(`part ${part} has conflicting SBE-1 values at row ${rowNumber}`)
    }
    result.set(part, { displayPart, sbe1Name, sourceRow: rowNumber })
  }
  return { parts: result, blankPartRows }
}

async function readContacts(path) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('SBE-1 contact workbook has no worksheets')
  const headers = headersFor(worksheet)
  requireHeaders(headers, ['SBE-1', 'champion'], 'SBE-1 contact workbook')
  const result = new Map()
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const name = normalized(row.getCell(headers.get('SBE-1')).value)
    if (!name) continue
    const championEmail = emailFrom(row.getCell(headers.get('champion')).value)
    const existing = result.get(name)
    if (existing !== undefined && existing !== championEmail) {
      throw new Error(`SBE-1 ${name} has conflicting champion emails at row ${rowNumber}`)
    }
    result.set(name, championEmail)
  }
  return result
}

let database
try {
  const [{ parts, blankPartRows }, contacts] = await Promise.all([
    readOwners(resolve(values.owners)),
    readContacts(resolve(values.contacts))
  ])
  database = new DatabaseSync(resolve(values.database))
  database.exec('PRAGMA foreign_keys = ON')
  database.exec(readFileSync(resolve(root, 'data/schema.sql'), 'utf8'))
  database.exec('BEGIN IMMEDIATE')

  const existingPartCount = database.prepare('SELECT count(*) AS count FROM ti_part').get().count
  const upsertSbe1 = database.prepare(`INSERT INTO sbe1(name, champion_email) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET champion_email = excluded.champion_email`)
  const insertSbe1WithoutContact = database.prepare('INSERT OR IGNORE INTO sbe1(name, champion_email) VALUES (?, NULL)')
  const insertPart = database.prepare('INSERT OR IGNORE INTO ti_part(normalized_part_number, display_part_number) VALUES (?, ?)')
  const findPart = database.prepare('SELECT id FROM ti_part WHERE normalized_part_number = ?')
  const findSbe1 = database.prepare('SELECT id FROM sbe1 WHERE name = ?')
  const assignPart = database.prepare(`INSERT INTO ti_part_organization(
      ti_part_id, sbe_id, sbe1_id, sbe2_id, source_file, source_sheet, source_row
    ) VALUES (?, NULL, ?, NULL, ?, ?, ?)
    ON CONFLICT(ti_part_id) DO UPDATE SET
      sbe1_id = excluded.sbe1_id,
      source_file = excluded.source_file,
      source_sheet = excluded.source_sheet,
      source_row = excluded.source_row,
      updated_at = CURRENT_TIMESTAMP`)
  const clearPartAssignment = database.prepare(`UPDATE ti_part_organization
    SET sbe1_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE ti_part_id = ?`)

  for (const [name, championEmail] of contacts) upsertSbe1.run(name, championEmail)
  for (const { sbe1Name } of parts.values()) {
    if (sbe1Name) insertSbe1WithoutContact.run(sbe1Name)
  }
  for (const [part, { displayPart, sbe1Name, sourceRow }] of parts) {
    insertPart.run(part, displayPart)
    const partId = findPart.get(part).id
    if (!sbe1Name) {
      clearPartAssignment.run(partId)
      continue
    }
    assignPart.run(partId, findSbe1.get(sbe1Name).id, basename(values.owners), 'SBE-1 ownership', sourceRow)
  }

  database.exec('COMMIT')
  const report = {
    workbook_parts: parts.size,
    blank_part_rows: blankPartRows,
    parts_created: database.prepare('SELECT count(*) AS count FROM ti_part').get().count - existingPartCount,
    part_ownership_assignments: database.prepare('SELECT count(*) AS count FROM ti_part_organization WHERE sbe1_id IS NOT NULL').get().count,
    sbe1_groups: database.prepare('SELECT count(*) AS count FROM sbe1').get().count,
    groups_with_champion_email: database.prepare('SELECT count(*) AS count FROM sbe1 WHERE champion_email IS NOT NULL').get().count,
    owned_parts_without_champion_email: database.prepare(`SELECT count(*) AS count FROM ti_part_organization assignment
      JOIN sbe1 ON sbe1.id = assignment.sbe1_id WHERE sbe1.champion_email IS NULL`).get().count
  }
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  if (database?.isTransaction) database.exec('ROLLBACK')
  console.error(`SBE-1 import rolled back: ${error.message}`)
  process.exitCode = 1
} finally {
  database?.close()
}

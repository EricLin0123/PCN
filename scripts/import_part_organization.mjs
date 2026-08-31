#!/usr/bin/env node
/**
 * Stream SBE, SBE-1, and SBE-2 ownership from the Step 6 dashboard workbook.
 *
 * Only columns Q, R, S, and W of the selected worksheet are read. Repeated
 * dashboard rows collapse to a single organization tuple per normalized LPN.
 */

import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'

const root = resolve(import.meta.dirname, '..')
const defaultWorkbook = resolve(root, 'source of truth/DELTA group step6 ESD 0806_2026.xlsx')
const worksheetName = 'Step 6 Dashboard - Current Back'
const { values } = parseArgs({
  options: {
    database: { type: 'string', default: resolve(root, 'data/pcn.db') },
    workbook: { type: 'string', default: defaultWorkbook }
  }
})

function clean(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function normalized(value) {
  return clean(value)?.toUpperCase() || null
}

async function readOrganization(path) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore'
  })
  const parts = new Map()
  let sourceRows = 0
  let found = false

  for await (const worksheet of reader) {
    if (worksheet.name !== worksheetName) continue
    found = true
    for await (const row of worksheet) {
      if (row.number === 1) {
        const headers = [17, 18, 19, 23].map(column => normalized(row.getCell(column).text))
        if (headers.join('|') !== 'SBE|SBE-1|SBE-2|LPN') {
          throw new Error(`unexpected headers in ${worksheetName}: ${headers.join(', ')}`)
        }
        continue
      }
      sourceRows++
      const displayPart = clean(row.getCell(23).text)
      const part = normalized(displayPart)
      if (!part) continue
      const organization = {
        displayPart,
        sbe: normalized(row.getCell(17).text),
        sbe1: normalized(row.getCell(18).text),
        sbe2: normalized(row.getCell(19).text),
        sourceRow: row.number
      }
      const existing = parts.get(part)
      if (existing && (existing.sbe !== organization.sbe || existing.sbe1 !== organization.sbe1 || existing.sbe2 !== organization.sbe2)) {
        throw new Error(`conflicting organization values for ${part} at rows ${existing.sourceRow} and ${row.number}`)
      }
      if (!existing) parts.set(part, organization)
    }
    break
  }
  if (!found) throw new Error(`worksheet not found: ${worksheetName}`)
  return { parts, sourceRows }
}

let database
try {
  const workbookPath = resolve(values.workbook)
  const { parts, sourceRows } = await readOrganization(workbookPath)
  database = new DatabaseSync(resolve(values.database))
  database.exec('PRAGMA foreign_keys = ON')
  database.exec(readFileSync(resolve(root, 'data/schema.sql'), 'utf8'))
  database.exec('BEGIN IMMEDIATE')

  const partsBefore = database.prepare('SELECT count(*) AS count FROM ti_part').get().count
  const inferredBefore = database.prepare('SELECT count(*) AS count FROM ti_part_sbe1_inference').get().count
  const insertPart = database.prepare('INSERT OR IGNORE INTO ti_part(normalized_part_number, display_part_number) VALUES (?, ?)')
  const insertSbe = database.prepare('INSERT OR IGNORE INTO sbe(name) VALUES (?)')
  const insertSbe1 = database.prepare('INSERT OR IGNORE INTO sbe1(name, champion_email) VALUES (?, NULL)')
  const insertSbe2 = database.prepare('INSERT OR IGNORE INTO sbe2(name) VALUES (?)')
  const findPart = database.prepare('SELECT id FROM ti_part WHERE normalized_part_number = ?')
  const findSbe = database.prepare('SELECT id FROM sbe WHERE name = ?')
  const findSbe1 = database.prepare('SELECT id FROM sbe1 WHERE name = ?')
  const findSbe2 = database.prepare('SELECT id FROM sbe2 WHERE name = ?')
  const assignSbe1 = database.prepare(`INSERT INTO ti_part_sbe1(ti_part_id, sbe1_id) VALUES (?, ?)
    ON CONFLICT(ti_part_id) DO UPDATE SET sbe1_id = excluded.sbe1_id`)
  const clearSbe1 = database.prepare('DELETE FROM ti_part_sbe1 WHERE ti_part_id = ?')
  const clearInference = database.prepare('DELETE FROM ti_part_sbe1_inference WHERE ti_part_id = ?')
  const upsertOrganization = database.prepare(`INSERT INTO ti_part_organization(
      ti_part_id, sbe_id, sbe1_id, sbe2_id, source_file, source_sheet, source_row
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ti_part_id) DO UPDATE SET
      sbe_id = excluded.sbe_id,
      sbe1_id = excluded.sbe1_id,
      sbe2_id = excluded.sbe2_id,
      source_file = excluded.source_file,
      source_sheet = excluded.source_sheet,
      source_row = excluded.source_row,
      updated_at = CURRENT_TIMESTAMP`)

  for (const organization of parts.values()) {
    if (organization.sbe) insertSbe.run(organization.sbe)
    if (organization.sbe1) insertSbe1.run(organization.sbe1)
    if (organization.sbe2) insertSbe2.run(organization.sbe2)
  }

  for (const [part, organization] of parts) {
    insertPart.run(part, organization.displayPart)
    const partId = findPart.get(part).id
    const sbeId = organization.sbe ? findSbe.get(organization.sbe).id : null
    const sbe1Id = organization.sbe1 ? findSbe1.get(organization.sbe1).id : null
    const sbe2Id = organization.sbe2 ? findSbe2.get(organization.sbe2).id : null
    if (sbe1Id) assignSbe1.run(partId, sbe1Id)
    else clearSbe1.run(partId)
    clearInference.run(partId)
    upsertOrganization.run(partId, sbeId, sbe1Id, sbe2Id, basename(workbookPath), worksheetName, organization.sourceRow)
  }

  database.exec('COMMIT')
  console.log(JSON.stringify({
    source_rows: sourceRows,
    unique_parts: parts.size,
    parts_created: database.prepare('SELECT count(*) AS count FROM ti_part').get().count - partsBefore,
    organization_records: database.prepare('SELECT count(*) AS count FROM ti_part_organization').get().count,
    sbe_groups: database.prepare('SELECT count(*) AS count FROM sbe').get().count,
    sbe1_groups: database.prepare('SELECT count(*) AS count FROM sbe1').get().count,
    sbe2_groups: database.prepare('SELECT count(*) AS count FROM sbe2').get().count,
    inferred_assignments_replaced: inferredBefore - database.prepare('SELECT count(*) AS count FROM ti_part_sbe1_inference').get().count
  }, null, 2))
} catch (error) {
  if (database?.isTransaction) database.exec('ROLLBACK')
  console.error(`Part organization import rolled back: ${error.message}`)
  process.exitCode = 1
} finally {
  database?.close()
}

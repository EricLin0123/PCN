#!/usr/bin/env node

// One-time export for Delta to confirm TI's expected risk before upload.
// Usage: node scripts/export_delta_confirmation_pcn.mjs [output.xlsx]

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'

const databasePath = resolve(process.env.PCN_DB_PATH || 'data/pcn.db')
const outputPath = resolve(process.argv[2] || 'Delta-confirmation-PCNs.xlsx')

if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`)

const db = new DatabaseSync(databasePath)
try {
  db.exec('PRAGMA foreign_keys = ON')
  const rows = db.prepare(`
    SELECT
      p.pcn_number_base AS pcn_number,
      p.title AS pcn_title,
      COALESCE(ct.name, '') AS pcn_change_type,
      COALESCE((
        SELECT group_concat(parts.display_part_number, '; ')
        FROM (
          SELECT tp.display_part_number
          FROM pcn_ti_part link
          JOIN ti_part tp ON tp.id = link.ti_part_id
          WHERE link.pcn_id = p.id
          ORDER BY tp.normalized_part_number
        ) parts
      ), '') AS affected_parts,
      ops.expected_risk AS ti_risk_level
    FROM pcn p
    LEFT JOIN change_type ct ON ct.id = p.change_type_id
    JOIN pcn_operational_status ops ON ops.pcn_id = p.id
    JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id
    JOIN pcn_executive_status ex ON ex.pcn_id = p.id
    WHERE ex.executive_state IN ('MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD')
    ORDER BY
      CASE ex.executive_state
        WHEN 'MINOR_READY_UPLOAD' THEN 1
        WHEN 'MAJOR_BLOCKED_RA' THEN 2
        WHEN 'MAJOR_READY_UPLOAD' THEN 3
      END,
      p.pcn_number_base
  `).all()

  const expectedCounts = { MINOR_READY_UPLOAD: 76, MAJOR_BLOCKED_RA: 66, MAJOR_READY_UPLOAD: 3 }
  const actualCounts = db.prepare(`
    SELECT ex.executive_state AS state, count(*) AS count
    FROM pcn_executive_status ex
    WHERE ex.executive_state IN ('MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD')
    GROUP BY ex.executive_state
  `).all()
  const counts = Object.fromEntries(actualCounts.map(row => [row.state, Number(row.count)]))
  for (const [state, expected] of Object.entries(expectedCounts)) {
    if (counts[state] !== expected) throw new Error(`Expected ${expected} ${state}, found ${counts[state] || 0}`)
  }
  if (rows.length !== 145) throw new Error(`Expected 145 PCNs, found ${rows.length}`)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PCN Workbench'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Delta confirmation')
  sheet.columns = [
    { header: 'PCN number', key: 'pcn_number', width: 16 },
    { header: 'PCN title', key: 'pcn_title', width: 48 },
    { header: 'PCN change type', key: 'pcn_change_type', width: 24 },
    { header: 'Affected parts', key: 'affected_parts', width: 55 },
    { header: "TI's risk level", key: 'ti_risk_level', width: 18 },
    { header: 'Delta confirmation', key: 'delta_confirmation', width: 24 }
  ]
  sheet.addRows(rows.map(row => ({ ...row, delta_confirmation: '' })))
  sheet.addTable({
    name: 'DeltaConfirmationPCNs',
    ref: 'A1:F146',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: sheet.columns.map(column => ({ name: column.header })),
    rows: rows.map(row => [row.pcn_number, row.pcn_title, row.pcn_change_type, row.affected_parts, row.ti_risk_level, ''])
  })
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true }
  })
  sheet.freezePanes = 'A2'
  sheet.autoFilter = 'A1:F146'
  await workbook.xlsx.writeFile(outputPath)
  console.log(`Created ${outputPath} with ${rows.length} PCNs.`)
} finally {
  db.close()
}

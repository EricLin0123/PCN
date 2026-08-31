import ExcelJS from 'exceljs'
import { DatabaseSync } from 'node:sqlite'
import { basename, resolve } from 'node:path'

const workbookPath = resolve(process.argv[2] || 'source of truth/DELTA group step6 ESD 0806_2026.xlsx')
const databasePath = resolve(process.env.PCN_DB_PATH || 'data/pcn.db')
const sheetName = 'Step 6 Dashboard - Current Back'
const normalizePart = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(workbookPath)
const sheet = workbook.getWorksheet(sheetName)
if (!sheet) throw new Error(`Worksheet not found: ${sheetName}`)

const expectedHeaders = new Map([
  [6, 'Material'],
  [12, 'NR (NETTOTI)'],
  [13, 'Month'],
])
for (const [column, expectedHeader] of expectedHeaders) {
  const actualHeader = String(sheet.getCell(1, column).value ?? '').trim()
  if (actualHeader !== expectedHeader) {
    throw new Error(`Expected ${expectedHeader} in column ${column}, found ${actualHeader || '(blank)'}`)
  }
}

const values = new Map()
let visibleRowCount = 0
for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
  const row = sheet.getRow(rowNumber)
  // The saved Excel filter defines the authoritative Current Back table.
  // Hidden rows are intentionally excluded from Delta's visible product set.
  if (row.hidden) continue
  visibleRowCount++
  const displayPart = String(row.getCell(6).value ?? '').trim()
  const normalizedPart = normalizePart(displayPart)
  const month = String(row.getCell(13).value ?? '').trim()
  const rawRevenue = row.getCell(12).value
  const netRevenue = typeof rawRevenue === 'number' ? rawRevenue : Number(rawRevenue)
  if (!normalizedPart || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(netRevenue)) {
    throw new Error(`Invalid material, month, or NR at worksheet row ${rowNumber}`)
  }
  const key = `${normalizedPart}\0${month}`
  const existing = values.get(key)
  values.set(key, {
    normalizedPart,
    displayPart: existing?.displayPart || displayPart,
    month,
    netRevenue: (existing?.netRevenue || 0) + netRevenue,
  })
}

const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
database.exec(`
  CREATE TABLE IF NOT EXISTS material_month_revenue (
    normalized_part_number TEXT NOT NULL,
    display_part_number TEXT NOT NULL,
    revenue_month TEXT NOT NULL CHECK (revenue_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    net_revenue REAL NOT NULL,
    source_file TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (normalized_part_number, revenue_month)
  );
  CREATE INDEX IF NOT EXISTS idx_material_month_revenue_month ON material_month_revenue(revenue_month);
`)
const insert = database.prepare(`
  INSERT INTO material_month_revenue (
    normalized_part_number, display_part_number, revenue_month, net_revenue, source_file, source_sheet
  ) VALUES (?, ?, ?, ?, ?, ?)
`)
database.exec('BEGIN IMMEDIATE')
try {
  database.prepare('DELETE FROM material_month_revenue').run()
  for (const value of values.values()) {
    insert.run(value.normalizedPart, value.displayPart, value.month, value.netRevenue, basename(workbookPath), sheetName)
  }
  database.exec('COMMIT')
} catch (error) {
  database.exec('ROLLBACK')
  throw error
}
console.log(`Imported ${values.size} material-month revenue totals from ${visibleRowCount} visible worksheet rows.`)

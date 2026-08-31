import { DatabaseSync } from 'node:sqlite'
import { basename, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const root = resolve(import.meta.dirname, '..')
const workbookPath = resolve(process.argv[2] || resolve(root, 'source of truth/TexasPN_20260827.xlsx'))
const databasePath = resolve(process.argv[3] || resolve(root, 'data/pcn.db'))
const normalize = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(workbookPath)
const sheet = workbook.getWorksheet('Format') || workbook.worksheets[0]
if (!sheet) throw new Error('Mapping workbook has no worksheets')

const mappings = []
const deltaRows = new Map()
for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
  const row = sheet.getRow(rowNumber)
  const deltaDisplay = row.getCell(1).text.trim()
  const tiDisplay = row.getCell(5).text.trim()
  const deltaNormalized = normalize(deltaDisplay)
  const tiNormalized = normalize(tiDisplay)
  if (!deltaNormalized && !tiNormalized) continue
  if (!deltaNormalized || !tiNormalized) throw new Error(`Incomplete mapping at row ${rowNumber}`)
  const previous = deltaRows.get(deltaNormalized)
  if (previous && previous.tiNormalized !== tiNormalized) {
    throw new Error(`Conflicting TI mappings for ${deltaDisplay} at rows ${previous.rowNumber} and ${rowNumber}`)
  }
  if (previous) continue
  const mapping = { deltaDisplay, deltaNormalized, tiDisplay, tiNormalized, rowNumber }
  deltaRows.set(deltaNormalized, mapping)
  mappings.push(mapping)
}

const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
database.exec(`
  CREATE TABLE IF NOT EXISTS delta_ti_part_mapping (
    delta_part_id INTEGER PRIMARY KEY REFERENCES delta_part(id) ON DELETE CASCADE,
    ti_part_id INTEGER NOT NULL REFERENCES ti_part(id),
    source_file TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_delta_ti_mapping_ti_part ON delta_ti_part_mapping(ti_part_id);
`)

const insertTi = database.prepare('INSERT OR IGNORE INTO ti_part(normalized_part_number, display_part_number) VALUES (?, ?)')
const insertDelta = database.prepare('INSERT OR IGNORE INTO delta_part(normalized_part_number, display_part_number) VALUES (?, ?)')
const getTi = database.prepare('SELECT id FROM ti_part WHERE normalized_part_number = ?')
const getDelta = database.prepare('SELECT id FROM delta_part WHERE normalized_part_number = ?')
const insertMapping = database.prepare(`
  INSERT INTO delta_ti_part_mapping(delta_part_id, ti_part_id, source_file, source_sheet, source_row)
  VALUES (?, ?, ?, ?, ?)
`)

database.exec('BEGIN IMMEDIATE')
try {
  database.exec('DELETE FROM delta_ti_part_mapping')
  for (const mapping of mappings) {
    insertTi.run(mapping.tiNormalized, mapping.tiDisplay)
    insertDelta.run(mapping.deltaNormalized, mapping.deltaDisplay)
    const tiId = getTi.get(mapping.tiNormalized).id
    const deltaId = getDelta.get(mapping.deltaNormalized).id
    insertMapping.run(deltaId, tiId, basename(workbookPath), sheet.name, mapping.rowNumber)
  }
  database.exec('COMMIT')
} catch (error) {
  database.exec('ROLLBACK')
  throw error
}

const imported = database.prepare('SELECT count(*) AS count FROM delta_ti_part_mapping').get().count
const missing = database.prepare(`
  SELECT count(*) AS count
  FROM delta_ti_part_mapping mapping
  LEFT JOIN delta_part dp ON dp.id = mapping.delta_part_id
  LEFT JOIN ti_part tp ON tp.id = mapping.ti_part_id
  WHERE dp.id IS NULL OR tp.id IS NULL
`).get().count
console.log(JSON.stringify({ workbook: basename(workbookPath), sheet: sheet.name, imported, missing }, null, 2))
database.close()

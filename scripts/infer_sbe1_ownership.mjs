#!/usr/bin/env node
/**
 * Infer missing SBE-1 ownership from TI product-family naming.
 *
 * Candidate families come from "Products Supported" in BU contact list.XLSX.
 * A candidate is accepted only when its part-number prefix is also associated
 * exclusively with the same SBE-1 among existing authoritative assignments.
 * Existing ti_part_sbe1 rows are never updated.
 */

import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'

const root = resolve(import.meta.dirname, '..')
const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    database: { type: 'string', default: resolve(root, 'data/pcn.db') },
    reference: { type: 'string', default: resolve(root, 'source of truth/BU contact list.XLSX') }
  }
})

// These prefixes are transcribed from the workbook's Products Supported rows.
// Broad or overlapping descriptions (for example INA, LM, and TPS) are omitted
// unless the workbook supplies a more specific family prefix.
const familyRules = {
  CONNECT: [/^(CC|WL18|RF43)/],
  MSP: [/^(MSP|TM4C)/],
  ASM: [/^(F28|TMS320F28)/],
  PROCESSORS: [/^(AM(?=\d)(?!26C|26LS|26LV)|TDA|DRA|TMS320[CD]|66AK|AWR|IWR|TCI|DM6|DM8)/],
  INT: [/^(SN74|CD74|CD40|TS3|TS5|TS12|TMUX|MUX|TPD|TVS|ESD|ISO7|TXB|TXS|TXU|PCA|TCA|TCAL|TUSB|TLIN|SN65|MAX)/],
  SENSING: [/^(TMP|LMT|HDC|OPT[3489]|TPR|LMP9[13]|TMCS|DRV[45]|PGA4[156]|TDC|TUSS|LDC|FDC)/],
  MD: [/^(DRV(8|9|10|32|83|7)|MCF83|MCT83|MCP)/],
  DCC: [/^(ADS|ADC|DAC|AFE|DDC|VSP|LMX|LMK|CDC|DS90|DP83|ISO[12]|AMC)/],
  LAMPS: [/^(OPA|THS|LMC|LMV[37]|TL0|OP07)/],
  AUDIO: [/^(TPA|TAS|PCM|AIC)/],
  SR: [/^(LMR|LMZ|TPS54|TPS53|TPS56|TPS62|TPS61|TPS63|LM515|LM512|LM517|LM6|LM536|LM516)/],
  IPP: [/^(TPS659|TPS669|TPS257|TPS258|TPS254|TPS251|TPS23[78]|LP87|CSD9)/],
  LED: [/^(TPS92|TLC6C)/],
  LP: [/^(TPS7|TLV7|LP29|LP3|LP59|REF|TL43|ATL43|LM40|LMV43|TPS38|TPS37|TPS36|TPS35|TPS34|TPS32|TPS24|TPS25|TPS26|TPS16|TPS168|LM50|LM74|LM505|TPS241|TPS212|TPS211|TPS22|TPS20|UA7|UA78|LM1117|LM317|LM2937|MC7)/],
  HVP: [/^(UCC|UC(?!D)|UCD|LMG|CSD[125678]|SN650|SN665|ISO5)/],
  BMS: [/^BQ(?!320)/]
}

const referenceLabels = {
  'LINEAR AMPLIFIERS': 'LAMPS',
  AUDIO: 'AUDIO',
  'DATA CONVERTERS': 'DCC',
  DCC: 'DCC',
  'INTERFACE PRODUCTS': 'INT',
  SENSING: 'SENSING',
  'MOTOR DRIVE': 'MD',
  'SWITCHING REGULATORS': 'SR',
  'INTERFACE & PROCESSOR POWER': 'IPP',
  'LED DRIVERS': 'LED',
  'LINEAR POWER': 'LP',
  'HIGH VOLTAGE POWER': 'HVP',
  'BATTERY MANAGEMENT SOLUTIONS': 'BMS',
  CONNECTIVITY: 'CONNECT',
  MSP: 'MSP',
  ASM: 'ASM',
  PROCESSORS: 'PROCESSORS'
}

function text(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text || '')
    if ('richText' in value) return value.richText.map(item => item.text).join('')
  }
  return String(value)
}

async function referenceSbe1Names(path) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const found = new Set()
  for (const worksheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber)
      const label = text(row.getCell(1).value).trim().toUpperCase()
      if (label !== 'SBE-1' && label !== 'BUSINESS UNIT') continue
      for (let column = 2; column <= worksheet.columnCount; column++) {
        const value = text(row.getCell(column).value).trim().toUpperCase()
        for (const [referenceLabel, sbe1] of Object.entries(referenceLabels)) {
          if (value.startsWith(referenceLabel)) found.add(sbe1)
        }
      }
    }
  }
  return found
}

function familyCandidates(part) {
  return Object.entries(familyRules)
    .filter(([, patterns]) => patterns.some(pattern => pattern.test(part)))
    .map(([sbe1]) => sbe1)
}

function prefixKeys(part) {
  const match = part.match(/^([A-Z]+)(\d+)/)
  if (!match) return []
  const letters = match[1]
  const digits = match[2]
  return [...new Set([
    letters,
    letters + digits.slice(0, 1),
    letters + digits.slice(0, 2),
    letters + digits.slice(0, 3),
    letters + digits.slice(0, 4)
  ])].filter(prefix => prefix.length >= 3)
}

function infer(part, learnedPrefixes) {
  const candidates = familyCandidates(part)
  if (candidates.length !== 1) return null
  const candidate = candidates[0]
  const prefixes = prefixKeys(part)
    .filter(prefix => learnedPrefixes.has(prefix))
    .sort((left, right) => right.length - left.length)
  for (const prefix of prefixes) {
    const evidence = learnedPrefixes.get(prefix)
    const total = [...evidence.values()].reduce((sum, count) => sum + count, 0)
    if (evidence.get(candidate) === total) return { sbe1: candidate, prefix, evidence: total }
    if (prefix.length >= 4) return null
  }
  return null
}

let database
try {
  const referenceNames = await referenceSbe1Names(resolve(values.reference))
  const missingReferenceNames = Object.keys(familyRules).filter(name => !referenceNames.has(name))
  if (missingReferenceNames.length) {
    throw new Error(`BU reference is missing expected SBE-1 groups: ${missingReferenceNames.join(', ')}`)
  }

  database = new DatabaseSync(resolve(values.database))
  database.exec('PRAGMA foreign_keys = ON')
  if (values.apply) database.exec(readFileSync(resolve(root, 'data/schema.sql'), 'utf8'))
  const hasInferenceAudit = Boolean(database.prepare(`SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'ti_part_sbe1_inference'`).get())
  const authoritativeClause = hasInferenceAudit
    ? `LEFT JOIN ti_part_sbe1_inference inference ON inference.ti_part_id = tp.id
       WHERE inference.ti_part_id IS NULL`
    : ''
  const assigned = database.prepare(`SELECT tp.normalized_part_number AS part, sbe1.name AS sbe1
    FROM ti_part tp
    JOIN ti_part_sbe1 assignment ON assignment.ti_part_id = tp.id
    JOIN sbe1 ON sbe1.id = assignment.sbe1_id
    ${authoritativeClause}`).all()
  const missing = database.prepare(`SELECT tp.id, tp.normalized_part_number AS part
    FROM ti_part tp
    LEFT JOIN ti_part_sbe1 assignment ON assignment.ti_part_id = tp.id
    WHERE assignment.ti_part_id IS NULL`).all()

  const learnedPrefixes = new Map()
  for (const { part, sbe1 } of assigned) {
    for (const prefix of prefixKeys(part)) {
      if (!learnedPrefixes.has(prefix)) learnedPrefixes.set(prefix, new Map())
      const evidence = learnedPrefixes.get(prefix)
      evidence.set(sbe1, (evidence.get(sbe1) || 0) + 1)
    }
  }

  const inferred = missing
    .map(item => ({ ...item, inference: infer(item.part, learnedPrefixes) }))
    .filter(item => item.inference)
  const counts = {}
  for (const { inference } of inferred) counts[inference.sbe1] = (counts[inference.sbe1] || 0) + 1

  if (values.apply) {
    database.exec('BEGIN IMMEDIATE')
    const sbe1Ids = new Map(database.prepare('SELECT name, id FROM sbe1').all().map(row => [row.name, row.id]))
    const insert = database.prepare('INSERT OR IGNORE INTO ti_part_sbe1(ti_part_id, sbe1_id) VALUES (?, ?)')
    const audit = database.prepare(`INSERT INTO ti_part_sbe1_inference(
      ti_part_id, sbe1_id, reference_file, matched_prefix, evidence_count
    ) VALUES (?, ?, ?, ?, ?)`)
    for (const { id, inference } of inferred) {
      const sbe1Id = sbe1Ids.get(inference.sbe1)
      const result = insert.run(id, sbe1Id)
      if (result.changes) audit.run(id, sbe1Id, basename(values.reference), inference.prefix, inference.evidence)
    }
    database.exec('COMMIT')
  }

  console.log(JSON.stringify({
    mode: values.apply ? 'applied' : 'dry-run',
    previously_assigned: assigned.length,
    previously_missing: missing.length,
    inferred: inferred.length,
    remaining_unassigned: missing.length - inferred.length,
    inferred_by_sbe1: counts
  }, null, 2))
} catch (error) {
  if (database?.isTransaction) database.exec('ROLLBACK')
  console.error(`SBE-1 inference rolled back: ${error.message}`)
  process.exitCode = 1
} finally {
  database?.close()
}

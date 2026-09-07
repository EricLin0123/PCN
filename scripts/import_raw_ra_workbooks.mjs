import { copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const rawRoot = path.join(projectRoot, 'RA', 'RAW-RA')
const databasePath = path.resolve(process.env.PCN_DB_PATH || path.join(projectRoot, 'data', 'pcn.db'))
const commit = process.argv.includes('--commit')
const summaryOnly = process.argv.includes('--summary-only')

function cellText(cell) {
  const value = cell.value
  if (value == null) return ''
  if (typeof value !== 'object') return String(value).trim()
  if ('result' in value) return String(value.result ?? '').trim()
  if ('text' in value) return String(value.text ?? '').trim()
  if ('richText' in value) return value.richText.map((run) => run.text).join('').trim()
  return ''
}

function squash(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function editDistanceAtMostOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false
  if (left === right) return true
  let leftIndex = 0
  let rightIndex = 0
  let edits = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++
      rightIndex++
      continue
    }
    if (++edits > 1) return false
    if (left.length > right.length) leftIndex++
    else if (right.length > left.length) rightIndex++
    else {
      leftIndex++
      rightIndex++
    }
  }
  return true
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'others' || entry.name === '.DS_Store' || entry.name.startsWith('~$')) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath))
    else if (/\.xlsx$/i.test(entry.name)) files.push(fullPath)
  }
  return files
}

function worksheetEvidence(worksheet, relativePath) {
  const pcns = new Set()
  const vendorTexts = []
  const allTexts = []
  let hasVendorLabel = false

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = []
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const text = cellText(cell)
      if (!text) return
      values.push({ columnNumber, text })
      allTexts.push(text)
      for (const match of text.matchAll(/(?<!\d)20\d{9}(?!\d)/g)) pcns.add(match[0])
    })
    for (const value of values) {
      if (!/vendor\s*p\s*\/?\s*n/i.test(value.text)) continue
      hasVendorLabel = true
      for (const candidate of values) {
        if (candidate.columnNumber > value.columnNumber) vendorTexts.push(candidate.text)
      }
    }
  })

  const identityText = `${relativePath}\n${worksheet.name}`
  for (const match of identityText.matchAll(/(?<!\d)20\d{9}(?!\d)/g)) pcns.add(match[0])
  return { pcns: [...pcns], vendorTexts, allTexts, hasVendorLabel }
}

const database = new DatabaseSync(databasePath, { readOnly: true })
database.exec('PRAGMA foreign_keys = ON')

const partRows = database.prepare(`
  SELECT part.id, part.normalized_part_number, part.display_part_number,
    pcn.id AS pcn_id, pcn.pcn_number_base
  FROM pcn_ti_part affected
  JOIN ti_part part ON part.id = affected.ti_part_id
  JOIN pcn ON pcn.id = affected.pcn_id
`).all()
const pcnsByBase = new Map()
const partsByPcn = new Map()
const allParts = new Map()
for (const row of partRows) {
  pcnsByBase.set(row.pcn_number_base, row.pcn_id)
  if (!partsByPcn.has(row.pcn_number_base)) partsByPcn.set(row.pcn_number_base, [])
  const part = {
    id: row.id,
    normalized: row.normalized_part_number,
    display: row.display_part_number,
    squashed: squash(row.normalized_part_number)
  }
  partsByPcn.get(row.pcn_number_base).push(part)
  allParts.set(row.id, part)
}

function matchingParts(parts, evidence) {
  const haystacks = [...evidence.vendorTexts, evidence.hasVendorLabel ? '' : evidence.allTexts.join('\n')]
    .map(squash)
    .filter(Boolean)
  const matches = parts.filter((part) => part.squashed.length >= 5 && haystacks.some((text) => text.includes(part.squashed)))
  return matches.filter((part) => !matches.some((other) =>
    other.id !== part.id && other.squashed.length > part.squashed.length && other.squashed.includes(part.squashed)
  ))
}

function fuzzyMatchingParts(parts, evidence) {
  const tokens = evidence.vendorTexts.flatMap((text) => text.split(/[\s,;&]+/)).map(squash).filter(Boolean)
  return parts.filter((part) => tokens.some((token) => editDistanceAtMostOne(part.squashed, token)))
}

const records = []
const unresolved = []
const ignoredSheets = []
const files = (await filesUnder(rawRoot)).sort()

for (const filename of files) {
  const relativePath = path.relative(projectRoot, filename)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filename)
  const workbookPartPcns = new Map()
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const texts = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = cellText(cell)
        if (text) texts.push(text)
      })
      const rowText = texts.join(' ')
      const bases = [...rowText.matchAll(/(?<!\d)20\d{9}(?!\d)/g)].map((match) => match[0])
        .filter((base) => pcnsByBase.has(base))
      if (bases.length !== 1) return
      for (const part of allParts.values()) {
        if (part.squashed.length >= 5 && texts.some((text) => squash(text) === part.squashed)) {
          workbookPartPcns.set(part.squashed, bases[0])
        }
      }
    })
  }
  for (const [index, worksheet] of workbook.worksheets.entries()) {
    const evidence = worksheetEvidence(worksheet, relativePath)
    if (!evidence.hasVendorLabel || /^example$/i.test(worksheet.name.trim())) {
      ignoredSheets.push(`${relativePath}#${worksheet.name}`)
      continue
    }

    for (const vendorText of evidence.vendorTexts) {
      const indexedPcn = workbookPartPcns.get(squash(vendorText))
      if (indexedPcn && !evidence.pcns.includes(indexedPcn)) evidence.pcns.push(indexedPcn)
    }

    const knownPcns = evidence.pcns.filter((base) => pcnsByBase.has(base))
    const scored = knownPcns.map((base) => ({ base, parts: matchingParts(partsByPcn.get(base), evidence) }))
    scored.sort((left, right) => right.parts.length - left.parts.length)
    let selected = scored[0]

    if (selected && selected.parts.length === 0 && knownPcns.length === 1) {
      selected.parts = fuzzyMatchingParts(partsByPcn.get(selected.base), evidence)
    }

    if (!selected || selected.parts.length === 0) {
      const broadMatches = matchingParts([...allParts.values()], evidence)
      const inferred = new Map()
      for (const row of partRows) {
        if (!broadMatches.some((part) => part.id === row.id)) continue
        if (!inferred.has(row.pcn_number_base)) inferred.set(row.pcn_number_base, [])
        inferred.get(row.pcn_number_base).push(allParts.get(row.id))
      }
      const candidates = [...inferred].map(([base, parts]) => ({ base, parts }))
        .sort((left, right) => right.parts.length - left.parts.length)
      if (candidates.length && (!candidates[1] || candidates[0].parts.length > candidates[1].parts.length)) selected = candidates[0]
    }

    if (!selected || selected.parts.length === 0) {
      unresolved.push({ workbook: relativePath, sheet: worksheet.name, pcns: evidence.pcns, vendor: evidence.vendorTexts })
      continue
    }

    records.push({
      raNumber: `RAW:${path.relative(rawRoot, filename)}#${worksheet.name}`,
      pcnId: pcnsByBase.get(selected.base),
      pcnBase: selected.base,
      workbook: relativePath,
      sourceRow: index + 1,
      sheet: worksheet.name,
      parts: [...new Map(selected.parts.map((part) => [part.id, part])).values()]
    })
  }
}

const duplicateNumbers = records.filter((record, index) => records.findIndex((item) => item.raNumber === record.raNumber) !== index)
if (duplicateNumbers.length) throw new Error(`Duplicate RA identities: ${duplicateNumbers.map((record) => record.raNumber).join(', ')}`)

const summary = {
  mode: commit ? 'commit' : 'dry-run',
  workbooksScanned: files.length,
  riskAssessments: records.length,
  partLinks: records.reduce((sum, record) => sum + record.parts.length, 0),
  uniqueParts: new Set(records.flatMap((record) => record.parts.map((part) => part.id))).size,
  pcnBases: new Set(records.map((record) => record.pcnBase)).size,
  ignoredNonRaSheets: ignoredSheets.length,
  unresolvedSheets: unresolved.length
}

if (commit) {
  const backupPath = path.join('/tmp', `pcn-before-raw-ra-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  database.close()
  await copyFile(databasePath, backupPath)
  const writable = new DatabaseSync(databasePath)
  writable.exec('PRAGMA foreign_keys = ON')
  const insertRa = writable.prepare(`
    INSERT INTO risk_assessment(ra_number, pcn_id, pcn_number_base, workbook_filename, source_row)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertLink = writable.prepare(`
    INSERT INTO risk_assessment_ti_part(risk_assessment_id, ti_part_id) VALUES (?, ?)
  `)
  writable.exec('BEGIN IMMEDIATE')
  try {
    writable.prepare('DELETE FROM risk_assessment').run()
    for (const record of records) {
      const result = insertRa.run(record.raNumber, record.pcnId, record.pcnBase, record.workbook, record.sourceRow)
      for (const part of record.parts) insertLink.run(result.lastInsertRowid, part.id)
    }
    writable.exec('COMMIT')
  } catch (error) {
    writable.exec('ROLLBACK')
    throw error
  }
  const integrity = writable.prepare('PRAGMA integrity_check').get().integrity_check
  summary.backup = backupPath
  summary.integrityCheck = integrity
  summary.databaseRiskAssessments = writable.prepare('SELECT count(*) AS count FROM risk_assessment').get().count
  summary.databasePartLinks = writable.prepare('SELECT count(*) AS count FROM risk_assessment_ti_part').get().count
  writable.close()
} else {
  database.close()
}

console.log(JSON.stringify(summaryOnly ? { summary, unresolved } : { summary, unresolved, records: records.map((record) => ({
  workbook: record.workbook,
  sheet: record.sheet,
  pcn: record.pcnBase,
  parts: record.parts.map((part) => part.display)
})) }, null, 2))

if (unresolved.length) process.exitCode = 2

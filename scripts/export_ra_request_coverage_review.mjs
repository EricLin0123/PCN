import ExcelJS from 'exceljs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

const database = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const asOfMonth = database.prepare("SELECT strftime('%Y-%m', 'now', 'localtime') AS month").get().month
const fromMonth = database.prepare("SELECT strftime('%Y-%m', 'now', 'localtime', '-11 months') AS month").get().month
const output = resolve(`Delta_Major_PCN_RA_Comparison_${asOfMonth}.xlsx`)

// Keep this RA eligibility logic aligned with server/utils/pendingDocuments.ts.
const pendingRows = database.prepare(`
  WITH eligible AS (
    SELECT DISTINCT affected.pcn_id, affected.ti_part_id, organization.sbe1_id
    FROM pcn_ti_part affected
    JOIN ti_part part ON part.id = affected.ti_part_id
    JOIN ti_part_organization organization ON organization.ti_part_id = part.id
    JOIN material_month_revenue revenue ON revenue.normalized_part_number = part.normalized_part_number
    WHERE revenue.revenue_month BETWEEN ? AND ?
  )
  SELECT eligible.pcn_id, eligible.ti_part_id, pcn.pcn_number_base,
    pcn.notification_date, pcn.title, risk.expected_risk, risk.risk_source,
    part.display_part_number, part.normalized_part_number,
    sbe.name AS sbe, sbe1.name AS sbe1, sbe2.name AS sbe2,
    COALESCE(sbe1.champion_email, '') AS champion_email,
    (SELECT SUM(revenue.net_revenue)
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = part.normalized_part_number
        AND revenue.revenue_month BETWEEN ? AND ?) AS trailing_12m_revenue,
    CASE WHEN EXISTS (
      SELECT 1 FROM delta_ti_part_mapping mapping WHERE mapping.ti_part_id = part.id
    ) THEN 'YES' ELSE 'NO' END AS has_delta_material_mapping
  FROM eligible
  JOIN pcn_expected_risk risk ON risk.pcn_id = eligible.pcn_id
  JOIN pcn ON pcn.id = eligible.pcn_id
  JOIN ti_part part ON part.id = eligible.ti_part_id
  JOIN ti_part_organization organization ON organization.ti_part_id = part.id
  JOIN sbe ON sbe.id = organization.sbe_id
  JOIN sbe1 ON sbe1.id = organization.sbe1_id
  JOIN sbe2 ON sbe2.id = organization.sbe2_id
  WHERE risk.expected_risk IN ('MAJOR', 'MAJOR_D')
    AND NOT EXISTS (
      SELECT 1 FROM risk_assessment assessment
      JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
      WHERE assessment.pcn_id = eligible.pcn_id AND link.ti_part_id = eligible.ti_part_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM delta_form form
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE form.delta_pcn_number_base = pcn.pcn_number_base
        AND mapping.ti_part_id = eligible.ti_part_id
    )
  ORDER BY sbe1.name, part.normalized_part_number, pcn.pcn_number_base
`).all(fromMonth, asOfMonth, fromMonth, asOfMonth)

const byPart = new Map()
for (const row of pendingRows) {
  if (!byPart.has(row.ti_part_id)) byPart.set(row.ti_part_id, [])
  byPart.get(row.ti_part_id).push(row)
}

const uniqueLines = values => [...new Set(values.filter(value => value !== '' && value != null))].sort().join('\n')
const emailRows = [...byPart.values()].map(rows => {
  const first = rows[0]
  return {
    sbe: first.sbe,
    sbe1: first.sbe1,
    sbe2: first.sbe2,
    championEmail: first.champion_email,
    partNumber: first.display_part_number,
    trailingRevenue: Number(first.trailing_12m_revenue || 0),
    pendingPcnCount: rows.length,
    pendingPcns: uniqueLines(rows.map(row => row.pcn_number_base)),
    notificationDates: uniqueLines(rows.map(row => `${row.pcn_number_base}: ${row.notification_date || '—'}`)),
    pcnTitles: uniqueLines(rows.map(row => `${row.pcn_number_base}: ${row.title || '—'}`)),
    expectedRisks: uniqueLines(rows.map(row => row.expected_risk)),
    riskSources: uniqueLines(rows.map(row => row.risk_source)),
    hasDeltaMaterialMapping: first.has_delta_material_mapping,
    deltaMappingNote: first.has_delta_material_mapping === 'YES'
      ? 'Mapping exists; not used for eligibility'
      : 'No mapping; still eligible under business logic',
    raStatus: 'MISSING',
    emailAction: 'EMAIL SBE-1'
  }
}).sort((left, right) => left.sbe1.localeCompare(right.sbe1) || left.partNumber.localeCompare(right.partNumber))

const sbe1Totals = [...new Set(emailRows.map(row => row.sbe1))].sort().map(sbe1 => ({
  sbe1,
  championEmail: emailRows.find(row => row.sbe1 === sbe1)?.championEmail || '',
  pendingRaParts: emailRows.filter(row => row.sbe1 === sbe1).length,
  pendingPcnPartLinks: emailRows.filter(row => row.sbe1 === sbe1)
    .reduce((sum, row) => sum + row.pendingPcnCount, 0)
}))
const sbe1PendingPartTotal = sbe1Totals.reduce((sum, row) => sum + row.pendingRaParts, 0)

const mappedRaRows = database.prepare(`
  SELECT assessment.pcn_id, link.ti_part_id, pcn.pcn_number_base,
    pcn.notification_date, pcn.title, risk.expected_risk,
    part.display_part_number, part.normalized_part_number,
    COALESCE(sbe1.name, '') AS sbe1,
    assessment.ra_number, assessment.workbook_filename, assessment.source_row,
    COALESCE((SELECT SUM(revenue.net_revenue)
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = part.normalized_part_number
        AND revenue.revenue_month BETWEEN ? AND ?), 0) AS trailing_12m_revenue,
    CASE WHEN EXISTS (
      SELECT 1 FROM delta_form form
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE form.delta_pcn_number_base = pcn.pcn_number_base
        AND mapping.ti_part_id = part.id
    ) THEN 'YES' ELSE 'NO' END AS uploaded_to_delta
  FROM risk_assessment assessment
  JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
  JOIN pcn ON pcn.id = assessment.pcn_id
  JOIN ti_part part ON part.id = link.ti_part_id
  JOIN pcn_expected_risk risk ON risk.pcn_id = pcn.id
  LEFT JOIN ti_part_organization organization ON organization.ti_part_id = part.id
  LEFT JOIN sbe1 ON sbe1.id = organization.sbe1_id
  ORDER BY part.normalized_part_number, pcn.pcn_number_base, assessment.ra_number
`).all(fromMonth, asOfMonth)

const mappedByPcnPart = new Map()
for (const row of mappedRaRows) {
  const key = `${row.pcn_id}:${row.ti_part_id}`
  if (!mappedByPcnPart.has(key)) mappedByPcnPart.set(key, [])
  mappedByPcnPart.get(key).push(row)
}

const sharingReviewRows = [
  ...pendingRows.map(row => ({
    normalizedPart: row.normalized_part_number,
    partNumber: row.display_part_number,
    raStatus: 'MISSING RA',
    sbe1: row.sbe1,
    pcnNumber: row.pcn_number_base,
    expectedRisk: row.expected_risk,
    notificationDate: row.notification_date || '',
    pcnTitle: row.title,
    trailingRevenue: Number(row.trailing_12m_revenue || 0),
    uploadedToDelta: 'NO',
    raReferences: '',
    raWorkbooks: '',
    raWorksheetIndexes: '',
    reviewPurpose: 'Candidate needing RA; compare nearby part prefixes for shareable evidence'
  })),
  ...[...mappedByPcnPart.values()].map(rows => {
    const first = rows[0]
    return {
      normalizedPart: first.normalized_part_number,
      partNumber: first.display_part_number,
      raStatus: 'RA MAPPED',
      sbe1: first.sbe1,
      pcnNumber: first.pcn_number_base,
      expectedRisk: first.expected_risk,
      notificationDate: first.notification_date || '',
      pcnTitle: first.title,
      trailingRevenue: Number(first.trailing_12m_revenue || 0),
      uploadedToDelta: first.uploaded_to_delta,
      raReferences: uniqueLines(rows.map(row => row.ra_number)),
      raWorkbooks: uniqueLines(rows.map(row => row.workbook_filename)),
      raWorksheetIndexes: uniqueLines(rows.map(row => row.source_row)),
      reviewPurpose: 'Existing RA evidence; assess whether it can cover similar missing parts'
    }
  })
].sort((left, right) => left.sbe1.localeCompare(right.sbe1)
  || left.normalizedPart.localeCompare(right.normalizedPart)
  || left.pcnNumber.localeCompare(right.pcnNumber)
  || right.raStatus.localeCompare(left.raStatus))

const workbook = new ExcelJS.Workbook()
workbook.creator = 'PCN Workbench'
workbook.created = new Date()
workbook.subject = 'Major PCN parts with trailing-12-month sales that are not uploaded to Delta and are missing RA'

const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true }
const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  right: { style: 'thin', color: { argb: 'FFD9E2F3' } }
}

const finishSheet = sheet => {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: sheet.getCell(1, sheet.columnCount).address }
  sheet.getRow(1).height = 32
  sheet.getRow(1).eachCell(cell => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    sheet.getRow(rowNumber).eachCell(cell => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = thinBorder
    })
  }
}

const summary = workbook.addWorksheet('Summary')
summary.columns = [{ width: 44 }, { width: 82 }]
summary.addRows([
  ['Metric', 'Value'],
  ['Revenue window', `${fromMonth} through ${asOfMonth} (12 calendar months)`],
  ['Business rule', 'MAJOR or MAJOR_D PCN + trailing-12-month sales record + exact PCN-part not uploaded to Delta + exact PCN-part missing RA.'],
  ['Delta material mapping rule', 'Not used for eligibility. Parts without a TI-to-Delta material mapping remain included.'],
  ['Email List - Missing RA rows', emailRows.length],
  ['Sum of /SBE pending RA parts', sbe1PendingPartTotal],
  ['Pending PCN-part relationships', pendingRows.length],
  ['Mapped RA PCN-part relationships in sharing review', mappedByPcnPart.size],
  ['RA Sharing Review rows', sharingReviewRows.length],
  ['Reconciliation', emailRows.length === sbe1PendingPartTotal ? 'MATCH' : 'MISMATCH']
])
finishSheet(summary)
summary.autoFilter = undefined

const sharing = workbook.addWorksheet('RA Sharing Review')
sharing.columns = [
  { header: 'Normalized Part Number', key: 'normalizedPart', width: 30 },
  { header: 'TI Part Number', key: 'partNumber', width: 30 },
  { header: 'RA Status', key: 'raStatus', width: 18 },
  { header: 'SBE-1', key: 'sbe1', width: 16 },
  { header: 'PCN Number', key: 'pcnNumber', width: 18 },
  { header: 'Expected Risk', key: 'expectedRisk', width: 16 },
  { header: 'Notification Date', key: 'notificationDate', width: 18 },
  { header: 'PCN Title', key: 'pcnTitle', width: 55 },
  { header: `Net Revenue (${fromMonth} to ${asOfMonth})`, key: 'trailingRevenue', width: 24 },
  { header: 'Uploaded to Delta?', key: 'uploadedToDelta', width: 20 },
  { header: 'RA Reference(s)', key: 'raReferences', width: 52 },
  { header: 'RA Workbook(s)', key: 'raWorkbooks', width: 58 },
  { header: 'RA Worksheet Index(es)', key: 'raWorksheetIndexes', width: 24 },
  { header: 'Manual Review Purpose', key: 'reviewPurpose', width: 58 }
]
sharing.addRows(sharingReviewRows)
sharing.getColumn('trailingRevenue').numFmt = '#,##0.00'
finishSheet(sharing)
for (let rowNumber = 2; rowNumber <= sharing.rowCount; rowNumber++) {
  const hasRa = sharing.getCell(rowNumber, 3).value === 'RA MAPPED'
  sharing.getRow(rowNumber).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hasRa ? 'FFC6EFCE' : 'FFFFC7CE' }
  }
}

const email = workbook.addWorksheet('Email List - Missing RA')
email.columns = [
  { header: 'SBE', key: 'sbe', width: 14 },
  { header: 'SBE-1', key: 'sbe1', width: 16 },
  { header: 'SBE-2', key: 'sbe2', width: 18 },
  { header: 'Champion Email', key: 'championEmail', width: 30 },
  { header: 'TI Part Number', key: 'partNumber', width: 28 },
  { header: `Net Revenue (${fromMonth} to ${asOfMonth})`, key: 'trailingRevenue', width: 24 },
  { header: 'Pending PCN Count', key: 'pendingPcnCount', width: 20 },
  { header: 'Pending Major PCNs', key: 'pendingPcns', width: 34 },
  { header: 'PCN Notification Dates', key: 'notificationDates', width: 38 },
  { header: 'PCN Titles', key: 'pcnTitles', width: 60 },
  { header: 'Expected Risk(s)', key: 'expectedRisks', width: 18 },
  { header: 'Risk Source(s)', key: 'riskSources', width: 20 },
  { header: 'TI-Delta Mapping Exists?', key: 'hasDeltaMaterialMapping', width: 24 },
  { header: 'Delta Mapping Note', key: 'deltaMappingNote', width: 42 },
  { header: 'RA Status', key: 'raStatus', width: 16 },
  { header: 'Email Action', key: 'emailAction', width: 20 }
]
email.addRows(emailRows)
email.getColumn('trailingRevenue').numFmt = '#,##0.00'
finishSheet(email)
for (let rowNumber = 2; rowNumber <= email.rowCount; rowNumber++) {
  email.getRow(rowNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }
}

const detail = workbook.addWorksheet('Pending PCN-Part Detail')
detail.columns = [
  { header: 'SBE-1', key: 'sbe1', width: 16 },
  { header: 'Champion Email', key: 'champion_email', width: 30 },
  { header: 'TI Part Number', key: 'display_part_number', width: 28 },
  { header: 'PCN Number', key: 'pcn_number_base', width: 18 },
  { header: 'Notification Date', key: 'notification_date', width: 18 },
  { header: 'PCN Title', key: 'title', width: 55 },
  { header: 'Expected Risk', key: 'expected_risk', width: 16 },
  { header: 'TI-Delta Mapping Exists?', key: 'has_delta_material_mapping', width: 24 }
]
detail.addRows(pendingRows)
finishSheet(detail)

const totals = workbook.addWorksheet('SBE-1 Totals')
totals.columns = [
  { header: 'SBE-1', key: 'sbe1', width: 20 },
  { header: 'Champion Email', key: 'championEmail', width: 34 },
  { header: 'Pending RA Parts', key: 'pendingRaParts', width: 22 },
  { header: 'Pending PCN-Part Links', key: 'pendingPcnPartLinks', width: 25 }
]
totals.addRows(sbe1Totals)
finishSheet(totals)

await workbook.xlsx.writeFile(output)
database.close()

console.log(JSON.stringify({
  output,
  revenueWindow: { fromMonth, asOfMonth },
  emailListRows: emailRows.length,
  sbe1PendingPartTotal,
  pendingPcnPartRelationships: pendingRows.length,
  mappedRaPcnPartRelationships: mappedByPcnPart.size,
  sharingReviewRows: sharingReviewRows.length,
  reconciliation: emailRows.length === sbe1PendingPartTotal ? 'MATCH' : 'MISMATCH'
}, null, 2))

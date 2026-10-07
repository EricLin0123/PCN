import ExcelJS from 'exceljs'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve(process.argv[2] || 'requested-devices-2026-09-17.txt')
const output = resolve(process.argv[3] || 'Delta_requested_devices_PCN_RA_2026-09-17.xlsx')
const requested = readFileSync(input, 'utf8').split(/\r?\n/).map(value => value.trim()).filter(Boolean)
const normalized = value => value.trim().toUpperCase()
const unique = [...new Set(requested.map(normalized))]
const emailDir = resolve('Delta_PCN_RA_PPAP_Emails')
const decodeHtml = value => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').trim()
const emailedRaPairs = new Set()
for (const filename of readdirSync(emailDir).filter(name => name.endsWith('.eml'))) {
  const email = readFileSync(resolve(emailDir, filename), 'utf8')
  for (const match of email.matchAll(/<tr><td>(.*?)<\/td><td>(20\d{9})<\/td>/g)) {
    emailedRaPairs.add(`${normalized(decodeHtml(match[1]))}:${match[2]}`)
  }
}
const database = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const period = database.prepare("SELECT strftime('%Y-%m', 'now', 'localtime', '-11 months') AS start, strftime('%Y-%m', 'now', 'localtime') AS end").get()

const partQuery = database.prepare(`
  SELECT part.id, part.display_part_number, part.normalized_part_number, part.industry,
    COALESCE(sbe.name, '') AS sbe, COALESCE(sbe1.name, '') AS sbe1,
    COALESCE(sbe1.champion_email, '') AS champion_email, COALESCE(sbe2.name, '') AS sbe2,
    COALESCE((SELECT sum(revenue.net_revenue) FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = part.normalized_part_number
        AND revenue.revenue_month BETWEEN ? AND ?), 0) AS trailing_revenue
  FROM ti_part part
  LEFT JOIN ti_part_organization organization ON organization.ti_part_id = part.id
  LEFT JOIN sbe ON sbe.id = organization.sbe_id
  LEFT JOIN sbe1 ON sbe1.id = organization.sbe1_id
  LEFT JOIN sbe2 ON sbe2.id = organization.sbe2_id
  WHERE part.normalized_part_number = ?
`)

const pcnQuery = database.prepare(`
  SELECT pcn.id, pcn.pcn_number_base, pcn.notification_date, pcn.title,
    COALESCE(change_type.name, '') AS change_type, risk.expected_risk, risk.risk_source,
    operational.upload_state, operational.delta_relevant_parts, operational.uploaded_parts,
    operational.delta_risks, operational.risk_alignment, delta.delta_status,
    documents.ra_document_state, documents.ra_required_parts, documents.ra_covered_parts,
    COALESCE(upload.form_no, '') AS csc_form_no, COALESCE(upload.apply_date, '') AS csc_apply_date,
    CASE WHEN EXISTS (
      SELECT 1 FROM delta_form form
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE form.delta_pcn_number_base = pcn.pcn_number_base AND mapping.ti_part_id = ?
    ) THEN 'YES' ELSE 'NO' END AS device_uploaded_to_delta,
    COALESCE((SELECT group_concat(value, char(10)) FROM (
      SELECT DISTINCT assessment.ra_number AS value
      FROM risk_assessment assessment
      JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
      WHERE assessment.pcn_id = pcn.id AND link.ti_part_id = ? ORDER BY value
    )), '') AS ra_numbers,
    COALESCE((SELECT group_concat(value, char(10)) FROM (
      SELECT DISTINCT assessment.workbook_filename AS value
      FROM risk_assessment assessment
      JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
      WHERE assessment.pcn_id = pcn.id AND link.ti_part_id = ? AND assessment.workbook_filename <> '' ORDER BY value
    )), '') AS ra_workbooks
  FROM pcn_ti_part affected
  JOIN pcn ON pcn.id = affected.pcn_id
  LEFT JOIN change_type ON change_type.id = pcn.change_type_id
  JOIN pcn_expected_risk risk ON risk.pcn_id = pcn.id
  JOIN pcn_operational_status operational ON operational.pcn_id = pcn.id
  JOIN pcn_delta_status delta ON delta.pcn_id = pcn.id
  JOIN pcn_document_status documents ON documents.pcn_id = pcn.id
  LEFT JOIN pcn_csc_upload upload ON upload.pcn_id = pcn.id
  WHERE affected.ti_part_id = ?
  ORDER BY pcn.notification_date DESC, pcn.pcn_number_base
`)

const deviceRows = []
const detailRows = []
for (const device of unique) {
  const part = partQuery.get(period.start, period.end, device)
  if (!part) {
    deviceRows.push({ requestedDevice: device, databaseMatch: 'NO', note: 'Device not found in ti_part' })
    continue
  }
  const pcns = pcnQuery.all(part.id, part.id, part.id, part.id)
  const values = list => [...new Set(list.filter(Boolean))].join('\n')
  for (const pcn of pcns) {
    const raNeeded = Number(part.trailing_revenue) !== 0 && ['MAJOR', 'MAJOR_D'].includes(pcn.expected_risk)
    const raRequestSent = emailedRaPairs.has(`${part.normalized_part_number}:${pcn.pcn_number_base}`)
    detailRows.push({
      requestedDevice: device, databaseDevice: part.display_part_number, normalizedDevice: part.normalized_part_number,
      sbe: part.sbe, sbe1: part.sbe1, sbe2: part.sbe2, championEmail: part.champion_email,
      industry: part.industry || '', trailingRevenue: Number(part.trailing_revenue), pcnNumber: pcn.pcn_number_base,
      notificationDate: pcn.notification_date || '', title: pcn.title, changeType: pcn.change_type,
      expectedRisk: pcn.expected_risk, riskSource: pcn.risk_source, raNeeded: raNeeded ? 'YES' : 'NO',
      raRequestSent: raRequestSent ? 'YES' : 'NO',
      deviceRaStatus: raNeeded ? (pcn.ra_numbers ? 'ACQUIRED' : 'MISSING') : 'NOT REQUIRED',
      raNumbers: pcn.ra_numbers, raWorkbooks: pcn.ra_workbooks, pcnRaStatus: pcn.ra_document_state,
      pcnRaCoverage: `${pcn.ra_covered_parts}/${pcn.ra_required_parts}`,
      deviceUploaded: pcn.device_uploaded_to_delta, uploadState: pcn.upload_state,
      uploadCoverage: `${pcn.uploaded_parts}/${pcn.delta_relevant_parts}`, deltaStatus: pcn.delta_status,
      deltaRisks: pcn.delta_risks || '', riskAlignment: pcn.risk_alignment,
      cscFormNo: pcn.csc_form_no, cscApplyDate: pcn.csc_apply_date
    })
  }
  deviceRows.push({
    requestedDevice: device, databaseMatch: 'YES', databaseDevice: part.display_part_number,
    sbe1: part.sbe1, championEmail: part.champion_email, industry: part.industry || '',
    trailingRevenue: Number(part.trailing_revenue), pcnCount: pcns.length,
    pcnNumbers: values(pcns.map(row => row.pcn_number_base)),
    raNeeded: pcns.some(row => Number(part.trailing_revenue) !== 0 && ['MAJOR', 'MAJOR_D'].includes(row.expected_risk)) ? 'YES' : 'NO',
    raRequestSent: pcns.some(row => emailedRaPairs.has(`${part.normalized_part_number}:${row.pcn_number_base}`)) ? 'YES' : 'NO',
    raRequestSentCount: pcns.filter(row => emailedRaPairs.has(`${part.normalized_part_number}:${row.pcn_number_base}`)).length,
    missingRaCount: pcns.filter(row => Number(part.trailing_revenue) !== 0 && ['MAJOR', 'MAJOR_D'].includes(row.expected_risk) && !row.ra_numbers).length,
    deltaStatuses: values(pcns.map(row => row.delta_status)), note: pcns.length ? '' : 'No associated PCN in database'
  })
}

const workbook = new ExcelJS.Workbook()
workbook.creator = 'PCN Workbench'
workbook.created = new Date()
workbook.subject = 'PCNs, SBE-1 ownership, and RA requirements for Delta-requested devices'
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
const border = { bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } }, right: { style: 'thin', color: { argb: 'FFD9E2F3' } } }
const finish = sheet => {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: sheet.getCell(1, sheet.columnCount).address }
  sheet.getRow(1).eachCell(cell => { cell.fill = headerFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { vertical: 'middle', wrapText: true } })
  for (let row = 2; row <= sheet.rowCount; row++) sheet.getRow(row).eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = border })
}
const addSheet = (name, columns, rows) => { const sheet = workbook.addWorksheet(name); sheet.columns = columns; sheet.addRows(rows); finish(sheet); return sheet }

const summary = workbook.addWorksheet('Read Me')
summary.columns = [{ width: 34 }, { width: 100 }]
summary.addRows([
  ['Field', 'Value'], ['Generated', new Date().toISOString()], ['Database', 'data/pcn.db (read-only)'],
  ['Requested rows', requested.length], ['Unique requested devices', unique.length],
  ['Matched devices', deviceRows.filter(row => row.databaseMatch === 'YES').length],
  ['Unmatched devices', deviceRows.filter(row => row.databaseMatch === 'NO').length], ['PCN-device relationships', detailRows.length],
  ['Revenue window', `${period.start} through ${period.end}`],
  ['RA needed rule', 'YES only when the PCN calculated risk is MAJOR or MAJOR_D and this device has revenue in the trailing-12-month window.'],
  ['RA request sent rule', 'YES only when the exact normalized device + PCN number pair appears in a .eml file under Delta_PCN_RA_PPAP_Emails (email package generated 2026-09-07).'],
  ['Device RA status', 'ACQUIRED/MISSING checks exact PCN-device RA linkage; PCN RA status and coverage show the broader PCN-level document state.'],
  ['Duplicate input', requested.length === unique.length ? 'None' : requested.filter((value, index) => requested.map(normalized).indexOf(normalized(value)) !== index).join(', ')]
])
finish(summary); summary.autoFilter = undefined

const devices = addSheet('Device Summary', [
  ['Requested Device', 'requestedDevice', 28], ['DB Match?', 'databaseMatch', 12], ['Database Device', 'databaseDevice', 28],
  ['SBE-1', 'sbe1', 18], ['Champion Email', 'championEmail', 30], ['Industry', 'industry', 15],
  [`Net Revenue (${period.start} to ${period.end})`, 'trailingRevenue', 24], ['PCN Count', 'pcnCount', 12],
  ['Associated PCNs', 'pcnNumbers', 28], ['Any RA Needed?', 'raNeeded', 16], ['Any RA Request Sent?', 'raRequestSent', 20],
  ['RA Requests Sent', 'raRequestSentCount', 17], ['Missing RA Count', 'missingRaCount', 18],
  ['Delta Status(es)', 'deltaStatuses', 18], ['Note', 'note', 32]
].map(([header, key, width]) => ({ header, key, width })), deviceRows)
devices.getColumn('trailingRevenue').numFmt = '#,##0.00'

const details = addSheet('PCN Device Detail', [
  ['Requested Device','requestedDevice',28],['Database Device','databaseDevice',28],['Normalized Device','normalizedDevice',28],
  ['SBE','sbe',14],['SBE-1','sbe1',18],['SBE-2','sbe2',18],['Champion Email','championEmail',30],['Industry','industry',15],
  [`Net Revenue (${period.start} to ${period.end})`,'trailingRevenue',24],['PCN Number','pcnNumber',17],['Notification Date','notificationDate',16],
  ['PCN Title','title',55],['Change Type','changeType',24],['Expected Risk','expectedRisk',15],['Risk Source','riskSource',18],
  ['RA Needed?','raNeeded',13],['RA Request Sent?','raRequestSent',17],['Device RA Status','deviceRaStatus',18],['RA Number(s)','raNumbers',28],['RA Workbook(s)','raWorkbooks',38],
  ['PCN RA Status','pcnRaStatus',18],['PCN RA Coverage','pcnRaCoverage',17],['Device Uploaded?','deviceUploaded',17],
  ['PCN Upload State','uploadState',18],['PCN Upload Coverage','uploadCoverage',19],['Delta Status','deltaStatus',15],
  ['Delta Risk(s)','deltaRisks',15],['Risk Alignment','riskAlignment',17],['CSC Form No.','cscFormNo',28],['CSC Apply Date','cscApplyDate',16]
].map(([header, key, width]) => ({ header, key, width })), detailRows)
details.getColumn('trailingRevenue').numFmt = '#,##0.00'

for (const sheet of [devices, details]) for (let row = 2; row <= sheet.rowCount; row++) {
  const raCell = sheet.getCell(row, sheet.name === 'Device Summary' ? 10 : 16)
  if (raCell.value === 'YES') raCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }
}

await workbook.xlsx.writeFile(output)
database.close()
console.log(JSON.stringify({ output, requested: requested.length, unique: unique.length, matched: deviceRows.filter(row => row.databaseMatch === 'YES').length, unmatched: deviceRows.filter(row => row.databaseMatch === 'NO').length, relationships: detailRows.length, raNeededRelationships: detailRows.filter(row => row.raNeeded === 'YES').length, raRequestSentRelationships: detailRows.filter(row => row.raRequestSent === 'YES').length, missingRaRelationships: detailRows.filter(row => row.deviceRaStatus === 'MISSING').length }, null, 2))
